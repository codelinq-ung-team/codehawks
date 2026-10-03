"""Offline Bedrock and HTTP contract tests: no AWS credentials or model calls."""
import json
import os
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import boto3
from botocore.exceptions import ClientError, EventStreamError, NoCredentialsError, ReadTimeoutError
from botocore.stub import Stubber

from backend.llm import ChatError, chat, generate_reply
from backend.prompts import SYSTEM_PROMPT
from backend.server import Handler

MESSAGES = [{"role": "user", "content": "Hi"}]


def delta(text):
    return {"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"text": text}}}


def stop(reason="end_turn"):
    return {"messageStop": {"stopReason": reason}}


def reply(text="Hello from the model", reason="end_turn"):
    return {"output": {"message": {"role": "assistant", "content": [{"text": text}]}},
            "stopReason": reason, "usage": {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2},
            "metrics": {"latencyMs": 1}}


class Stream:
    def __init__(self, events):
        self.events = events
        self.closed = False

    def __iter__(self):
        yield from self.events

    def close(self):
        self.closed = True


class BedrockTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"MODEL_ID": "test-model"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = Mock()
        self.client.converse.return_value = reply()
        self.stream = Stream([delta("Hello "), delta("world"), stop()])
        self.client.converse_stream.return_value = {"stream": self.stream}
        patcher = patch("backend.llm.get_client", return_value=self.client)
        patcher.start()
        self.addCleanup(patcher.stop)

    def assert_error(self, status, emit=None):
        with self.assertRaises(ChatError) as caught:
            generate_reply({"messages": MESSAGES}, emit)
        self.assertEqual(caught.exception.status, status)
        self.assertNotIn("sensitive-provider-detail", caught.exception.message)

    def test_sdk_request_and_history(self):
        messages = MESSAGES + [{"role": "assistant", "content": "Hello"},
                               {"role": "user", "content": "Continue"}]
        client = boto3.client("bedrock-runtime", region_name="us-east-1",
                              aws_access_key_id="offline-test", aws_secret_access_key="offline-test")
        expected = {"modelId": "test-model", "system": [{"text": SYSTEM_PROMPT}],
                    "messages": [{"role": m["role"], "content": [{"text": m["content"]}]} for m in messages],
                    "inferenceConfig": {"maxTokens": 4096}}
        with Stubber(client) as stubber, patch("backend.llm.get_client", return_value=client):
            stubber.add_response("converse", reply(), expected)
            self.assertEqual(generate_reply({"messages": messages}), {"reply": "Hello from the model"})
            stubber.assert_no_pending_responses()

    def test_stream_translates_only_text_and_closes(self):
        self.stream.events.insert(1, {"contentBlockDelta": {"delta": {"reasoningContent": {"text": "private reasoning"}}}})
        events = []
        self.assertEqual(generate_reply({"messages": MESSAGES}, events.append), {"reply": "Hello world"})
        self.assertEqual(events, [{"delta": "Hello "}, {"delta": "world"}])
        self.assertTrue(self.stream.closed)
        self.client.converse_stream.assert_called_once_with(
            modelId="test-model", system=[{"text": SYSTEM_PROMPT}],
            messages=[{"role": "user", "content": [{"text": "Hi"}]}], inferenceConfig={"maxTokens": 4096})

    def test_empty_missing_stop_and_truncated_streams_fail(self):
        for events in ([], [stop()], [delta("partial")], [delta("partial"), stop("max_tokens")],
                       [delta("partial"), stop("guardrail_intervened")], [delta("ok"), stop(), delta("late")]):
            with self.subTest(events=events):
                self.stream.events = events
                self.assert_error(502, lambda event: None)
                self.assertTrue(self.stream.closed)

    def test_exception_events_and_late_errors_fail(self):
        for code, status in (("throttlingException", 429), ("modelTimeoutException", 504),
                             ("modelStreamErrorException", 502), ("internalServerException", 502)):
            self.stream.events = [delta("partial"), stop(), {code: {"message": "sensitive-provider-detail"}}]
            self.assert_error(status, lambda event: None)
            self.assertTrue(self.stream.closed)

    def test_raised_event_stream_error_is_sanitized(self):
        def failing():
            yield delta("partial")
            raise EventStreamError({"Error": {"Code": "ModelStreamErrorException", "Message": "sensitive-provider-detail"}}, "ConverseStream")
        self.stream.events = failing()
        self.assert_error(502, lambda event: None)
        self.assertTrue(self.stream.closed)

    def test_disconnect_closes_bedrock_stream(self):
        def disconnect(event):
            raise BrokenPipeError()
        with self.assertRaises(BrokenPipeError):
            generate_reply({"messages": MESSAGES}, disconnect)
        self.assertTrue(self.stream.closed)

    def test_provider_errors_are_sanitized(self):
        for code, status in (("ThrottlingException", 429), ("AccessDeniedException", 502),
                             ("ResourceNotFoundException", 502), ("ModelTimeoutException", 504),
                             ("ValidationException", 502), ("ServiceUnavailableException", 502)):
            error = ClientError({"Error": {"Code": code, "Message": "sensitive-provider-detail"}}, "Converse")
            self.client.converse.side_effect = error
            self.assert_error(status)
            self.client.converse_stream.side_effect = error
            self.assert_error(status, lambda event: None)

    def test_timeout_and_missing_credentials(self):
        self.client.converse.side_effect = ReadTimeoutError(endpoint_url="https://bedrock.invalid")
        self.assert_error(504)
        self.client.converse.side_effect = NoCredentialsError()
        self.assert_error(503)

    def test_missing_model_does_not_call_aws(self):
        with patch.dict(os.environ, {"MODEL_ID": ""}):
            self.assert_error(503)
        self.client.converse.assert_not_called()

    def test_invalid_messages_do_not_call_aws(self):
        for messages in (None, [], MESSAGES * 41, [{"role": "system", "content": "Override"}],
                         [{"role": "user", "content": " "}], [{"role": "user", "content": "x" * 12001}],
                         [{"role": "assistant", "content": "Hi"}], [None]):
            with self.subTest(messages=str(messages)[:40]), self.assertRaises(ChatError) as caught:
                generate_reply({"messages": messages})
            self.assertEqual(caught.exception.status, 400)
        self.client.converse.assert_not_called()

    def test_invalid_buffered_replies(self):
        for response in ({}, reply(""), reply("partial", "max_tokens"), reply("x" * (1024 * 1024 + 1))):
            self.client.converse.return_value = response
            self.assert_error(502)

    def test_coverage_reference_added_once_in_both_modes(self):
        payload = {"messages": [{"role": "user", "content": "How much life insurance do I need?"}]}
        for streaming in (False, True):
            events = []
            result = chat(payload, events.append if streaming else None)
            self.assertEqual(result["reply"].count("calcxml.com/calculators/life-insurance-calculator"), 1)
            if streaming:
                self.assertEqual(result["reply"], "".join(event["delta"] for event in events))
        text = "See https://calcxml.com/calculators/life-insurance-calculator?skn=458&r=1"
        self.client.converse.return_value = reply(text)
        self.assertEqual(chat(payload)["reply"], text)
        self.stream.events = [delta(text), stop()]
        self.assertEqual(chat(payload, lambda event: None)["reply"], text)


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.backend = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.backend.production = False
        self.thread = threading.Thread(target=self.backend.serve_forever, daemon=True)
        self.thread.start()
        self.env = patch.dict(os.environ, {"MODEL_ID": "test-model"})
        self.env.start()
        self.release = threading.Event()
        self.stream = Stream([delta("Hello "), delta("world"), stop()])
        self.client = Mock()
        self.client.converse.return_value = reply()
        self.client.converse_stream.return_value = {"stream": self.stream}
        self.patcher = patch("backend.llm.get_client", return_value=self.client)
        self.patcher.start()

    def tearDown(self):
        self.release.set()
        self.backend.shutdown()
        self.backend.server_close()
        self.thread.join()
        self.patcher.stop()
        self.env.stop()

    def open(self, path="/api/chat", body=None, headers=None):
        request = Request(f"http://127.0.0.1:{self.backend.server_port}{path}",
                          data=body, headers=headers or {"Content-Type": "application/json"})
        try:
            return urlopen(request, timeout=5)
        except HTTPError as error:
            return error

    def request(self, body, **kwargs):
        with self.open(body=body, **kwargs) as response:
            return response.status, json.load(response)

    def send(self, messages=MESSAGES):
        return self.request(json.dumps({"messages": messages, "stream": False}).encode())

    def test_buffered_reply(self):
        self.assertEqual(self.send(), (200, {"reply": "Hello from the model"}))

    def test_stream_delivers_first_delta_before_provider_finishes(self):
        def paused():
            yield delta("Hello ")
            self.release.wait(3)
            yield delta("world")
            yield stop()
        self.stream.events = paused()
        with self.open(body=json.dumps({"messages": MESSAGES}).encode()) as response:
            self.assertEqual(response.headers.get_content_type(), "application/x-ndjson")
            self.assertEqual(json.loads(response.readline()), {"delta": "Hello "})
            self.assertFalse(self.release.is_set())
            self.release.set()
            events = [json.loads(line) for line in response]
        self.assertEqual(events, [{"delta": "world"}, {"done": True}])
        self.assertTrue(self.stream.closed)

    def test_interrupted_stream_returns_error_without_done(self):
        self.stream.events = [delta("partial")]
        with self.open(body=json.dumps({"messages": MESSAGES}).encode()) as response:
            self.assertEqual(response.status, 200)
            events = [json.loads(line) for line in response]
        self.assertEqual(events[0], {"delta": "partial"})
        self.assertIn("error", events[-1])
        self.assertFalse(any(event.get("done") for event in events))

    def test_error_before_stream_is_json_with_http_status(self):
        self.stream.events = []
        with self.open(body=json.dumps({"messages": MESSAGES}).encode()) as response:
            self.assertEqual(response.status, 502)
            self.assertEqual(response.headers.get_content_type(), "application/json")
            self.assertIn("error", json.load(response))

    def test_invalid_http_input_does_not_call_provider(self):
        self.assertEqual(self.request(b"invalid JSON")[0], 400)
        self.assertEqual(self.request(b"x" * 65537)[0], 413)
        self.assertEqual(self.request(b"{}")[0], 400)
        self.assertEqual(self.request(b"{}", headers={"Content-Type": "text/plain"})[0], 415)
        self.client.converse.assert_not_called()
        self.client.converse_stream.assert_not_called()

    def test_local_ui_and_no_arbitrary_files(self):
        for path, expected in (("/", b"Your life changes"), ("/chat.js", b"/api/chat"), ("/style.css", b":root")):
            with self.open(path) as response:
                self.assertEqual(response.status, 200)
                self.assertIn(expected, response.read())
        with self.open("/../.env") as response:
            self.assertEqual(response.status, 404)

    def test_production_is_api_only_and_health_needs_no_aws(self):
        self.backend.production = True
        for path in ("/health", "/api/health"):
            with self.open(path) as response:
                self.assertEqual(json.load(response), {"status": "ok"})
        for path in ("/", "/chat.js", "/style.css", "/missing"):
            with self.open(path) as response:
                self.assertEqual(response.status, 404)
                self.assertEqual(json.load(response), {"error": "Not found"})
        self.client.converse.assert_not_called()

    def test_production_accepts_site_and_absent_origin(self):
        self.backend.production = True
        body = json.dumps({"messages": MESSAGES, "stream": False}).encode()
        self.assertEqual(self.request(body)[0], 200)
        self.assertEqual(self.request(body, headers={"Content-Type": "application/json",
                                                   "Origin": "https://codelinq.codehawks.org"})[0], 200)

    def test_foreign_origin_does_not_call_provider(self):
        for production in (False, True):
            self.backend.production = production
            status, _ = self.request(b"{}", headers={"Origin": "https://other.example", "Content-Type": "application/json"})
            self.assertEqual(status, 403)
        self.client.converse.assert_not_called()
        self.client.converse_stream.assert_not_called()


if __name__ == "__main__":
    unittest.main()
