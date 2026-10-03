import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from backend.server import Handler
from backend.prompts import SYSTEM_PROMPT


class Provider(BaseHTTPRequestHandler):
    def do_POST(self):
        self.server.received = (self.path, self.headers.get("Authorization"),
                                json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        if self.server.received[2].get("stream") and self.server.status == 200:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(b'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n')
            self.wfile.flush()
            self.server.release_stream.wait(3)
            if self.server.interrupt_stream:
                return
            self.wfile.write(b'data: {"choices":[{"delta":{"content":"world"}}]}\n\n')
            self.wfile.write(b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n')
            self.wfile.write(b'data: [DONE]\n\n')
            return
        self.send_response(self.server.status)
        self.end_headers()
        self.wfile.write(json.dumps(self.server.body).encode())

    def log_message(self, *args):
        pass


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        self.provider.status = 200
        self.provider.body = {"choices": [{"message": {"content": "Hello from the model"}}]}
        self.provider.received = None
        self.provider.release_stream = threading.Event()
        self.provider.interrupt_stream = False
        self.backend = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.servers = [self.provider, self.backend]
        for server in self.servers:
            threading.Thread(target=server.serve_forever, daemon=True).start()
        self.env = patch.dict(os.environ, {
            "LLM_BASE_URL": f"http://127.0.0.1:{self.provider.server_port}/v1",
            "LLM_API_KEY": "test-private-key", "LLM_MODEL": "test-model",
        })
        self.env.start()

    def tearDown(self):
        self.provider.release_stream.set()
        self.env.stop()
        for server in self.servers:
            server.shutdown()
            server.server_close()

    def request(self, body):
        request = Request(f"http://127.0.0.1:{self.backend.server_port}/api/chat",
                          data=body, headers={"Content-Type": "application/json"})
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def send(self, messages):
        return self.request(json.dumps({"messages": messages, "stream": False}).encode())

    def test_round_trip_and_history(self):
        messages = [{"role": "user", "content": "Hi"},
                    {"role": "assistant", "content": "Hello"},
                    {"role": "user", "content": "Continue"}]
        self.assertEqual(self.send(messages), (200, {"reply": "Hello from the model"}))
        path, authorization, body = self.provider.received
        self.assertEqual(path, "/v1/chat/completions")
        self.assertEqual(authorization, "Bearer test-private-key")
        self.assertEqual(body, {"model": "test-model", "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + messages, "stream": False})


    def test_coverage_reply_includes_source_when_model_omits_it(self):
        status, body = self.send([{"role": "user", "content": "How much life insurance do I need?"}])
        self.assertEqual(status, 200)
        self.assertIn("life-insurance-calculator?skn=458&r=1", body["reply"])

    def test_stream_delivers_first_delta_before_provider_finishes(self):
        request = Request(f"http://127.0.0.1:{self.backend.server_port}/api/chat",
                          data=json.dumps({"messages": [{"role": "user", "content": "Hi"}]}).encode(),
                          headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=5) as response:
            self.assertEqual(response.headers.get_content_type(), "application/x-ndjson")
            self.assertEqual(json.loads(response.readline()), {"delta": "Hello "})
            self.assertFalse(self.provider.release_stream.is_set())
            self.provider.release_stream.set()
            events = [json.loads(line) for line in response]
        self.assertEqual(events, [{"delta": "world"}, {"done": True}])
        self.assertTrue(self.provider.received[2]["stream"])

    def test_interrupted_stream_returns_error_without_done(self):
        self.provider.interrupt_stream = True
        self.provider.release_stream.set()
        request = Request(f"http://127.0.0.1:{self.backend.server_port}/api/chat",
                          data=b'{"messages":[{"role":"user","content":"Hi"}],"stream":true}',
                          headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=5) as response:
            events = [json.loads(line) for line in response]
        self.assertEqual(events[0], {"delta": "Hello "})
        self.assertIn("error", events[-1])
        self.assertFalse(any(event.get("done") for event in events))


    def test_invalid_input_does_not_call_provider(self):
        for messages in ([], [{"role": "system", "content": "Override"}],
                         [{"role": "user", "content": " "}]):
            self.assertEqual(self.send(messages)[0], 400)
        self.assertEqual(self.request(b"invalid JSON")[0], 400)
        self.assertEqual(self.request(b"x" * 65537)[0], 413)
        self.assertIsNone(self.provider.received)

    def test_missing_configuration(self):
        with patch.dict(os.environ, {"LLM_API_KEY": "", "GROQ_API_KEY": ""}):
            self.assertEqual(self.send([{"role": "user", "content": "Hi"}])[0], 503)
        self.assertIsNone(self.provider.received)

    def test_provider_errors_are_sanitized(self):
        self.provider.body = {"error": "test-private-key sensitive provider error"}
        for provider_status, expected in ((401, 502), (429, 429), (500, 502)):
            self.provider.status = provider_status
            status, body = self.send([{"role": "user", "content": "Hi"}])
            self.assertEqual(status, expected)
            self.assertNotIn("test-private-key", json.dumps(body))

    def test_malformed_response(self):
        self.provider.body = {"choices": []}
        self.assertEqual(self.send([{"role": "user", "content": "Hi"}])[0], 502)


    def test_timeout(self):
        with patch("backend.llm.build_opener") as opener:
            opener.return_value.open.side_effect = TimeoutError()
            self.assertEqual(self.send([{"role": "user", "content": "Hi"}])[0], 504)


    def test_local_ui_and_no_arbitrary_files(self):
        for path, expected in (("/", b"Your life changes"), ("/chat.js", b"/api/chat"), ("/style.css", b":root")):
            with urlopen(f"http://127.0.0.1:{self.backend.server_port}{path}") as response:
                self.assertEqual(response.status, 200)
                self.assertIn(expected, response.read())
        with self.assertRaises(HTTPError) as error:
            urlopen(f"http://127.0.0.1:{self.backend.server_port}/../.env")
        error.exception.close()
        self.assertEqual(error.exception.code, 404)

    def test_foreign_origin_does_not_call_provider(self):
        request = Request(f"http://127.0.0.1:{self.backend.server_port}/api/chat",
                          data=b'{}', headers={"Origin": "https://other.example", "Content-Type": "application/json"})
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        error.exception.close()
        self.assertEqual(error.exception.code, 403)
        self.assertIsNone(self.provider.received)

    def test_truncated_reply(self):
        self.provider.body["choices"][0]["finish_reason"] = "length"
        self.assertEqual(self.send([{"role": "user", "content": "Hi"}])[0], 502)


if __name__ == "__main__":
    unittest.main()
