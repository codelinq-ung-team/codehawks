"""Guided intake: read one answer from the LincLife chat into structured fields.

The website owns the question order, validation and every number in the estimate.
The model only interprets what the user typed. Its output is checked here and again
by the site before anything reaches the profile.
"""
import json
import os
import re
from itertools import combinations

from .llm import ChatError, get_client, provider_errors, reserve_inference
from .prompts import INTAKE_PROMPT

# Mirrors FIELDS in apps/web/src/domain/calculator.ts.
MONEY = ("income", "futureIncome", "support", "mortgage", "otherDebts", "finalExpenses", "education", "existing", "savings")
# plans: what the user expects in the next ten years, as bits (kids 1, home 2, partner 4). 0 is none of them.
PLANS = ("kids", "home", "partner")
LIMITS = {"youngestAge": (0, 30), "years": (1, 70), "plans": (0, 2 ** len(PLANS) - 1),
          **{name: (0, 1_000_000_000) for name in MONEY}}
HOUSEHOLD = ("both", "partner", "kids", "others", "none")
STEPS = ("household", *LIMITS)
INTENTS = ("answer", "unsure", "skip", "why", "question", "unclear")
MAX_ANSWER = 1000
MAX_QUESTION = 600
MAX_SAY = 600

TOOL = {"toolSpec": {
    "name": "record",
    "description": "Record how the user's latest message answers the current question.",
    "inputSchema": {"json": {
        "type": "object",
        "properties": {
            "intent": {"type": "string", "enum": list(INTENTS)},
            "value": {"type": "number", "description": "Dollars, years or age for the current question. Omit for household or when not answered."},
            "household": {"type": "string", "enum": list(HOUSEHOLD)},
            "plans": {"type": "array", "items": {"type": "string", "enum": list(PLANS)},
                      "description": "Only for the plans field: what they expect in the next ten years. Empty for none."},
            "period": {"type": "string", "enum": ["month", "year"],
                       "description": "Only when the user said the amount is per month or per year."},
            "extra": {"type": "object", "description": "Figures the message gives for fields other than the current one, as numbers. Fill it with any intent.",
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


# How a message starts when it asks something, as opposed to a guess ending in "?".
ASKS = re.compile(r"^(should|shall|do|does|did|is|are|am|can|could|would|will|what|why|how|which|who|when|where)\b")


def stated_amounts(answer, value):
    """What an extra field may hold: figures the user typed, apart from the main answer,
    their sums, and a few times one of them when the user said "each"."""
    typed = figures(answer)
    # Figures that add up to the main answer were parts of it, not other fields.
    typed = set() if value is not None and sum(typed) == value else typed - {value}
    typed = sorted(typed)[:8]
    allowed = {sum(group) for size in range(1, len(typed) + 1) for group in combinations(typed, size)}
    if re.search(r"\b(each|apiece|per (kid|child|person))\b", answer.lower()):
        allowed |= {figure * count for figure in typed for count in range(2, 7)}
    return allowed


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
    return step, question.strip(), answer.strip(), facts


def clean(reading, step, answer):
    """Keep only what the site can use. Anything doubtful becomes a re-ask."""
    if not isinstance(reading, dict) or reading.get("intent") not in INTENTS:
        raise ValueError("Invalid reading")
    say = reading.get("say")
    say = " ".join(say.split())[:MAX_SAY] if isinstance(say, str) else ""
    result = {"intent": reading["intent"], "value": None, "household": None, "period": None, "extra": {}, "say": say}
    # A question is never recorded as an answer, whatever the model made of it. A guess
    # that ends in "?" ("maybe 50k?") still counts when the figure is the one they typed.
    if answer.endswith("?") and result["intent"] in ("answer", "unsure", "skip"):
        guess = (result["intent"] == "answer" and not ASKS.match(answer.lower())
                 and number(reading.get("value"), step if step in LIMITS else "years") in figures(answer))
        if not guess:
            result["intent"] = "question"
            return result
    if result["intent"] == "unclear":
        # Nothing for this field, but the message may have answered another one.
        result["extra"] = extras(reading, step, answer, None)
    if result["intent"] != "answer":
        return result
    if step == "household":
        if reading.get("household") not in HOUSEHOLD:
            result["intent"] = "unclear"
            return result
        result["household"] = reading["household"]
    elif step == "plans":
        plans = reading.get("plans")
        if not isinstance(plans, list) or any(plan not in PLANS for plan in plans):
            result["intent"] = "unclear"
            return result
        result["value"] = sum(2 ** PLANS.index(plan) for plan in set(plans))
        return result
    else:
        value = reading.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
            result["intent"] = "unclear"
            return result
        # Out-of-range values pass through so the site can explain the limit.
        result["value"] = round(max(-1, min(value, 10 ** 12)))
        if reading.get("period") in ("month", "year"):
            result["period"] = reading["period"]
    result["extra"] = extras(reading, step, answer, result["value"])
    return result


def extras(reading, step, answer, value):
    """Other fields the message gave figures for. Each must come from what the user typed."""
    extra = reading.get("extra")
    if not isinstance(extra, dict):
        return {}
    allowed = stated_amounts(answer, value)
    return {name: number(amount, name) for name, amount in extra.items()
            if name in LIMITS and name not in (step, "plans") and number(amount, name) in allowed}


def read_answer(payload):
    step, question, answer, facts = validate_request(payload)
    model = os.environ.get("MODEL_ID", "").strip()
    if not model:
        raise ChatError(503, "Configure MODEL_ID on the server.")
    known = "\n".join(f"- {name}: {value}" for name, value in facts.items()) or "- nothing yet"
    prompt = (f"Current field: {step}\nQuestion Abe asked: {question}\n"
              f"Already known:\n{known}\n\nThe user's message:\n<message>\n{answer}\n</message>")
    reserve_inference()
    with provider_errors():
        response = get_client().converse(
            modelId=model, system=[{"text": INTAKE_PROMPT}],
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
