"""Check Groq credentials and model availability without printing credentials."""
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = "backend"

from .config import load_local_env
from .llm import NoRedirect, chat, ChatError


def main():
    load_local_env()
    base = os.environ.get("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
    key = os.environ.get("LLM_API_KEY") or os.environ.get("GROQ_API_KEY", "")
    model = os.environ.get("LLM_MODEL", "openai/gpt-oss-20b")
    print("Credential source:", "LLM_API_KEY" if os.environ.get("LLM_API_KEY") else "GROQ_API_KEY")
    print("Credential configured:", bool(key))
    if base != "https://api.groq.com/openai/v1":
        print("Non-default base URL configured; this diagnostic only contacts Groq's official endpoint.")
        return 1
    if not key:
        print("Set GROQ_API_KEY in backend/.env and restart the server.")
        return 1
    try:
        request = Request(base + "/models", headers={"Authorization": "Bearer " + key,
                          "User-Agent": "Codelinq-Chat/1.0", "Accept": "application/json"})
        with build_opener(NoRedirect()).open(request, timeout=20) as response:
            data = json.load(response)
        ids = {item["id"] for item in data["data"]}
        print("Credentials accepted: yes")
        print("Configured model listed:", model in ids)
        # Exercise the exact chatbot request, including the system instructions.
        events = []
        result = chat({"messages": [{"role": "user", "content": "In two sentences, explain what a term life insurance policy is."}]}, events.append)
        print("Streaming text received:", any(event.get("delta") for event in events))
        print("Chatbot completion accepted:", bool(result.get("reply")))
        return 0
    except ChatError as error:
        print("Chatbot check failed:", error.message)
        return 1
    except HTTPError as error:
        with error:
            try:
                body = json.loads(error.read(65536))
                code = body.get("error", {}).get("code")
            except (ValueError, AttributeError):
                code = None
        print("Provider HTTP status:", error.code)
        known = {"invalid_api_key", "model_not_found", "model_decommissioned", "model_permission_blocked",
                 "organization_restricted", "rate_limit_exceeded", "insufficient_quota"}
        print("Provider error code:", code if isinstance(code, str) and code in known else "unclassified")
        return 1
    except (URLError, TimeoutError):
        print("Provider network request failed; check network access.")
        return 2
    except (ValueError, KeyError, TypeError):
        print("Provider returned an unexpected response.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
