"""Pairing a browser with the Quest app, so a chat started on the site can be spoken in VR.

The site saves the answers from its Basics form and shows the pairing id as a QR code (and a
six-digit code to type). The headset reads the code, loads those answers, has the conversation
with Abe, and saves what he learned. The site polls for it and carries on at Review.

Only the form and the profile are held, for two hours, under an id nobody can guess. No
conversation text is stored. Nothing here calls a model, so it does not use the admission limit.
"""
import json
import os
import secrets
import time
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from .intake import HOUSEHOLD, LIMITS, STEPS
from .llm import ChatError

SESSION_SECONDS = 2 * 60 * 60
CODE_SECONDS = 10 * 60     # the typed code is easier to guess than the id, so it is short-lived and works once
ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford base32: fits a QR code's compact alphanumeric mode
ID_LENGTH = 26             # 130 random bits
STATUSES = ("waiting", "joined", "done")
FIELD_STATUSES = ("empty", "unknown", "skipped", "proposed", "confirmed")
FORM_LIMITS = {"age": 120, "income": 1_000_000_000, "dependents": 20, "debt": 1_000_000_000}
MAX_CODE_TRIES = 5
UNAVAILABLE = "Pairing with a headset is unavailable right now."
NOT_FOUND = "That pairing was not found, or it has expired."

_local = {}  # a developer's computer only: sessions live in this process


@lru_cache(maxsize=1)
def get_client():
    return boto3.client("dynamodb", config=Config(
        connect_timeout=1, read_timeout=2, retries={"mode": "standard", "total_max_attempts": 2}))


def table():
    name = os.environ.get("PAIRING_TABLE", "").strip()
    if not name and "AWS_LAMBDA_FUNCTION_NAME" in os.environ:
        raise ChatError(503, UNAVAILABLE)
    return name


def whole(value, high):
    """A whole number from 0 to high, or None. JSON numbers may arrive as 80000.0."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return None
    return int(value) if 0 <= value <= high and value == int(value) else None


def clean_form(form):
    if not isinstance(form, dict):
        raise ChatError(400, "form must be an object.")
    marital, coverage = form.get("marital"), form.get("coverage")
    return {
        **{name: whole(form.get(name), high) for name, high in FORM_LIMITS.items()},
        "marital": marital if marital in ("single", "married") else None,
        "coverage": coverage if isinstance(coverage, bool) else None,
    }


def clean_profile(profile):
    """Every field of the site's profile, with anything unexpected read as not answered."""
    if not isinstance(profile, dict):
        raise ChatError(400, "profile must be an object.")
    cleaned = {}
    for name in STEPS:
        field = profile.get(name)
        field = field if isinstance(field, dict) else {}
        status, value = field.get("status"), None
        if status in ("proposed", "confirmed"):
            if name == "household":
                value = field.get("value") if field.get("value") in HOUSEHOLD else None
            else:
                low, high = LIMITS[name]
                value = whole(field.get("value"), high)
                value = None if value is not None and value < low else value
            if value is None:
                status = "empty"
        elif status not in FIELD_STATUSES:
            status = "empty"
        cleaned[name] = {"status": status, "value": value}
        if field.get("source") in ("form", "plaid"):
            cleaned[name]["source"] = field["source"]
    return cleaned


def valid_id(session_id):
    return isinstance(session_id, str) and len(session_id) == ID_LENGTH and all(c in ID_ALPHABET for c in session_id)


def _put(key, item, fresh=False):
    """Save an item. With fresh, refuse to replace one that has not expired yet."""
    now = int(time.time())
    name = table()
    if not name:
        held = _local.get(key)
        if fresh and held and held["expires"] > now:
            return False
        _local[key] = item
        return True
    arguments = {"TableName": name, "Item": {
        "id": {"S": key}, "expires": {"N": str(item["expires"])}, "body": {"S": json.dumps(item)}}}
    if fresh:
        arguments.update(ConditionExpression="attribute_not_exists(#id) OR #expires < :now",
                         ExpressionAttributeNames={"#id": "id", "#expires": "expires"},
                         ExpressionAttributeValues={":now": {"N": str(now)}})
    try:
        get_client().put_item(**arguments)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise ChatError(503, UNAVAILABLE) from None
    except BotoCoreError:
        raise ChatError(503, UNAVAILABLE) from None
    return True


def _get(key):
    """The item, or None when it is missing or past its time (the table's own expiry can lag)."""
    name = table()
    try:
        if name:
            found = get_client().get_item(TableName=name, Key={"id": {"S": key}}, ConsistentRead=True).get("Item")
            item = json.loads(found["body"]["S"]) if found else None
        else:
            item = _local.get(key)
    except (BotoCoreError, ClientError, ValueError, KeyError, TypeError):
        raise ChatError(503, UNAVAILABLE) from None
    return item if item and item["expires"] > time.time() else None


def _delete(key):
    name = table()
    try:
        if name:
            get_client().delete_item(TableName=name, Key={"id": {"S": key}})
        else:
            _local.pop(key, None)
    except (BotoCoreError, ClientError):
        raise ChatError(503, UNAVAILABLE) from None


def public(session):
    return {name: session[name] for name in ("status", "form", "profile")}


def create(payload):
    if not isinstance(payload, dict):
        raise ChatError(400, "Request body must be a JSON object.")
    now = int(time.time())
    session_id = "".join(secrets.choice(ID_ALPHABET) for _ in range(ID_LENGTH))
    for _ in range(MAX_CODE_TRIES):
        code = f"{secrets.randbelow(1_000_000):06d}"
        if _put("code#" + code, {"session": session_id, "expires": now + CODE_SECONDS}, fresh=True):
            break
    else:
        raise ChatError(503, UNAVAILABLE)
    _put("session#" + session_id, {
        "status": "waiting", "form": clean_form(payload.get("form", {})),
        "profile": clean_profile(payload.get("profile", {})), "expires": now + SESSION_SECONDS})
    return {"id": session_id, "code": code, "codeSeconds": CODE_SECONDS, "seconds": SESSION_SECONDS}


def join(payload):
    """Trade the six-digit code for the pairing id. The code works once."""
    code = payload.get("code") if isinstance(payload, dict) else None
    if not isinstance(code, str) or len(code) != 6 or not code.isdigit():
        raise ChatError(400, "code must be six digits.")
    held = _get("code#" + code)
    if not held:
        raise ChatError(404, "That code was not found, or it has expired.")
    _delete("code#" + code)
    return {"id": held["session"]}


def read(session_id):
    session = _get("session#" + session_id) if valid_id(session_id) else None
    if not session:
        raise ChatError(404, NOT_FOUND)
    return public(session)


def update(session_id, payload):
    """The headset saving how far it has got. Fields left out of the body stay as they are."""
    if not isinstance(payload, dict):
        raise ChatError(400, "Request body must be a JSON object.")
    session = _get("session#" + session_id) if valid_id(session_id) else None
    if not session:
        raise ChatError(404, NOT_FOUND)
    if "status" in payload:
        if payload["status"] not in STATUSES:
            raise ChatError(400, "status must be waiting, joined or done.")
        session["status"] = payload["status"]
    if "form" in payload:
        session["form"] = clean_form(payload["form"])
    if "profile" in payload:
        session["profile"] = clean_profile(payload["profile"])
    _put("session#" + session_id, session)
    return public(session)
