"""Offline intake checks: no AWS credentials or model calls."""
import os
import unittest
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError

from backend.app import app
from backend.intake import TOOL
from backend.prompts import INTAKE_PROMPT

ASK = {"step": "income", "question": "About how much do you earn in a year?", "answer": "eighty grand"}


def tool(**reading):
    return {"output": {"message": {"role": "assistant", "content": [
        {"text": "<thinking>hidden</thinking>"}, {"toolUse": {"toolUseId": "1", "name": "record", "input": reading}}]}},
        "stopReason": "tool_use"}


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.aws = Mock()
        self.aws.converse.return_value = tool(intent="answer", value=80000, say="Thanks for sharing.")
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {"MODEL_ID": "test-model"}).start()
        patch("backend.llm.get_client", return_value=self.aws).start()
        patch("backend.intake.get_client", return_value=self.aws).start()
        self.http = app.test_client()

    def post(self, **values):
        return self.http.post("/api/intake", json={**ASK, **values})

    def test_expected_income_is_a_field_with_its_own_rules(self):
        self.aws.converse.return_value = tool(intent="answer", value=160000, say="")
        response = self.post(step="futureIncome", question="Where do you expect your income to be in ten years?",
                             answer="probably double", known={"income": 80000})
        self.assertEqual((response.status_code, response.json["value"]), (200, 160000))
        self.assertIn("futureIncome", INTAKE_PROMPT)
        self.assertIn("futureIncome", TOOL["toolSpec"]["inputSchema"]["json"]["properties"]["extra"]["properties"])
        # A figure about the future, given while answering something else, is kept apart from the answer.
        self.aws.converse.return_value = tool(intent="answer", value=13000, extra={"futureIncome": 70000}, say="")
        mixed = self.post(answer="13k now but I'll make 70k once I graduate")
        self.assertEqual((mixed.json["value"], mixed.json["extra"]), (13000, {"futureIncome": 70000}))

    def test_plans_are_read_as_a_set_and_sent_as_one_number(self):
        ask = dict(step="plans", question="Looking ahead ten years, do you expect any of these?")
        self.aws.converse.return_value = tool(intent="answer", plans=["home", "kids", "kids"], say="")
        self.assertEqual(self.post(**ask, answer="we want a baby and a house").json["value"], 3)
        self.aws.converse.return_value = tool(intent="answer", plans=[], say="")
        none = self.post(**ask, answer="nothing really")
        self.assertEqual((none.json["intent"], none.json["value"]), ("answer", 0))
        self.aws.converse.return_value = tool(intent="answer", plans=["a boat"], say="")
        self.assertEqual(self.post(**ask, answer="a boat").json["intent"], "unclear")
        self.aws.converse.return_value = tool(intent="answer", value=3, say="")
        self.assertEqual(self.post(**ask, answer="the first two").json["intent"], "unclear")

    def test_answer_and_model_request(self):
        response = self.post(known={"household": "kids", "youngestAge": 4, "totalDebt": 180000})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"intent": "answer", "value": 80000, "household": None, "period": None,
                                         "extra": {}, "say": "Thanks for sharing."})
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        request = self.aws.converse.call_args.kwargs
        self.assertEqual(request["modelId"], "test-model")
        self.assertEqual(request["system"], [{"text": INTAKE_PROMPT}])
        self.assertEqual(request["toolConfig"], {"tools": [TOOL], "toolChoice": {"tool": {"name": "record"}}})
        prompt = request["messages"][0]["content"][0]["text"]
        for part in ("Current field: income", "- household: kids", "- totalDebt: 180000", "<message>\neighty grand\n</message>"):
            self.assertIn(part, prompt)

    def test_household_period_and_json_text_reply(self):
        self.aws.converse.return_value = tool(intent="answer", household="both", value=3, say="  A full\nhouse. ")
        self.assertEqual(self.post(step="household").json,
                         {"intent": "answer", "value": None, "household": "both", "period": None, "extra": {}, "say": "A full house."})
        self.aws.converse.return_value = tool(intent="answer", value=6000.4, period="month", say="")
        reading = self.post().json
        self.assertEqual((reading["value"], reading["period"]), (6000, "month"))
        self.aws.converse.return_value = {"output": {"message": {"content": [
            {"text": 'Here: {"intent": "unsure", "say": "No problem."}'}]}}, "stopReason": "end_turn"}
        self.assertEqual(self.post().json["intent"], "unsure")

    def test_doubtful_readings_become_a_reask(self):
        for reading in ({"intent": "answer", "say": "ok"}, {"intent": "answer", "value": "80000", "say": "ok"},
                        {"intent": "answer", "value": True, "say": "ok"}, {"intent": "answer", "value": float("nan"), "say": "ok"}):
            self.aws.converse.return_value = tool(**reading)
            self.assertEqual(self.post().json["intent"], "unclear")
        self.aws.converse.return_value = tool(intent="answer", household="pets", say="ok")
        self.assertEqual(self.post(step="household").json["intent"], "unclear")
        # A value given with a non-answer intent is dropped.
        self.aws.converse.return_value = tool(intent="question", value=5, extra={"mortgage": 1}, say="Term lasts a set time.")
        self.assertEqual(self.post().json, {"intent": "question", "value": None, "household": None, "period": None,
                                            "extra": {}, "say": "Term lasts a set time."})

    def test_a_question_is_never_recorded_as_an_answer(self):
        for reading in ({"intent": "answer", "value": 401000, "say": ""}, {"intent": "unsure", "say": "Usually yes."}):
            self.aws.converse.return_value = tool(**reading)
            result = self.post(step="savings", answer="should I count my 401k?").json
            self.assertEqual((result["intent"], result["value"], result["say"]), ("question", None, reading["say"]))

    def test_extra_fields_must_repeat_a_stated_figure(self):
        extra = {"mortgage": 250000, "income": 1, "years": 500, "household": "kids", "bogus": 3, "existing": 340000}
        self.aws.converse.return_value = tool(intent="answer", value=90000, extra=extra, say="")
        self.assertEqual(self.post(answer="I make 90k and owe $250,000 on the house").json["extra"], {"mortgage": 250000})
        self.assertEqual(self.post(answer="ninety thousand").json["extra"], {})
        # Parts of the main answer, or a sum the model made up, are not other fields.
        self.aws.converse.return_value = tool(intent="answer", value=50000, extra={"existing": 50000, "income": 40000}, say="")
        self.assertEqual(self.post(step="savings", answer="about 40k in a 401k and 10k in the bank").json["extra"], {})

    def test_invalid_model_output_and_provider_errors_are_sanitized(self):
        for reply in (tool(intent="guess", say="x"), {"output": {"message": {"content": [{"text": "no json"}]}}}, {}):
            self.aws.converse.return_value = reply
            response = self.post()
            self.assertEqual(response.status_code, 502)
            self.assertEqual(response.json, {"error": "The LLM returned an invalid response."})
        self.aws.converse.side_effect = ClientError({"Error": {"Code": "ThrottlingException", "Message": "secret"}}, "Converse")
        response = self.post()
        self.assertEqual(response.status_code, 429)
        self.assertNotIn(b"secret", response.data)

    def test_invalid_requests_do_not_invoke_bedrock(self):
        bad = [{"step": "ssn"}, {"question": ""}, {"answer": " "}, {"answer": "x" * 1001}, {"question": "x" * 601},
               {"known": []}, {"known": {"income": "lots"}}, {"known": {"household": "pets"}}, {"known": {"years": 0}},
               {"known": {"name": 1}}]
        for values in bad:
            with self.subTest(values=values):
                self.assertEqual(self.post(**values).status_code, 400)
        self.assertEqual(self.http.post("/api/intake", data=b"[]", content_type="application/json").status_code, 400)
        self.assertEqual(self.http.post("/api/intake", data=b"{}", content_type="text/plain").status_code, 415)
        with patch.dict(os.environ, {"MODEL_ID": ""}):
            self.assertEqual(self.post().status_code, 503)
        self.aws.converse.assert_not_called()

    def test_shared_rate_limit_applies(self):
        with patch.dict(os.environ, {"AWS_LAMBDA_FUNCTION_NAME": "chat", "CHAT_RATE_LIMIT_TABLE": ""}):
            self.assertEqual(self.post().status_code, 503)
        self.aws.converse.assert_not_called()


if __name__ == "__main__":
    unittest.main()
