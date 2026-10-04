"""Offline voice-session checks: no OpenAI key, network or AWS calls."""
import io
import json
import os
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError

import backend.voice
from backend.app import app
from backend.voice import CLIENT_SECRETS_URL, TOOL, VOICE_PROMPT


def answer(payload):
    response = MagicMock()
    response.__enter__.return_value = io.BytesIO(json.dumps(payload).encode())
    return response


class VoiceTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}).start()
        os.environ.pop("OPENAI_REALTIME_MODEL", None)
        os.environ.pop("OPENAI_API_KEY_SECRET", None)
        patch.object(backend.voice, "_key", ("", 0.0)).start()
        self.urlopen = patch("backend.voice.urllib.request.urlopen", return_value=answer({"value": "ek_123"})).start()
        self.admit = patch("backend.llm.admit").start()
        self.http = app.test_client()

    def post(self):
        return self.http.post("/api/voice/session", json={})

    def test_session_and_provider_request(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"clientSecret": "ek_123", "model": "gpt-realtime-2.1", "voice": "ash",
                                         "url": "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1"})
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertNotIn("sk-test", response.get_data(as_text=True))
        request = self.urlopen.call_args.args[0]
        self.assertEqual(request.full_url, CLIENT_SECRETS_URL)
        self.assertEqual(request.get_header("Authorization"), "Bearer sk-test")
        body = json.loads(request.data)
        self.assertEqual(body["expires_after"], {"anchor": "created_at", "seconds": 60})
        session = body["session"]
        self.assertEqual((session["type"], session["model"], session["instructions"]), ("realtime", "gpt-realtime-2.1", VOICE_PROMPT))
        self.assertEqual(session["audio"]["output"], {"format": {"type": "audio/pcm", "rate": 24000}, "voice": "ash"})
        self.assertEqual(session["audio"]["input"]["format"], {"type": "audio/pcm", "rate": 24000})
        self.assertEqual(session["tools"], [TOOL])
        self.admit.assert_called_once()

    def test_model_override(self):
        with patch.dict(os.environ, {"OPENAI_REALTIME_MODEL": "gpt-realtime-2.1-mini"}):
            self.assertEqual(self.post().json["model"], "gpt-realtime-2.1-mini")

    def test_missing_key_never_calls_the_provider(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": " "}):
            response = self.post()
        self.assertEqual((response.status_code, response.json), (503, {"error": "Voice is not configured on the server."}))
        self.urlopen.assert_not_called()
        self.admit.assert_not_called()

    def test_deployed_key_comes_from_the_secret_and_is_reused(self):
        aws = patch("backend.voice.boto3.client").start().return_value
        aws.get_secret_value.return_value = {"SecretString": "sk-from-aws\n"}
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "OPENAI_API_KEY_SECRET": "arn:secret"}):
            self.urlopen.side_effect = lambda *args, **kwargs: answer({"value": "ek_123"})
            self.assertEqual(self.post().status_code, 200)
            self.assertEqual(self.post().status_code, 200)
            self.assertEqual(self.urlopen.call_args.args[0].get_header("Authorization"), "Bearer sk-from-aws")
            aws.get_secret_value.assert_called_once_with(SecretId="arn:secret")

    def test_placeholder_or_unreadable_secret_keeps_voice_off(self):
        aws = patch("backend.voice.boto3.client").start().return_value
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "OPENAI_API_KEY_SECRET": "arn:secret"}):
            aws.get_secret_value.return_value = {"SecretString": "unset"}
            self.assertEqual(self.post().status_code, 503)
            aws.get_secret_value.side_effect = ClientError({"Error": {"Code": "AccessDeniedException"}}, "GetSecretValue")
            response = self.post()
            self.assertEqual((response.status_code, response.json), (503, {"error": "Voice is unavailable right now. Try again later."}))
        self.urlopen.assert_not_called()

    def test_provider_failures_are_sanitized(self):
        def refused(code):
            return urllib.error.HTTPError(CLIENT_SECRETS_URL, code, "no", {}, io.BytesIO(b'{"error":"org-secret-detail"}'))
        for failure, status in ((refused(401), 502), (refused(429), 429), (TimeoutError(), 502)):
            self.urlopen.side_effect = failure
            response = self.post()
            self.assertEqual(response.status_code, status)
            self.assertNotIn("org-secret-detail", response.get_data(as_text=True))
        self.urlopen.side_effect = None
        for payload in ({}, {"value": ""}, {"value": 7}, []):
            self.urlopen.return_value = answer(payload)
            self.assertEqual(self.post().status_code, 502)

    def test_request_rules_match_the_other_routes(self):
        self.assertEqual(self.http.post("/api/voice/session", data="{}").status_code, 415)
        self.assertEqual(self.http.get("/api/voice/session").status_code, 405)
        self.urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
