"""Voice with Abe: start an OpenAI Realtime session for the Quest app.

The headset talks to OpenAI directly over a WebSocket, so the audio never passes
through this server. This endpoint only trades the long-lived API key, which stays
here, for a client secret that expires in a minute. The model, the voice, Abe's
instructions and his one tool are fixed here too, so they do not ship in the APK.
"""
import json
import os
import time
import urllib.error
import urllib.request

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from .intake import HOUSEHOLD, LIMITS
from .llm import ChatError, reserve_inference

CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"
DEFAULT_MODEL = "gpt-realtime-2.1"
VOICE = "ash"
SECRET_SECONDS = 60  # long enough to connect; the session itself outlives the secret
KEY_SECONDS = 300    # how long a function instance keeps the key before reading the secret again
_key = ("", 0.0)

VOICE_PROMPT = """You are Abe, the friendly guide in LinqLife, a life insurance needs assessment in a
VR headset. You look like a small, kindly Abraham Lincoln. Speak warmly, clearly and calmly,
at a steady, natural pace, in plain modern English. Money and loss are sensitive topics, so
keep the listener comfortable and confident. Keep every turn short: one or two sentences,
then one question, then wait.

The app, not you, runs the assessment. It decides which question is open, checks every
answer and does all the math. Messages that start with [app] come from the app, never from
the user: follow them, and never read them aloud or mention them.

- Ask only the question the app gives you, in your own warm words, without changing its
  meaning. Never ask two questions at once and never skip ahead.
- When the user answers, call record_answer right away, before you say anything. Set
  intent to "answer" and fill value (a plain number: dollars, years or age) or household.
  Convert spoken amounts yourself ("eighty grand" is 80000, "a quarter million" is 250000,
  "none" or "nothing" is 0). If they said the amount was per month or per year, set period
  and report the amount as stated: do not multiply it yourself.
- If they don't know, use intent "unsure". If they want to leave the question out, use "skip".
- Always put the user's own words in heard.
- The tool result tells you what was saved and exactly what to say or ask next. Follow it.
  If it says the answer was not saved, ask again the way it tells you to.
- Never guess, estimate or invent a value, and never save one the user did not say. A range
  or a vague amount is not an answer: ask kindly for one number.
- If they ask why you need something, or a general question about life insurance, answer in
  two or three plain sentences without calling the tool, then ask the open question again.
  This is education, not advice: do not recommend a product, an insurer or a coverage amount.
  For personal advice, point to a licensed professional.
- Do not state the final estimate or do any math yourself. The app shows the numbers on screen.
- If you could not hear or understand, say so kindly and ask again.
"""

TOOL = {
    "type": "function",
    "name": "record_answer",
    "description": "Save the user's answer to the question the app has open. The result says what to say next.",
    "parameters": {
        "type": "object",
        "properties": {
            "intent": {"type": "string", "enum": ["answer", "unsure", "skip"]},
            "value": {"type": "number", "description": "Dollars, years or age, as a plain number. Omit for the household question."},
            "household": {"type": "string", "enum": list(HOUSEHOLD),
                          "description": "Only for who depends on the user's income: both = partner and kids, "
                                         "others = parents or other family, none = no one."},
            "period": {"type": "string", "enum": ["month", "year"], "description": "Only when the user said per month or per year."},
            "extra": {"type": "object", "description": "Other fields the user stated outright in the same reply, as numbers.",
                      "properties": {name: {"type": "number"} for name in LIMITS}},
            "heard": {"type": "string", "description": "The user's reply, in their own words."},
        },
        "required": ["intent", "heard"],
    },
}


def session_config(model):
    return {
        "type": "realtime",
        "model": model,
        "instructions": VOICE_PROMPT,
        "output_modalities": ["audio"],
        "audio": {
            "input": {
                "format": {"type": "audio/pcm", "rate": 24000},
                "transcription": {"model": "gpt-4o-mini-transcribe", "language": "en"},
                "noise_reduction": {"type": "far_field"},
                "turn_detection": {"type": "semantic_vad"},
            },
            "output": {"format": {"type": "audio/pcm", "rate": 24000}, "voice": VOICE},
        },
        "tools": [TOOL],
        "tool_choice": "auto",
    }


def api_key():
    """The OpenAI key: OPENAI_API_KEY on a developer's computer, the stack's secret on Lambda."""
    global _key
    local = os.environ.get("OPENAI_API_KEY", "").strip()
    if local:
        return local
    secret = os.environ.get("OPENAI_API_KEY_SECRET", "").strip()
    if not secret:
        return ""
    value, read = _key
    if not value or time.monotonic() - read > KEY_SECONDS:
        try:
            client = boto3.client("secretsmanager", config=Config(
                connect_timeout=2, read_timeout=3, retries={"mode": "standard", "total_max_attempts": 2}))
            value = client.get_secret_value(SecretId=secret).get("SecretString", "").strip()
        except (BotoCoreError, ClientError):
            raise ChatError(503, "Voice is unavailable right now. Try again later.") from None
        # The stack holds the placeholder "unset" until a key is supplied at deploy time.
        if not value.startswith("sk-"):
            return ""
        _key = (value, time.monotonic())
    return value


def create_session():
    key = api_key()
    if not key:
        raise ChatError(503, "Voice is not configured on the server.")
    model = os.environ.get("OPENAI_REALTIME_MODEL", "").strip() or DEFAULT_MODEL
    reserve_inference()
    body = json.dumps({
        "expires_after": {"anchor": "created_at", "seconds": SECRET_SECONDS},
        "session": session_config(model),
    }).encode()
    request = urllib.request.Request(CLIENT_SECRETS_URL, data=body, method="POST", headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            secret = json.load(response)["value"]
    except urllib.error.HTTPError as error:
        # The provider's message can name the account, so only the status is passed on.
        if error.code == 429:
            raise ChatError(429, "Voice is busy right now. Try again in a minute.") from None
        raise ChatError(502, "The voice provider refused the session.") from None
    except (OSError, ValueError, KeyError, TypeError):
        raise ChatError(502, "Unable to reach the voice provider.") from None
    if not isinstance(secret, str) or not secret:
        raise ChatError(502, "The voice provider returned an invalid session.")
    return {"clientSecret": secret, "url": "wss://api.openai.com/v1/realtime?model=" + model, "model": model, "voice": VOICE}
