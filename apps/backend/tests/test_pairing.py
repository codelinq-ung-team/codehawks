"""Offline pairing checks: no AWS calls."""
import json
import os
import unittest
from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError

import backend.pairing
from backend.app import app
from backend.pairing import CODE_SECONDS, ID_ALPHABET, SESSION_SECONDS

FORM = {"age": 35, "income": 85000, "marital": "married", "dependents": 2, "debt": 280000, "coverage": True}
PROFILE = {"income": {"status": "proposed", "value": 85000, "source": "form"}}


class PairingTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        for name in ("PAIRING_TABLE", "AWS_LAMBDA_FUNCTION_NAME"):
            patch.dict(os.environ).start()
            os.environ.pop(name, None)
        patch.object(backend.pairing, "_local", {}).start()
        self.clock = patch("backend.pairing.time.time", return_value=1000.0).start()
        self.http = app.test_client()

    def create(self, **body):
        return self.http.post("/api/pair", json={"form": FORM, "profile": PROFILE, **body})

    def test_browser_and_headset_share_one_session(self):
        created = self.create()
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.headers["Cache-Control"], "no-store")
        session_id, code = created.json["id"], created.json["code"]
        self.assertEqual((created.json["seconds"], created.json["codeSeconds"]), (SESSION_SECONDS, CODE_SECONDS))
        self.assertEqual(len(session_id), 26)
        self.assertTrue(set(session_id) <= set(ID_ALPHABET))
        self.assertRegex(code, r"^\d{6}$")

        waiting = self.http.get("/api/pair/" + session_id).json
        self.assertEqual((waiting["status"], waiting["form"]), ("waiting", FORM))
        self.assertEqual(waiting["profile"]["income"], {"status": "proposed", "value": 85000, "source": "form"})
        self.assertEqual(waiting["profile"]["support"], {"status": "empty", "value": None})
        self.assertEqual(len(waiting["profile"]), 11)

        # The headset joins, then saves what Abe learned. The form it was not sent stays.
        self.assertEqual(self.http.post("/api/pair/" + session_id, json={"status": "joined"}).json["status"], "joined")
        learned = {**PROFILE, "household": {"status": "proposed", "value": "both"}, "years": {"status": "unknown", "value": None}}
        done = self.http.post("/api/pair/" + session_id, json={"status": "done", "profile": learned})
        self.assertEqual(done.status_code, 200)
        seen = self.http.get("/api/pair/" + session_id).json
        self.assertEqual((seen["status"], seen["form"]), ("done", FORM))
        self.assertEqual(seen["profile"]["household"], {"status": "proposed", "value": "both"})
        self.assertEqual(seen["profile"]["years"], {"status": "unknown", "value": None})

    def test_the_typed_code_works_once_and_expires(self):
        created = self.create().json
        self.assertEqual(self.http.post("/api/pair/join", json={"code": created["code"]}).json, {"id": created["id"]})
        self.assertEqual(self.http.post("/api/pair/join", json={"code": created["code"]}).status_code, 404)
        later = self.create().json
        self.clock.return_value += CODE_SECONDS + 1
        self.assertEqual(self.http.post("/api/pair/join", json={"code": later["code"]}).status_code, 404)
        self.assertEqual(self.http.get("/api/pair/" + later["id"]).status_code, 200)
        for code in ("12345", "1234567", "abcdef", 123456, None):
            self.assertEqual(self.http.post("/api/pair/join", json={"code": code}).status_code, 400)

    def test_sessions_expire_and_unknown_ids_are_not_found(self):
        session_id = self.create().json["id"]
        self.clock.return_value += SESSION_SECONDS + 1
        self.assertEqual(self.http.get("/api/pair/" + session_id).status_code, 404)
        self.assertEqual(self.http.post("/api/pair/" + session_id, json={"status": "done"}).status_code, 404)
        for bad in ("nope", "0" * 26, "a" * 26, "session%23x"):
            response = self.http.get("/api/pair/" + bad)
            self.assertEqual((response.status_code, response.json), (404, {"error": "That pairing was not found, or it has expired."}))

    def test_age_is_a_whole_number_from_zero_to_120(self):
        for value, expected in ((0, 0), (120, 120), (35.0, 35), (None, None),
                                (-1, None), (121, None), (35.5, None), (True, None), ("35", None)):
            with self.subTest(age=value):
                created = self.create(form={**FORM, "age": value})
                seen = self.http.get("/api/pair/" + created.json["id"]).json
                self.assertEqual(seen["form"]["age"], expected)

    def test_only_expected_values_are_kept(self):
        created = self.create(
            form={"income": -5, "marital": "<b>", "dependents": 2.0, "debt": 10 ** 12, "coverage": "yes", "extra": "x"},
            profile={"income": {"status": "confirmed", "value": "lots"}, "years": {"status": "proposed", "value": 0},
                     "household": {"status": "proposed", "value": "everyone"}, "support": {"status": "sideways", "value": 5},
                     "savings": {"status": "skipped", "value": 99}, "mortgage": {"status": "confirmed", "value": 240000.0},
                     "notes": {"status": "confirmed", "value": "call me"}, "education": "soon"})
        seen = self.http.get("/api/pair/" + created.json["id"]).json
        self.assertEqual(seen["form"], {"age": None, "income": None, "marital": None, "dependents": 2, "debt": None, "coverage": None})
        empty = {"status": "empty", "value": None}
        for name in ("income", "years", "household", "support", "education"):
            self.assertEqual(seen["profile"][name], empty)
        self.assertEqual(seen["profile"]["savings"], {"status": "skipped", "value": None})
        self.assertEqual(seen["profile"]["mortgage"], {"status": "confirmed", "value": 240000})
        self.assertNotIn("notes", seen["profile"])
        session_id = created.json["id"]
        self.assertEqual(self.http.post("/api/pair/" + session_id, json={"status": "finished"}).status_code, 400)
        self.assertEqual(self.http.post("/api/pair/" + session_id, json=[]).status_code, 400)
        self.assertEqual(self.http.post("/api/pair", json={"form": [], "profile": {}}).status_code, 400)
        self.assertEqual(self.http.post("/api/pair", data="{}", content_type="text/plain").status_code, 415)

    def test_deployed_sessions_live_in_the_table(self):
        aws = MagicMock()
        patch("backend.pairing.get_client", return_value=aws).start()
        with patch.dict(os.environ, {"PAIRING_TABLE": "pairing", "AWS_LAMBDA_FUNCTION_NAME": "chat"}):
            created = self.create().json
            code_put, session_put = (call.kwargs for call in aws.put_item.call_args_list)
            self.assertEqual(code_put["Item"]["id"], {"S": "code#" + created["code"]})
            self.assertEqual(code_put["Item"]["expires"], {"N": str(1000 + CODE_SECONDS)})
            self.assertIn("attribute_not_exists", code_put["ConditionExpression"])
            self.assertEqual(session_put["Item"]["id"], {"S": "session#" + created["id"]})
            self.assertEqual(session_put["Item"]["expires"], {"N": str(1000 + SESSION_SECONDS)})
            self.assertNotIn("ConditionExpression", session_put)

            aws.get_item.return_value = {"Item": session_put["Item"]}
            self.assertEqual(self.http.get("/api/pair/" + created["id"]).json["status"], "waiting")
            self.assertEqual(aws.get_item.call_args.kwargs, {
                "TableName": "pairing", "Key": {"id": {"S": "session#" + created["id"]}}, "ConsistentRead": True})
            self.http.post("/api/pair/" + created["id"], json={"status": "done"})
            self.assertEqual(json.loads(aws.put_item.call_args.kwargs["Item"]["body"]["S"])["status"], "done")

            aws.get_item.return_value = {"Item": code_put["Item"]}
            self.assertEqual(self.http.post("/api/pair/join", json={"code": created["code"]}).json, {"id": created["id"]})
            aws.delete_item.assert_called_once_with(TableName="pairing", Key={"id": {"S": "code#" + created["code"]}})

    def test_a_code_in_use_is_not_handed_out_again(self):
        aws = MagicMock()
        taken = ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "PutItem")
        patch("backend.pairing.get_client", return_value=aws).start()
        with patch.dict(os.environ, {"PAIRING_TABLE": "pairing"}):
            aws.put_item.side_effect = [taken, None, None]
            self.assertEqual(self.create().status_code, 201)
            self.assertEqual(aws.put_item.call_count, 3)
            aws.put_item.side_effect = taken
            self.assertEqual(self.create().status_code, 503)

    def test_storage_failures_are_sanitized_and_production_fails_closed(self):
        with patch.dict(os.environ, {"AWS_LAMBDA_FUNCTION_NAME": "chat"}):
            response = self.create()
            self.assertEqual((response.status_code, response.json), (503, {"error": "Pairing with a headset is unavailable right now."}))
        aws = MagicMock()
        denied = ClientError({"Error": {"Code": "AccessDeniedException", "Message": "arn:aws:secret-detail"}}, "GetItem")
        aws.get_item.side_effect = aws.put_item.side_effect = denied
        patch("backend.pairing.get_client", return_value=aws).start()
        with patch.dict(os.environ, {"PAIRING_TABLE": "pairing"}):
            for response in (self.create(), self.http.get("/api/pair/" + "0" * 26)):
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("secret-detail", response.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
