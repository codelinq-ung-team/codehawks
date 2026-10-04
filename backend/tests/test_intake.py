"""Offline intake checks: no AWS credentials or model calls."""
import os
import unittest
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError

from backend.app import app
from backend.intake import TOOL
from backend.prompts import INTAKE_PROMPT, PLAID_CONTEXT_PROMPT

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

    @patch("backend.intake.load_financial_context")
    def test_verified_plaid_context_is_sent_to_intake_model(self, load_context):
        load_context.return_value = {
            "source": "plaid_accounts_get", "environment": "sandbox",
            "accounts": [{"category": "debt", "currentBalance": 450.0}],
        }
        response = self.post(plaid_context_token="signed-context")
        self.assertEqual(response.status_code, 200)
        system = self.aws.converse.call_args.kwargs["system"][0]["text"]
        self.assertIn(PLAID_CONTEXT_PROMPT, system)
        self.assertIn('"currentBalance":450.0', system)
        load_context.assert_called_once_with("signed-context")

    @patch("backend.intake.load_financial_context")
    def test_invalid_plaid_context_does_not_call_bedrock(self, load_context):
        from backend.plaid import PlaidError
        load_context.side_effect = PlaidError(400, "Reconnect your account.")
        response = self.post(plaid_context_token="invalid")
        self.assertEqual(response.status_code, 400)
        self.aws.converse.assert_not_called()

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
