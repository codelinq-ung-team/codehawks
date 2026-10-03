"""Provider HTTP requests and streaming text parsing."""
import json
import os
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .prompts import SYSTEM_PROMPT


class ChatError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


class NoRedirect(HTTPRedirectHandler):
    # Never forward a credential to a redirected endpoint.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def chat(payload, emit=None):
    result = generate_reply(payload, emit)
    latest = payload["messages"][-1]["content"].lower()
    needs_reference = any(term in latest for term in ("how much", "calculator", "enough coverage", "coverage needs"))
    if needs_reference and "calcxml.com/calculators/life-insurance-calculator" not in result["reply"]:
        reference = "\n\nCoverage planning reference: [Lincoln Financial's life insurance calculator](https://calcxml.com/calculators/life-insurance-calculator?skn=458&r=1)."
        result["reply"] += reference
        if emit is not None:
            emit({"delta": reference})
    return result


def generate_reply(payload, emit=None):
    messages = payload.get("messages") if isinstance(payload, dict) else None
    if not isinstance(messages, list) or not 1 <= len(messages) <= 40:
        raise ChatError(400, "messages must contain between 1 and 40 messages.")
    clean = []
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in ("user", "assistant"):
            raise ChatError(400, "Each message must have a user or assistant role.")
        content = message.get("content")
        if not isinstance(content, str) or not content.strip() or len(content) > 12000:
            raise ChatError(400, "Message content must be nonempty text up to 12000 characters.")
        clean.append({"role": message["role"], "content": content})
    if clean[-1]["role"] != "user":
        raise ChatError(400, "The last message must be from the user.")
    base = os.environ.get("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
    key = os.environ.get("LLM_API_KEY") or os.environ.get("GROQ_API_KEY", "")
    model = os.environ.get("LLM_MODEL", "openai/gpt-oss-20b")
    if not all((base, key, model)):
        raise ChatError(503, "Set GROQ_API_KEY on the server (or configure LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL).")
    parsed = urlsplit(base)
    local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if (parsed.scheme != "https" and not (parsed.scheme == "http" and local)) or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ChatError(503, "LLM_BASE_URL must use HTTPS (HTTP is allowed for localhost only).")
    provider_payload = {"model": model, "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + clean, "stream": emit is not None}
    if parsed.hostname == "api.groq.com":
        provider_payload["max_completion_tokens"] = 4096
        if model in ("openai/gpt-oss-120b", "openai/gpt-oss-20b"):
            provider_payload["reasoning_effort"] = "low"
            provider_payload["include_reasoning"] = False
    body = json.dumps(provider_payload).encode()
    request = Request(base + "/chat/completions", data=body, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json",
        "User-Agent": "Codelinq-Chat/1.0", "Accept": "application/json",
    }, method="POST")
    try:
        with build_opener(NoRedirect()).open(request, timeout=45) as response:
            if emit is not None:
                return consume_stream(response, emit)
            raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ChatError(502, "The LLM returned an oversized response.")
        result = json.loads(raw)
        choice = result["choices"][0]
        if choice.get("finish_reason") == "length":
            raise ChatError(502, "The reply exceeded the output limit. Try a narrower question.")
        reply = choice["message"]["content"]
        if not isinstance(reply, str) or not reply.strip():
            raise ValueError("No text reply")
        return {"reply": reply}
    except HTTPError as error:
        with error:
            try:
                details = json.loads(error.read(65536))
                provider_error = details.get("error", {})
                code = provider_error.get("code") if isinstance(provider_error, dict) else None
            except (ValueError, AttributeError):
                code = None
        # Return fixed explanations, never raw provider messages or credential data.
        if code in ("model_not_found", "model_decommissioned") or error.code == 404:
            raise ChatError(502, "The configured model is unavailable to this provider account. Set LLM_MODEL to an accessible model in backend/.env and restart the server.") from None
        if error.code == 401:
            raise ChatError(502, "The provider rejected the API key. Update GROQ_API_KEY (or LLM_API_KEY) and restart the server; environment variables override backend/.env.") from None
        if error.code == 403:
            raise ChatError(502, "The provider denied access. Check your Groq project and model permissions.") from None
        if error.code == 429:
            raise ChatError(429, "The LLM is rate limited. Try again later.") from None
        if error.code >= 500:
            raise ChatError(502, "The LLM provider is temporarily unavailable. Try again later.") from None
        raise ChatError(502, "The LLM rejected the request. Check server credentials and model configuration.") from None
    except (TimeoutError, socket.timeout):
        raise ChatError(504, "The LLM request timed out.") from None
    except URLError:
        raise ChatError(502, "Unable to reach the LLM provider.") from None
    except (ValueError, KeyError, IndexError, TypeError):
        raise ChatError(502, "The LLM returned an invalid Chat Completions response.") from None


def consume_stream(response, emit):
    """Forward provider SSE text deltas immediately, excluding reasoning."""
    parts, event = [], []
    total = 0
    finished = False
    while True:
        line = response.readline(65537)
        if not line:
            break
        total += len(line)
        if len(line) > 65536 or total > 1024 * 1024:
            raise ChatError(502, "The LLM returned an oversized response.")
        text = line.decode("utf-8").rstrip("\r\n")
        if text.startswith("data:"):
            event.append(text[5:].lstrip())
        elif not text and event:
            data = "\n".join(event)
            event = []
            if data == "[DONE]":
                if not finished or not "".join(parts).strip():
                    raise ChatError(502, "The LLM stream ended without a complete reply.")
                return {"reply": "".join(parts)}
            chunk = json.loads(data)
            if "error" in chunk:
                raise ChatError(502, "The LLM stream failed. Please try again.")
            choices = chunk.get("choices", [])
            if not choices:
                continue
            choice = choices[0]
            reason = choice.get("finish_reason")
            if reason == "length":
                raise ChatError(502, "The reply exceeded the output limit. Try a narrower question.")
            if reason:
                if reason != "stop":
                    raise ChatError(502, "The LLM could not complete a text reply.")
                finished = True
            delta = choice.get("delta", {}).get("content")
            if delta is not None:
                if not isinstance(delta, str):
                    raise ValueError("Invalid delta")
                parts.append(delta)
                if delta:
                    emit({"delta": delta})
    raise ChatError(502, "The LLM connection closed before the reply was complete. Please try again.")
