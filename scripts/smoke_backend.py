"""Exercise the deployed backend from the main-branch deployment workflow."""
import hashlib
import json
import re
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from aws_actions import check_context, describe_app
from validate_repo import CONFIG

SITE = f"https://{CONFIG['site_domain']}"


def request(path, body=None):
    headers = {"Content-Type": "application/json"}
    if body is not None:
        headers["x-amz-content-sha256"] = hashlib.sha256(body).hexdigest()
    req = Request(SITE + path, data=body, headers=headers)
    try:
        return urlopen(req, timeout=120)
    except HTTPError as error:
        return error


def check_api():
    with request("/api/health") as response:
        assert response.status == 200 and json.load(response) == {"status": "ok"}, "Backend health failed"
    with request("/api/chat", b'{"messages":[]}') as response:
        assert response.status == 400 and "error" in json.load(response), "API input errors must retain JSON/status"
    messages = [{"role": "user", "content": "Explain term life insurance in one sentence."}]
    with request("/api/chat", json.dumps({"messages": messages, "stream": False}).encode()) as response:
        assert response.status == 200, "Buffered Bedrock request failed"
        assert json.load(response).get("reply", "").strip(), "Buffered Bedrock response was empty"
    started = time.monotonic()
    first_delta = None
    done, parts = False, []
    with request("/api/chat", json.dumps({"messages": messages}).encode()) as response:
        assert response.status == 200, "Streaming Bedrock request failed"
        assert response.headers.get_content_type() == "application/x-ndjson", "Unexpected stream content type"
        for line in response:
            event = json.loads(line)
            assert not done and "error" not in event, "Stream failed or continued after completion"
            if "delta" in event:
                assert isinstance(event["delta"], str), "Invalid text delta"
                if first_delta is None:
                    first_delta = time.monotonic() - started
                parts.append(event["delta"])
            elif event == {"done": True}:
                done = True
            else:
                raise AssertionError("Unknown stream event")
    assert done and "".join(parts).strip(), "Stream ended without a complete reply"
    print(f"Backend checks passed: health, input errors, buffered reply, NDJSON completion (first text {first_delta:.2f}s).")


def check_private_origin(url):
    if not re.fullmatch(r"https://[a-z0-9]+\.lambda-url\.us-east-1\.on\.aws/", url):
        raise ValueError("Unexpected chat Function URL")
    try:
        with urlopen(url + "api/health", timeout=20):
            raise AssertionError("Anonymous direct Function URL access unexpectedly succeeded")
    except HTTPError as error:
        with error:
            assert error.code == 403, "Expected IAM denial for anonymous origin access"
    print("Anonymous direct Function URL access denied.")


def main():
    # Live inference is intentionally restricted to the deployed Actions context.
    check_context("deploy")
    stack = describe_app()
    assert stack is not None, "App stack does not exist"
    outputs = {item["OutputKey"]: item["OutputValue"] for item in stack.get("Outputs", [])}
    check_private_origin(outputs["ChatFunctionUrl"])
    check_api()


if __name__ == "__main__":
    main()
