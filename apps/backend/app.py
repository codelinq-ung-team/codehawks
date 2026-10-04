"""Production API served by Gunicorn through Lambda Web Adapter."""
import json

from flask import Flask, Response, jsonify, request
from werkzeug.exceptions import HTTPException

from .intake import read_answer
from .llm import ChatError, chat, iter_chat_events
from . import pairing
from .plaid import PlaidError, create_link_token, exchange_and_get_accounts
from .voice import create_session

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 65536


@app.after_request
def no_cache(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@app.errorhandler(HTTPException)
def http_error(error):
    return jsonify(error="Not found" if error.code == 404 else error.name), error.code


@app.get("/health")
@app.get("/api/health")
def health():
    return jsonify(status="ok")


def json_payload():
    if request.headers.get("Transfer-Encoding"):
        raise ChatError(400, "Use Content-Length; chunked requests are unsupported.")
    if request.mimetype != "application/json":
        raise ChatError(415, "Send Content-Type: application/json.")
    if not request.content_length or request.content_length > 65536:
        raise ChatError(413, "Request body must be between 1 and 65536 bytes.")
    try:
        return json.loads(request.get_data())
    except (ValueError, UnicodeError):
        raise ChatError(400, "Request body must be valid JSON.") from None


@app.post("/api/intake")
def intake_route():
    try:
        return jsonify(read_answer(json_payload()))
    except ChatError as error:
        return jsonify(error=error.message), error.status


@app.post("/api/plaid/link-token")
def plaid_link_token_route():
    try:
        if json_payload() != {}:
            raise PlaidError(400, "Request body must be an empty JSON object.")
        return jsonify(create_link_token())
    except (ChatError, PlaidError) as error:
        return jsonify(error=error.message), error.status


@app.post("/api/plaid/exchange")
def plaid_exchange_route():
    try:
        payload = json_payload()
        if not isinstance(payload, dict) or set(payload) != {"public_token"}:
            raise PlaidError(400, "Request body must contain only public_token.")
        return jsonify(connected=True, financialSnapshot=exchange_and_get_accounts(payload["public_token"]))
    except (ChatError, PlaidError) as error:
        return jsonify(error=error.message), error.status


@app.post("/api/voice/session")
def voice_session_route():
    try:
        json_payload()  # the body is unused, but CloudFront needs one to sign
        return jsonify(create_session())
    except ChatError as error:
        return jsonify(error=error.message), error.status


@app.post("/api/pair")
def pair_create_route():
    try:
        return jsonify(pairing.create(json_payload())), 201
    except ChatError as error:
        return jsonify(error=error.message), error.status


@app.post("/api/pair/join")
def pair_join_route():
    try:
        return jsonify(pairing.join(json_payload()))
    except ChatError as error:
        return jsonify(error=error.message), error.status


@app.get("/api/pair/<session_id>")
def pair_read_route(session_id):
    try:
        return jsonify(pairing.read(session_id))
    except ChatError as error:
        return jsonify(error=error.message), error.status


@app.post("/api/pair/<session_id>")
def pair_update_route(session_id):
    try:
        return jsonify(pairing.update(session_id, json_payload()))
    except ChatError as error:
        return jsonify(error=error.message), error.status


@app.post("/api/chat")
def chat_route():
    events = None
    try:
        payload = json_payload()
        if isinstance(payload, dict) and payload.get("stream", True) is False:
            return jsonify(chat(payload))
        events = iter_chat_events(payload)
        # Keep the HTTP error status until the first model text is available.
        first = next(events)
    except ChatError as error:
        if events is not None:
            events.close()
        return jsonify(error=error.message), error.status

    def body():
        try:
            yield json.dumps(first) + "\n"
            for event in events:
                yield json.dumps(event) + "\n"
        except ChatError as error:
            yield json.dumps({"error": error.message}) + "\n"
        finally:
            events.close()

    response = Response(body(), content_type="application/x-ndjson; charset=utf-8")
    response.headers["X-Accel-Buffering"] = "no"
    response.call_on_close(events.close)
    return response
