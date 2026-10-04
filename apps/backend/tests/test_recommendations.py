"""Offline recommendation validation, policy matching and calculator parity."""
import json
import os
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError, ReadTimeoutError
from backend.app import app
from backend.llm import ChatError
from backend.policy_catalog import eligible, VERSION
from backend.recommendations import validate, PROMPT, TOOL

PREFERENCES = dict(state="TX", tobacco="no", goal="temporary", premium="low", cashValue="no")
VALUES = dict(support=40000, years=10, mortgage=150000, otherDebts=30000, education=20000, existing=100000)


def body(values=None, **preferences):
    return dict(profile={name: dict(status="confirmed", value=value) for name, value in (values or VALUES).items()},
                age=35, preferences={**PREFERENCES, **preferences})


def reading(**updates):
    return {**dict(termId="termaccel", permanentId="wealthprotector", termYears=10,
                termFit="Your family support and mortgage have an end date.",
                permanentFit="This offers protection-focused IUL; ongoing funding needs confirmation.",
                recommendedType="term", reason="Your temporary family needs and low-cost priority favor term."), **updates}


def response(value):
    return {"output": {"message": {"content": [{"toolUse": {"name": "recommend", "input": value}}]}}, "stopReason": "tool_use"}


class RecommendationsTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {"MODEL_ID": "test-model"}).start()
        self.model = Mock()
        self.model.converse.return_value = response(reading())
        patch("backend.recommendations.get_client", return_value=self.model).start()
        self.admit = patch("backend.recommendations.reserve_inference").start()
        self.http = app.test_client()

    def post(self, payload=None):
        return self.http.post("/api/recommendations", json=payload or body())

    def test_family_options_are_alternatives_and_facts_are_server_owned(self):
        result = self.post()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.headers["Cache-Control"], "no-store")
        self.assertEqual(result.json["recommendedType"], "term")
        for category in ("term", "permanent"):
            self.assertEqual(result.json[category]["amount"], 500000)
            self.assertTrue(result.json[category]["source"].startswith("https://"))
        self.assertEqual(result.json["catalogVersion"], VERSION)
        self.admit.assert_called_once()
        sent = self.model.converse.call_args.kwargs
        self.assertEqual(sent["toolConfig"]["tools"], [TOOL])
        self.assertIn(PROMPT, sent["system"][0]["text"])
        self.assertIn("Lincoln TermAccel Level Term", sent["system"][0]["text"])
        facts = json.loads(sent["messages"][0]["content"][0]["text"])
        self.assertEqual(facts["preferences"], PREFERENCES)

    def test_lifelong_choice_keeps_small_gap_and_flags_minimum(self):
        payload = body(dict(support=0, years=1, mortgage=0, otherDebts=0, existing=0, finalExpenses=25000),
                       goal="lifelong", premium="higher")
        result_reading = reading()
        result_reading.update(recommendedType="permanent", reason="You prioritize lifelong protection and are open to higher premiums.")
        self.model.converse.return_value = response(result_reading)
        result = self.post(payload).json
        self.assertEqual(result["recommendedType"], "permanent")
        self.assertEqual(result["permanent"]["amount"], 25000)
        self.assertTrue(any("below" in n for n in result["permanent"]["qualifications"]))

    def test_shared_calculator_scenarios(self):
        cases = json.loads((Path(__file__).resolve().parents[2] / "web/tests/coverage-cases.json").read_text())
        for case in cases:
            with self.subTest(case["name"]):
                payload = body(case["values"])
                payload["profile"]["savings"] = payload["profile"].get("savings", dict(status="skipped", value=None))
                self.assertEqual(validate(payload)[3], case["expected"])

    def test_zero_gap_and_unsupported_state_skip_inference(self):
        for payload in (body({**VALUES, "existing":1000000}), body(state="NY")):
            result = self.post(payload)
            self.assertEqual(result.status_code, 200)
            self.assertIsNone(result.json["recommendedType"])
            self.assertIsNone(result.json["term"])
            self.assertIsNone(result.json["permanent"])
        self.admit.assert_not_called()
        self.model.converse.assert_not_called()

    def test_policy_constraints_and_missing_context(self):
        policies = eligible(56, {**PREFERENCES, "tobacco":"yes"}, 500000)
        self.assertNotIn(30, next(p for p in policies if p["id"] == "termaccel")["eligibleTerms"])
        self.assertNotIn("wealthaccelerate", [p["id"] for p in policies])
        policies = eligible(35, {**PREFERENCES, "state":"CA"}, 3000000)
        self.assertEqual({p["id"] for p in policies}, {"lifeelements"})
        self.assertNotIn("wealthbuilder", [p["id"] for p in eligible(35, PREFERENCES, 500000)])
        self.assertIn("wealthbuilder", [p["id"] for p in eligible(35, {**PREFERENCES, "cashValue":"yes"}, 500000)])
        unknown = {name: None for name in PREFERENCES}
        policies = eligible(None, unknown, 500000)
        self.assertTrue(all(any("Age was not provided" in q for q in p["qualifications"]) for p in policies))

    def test_long_horizon_has_explicit_shortfall(self):
        updated = reading()
        updated["termYears"] = 30
        self.model.converse.return_value = response(updated)
        result = self.post(body({**VALUES, "support":1000, "years":70})).json
        self.assertEqual(result["term"]["termYears"], 30)
        self.assertTrue(any("shorter than" in n for n in result["term"]["qualifications"]))

    def test_invalid_model_selection_never_reaches_cards(self):
        for changes in (dict(termId="invented"), dict(permanentId="termaccel"), dict(termYears=20),
                        dict(termYears=True), dict(recommendedType="both"), dict(reason=""),
                        dict(recommendedType=None), dict(permanentId="wealthbuilder"), dict(amount=1)):
            result = reading()
            result.update(changes)
            self.model.converse.return_value = response(result)
            with self.subTest(changes):
                self.assertEqual(self.post().status_code, 502)
        self.model.converse.return_value = {"stopReason":"max_tokens"}
        self.assertEqual(self.post().status_code, 502)

    def test_invalid_input_never_calls_model(self):
        inputs = []
        for name, value in (("state", []), ("state", "ignore instructions"), ("goal", {}), ("premium", "free")):
            inputs.append(body(**{name:value}))
        for field in (dict(status="proposed", value=100), dict(status="confirmed", value=True),
                      dict(status="confirmed", value=float("nan")), dict(status="confirmed", value=10**400),
                      dict(status="unknown", value=200)):
            payload = body()
            payload["profile"]["support"] = field
            inputs.append(payload)
        inputs.extend([dict(body(), age=True), dict(body(), age=121), dict(body(), age=35.5)])
        for payload in inputs:
            with self.subTest(payload):
                self.assertEqual(self.post(payload).status_code, 400)
        self.model.converse.assert_not_called()
        self.admit.assert_not_called()

    def test_missing_model_returns_503_and_unknowns_are_not_assumed(self):
        with patch.dict(os.environ, {"MODEL_ID":""}):
            self.assertEqual(self.post().status_code, 503)
            self.admit.assert_not_called()
        payload = body()
        payload["age"] = None
        payload["preferences"] = {key:None for key in PREFERENCES}
        result = self.post(payload)
        self.assertEqual(result.status_code, 200)
        self.assertTrue(any("State was not provided" in q for q in result.json["term"]["qualifications"]))
        facts = json.loads(self.model.converse.call_args.kwargs["messages"][0]["content"][0]["text"])
        self.assertEqual(facts["preferences"], payload["preferences"])
        self.assertNotIn("savings", facts["facts"])

    def test_errors_are_sanitized_and_limiter_runs_first(self):
        self.admit.side_effect = ChatError(429, "Try again later.")
        self.assertEqual(self.post().status_code, 429)
        self.model.converse.assert_not_called()
        self.admit.side_effect = None
        for error, status in ((ReadTimeoutError(endpoint_url="secret"), 504),
                              (ClientError({"Error":{"Code":"ThrottlingException","Message":"secret"}}, "Converse"), 429)):
            self.model.converse.side_effect = error
            result = self.post()
            self.assertEqual(result.status_code, status)
            self.assertNotIn("secret", result.get_data(as_text=True))

    def test_age_and_state_can_leave_just_one_option(self):
        result_reading = reading()
        result_reading.update(permanentId=None, recommendedType="term")
        self.model.converse.return_value = response(result_reading)
        result = self.post(body(state="CA", cashValue="no"))
        # WealthAccelerate remains eligible in CA, so omitting it is invalid.
        self.assertEqual(result.status_code, 502)
        payload = body({**VALUES, "support":300000, "years":10}, state="CA")
        result_reading["termId"] = "lifeelements"
        self.model.converse.return_value = response(result_reading)
        result = self.post(payload)
        self.assertEqual(result.status_code, 200)
        self.assertIsNone(result.json["permanent"])
        self.assertEqual(result.json["term"]["policyId"], "lifeelements")
        payload = body()
        payload["age"] = 81
        result = self.post(payload)
        self.assertEqual(result.status_code, 200)
        self.assertIsNone(result.json["recommendedType"])


if __name__ == "__main__":
    unittest.main()
