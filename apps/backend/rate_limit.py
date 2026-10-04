"""Global rolling admission limit, shared by every Lambda instance."""
import os
import time
from decimal import Decimal
from functools import lru_cache
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

# Sized for the website: each typed chat answer is one call, so a visitor makes a few
# per minute. Reads and writes stay one small item.
LIMIT = 30
WINDOW_SECONDS = 60
MAX_CONFLICT_RETRIES = 3
KEY = {"id": {"S": "global"}}


class AdmissionError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


@lru_cache(maxsize=1)
def get_client():
    # Never retry an ambiguous write: it may already have consumed an admission.
    return boto3.client("dynamodb", config=Config(
        connect_timeout=1, read_timeout=2,
        retries={"mode": "standard", "total_max_attempts": 1},
    ))


def admit():
    table = os.environ.get("CHAT_RATE_LIMIT_TABLE", "").strip()
    if not table:
        if "AWS_LAMBDA_FUNCTION_NAME" not in os.environ:
            return  # Local harness only; production must fail closed.
        raise AdmissionError(503, "Chat rate limiting is unavailable. Try again later.")
    try:
        client = get_client()
        for _ in range(MAX_CONFLICT_RETRIES + 1):
            item = client.get_item(TableName=table, Key=KEY, ConsistentRead=True).get("Item")
            now = Decimal(str(time.time()))
            timestamps = []
            if item is not None:
                revision = item["revision"]["S"]
                entries = item["admissions"]["L"]
                if not revision or len(entries) > LIMIT:
                    raise ValueError("Invalid limiter state")
                for entry in entries:
                    stamp = Decimal(entry["N"])
                    if not stamp.is_finite() or stamp < 0:
                        raise ValueError("Invalid limiter timestamp")
                    if stamp > now - WINDOW_SECONDS:
                        timestamps.append(stamp)
            if len(timestamps) >= LIMIT:
                raise AdmissionError(429, "Chat is busy right now. Try again in a minute.")
            arguments = {
                "TableName": table,
                "Item": {**KEY, "revision": {"S": uuid4().hex},
                         "admissions": {"L": [{"N": str(t)} for t in timestamps + [now]]}},
                "ExpressionAttributeNames": {"#revision": "revision"} if item is not None else {"#id": "id"},
                "ConditionExpression": "#revision = :previous" if item is not None else "attribute_not_exists(#id)",
            }
            if item is not None:
                arguments["ExpressionAttributeValues"] = {":previous": {"S": revision}}
            try:
                client.put_item(**arguments)
                return
            except ClientError as error:
                if error.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                    raise
                # Another instance won. Re-read and recompute before retrying.
    except (BotoCoreError, ClientError, ValueError, KeyError, TypeError, ArithmeticError):
        pass
    raise AdmissionError(503, "Chat rate limiting is unavailable. Try again later.") from None
