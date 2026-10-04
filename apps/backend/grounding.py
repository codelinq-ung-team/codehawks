"""Keeps the model's words to dollar amounts the code can account for.

The calculator owns every number in the estimate. The model explains, so an amount in
its text must be one the user typed, one the site supplied, or one step of arithmetic
from those, which is worked out here and not taken on trust. A sentence that quotes any
other amount is left out before the text is shown.
"""
import re
from itertools import combinations

SCALE = {"k": 1e3, "thousand": 1e3, "grand": 1e3, "m": 1e6, "mil": 1e6, "million": 1e6}
ACCOUNTS = re.compile(r"\b(401\s?\(?k\)?|403\s?\(?b\)?|529)\b")  # account names, not amounts
NUMBER = r"(\d[\d,]*(?:\.\d+)?)"
ANY = re.compile(NUMBER + r"\s*(k|thousand|grand|m|mil|million)?\b")
# What reads as money in a reply: $12,000, $1.2 million, 250k, 400,000, 500 dollars.
DOLLARS = re.compile(r"\$\s?" + NUMBER + r"\s*(k|thousand|grand|m|mil|million)?\b"
                     r"|\b" + NUMBER + r"\s*(k|thousand|grand|mil|million)\b"
                     r"|\b(\d{1,3}(?:,\d{3})+)\b"
                     r"|\b" + NUMBER + r"\s+dollars\b")
SENTENCES = re.compile(r"(?<=[.!?])(?=\s)|(?<=\n)")
BOUNDARY = re.compile(r"[.!?](?=\s)|\n")
MAX_BASE = 120  # past this many source amounts only the amounts themselves count
MAX_COUNT = 100
LEFT_OUT = ("\n\nI left out an amount I couldn’t check against the numbers you gave me. "
            "A licensed professional can give you exact figures.")


def value(digits, unit):
    return round(float(digits.replace(",", "")) * SCALE.get(unit, 1))


def figures(text):
    """Amounts written with digits, such as 250k, $12,000 or 1.2 million."""
    return {value(digits, unit) for digits, unit in ANY.findall(ACCOUNTS.sub(" ", text.lower()))}


def reach(money, counts=()):
    """The source amounts, plus what one step of arithmetic on them gives: a sum, a
    difference, an amount times a count the sources mention, or a month's or year's worth."""
    money = set(money)
    if len(money) > MAX_BASE:
        return money
    within = money | {a * 12 for a in money} | {round(a / 12) for a in money}
    within |= {a * n for a in money for n in counts}
    for a, b in combinations(money, 2):
        within |= {a + b, abs(a - b)}
    return within


def allowed(*sources):
    """What a reply may quote, given what the user typed and the site supplied: text, numbers,
    or lists and objects of them. A number up to 100 is a count (years, an age) unless the
    source wrote it as money, so "10 years" never licenses "$10 a month"."""
    found, written = set(), set()

    def collect(data):
        if isinstance(data, str):
            found.update(figures(data))
            written.update(quoted(data))
        elif isinstance(data, (int, float)) and not isinstance(data, bool):
            found.add(round(data))
        elif isinstance(data, dict):
            collect(list(data.values()))
        elif isinstance(data, (list, tuple, set)):
            for item in data:
                collect(item)

    collect(sources)
    return reach({n for n in found if n > MAX_COUNT} | written, {n for n in found if 1 < n <= MAX_COUNT})


def quoted(text):
    """The dollar amounts a reply states."""
    found = []
    for match in DOLLARS.finditer(ACCOUNTS.sub(lambda m: " " * len(m.group()), text.lower())):
        a, a_unit, b, b_unit, grouped, plain = match.groups()
        found.append(value(a or b or grouped or plain, a_unit or b_unit))
    return found


def grounded(text, within):
    return all(amount == 0 or amount in within for amount in quoted(text))


def keep_grounded(text, within):
    """The text without the sentences that quote an unaccounted amount, and whether any went."""
    sentences = SENTENCES.split(text)
    kept = [sentence for sentence in sentences if grounded(sentence, within)]
    return "".join(kept), len(kept) != len(sentences)


class Gate:
    """Checks a streamed reply a sentence at a time, so nothing unchecked is ever sent."""

    def __init__(self, within):
        self.within, self.held, self.dropped = within, "", False

    def feed(self, delta):
        self.held += delta
        cut = max((match.end() for match in BOUNDARY.finditer(self.held)), default=0)
        ready, self.held = self.held[:cut], self.held[cut:]
        return self.check(ready)

    def close(self):
        ready, self.held = self.held, ""
        return self.check(ready)

    def check(self, text):
        text, dropped = keep_grounded(text, self.within)
        self.dropped = self.dropped or dropped
        return text
