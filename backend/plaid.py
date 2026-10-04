"""Privacy-limited Plaid Sandbox access and signed AI context."""
import hashlib
import hmac
import json
import os
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from itsdangerous import BadData, SignatureExpired, URLSafeTimedSerializer


PLAID_BASE_URL = "https://sandbox.plaid.com"
CONTEXT_MAX_AGE_SECONDS = 30 * 60
MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024
MAX_ACCOUNTS = 200
SAFE_VALUE = re.compile(r"^[a-z0-9 _-]{1,40}$")


class PlaidError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def _credentials():
    client_id = os.environ.get("PLAID_CLIENT_ID", "").strip()
    secret = os.environ.get("PLAID_SECRET", "").strip()
    environment = os.environ.get("PLAID_ENV", "sandbox").strip().lower()
    if environment != "sandbox":
        raise PlaidError(503, "This demo is configured for Plaid Sandbox only.")
    if not client_id or not secret:
        raise PlaidError(503, "Configure Plaid Sandbox credentials on the server.")
    return client_id, secret


def _post(path, payload):
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = Request(
        PLAID_BASE_URL + path,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read(MAX_PROVIDER_RESPONSE_BYTES + 1)
    except HTTPError as error:
        if error.code == 429:
            raise PlaidError(429, "Plaid is rate limited. Try again later.") from None
        if error.code in (401, 403):
            raise PlaidError(503, "Plaid Sandbox credentials were rejected.") from None
        raise PlaidError(502, "Plaid could not complete the request. Try again later.") from None
    except (URLError, TimeoutError, OSError):
        raise PlaidError(504, "Plaid did not respond in time. Try again later.") from None
    if len(raw) > MAX_PROVIDER_RESPONSE_BYTES:
        raise PlaidError(502, "Plaid returned an invalid response.")
    try:
        result = json.loads(raw)
    except (ValueError, UnicodeError):
        raise PlaidError(502, "Plaid returned an invalid response.") from None
    if not isinstance(result, dict):
        raise PlaidError(502, "Plaid returned an invalid response.")
    return result


def create_link_token():
    client_id, secret = _credentials()
    result = _post("/link/token/create", {
        "client_id": client_id,
        "secret": secret,
        "client_name": os.environ.get("PLAID_CLIENT_NAME", "LinqLife")[:30],
        "user": {"client_user_id": str(uuid.uuid4())},
        "products": ["transactions"],
        "country_codes": ["US"],
        "language": "en",
    })
    token = result.get("link_token")
    expiration = result.get("expiration")
    if not isinstance(token, str) or not token or not isinstance(expiration, str):
        raise PlaidError(502, "Plaid returned an invalid link token.")
    return {"link_token": token, "expiration": expiration}


def exchange_and_get_accounts(public_token):
    if not isinstance(public_token, str) or not public_token.strip() or len(public_token) > 2048:
        raise PlaidError(400, "public_token must be nonempty text up to 2048 characters.")
    client_id, secret = _credentials()
    exchanged = _post("/item/public_token/exchange", {
        "client_id": client_id, "secret": secret, "public_token": public_token.strip(),
    })
    access_token = exchanged.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise PlaidError(502, "Plaid returned an invalid access token.")
    try:
        result = _post("/accounts/get", {
            "client_id": client_id, "secret": secret, "access_token": access_token,
        })
        return normalize_accounts(result.get("accounts"))
    finally:
        # This integration deliberately does not persist an Item or access token.
        access_token = None


def _safe_enum(value, fallback="unknown"):
    if not isinstance(value, str):
        return fallback
    value = value.strip().lower()
    return value if SAFE_VALUE.fullmatch(value) else fallback


def _amount(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        return None
    if not number.is_finite() or abs(number) > Decimal("1000000000000"):
        return None
    return number


def _json_amount(value):
    return None if value is None else float(value)


def _category(account_type):
    return {
        "depository": "liquid_asset",
        "investment": "investment_asset",
        "credit": "debt",
        "loan": "debt",
    }.get(account_type, "other")


def normalize_accounts(accounts):
    if not isinstance(accounts, list) or len(accounts) > MAX_ACCOUNTS:
        raise PlaidError(502, "Plaid returned an invalid accounts response.")
    normalized = []
    totals = {}
    for account in accounts:
        if not isinstance(account, dict) or not isinstance(account.get("balances"), dict):
            raise PlaidError(502, "Plaid returned an invalid accounts response.")
        balances = account["balances"]
        account_type = _safe_enum(account.get("type"))
        subtype = _safe_enum(account.get("subtype"))
        currency = balances.get("iso_currency_code")
        currency = currency.upper() if isinstance(currency, str) and re.fullmatch(r"[A-Za-z]{3}", currency) else "UNKNOWN"
        current = _amount(balances.get("current"))
        available = _amount(balances.get("available"))
        limit = _amount(balances.get("limit"))
        category = _category(account_type)
        normalized.append({
            "category": category,
            "type": account_type,
            "subtype": subtype,
            "currentBalance": _json_amount(current),
            "availableBalance": _json_amount(available),
            "limit": _json_amount(limit),
            "currency": currency,
        })
        bucket = totals.setdefault(currency, {
            "liquidAssets": Decimal(0),
            "investmentAssets": Decimal(0),
            "debtBalances": Decimal(0),
        })
        if current is not None and current > 0:
            if category == "liquid_asset":
                bucket["liquidAssets"] += current
            elif category == "investment_asset":
                bucket["investmentAssets"] += current
            elif category == "debt":
                bucket["debtBalances"] += current
    json_totals = {
        currency: {name: float(value) for name, value in values.items()}
        for currency, values in sorted(totals.items())
    }
    return {
        "version": 1,
        "source": "plaid_accounts_get",
        "environment": "sandbox",
        "asOf": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "accounts": normalized,
        "totalsByCurrency": json_totals,
        "limitations": [
            "Balances may be cached and must be confirmed by the user.",
            "This does not include transaction history, verified income, detailed liabilities, dependents, future expenses, or existing life insurance.",
            "Account classifications and whether funds are available for insurance planning must be confirmed by the user.",
        ],
    }


def _serializer():
    _, secret = _credentials()
    signing_key = hmac.new(
        secret.encode("utf-8"), b"linqlife-plaid-context-signing-v1", hashlib.sha256,
    ).digest()
    return URLSafeTimedSerializer(signing_key, salt="plaid-financial-context-v1")


def sign_financial_context(snapshot):
    return _serializer().dumps(snapshot)


def load_financial_context(token):
    if not isinstance(token, str) or not token or len(token) > 32768:
        raise PlaidError(400, "Plaid financial context is invalid or expired. Reconnect your account.")
    try:
        snapshot = _serializer().loads(token, max_age=CONTEXT_MAX_AGE_SECONDS)
    except (BadData, SignatureExpired):
        raise PlaidError(400, "Plaid financial context is invalid or expired. Reconnect your account.") from None
    if not isinstance(snapshot, dict) or snapshot.get("source") != "plaid_accounts_get":
        raise PlaidError(400, "Plaid financial context is invalid or expired. Reconnect your account.")
    return snapshot
