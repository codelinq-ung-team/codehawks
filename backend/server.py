"""HTTP routes and streaming transport. Run: python -m backend.server."""
import json
import os
import sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Direct script execution needs the same package context as python -m.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = "backend"

from .config import load_local_env
from .llm import ChatError, chat

MAX_BODY = 65536
LOCAL_UI = Path(__file__).resolve().parents[1] / "frontend" / "local-demo"


class Handler(BaseHTTPRequestHandler):
    def stream_event(self, event):
        if not self.streaming:
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Accel-Buffering", "no")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            self.streaming = True
        self.wfile.write((json.dumps(event) + "\n").encode())
        self.wfile.flush()

    def respond(self, status, body):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        assets = {"/": ("index.html", "text/html; charset=utf-8"),
                  "/chat.js": ("chat.js", "text/javascript; charset=utf-8"),
                  "/style.css": ("style.css", "text/css; charset=utf-8")}
        if self.path in assets:
            name, content_type = assets[self.path]
            data = (LOCAL_UI / name).read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            self.end_headers()
            self.wfile.write(data)
        elif self.path == "/health":
            self.respond(200, {"status": "ok"})
        else:
            self.respond(404, {"error": "Not found"})

    def do_POST(self):
        self.streaming = False
        self.connection.settimeout(50)
        origin = self.headers.get("Origin")
        port = self.server.server_port
        if origin and origin not in (f"http://127.0.0.1:{port}", f"http://localhost:{port}"):
            self.respond(403, {"error": "Use the local chat page to send messages."})
            return
        if self.path != "/api/chat":
            self.respond(404, {"error": "Not found"})
            return
        try:
            if self.headers.get("Transfer-Encoding"):
                raise ChatError(400, "Use Content-Length; chunked requests are unsupported.")
            if self.headers.get_content_type() != "application/json":
                raise ChatError(415, "Send Content-Type: application/json.")
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise ChatError(400, "Invalid Content-Length.") from None
            if not 0 < length <= MAX_BODY:
                raise ChatError(413, "Request body must be between 1 and 65536 bytes.")
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ChatError(400, "Incomplete request body.")
            try:
                payload = json.loads(raw)
            except (ValueError, UnicodeError):
                raise ChatError(400, "Request body must be valid JSON.") from None
            # Streaming is the default; explicit false supports older clients.
            if not isinstance(payload, dict) or payload.get("stream", True) is not False:
                chat(payload, self.stream_event)
                self.stream_event({"done": True})
            else:
                self.respond(200, chat(payload))
        except ChatError as error:
            if self.streaming:
                self.stream_event({"error": error.message})
            else:
                self.respond(error.status, {"error": error.message})
        except TimeoutError:
            if self.streaming:
                self.stream_event({"error": "Request timed out."})
            else:
                self.respond(408, {"error": "Request body timed out."})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            self.close_connection = True

    def log_message(self, format, *args):
        # Avoid logging message bodies, credentials, and attacker-controlled URLs.
        pass


if __name__ == "__main__":
    load_local_env()
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", "8000"))), Handler)
    print(f"Chat backend listening on http://127.0.0.1:{server.server_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
