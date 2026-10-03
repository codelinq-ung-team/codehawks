"""Amazon Bedrock inference using the runtime IAM role."""
import os
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import (
    BotoCoreError, ClientError, ConnectTimeoutError, NoCredentialsError,
    PartialCredentialsError, ReadTimeoutError,
)

from .prompts import SYSTEM_PROMPT

MAX_REPLY_BYTES = 1024 * 1024


class ChatError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


@lru_cache(maxsize=1)
def get_client():
    # Resolve credentials lazily so offline tests and /health never contact AWS.
    # One attempt keeps pre-stream errors within CloudFront's origin read timeout.
    return boto3.client("bedrock-runtime", config=Config(
        signature_version="v4", connect_timeout=5, read_timeout=45,
        retries={"mode": "standard", "total_max_attempts": 1},
    ))


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
    messages = validate_messages(payload)
    model = os.environ.get("MODEL_ID", "").strip()
    if not model:
        raise ChatError(503, "Configure MODEL_ID on the server.")
    request = {
        "modelId": model, "system": [{"text": SYSTEM_PROMPT}], "messages": messages,
        "inferenceConfig": {"maxTokens": 4096},
    }
    try:
        client = get_client()
        if emit is not None:
            response = client.converse_stream(**request)
            stream = response["stream"]
            try:
                return consume_stream(stream, emit)
            finally:
                # Also release the upstream connection when emit detects a disconnect.
                stream.close()
        response = client.converse(**request)
        check_stop_reason(response["stopReason"])
        content = response["output"]["message"]["content"]
        reply = "".join(block["text"] for block in content if "text" in block)
        if not reply.strip():
            raise ValueError("Empty reply")
        if len(reply.encode("utf-8")) > MAX_REPLY_BYTES:
            raise ChatError(502, "The LLM returned an oversized response.")
        return {"reply": reply}
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


def consume_stream(stream, emit):
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
                    emit({"delta": delta})
        elif "messageStop" in event:
            check_stop_reason(event["messageStop"]["stopReason"])
            finished = True
    reply = "".join(parts)
    if not finished or not reply.strip():
        raise ChatError(502, "The LLM stream ended without a complete reply.")
    return {"reply": reply}
