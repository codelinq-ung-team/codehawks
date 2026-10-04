"""The model explains the numbers; it never supplies one. Offline, no model calls."""
import json
import os
import unittest
from unittest.mock import Mock, patch

from backend.app import app
from backend.grounding import Gate, LEFT_OUT, allowed, figures, keep_grounded, quoted, reach
from backend.tests.test_chat import Stream, delta, reply, stop
from backend.tests.test_recommendations import body, reading, response

ESTIMATE = ("+ Yearly support ($40,000 × 10 years): $400,000\n+ Mortgage balance: $150,000\n"
            "- Life insurance you have: $100,000\n= Estimated additional coverage: $450,000")


class GroundingTests(unittest.TestCase):
    def test_reads_the_ways_a_reply_writes_money(self):
        self.assertEqual(quoted("About $1.2 million, or 250k, or 400,000, or 500 dollars."), [1200000, 250000, 400000, 500])
        # Years, ages, percentages and account names are not amounts.
        self.assertEqual(quoted("For 10 years, until 18, at 70% of income, in your 401k, by 2030."), [])
        self.assertEqual(figures("a 401k and 250k"), {250000})

    def test_one_step_of_arithmetic_is_worked_out_here(self):
        within = reach({40000, 150000, 30000}, {10})
        for amount in (400000, 180000, 120000, 480000, 3333):  # ×years, a sum, a difference, a year's and a month's worth
            self.assertIn(amount, within)
        self.assertNotIn(250000, within)
        self.assertNotIn(580000, within)  # two steps away
        many = set(range(1000, 1000 + 200))
        self.assertEqual(reach(many, {10}), many)  # too many sources to combine: only the amounts themselves

    def test_sources_can_be_text_numbers_or_nested_data(self):
        within = allowed({"gap": 500000, "ok": True, "none": None, "years": 10}, [{"minimum": 100000}, "from $25,000"], "age 35")
        for amount in (500000, 100000, 25000, 400000, 250000):
            self.assertIn(amount, within)
        # Years and ages are counts: they multiply an amount but are never amounts themselves.
        for amount in (10, 35, 45, 350):
            self.assertNotIn(amount, within)
        self.assertIn(50, allowed("I can pay $50 a month"))
        self.assertEqual(allowed(), set())

    def test_only_the_sentence_with_the_stray_amount_goes(self):
        within = allowed(ESTIMATE)
        text = "Your estimate is $450,000. A policy like that costs $35 a month. Support makes up $400,000 of it."
        self.assertEqual(keep_grounded(text, within), ("Your estimate is $450,000. Support makes up $400,000 of it.", True))
        self.assertEqual(keep_grounded("Term covers a set number of years.", set()), ("Term covers a set number of years.", False))
        self.assertEqual(keep_grounded("You have $0 of other debts.", set())[1], False)
        self.assertEqual(keep_grounded("", within), ("", False))

    def test_a_stream_is_released_a_checked_sentence_at_a_time(self):
        gate = Gate({450000})
        self.assertEqual(gate.feed("Your gap is $4"), "")  # nothing leaves mid-sentence
        self.assertEqual(gate.feed("50,000. Premiums run $9"), "Your gap is $450,000.")
        self.assertEqual(gate.feed("9 a month.\n"), "\n")  # the sentence goes; the line break stays
        self.assertEqual(gate.close(), "")
        self.assertTrue(gate.dropped)
        whole = Gate({1200000})
        self.assertEqual(whole.feed("About $1.2 million") + whole.close(), "About $1.2 million")  # a decimal point is not an ending
        self.assertFalse(whole.dropped)


class GroundedRepliesTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {"MODEL_ID": "test-model"}).start()
        self.aws = Mock()
        patch("backend.llm.get_client", return_value=self.aws).start()
        patch("backend.intake.get_client", return_value=self.aws).start()
        patch("backend.recommendations.get_client", return_value=self.aws).start()
        self.http = app.test_client()
        self.messages = [{"role": "user", "content": ESTIMATE + "\n\nMy question: what would it cost?"}]

    def test_chat_keeps_the_calculators_amounts_and_drops_invented_ones(self):
        said = "Your estimate is $450,000. That might cost $35 a month. A professional can quote it."
        kept = "Your estimate is $450,000. A professional can quote it." + LEFT_OUT
        self.aws.converse.return_value = reply(said)
        self.assertEqual(self.http.post("/api/chat", json={"messages": self.messages, "stream": False}).json, {"reply": kept})
        self.aws.converse_stream.return_value = {"stream": Stream([delta(said[:30]), delta(said[30:]), stop()])}
        events = [json.loads(line) for line in self.http.post("/api/chat", json={"messages": self.messages}).data.splitlines()]
        self.assertEqual("".join(event.get("delta", "") for event in events), kept)
        self.assertEqual(events[-1], {"done": True})

    def test_chat_arithmetic_on_the_users_numbers_is_checked_not_trusted(self):
        messages = [{"role": "user", "content": "I owe $300k on the house and have a $250k policy."}]
        self.aws.converse.return_value = reply("That leaves $50,000 uncovered. Call it $75,000 to be safe.")
        self.assertEqual(self.http.post("/api/chat", json={"messages": messages, "stream": False}).json["reply"],
                         "That leaves $50,000 uncovered." + LEFT_OUT)

    def test_a_reply_whose_opening_was_left_out_does_not_start_blank(self):
        said = "Funerals often run $7,000.\n\nYour estimate is $450,000."
        kept = "Your estimate is $450,000." + LEFT_OUT
        self.aws.converse.return_value = reply(said)
        self.assertEqual(self.http.post("/api/chat", json={"messages": self.messages, "stream": False}).json, {"reply": kept})
        self.aws.converse_stream.return_value = {"stream": Stream([delta(said), stop()])}
        events = [json.loads(line) for line in self.http.post("/api/chat", json={"messages": self.messages}).data.splitlines()]
        self.assertEqual("".join(event.get("delta", "") for event in events), kept)

    def test_recommendation_text_cannot_introduce_an_amount(self):
        self.aws.converse.return_value = response(reading(
            termFit="It covers the $500,000 gap. Expect about $40 a month.",
            reason="Premiums near $1,200 a year suit you."))
        result = self.http.post("/api/recommendations", json=body()).json
        self.assertEqual(result["term"]["fit"], "It covers the $500,000 gap.")
        self.assertEqual(result["reason"], "A licensed professional can confirm how this fits your situation.")
        self.assertEqual(result["amount"], 500000)

    def test_intake_replies_repeat_only_what_was_typed_or_the_stated_starting_points(self):
        ask = dict(step="finalExpenses", question="What should we set aside for funeral and final expenses?", known={"income": 85000})
        tool = lambda **value: {"output": {"message": {"content": [{"toolUse": {"name": "record", "input": value}}]}}}
        self.aws.converse.return_value = tool(intent="question", say="Many people start with $10,000 to $15,000. The average is $9,420.")
        self.assertEqual(self.http.post("/api/intake", json={**ask, "answer": "what is typical?"}).json["say"],
                         "Many people start with $10,000 to $15,000.")
        self.aws.converse.return_value = tool(intent="why", say="A $40,000 bill would fall on your family.")
        self.assertEqual(self.http.post("/api/intake", json={**ask, "answer": "why?"}).json["say"], "")


if __name__ == "__main__":
    unittest.main()
