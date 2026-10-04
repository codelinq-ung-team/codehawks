"""Amazon Bedrock inference using the runtime IAM role."""
import os
from contextlib import contextmanager
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import (
    BotoCoreError, ClientError, ConnectTimeoutError, NoCredentialsError,
    PartialCredentialsError, ReadTimeoutError,
)

from .grounding import Gate, LEFT_OUT, allowed, keep_grounded
from .prompts import SYSTEM_PROMPT
from .rate_limit import AdmissionError, admit

MAX_REPLY_BYTES = 1024 * 1024


class ChatError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def reserve_inference():
    try:
        admit()
    except AdmissionError as error:
        raise ChatError(error.status, error.message) from None


@lru_cache(maxsize=1)
def get_client():
    # Resolve credentials lazily so offline tests and /health never contact AWS.
    # One attempt keeps pre-stream errors within CloudFront's origin read timeout.
    return boto3.client("bedrock-runtime", config=Config(
        signature_version="v4", connect_timeout=5, read_timeout=45,
        retries={"mode": "standard", "total_max_attempts": 1},
    ))


REFERENCE_TERMS = ("how much", "calculator", "enough coverage", "coverage needs")
REFERENCE_URL = "calcxml.com/calculators/life-insurance-calculator"
REFERENCE = "\n\nCoverage planning reference: [Lincoln Financial's life insurance calculator](https://calcxml.com/calculators/life-insurance-calculator?skn=458&r=1)."


def stated(payload):
    """Amounts a reply may quote: the user's own, which on the site include the calculator's
    summary of their estimate, and one step of arithmetic from them."""
    return allowed([m["content"] for m in payload["messages"] if m["role"] == "user"])


def needs_reference(payload, reply):
    latest = payload["messages"][-1]["content"].lower()
    return any(term in latest for term in REFERENCE_TERMS) and REFERENCE_URL not in reply


def chat(payload, emit=None):
    if emit is not None:
        parts = []
        for event in iter_chat_events(payload):
            if "delta" in event:
                parts.append(event["delta"])
                emit(event)
        return {"reply": "".join(parts)}
    reply, dropped = keep_grounded(generate_reply(payload)["reply"], stated(payload))
    if dropped:
        reply = reply.lstrip() + LEFT_OUT
    if needs_reference(payload, reply):
        reply += REFERENCE
    return {"reply": reply}


def validate_messages(payload):
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
        clean.append({"role": message["role"], "content": [{"text": content}]})
    if clean[-1]["role"] != "user":
        raise ChatError(400, "The last message must be from the user.")
    return clean


def check_stop_reason(reason):
    if reason == "max_tokens":
        raise ChatError(502, "The reply exceeded the output limit. Try a narrower question.")
    if reason != "end_turn":
        raise ChatError(502, "The LLM could not complete a text reply.")


def provider_error(code):
    if code in ("ThrottlingException", "throttlingException"):
        return ChatError(429, "The LLM is rate limited. Try again later.")
    if code in ("ModelTimeoutException", "modelTimeoutException"):
        return ChatError(504, "The LLM request timed out.")
    if code in ("AccessDeniedException", "ResourceNotFoundException"):
        return ChatError(502, "The configured model is unavailable to this account.")
    return ChatError(502, "The LLM provider is temporarily unavailable. Try again later.")


def generate_reply(payload, emit=None):
    if emit is not None:
        events = iter_reply_events(payload)
        parts = []
        try:
            for event in events:
                parts.append(event["delta"])
                emit(event)
        finally:
            events.close()
        return {"reply": "".join(parts)}
    request = model_request(payload)
    reserve_inference()
    with provider_errors():
        response = get_client().converse(**request)
        check_stop_reason(response["stopReason"])
        content = response["output"]["message"]["content"]
        reply = "".join(block["text"] for block in content if "text" in block)
        if not reply.strip():
            raise ValueError("Empty reply")
        if len(reply.encode("utf-8")) > MAX_REPLY_BYTES:
            raise ChatError(502, "The LLM returned an oversized response.")
        return {"reply": reply}


def model_request(payload):
    messages = validate_messages(payload)
    model = os.environ.get("MODEL_ID", "").strip()
    if not model:
        raise ChatError(503, "Configure MODEL_ID on the server.")
    return {
        "modelId": model, "system": [{"text": SYSTEM_PROMPT}], "messages": messages,
        "inferenceConfig": {"maxTokens": 4096},
    }


@contextmanager
def provider_errors():
    try:
        yield
    except ClientError as error:
        raise provider_error(error.response.get("Error", {}).get("Code")) from None
    except (ReadTimeoutError, ConnectTimeoutError, TimeoutError):
        raise ChatError(504, "The LLM request timed out.") from None
    except (NoCredentialsError, PartialCredentialsError):
        raise ChatError(503, "AWS runtime credentials are unavailable.") from None
    except BotoCoreError:
        raise ChatError(502, "Unable to reach the LLM provider.") from None
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        raise ChatError(502, "The LLM returned an invalid response.") from None


def iter_reply_events(payload):
    request = model_request(payload)
    reserve_inference()
    with provider_errors():
        stream = get_client().converse_stream(**request)["stream"]
        try:
            yield from consume_stream(stream)
        finally:
            stream.close()


def iter_chat_events(payload):
    """The reply a checked sentence at a time: see grounding.Gate."""
    events = iter_reply_events(payload)
    gate, parts = None, []
    try:
        for event in events:
            gate = gate or Gate(stated(payload))  # the first event means the payload was valid
            text = gate.feed(event["delta"])
            text = text if parts else text.lstrip()  # no blank opening when the first sentence was left out
            if text:
                parts.append(text)
                yield {"delta": text}
    finally:
        events.close()
    rest = gate.close()
    rest = (rest if parts else rest.lstrip()) + (LEFT_OUT if gate.dropped else "")
    if rest:
        parts.append(rest)
        yield {"delta": rest}
    if needs_reference(payload, "".join(parts)):
        yield {"delta": REFERENCE}
    yield {"done": True}


def consume_stream(stream):
    """Forward only text, and require messageStop before declaring success."""
    parts, total, finished = [], 0, False
    for event in stream:
        for name in event:
            if name.endswith("Exception"):
                raise provider_error(name)
        if "contentBlockDelta" in event:
            if finished:
                raise ChatError(502, "The LLM returned an invalid response.")
            delta = event["contentBlockDelta"]["delta"].get("text")
            if delta is not None:
                if not isinstance(delta, str):
                    raise ValueError("Invalid text delta")
                total += len(delta.encode("utf-8"))
                if total > MAX_REPLY_BYTES:
                    raise ChatError(502, "The LLM returned an oversized response.")
                parts.append(delta)
                if delta:
                    yield {"delta": delta}
        elif "messageStop" in event:
            check_stop_reason(event["messageStop"]["stopReason"])
            finished = True
    reply = "".join(parts)
    if not finished or not reply.strip():
        raise ChatError(502, "The LLM stream ended without a complete reply.")
