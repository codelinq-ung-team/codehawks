"""Offline checks of the deployed API and streaming lifecycle."""
import json
from http.client import HTTPConnection
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import unittest
from unittest.mock import Mock, patch

from backend.app import app
from backend.tests.test_chat import MESSAGES, Stream, delta, reply, stop


class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.aws = Mock()
        self.aws.converse.return_value = reply("Hello")
        self.stream = Stream([delta("Hello"), stop()])
        self.aws.converse_stream.return_value = {"stream": self.stream}
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {"MODEL_ID": "test-model"}).start()
        patch("backend.llm.get_client", return_value=self.aws).start()
        self.http = app.test_client()

    def post(self, **values):
        return self.http.post("/api/chat", json={"messages": MESSAGES, **values})

    def test_api_only_and_offline_health(self):
        for path in ("/health", "/api/health"):
            self.assertEqual(self.http.get(path).json, {"status": "ok"})
        for path in ("/", "/chat.js", "/style.css", "/../.env"):
            self.assertEqual(self.http.get(path).status_code, 404)
        self.aws.converse.assert_not_called()
        self.aws.converse_stream.assert_not_called()

    def test_buffered_and_cloudfront_origin(self):
        response = self.http.post("/api/chat", json={"messages": MESSAGES, "stream": False},
                                  headers={"Origin": "https://codelinc.codehawks.org"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"reply": "Hello"})
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_stream_delivers_before_upstream_finishes(self):
        reached_end = []
        def upstream():
            yield delta("first")
            reached_end.append(True)
            yield delta("second")
            yield stop()
        stream = Stream(upstream())
        self.aws.converse_stream.return_value = {"stream": stream}
        response = self.post()
        iterator = iter(response.response)
        self.assertEqual(json.loads(next(iterator)), {"delta": "first"})
        self.assertEqual(reached_end, [])
        self.assertEqual([json.loads(line) for line in iterator], [{"delta": "second"}, {"done": True}])
        self.assertTrue(stream.closed)
        response.close()

    def test_disconnect_closes_upstream(self):
        response = self.post()
        self.assertFalse(self.stream.closed)
        response.close()
        self.assertTrue(self.stream.closed)

    def test_errors_before_and_after_text(self):
        for events, status in (([{"throttlingException": {"message": "secret"}}], 429),
                               ([delta("partial"), {"modelTimeoutException": {}}], 200),
                               ([delta("partial")], 200)):
            stream = Stream(events)
            self.aws.converse_stream.return_value = {"stream": stream}
            response = self.post()
            self.assertEqual(response.status_code, status)
            if status == 200:
                lines = [json.loads(line) for line in response.data.splitlines()]
                self.assertIn("error", lines[-1])
                self.assertFalse(any("done" in line for line in lines))
            else:
                self.assertIn("error", response.json)
            self.assertNotIn(b"secret", response.data)
            self.assertTrue(stream.closed)
            response.close()

    def test_invalid_requests_do_not_invoke_bedrock(self):
        for body, content_type, status in ((b"{", "application/json", 400),
                                           (b"{}", "application/json", 400),
                                           (b"x" * 65537, "application/json", 413),
                                           (b"{}", "text/plain", 415)):
            response = self.http.post("/api/chat", data=body, content_type=content_type)
            self.assertEqual(response.status_code, status)
        self.aws.converse.assert_not_called()
        self.aws.converse_stream.assert_not_called()

    def test_stream_preserves_calculator_reference(self):
        response = self.post(messages=[{"role": "user", "content": "How much coverage?"}])
        events = [json.loads(line) for line in response.data.splitlines()]
        self.assertIn("calcxml.com/calculators/life-insurance-calculator", events[-2]["delta"])
        self.assertEqual(events[-1], {"done": True})
        response.close()


@unittest.skipIf(sys.platform == "win32", "Gunicorn runs on the Linux deployment target")
class ProductionProcessTests(unittest.TestCase):
    def test_gunicorn_starts_without_aws_credentials(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        environment = {key: value for key, value in os.environ.items()
                       if not key.startswith("AWS_") and key != "MODEL_ID"}
        environment["AWS_EC2_METADATA_DISABLED"] = "true"
        environment["LAMBDA_TASK_ROOT"] = str(Path(__file__).resolve().parents[2])
        environment["PORT"] = str(port)
        environment["PATH"] = str(Path(sys.executable).parent) + os.pathsep + environment.get("PATH", "")
        # Exercise the actual deployed launcher, including its Lambda-specific flags.
        process = subprocess.Popen(["sh", str(Path(__file__).resolve().parents[1] / "run.sh")],
                                   env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                self.assertIsNone(process.poll(), "Production server exited during startup")
                try:
                    # HTTPConnection leaves HTTP/1.1 keep-alive enabled by default;
                    # the server must explicitly close it for the adapter.
                    connection = HTTPConnection("127.0.0.1", port, timeout=1)
                    try:
                        connection.request("GET", "/health")
                        response = connection.getresponse()
                        self.assertEqual(json.load(response), {"status": "ok"})
                        self.assertEqual(response.headers.get("Connection"), "close")
                    finally:
                        connection.close()
                    return
                except OSError:
                    time.sleep(0.1)
            self.fail("Production server did not become ready")
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
