"""Offline Plaid request and normalization tests."""
import json
import os
import unittest
from unittest.mock import patch

from botocore.exceptions import ClientError

from backend.plaid import PlaidError, annual_income, create_link_token, exchange_and_get_accounts, normalize_accounts


ACCOUNTS = [
    {
        "account_id": "do-not-expose-1",
        "name": "My Checking",
        "official_name": "Sensitive name",
        "mask": "1234",
        "type": "depository",
        "subtype": "checking",
        "balances": {"current": 1250.25, "available": 1200, "limit": None,
                     "iso_currency_code": "usd"},
    },
    {
        "account_id": "do-not-expose-2",
        "name": "Credit Card",
        "type": "credit",
        "subtype": "credit card",
        "balances": {"current": 450, "available": 1550, "limit": 2000,
                     "iso_currency_code": "USD"},
    },
    {
        "account_id": "do-not-expose-3",
        "name": "Brokerage",
        "type": "investment",
        "subtype": "brokerage",
        "balances": {"current": 8000, "available": None, "limit": None,
                     "iso_currency_code": "USD"},
    },
]


class PlaidTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            "PLAID_CLIENT_ID": "client-id", "PLAID_SECRET": "sandbox-secret",
            "PLAID_ENV": "sandbox",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)

    @patch("backend.plaid._post")
    def test_link_token_uses_random_non_pii_user(self, post):
        post.side_effect = [
            {"user_id": "user-sandbox"},
            {"link_token": "link-sandbox", "expiration": "2026-10-04T00:00:00Z"},
        ]
        session = create_link_token()
        self.assertEqual(session, {"link_token": "link-sandbox", "expiration": "2026-10-04T00:00:00Z", "user_id": "user-sandbox"})
        self.assertEqual([call.args[0] for call in post.call_args_list], ["/user/create", "/link/token/create"])
        path, body = post.call_args_list[1].args
        self.assertEqual(path, "/link/token/create")
        self.assertEqual(body["products"], ["transactions", "income_verification"])
        self.assertEqual(body["income_verification"], {"income_source_types": ["bank"], "bank_income": {"days_requested": 120}})
        self.assertEqual(body["user_id"], "user-sandbox")
        self.assertEqual(body["country_codes"], ["US"])
        self.assertNotIn("email_address", body["user"])
        self.assertNotIn("phone_number", body["user"])
        self.assertTrue(body["user"]["client_user_id"])

    @patch("backend.plaid._post")
    def test_exchange_fetches_accounts_and_drops_identifiers(self, post):
        post.side_effect = [
            {"access_token": "access-sandbox", "item_id": "item-secret"},
            {"accounts": ACCOUNTS, "item": {"institution_id": "ins_secret"}},
            {"bank_income": [{"bank_income_id": "income-secret", "bank_income_summary": {
                "start_date": "2025-01-01", "end_date": "2025-04-30",
                "total_amounts": [{"amount": 24000, "iso_currency_code": "USD"}],
            }}]},
        ]
        snapshot = exchange_and_get_accounts("public-sandbox", "user-sandbox")
        self.assertEqual([call.args[0] for call in post.call_args_list],
                         ["/item/public_token/exchange", "/accounts/get", "/credit/bank_income/get"])
        self.assertEqual(post.call_args_list[1].args[1]["access_token"], "access-sandbox")
        self.assertEqual(post.call_args_list[2].args[1]["user_id"], "user-sandbox")
        self.assertEqual(snapshot["annualIncome"], 73000)
        serialized = str(snapshot)
        for private in ("do-not-expose", "My Checking", "Sensitive name", "1234",
                        "item-secret", "ins_secret", "access-sandbox", "income-secret"):
            self.assertNotIn(private, serialized)

    def test_annual_income_uses_only_latest_usd_summary(self):
        reports = [{"bank_income_summary": {
            "start_date": "2025-01-01", "end_date": "2025-04-30",
            "total_amounts": [
                {"amount": 1000, "iso_currency_code": "EUR"},
                {"amount": 24000, "iso_currency_code": "USD"},
            ],
        }}]
        self.assertEqual(annual_income(reports), 73000)
        self.assertIsNone(annual_income([]))
        self.assertIsNone(annual_income([{"bank_income_summary": {"start_date": "bad", "end_date": "bad", "total_amounts": []}}]))

    def test_normalizes_categories_and_currency_totals(self):
        snapshot = normalize_accounts(ACCOUNTS)
        self.assertEqual([account["category"] for account in snapshot["accounts"]],
                         ["liquid_asset", "debt", "investment_asset"])
        self.assertEqual(snapshot["totalsByCurrency"]["USD"], {
            "liquidAssets": 1250.25, "investmentAssets": 8000.0, "debtBalances": 450.0,
        })
        self.assertEqual(snapshot["source"], "plaid_accounts_get+credit_bank_income_get")
        self.assertEqual(snapshot["environment"], "sandbox")
        self.assertIsNone(snapshot["annualIncome"])

    def test_unknown_and_negative_values_are_not_counted_as_assets(self):
        accounts = [{
            "type": "depository", "subtype": "checking",
            "balances": {"current": -20, "available": None, "limit": None,
                         "unofficial_currency_code": "points"},
        }]
        snapshot = normalize_accounts(accounts)
        self.assertEqual(snapshot["accounts"][0]["currency"], "UNKNOWN")
        self.assertEqual(snapshot["accounts"][0]["currentBalance"], -20.0)
        self.assertEqual(snapshot["totalsByCurrency"]["UNKNOWN"]["liquidAssets"], 0.0)

    def test_configuration_is_required_and_sandbox_only(self):
        for values in ({"PLAID_CLIENT_ID": "", "PLAID_SECRET": ""},
                       {"PLAID_ENV": "production"}):
            with self.subTest(values=values), patch.dict(os.environ, values):
                with self.assertRaises(PlaidError) as caught:
                    create_link_token()
                self.assertEqual(caught.exception.status, 503)

    def test_credentials_come_from_the_stack_secret(self):
        import backend.plaid as plaid
        secret = json.dumps({"client_id": "stored-id", "secret": "stored-secret"})
        values = {"PLAID_CLIENT_ID": "", "PLAID_SECRET": "", "PLAID_CREDENTIALS_SECRET": "arn:aws:secretsmanager:us-east-1:1:secret:x"}
        with patch.dict(os.environ, values), patch("backend.plaid.boto3.client") as client, \
                patch("backend.plaid._stored", ("", "", 0.0)):
            client.return_value.get_secret_value.return_value = {"SecretString": secret}
            self.assertEqual(plaid._credentials(), ("stored-id", "stored-secret"))
            self.assertEqual(plaid._credentials(), ("stored-id", "stored-secret"))
            self.assertEqual(client.return_value.get_secret_value.call_count, 1, "keys are cached between requests")

    def test_unset_or_unreadable_stack_secret_returns_503(self):
        import backend.plaid as plaid
        values = {"PLAID_CLIENT_ID": "", "PLAID_SECRET": "", "PLAID_CREDENTIALS_SECRET": "arn:aws:secretsmanager:us-east-1:1:secret:x"}
        for read in ({"SecretString": json.dumps({"client_id": "unset", "secret": "unset"})}, {"SecretString": "not json"},
                     ClientError({"Error": {"Code": "AccessDeniedException"}}, "GetSecretValue")):
            with self.subTest(read=read), patch.dict(os.environ, values), patch("backend.plaid.boto3.client") as client, \
                    patch("backend.plaid._stored", ("", "", 0.0)):
                if isinstance(read, Exception):
                    client.return_value.get_secret_value.side_effect = read
                else:
                    client.return_value.get_secret_value.return_value = read
                with self.assertRaises(PlaidError) as caught:
                    plaid._credentials()
                self.assertEqual(caught.exception.status, 503)


if __name__ == "__main__":
    unittest.main()
