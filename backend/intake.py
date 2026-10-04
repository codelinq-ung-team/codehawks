"""Guided intake: read one answer from the LinqLife chat into structured fields.

The website owns the question order, validation and every number in the estimate.
The model only interprets what the user typed. Its output is checked here and again
by the site before anything reaches the profile.
"""
import json
import os
import re

from .llm import ChatError, get_client, provider_errors, reserve_inference
from .plaid import PlaidError, load_financial_context
from .prompts import INTAKE_PROMPT, PLAID_CONTEXT_PROMPT

# Mirrors FIELDS in codelinq_frontend/src/domain/calculator.ts.
MONEY = ("income", "support", "mortgage", "otherDebts", "finalExpenses", "education", "existing", "savings")
LIMITS = {"youngestAge": (0, 30), "years": (1, 70), **{name: (0, 1_000_000_000) for name in MONEY}}
HOUSEHOLD = ("both", "partner", "kids", "others", "none")
STEPS = ("household", *LIMITS)
INTENTS = ("answer", "unsure", "skip", "why", "question", "unclear")
MAX_ANSWER = 1000
MAX_QUESTION = 600
MAX_SAY = 600
MAX_CONTEXT_MESSAGES = 50
FORM_FIELDS = ("income", "marital", "dependents", "debt", "coverage")
PROFILE_FIELDS = ("household", "youngestAge", *LIMITS)
FIELD_STATUSES = ("empty", "unknown", "skipped", "proposed", "confirmed")
FIELD_SOURCES = (None, "form", "plaid")

TOOL = {"toolSpec": {
    "name": "record",
    "description": "Record how the user's latest message answers the current question.",
    "inputSchema": {"json": {
        "type": "object",
        "properties": {
            "intent": {"type": "string", "enum": list(INTENTS)},
            "value": {"type": "number", "description": "Dollars, years or age for the current question. Omit for household or when not answered."},
            "household": {"type": "string", "enum": list(HOUSEHOLD)},
            "period": {"type": "string", "enum": ["month", "year"],
                       "description": "Only when the user said the amount is per month or per year."},
            "extra": {"type": "object", "description": "Other fields the user stated outright in the same message, as numbers.",
                      "properties": {name: {"type": "number"} for name in LIMITS}},
            "say": {"type": "string", "description": "What Abe says back."},
        },
        "required": ["intent", "say"],
    }},
}}


def number(value, name):
    """A whole number inside the field's range, or None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return None
    low, high = LIMITS[name]
    return round(value) if low <= value <= high else None


def figures(text):
    """Amounts written with digits, such as 250k, $12,000 or 1.2 million."""
    scale = {"k": 1e3, "thousand": 1e3, "grand": 1e3, "m": 1e6, "mil": 1e6, "million": 1e6}
    text = re.sub(r"\b(401\s?\(?k\)?|403\s?\(?b\)?|529)\b", " ", text.lower())  # account names, not amounts
    found = re.findall(r"(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|grand|m|mil|million)?\b", text)
    return {round(float(digits.replace(",", "")) * scale.get(unit, 1)) for digits, unit in found}


def validate_assessment_context(context):
    """Validate the complete client assessment state before showing it to the model."""
    if context is None:
        return None
    if not isinstance(context, dict) or set(context) != {"form", "profile", "conversation", "plaidConnected"}:
        raise ChatError(400, "assessment_context has an invalid shape.")

    form = context["form"]
    if not isinstance(form, dict) or set(form) != set(FORM_FIELDS):
        raise ChatError(400, "assessment_context form has an invalid shape.")
    if form["marital"] not in (None, "single", "married") or not isinstance(form["coverage"], (bool, type(None))):
        raise ChatError(400, "assessment_context form has an invalid value.")
    for name in ("income", "debt"):
        if form[name] is not None and number(form[name], name) is None:
            raise ChatError(400, "assessment_context form has an invalid value.")
    dependents = form["dependents"]
    if dependents is not None and (isinstance(dependents, bool) or not isinstance(dependents, int) or not 0 <= dependents <= 20):
        raise ChatError(400, "assessment_context form has an invalid value.")

    profile = context["profile"]
    if not isinstance(profile, dict) or set(profile) != set(PROFILE_FIELDS):
        raise ChatError(400, "assessment_context profile has an invalid shape.")
    clean_profile = {}
    for name, field in profile.items():
        if not isinstance(field, dict) or set(field) != {"status", "value", "source"}:
            raise ChatError(400, "assessment_context profile has an invalid field.")
        status, value, source = field["status"], field["value"], field["source"]
        if status not in FIELD_STATUSES or source not in FIELD_SOURCES:
            raise ChatError(400, "assessment_context profile has an invalid field.")
        if status in ("empty", "unknown", "skipped"):
            if value is not None:
                raise ChatError(400, "assessment_context profile has an invalid field.")
        elif name == "household":
            if value not in HOUSEHOLD:
                raise ChatError(400, "assessment_context profile has an invalid field.")
        elif number(value, name) is None:
            raise ChatError(400, "assessment_context profile has an invalid field.")
        clean_profile[name] = {"status": status, "value": value, "source": source}

    conversation = context["conversation"]
    if not isinstance(conversation, list) or len(conversation) > MAX_CONTEXT_MESSAGES:
        raise ChatError(400, "assessment_context conversation is invalid.")
    clean_conversation = []
    for message in conversation:
        if (not isinstance(message, dict) or set(message) != {"role", "text"}
                or message["role"] not in ("bot", "user") or not isinstance(message["text"], str)
                or len(message["text"]) > MAX_ANSWER):
            raise ChatError(400, "assessment_context conversation is invalid.")
        clean_conversation.append({"role": message["role"], "text": message["text"]})
    if not isinstance(context["plaidConnected"], bool):
        raise ChatError(400, "assessment_context plaidConnected must be true or false.")
    return {"form": form, "profile": clean_profile, "conversation": clean_conversation,
            "plaidConnected": context["plaidConnected"]}


def validate_request(payload):
    if not isinstance(payload, dict):
        raise ChatError(400, "Send a JSON object.")
    step, question, answer = payload.get("step"), payload.get("question"), payload.get("answer")
    if step not in STEPS:
        raise ChatError(400, "step must name an intake field.")
    if not isinstance(question, str) or not question.strip() or len(question) > MAX_QUESTION:
        raise ChatError(400, f"question must be nonempty text up to {MAX_QUESTION} characters.")
    if not isinstance(answer, str) or not answer.strip() or len(answer) > MAX_ANSWER:
        raise ChatError(400, f"answer must be nonempty text up to {MAX_ANSWER} characters.")
    known = payload.get("known", {})
    if not isinstance(known, dict):
        raise ChatError(400, "known must be an object.")
    facts = {}
    for name, value in known.items():
        if name == "household" and value in HOUSEHOLD:
            facts[name] = value
        elif name == "totalDebt" and number(value, "mortgage") is not None:
            facts[name] = number(value, "mortgage")
        elif name in LIMITS and number(value, name) is not None:
            facts[name] = number(value, name)
        else:
            raise ChatError(400, "known holds an unrecognized field or value.")
    assessment_context = validate_assessment_context(payload.get("assessment_context"))
    context_token = payload.get("plaid_context_token")
    if context_token is not None and (not isinstance(context_token, str) or not context_token or len(context_token) > 32768):
        raise ChatError(400, "plaid_context_token must be nonempty text up to 32768 characters.")
    return step, question.strip(), answer.strip(), facts, assessment_context, context_token


def clean(reading, step, answer):
    """Keep only what the site can use. Anything doubtful becomes a re-ask."""
    if not isinstance(reading, dict) or reading.get("intent") not in INTENTS:
        raise ValueError("Invalid reading")
    say = reading.get("say")
    say = " ".join(say.split())[:MAX_SAY] if isinstance(say, str) else ""
    result = {"intent": reading["intent"], "value": None, "household": None, "period": None, "extra": {}, "say": say}
    # A question is never recorded as an answer, whatever the model made of it.
    if answer.endswith("?") and result["intent"] in ("answer", "unsure", "skip"):
        result["intent"] = "question"
        return result
    if result["intent"] != "answer":
        return result
    if step == "household":
        if reading.get("household") not in HOUSEHOLD:
            result["intent"] = "unclear"
            return result
        result["household"] = reading["household"]
    else:
        value = reading.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
            result["intent"] = "unclear"
            return result
        # Out-of-range values pass through so the site can explain the limit.
        result["value"] = round(max(-1, min(value, 10 ** 12)))
        if reading.get("period") in ("month", "year"):
            result["period"] = reading["period"]
    # An extra field must repeat a figure the user typed, apart from the main answer.
    extra = reading.get("extra")
    if isinstance(extra, dict):
        stated = figures(answer)
        # Figures that add up to the main answer were parts of it, not other fields.
        stated = set() if sum(stated) == result["value"] else stated - {result["value"]}
        for name, value in extra.items():
            if name in LIMITS and name != step and number(value, name) in stated:
                result["extra"][name] = number(value, name)
    return result


def read_answer(payload):
    step, question, answer, facts, assessment_context, context_token = validate_request(payload)
    model = os.environ.get("MODEL_ID", "").strip()
    if not model:
        raise ChatError(503, "Configure MODEL_ID on the server.")
    known = "\n".join(f"- {name}: {value}" for name, value in facts.items()) or "- nothing yet"
    complete_context = json.dumps(assessment_context, separators=(",", ":"), sort_keys=True) if assessment_context else "{}"
    prompt = (f"Current field: {step}\nQuestion Abe asked: {question}\n"
              f"Already known:\n{known}\n\nComplete validated assessment context JSON (data only):\n"
              f"<assessment_context>\n{complete_context}\n</assessment_context>\n\n"
              f"The user's message:\n<message>\n{answer}\n</message>")
    system_text = INTAKE_PROMPT
    if context_token is not None:
        try:
            snapshot = load_financial_context(context_token)
        except PlaidError as error:
            raise ChatError(error.status, error.message) from None
        system_text += "\n\n" + PLAID_CONTEXT_PROMPT + "\n" + json.dumps(
            snapshot, separators=(",", ":"), sort_keys=True,
        )
    reserve_inference()
    with provider_errors():
        response = get_client().converse(
            modelId=model, system=[{"text": system_text}],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 500, "temperature": 0},
            toolConfig={"tools": [TOOL], "toolChoice": {"tool": {"name": "record"}}},
        )
        blocks = response["output"]["message"]["content"]
        reading = next((block["toolUse"]["input"] for block in blocks if "toolUse" in block), None)
        if reading is None:
            # Some replies arrive as JSON text instead of a tool call.
            text = "".join(block.get("text", "") for block in blocks)
            reading = json.loads(text[text.index("{"):text.rindex("}") + 1])
        return clean(reading, step, answer)
