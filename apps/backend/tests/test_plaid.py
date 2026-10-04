"""Offline Plaid request and normalization tests."""
import os
import unittest
from unittest.mock import patch

from backend.plaid import PlaidError, create_link_token, exchange_and_get_accounts, normalize_accounts


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
        post.return_value = {"link_token": "link-sandbox", "expiration": "2026-10-04T00:00:00Z"}
        self.assertEqual(create_link_token()["link_token"], "link-sandbox")
        path, body = post.call_args.args
        self.assertEqual(path, "/link/token/create")
        self.assertEqual(body["products"], ["transactions"])
        self.assertEqual(body["country_codes"], ["US"])
        self.assertNotIn("email_address", body["user"])
        self.assertNotIn("phone_number", body["user"])
        self.assertTrue(body["user"]["client_user_id"])

    @patch("backend.plaid._post")
    def test_exchange_fetches_accounts_and_drops_identifiers(self, post):
        post.side_effect = [
            {"access_token": "access-sandbox", "item_id": "item-secret"},
            {"accounts": ACCOUNTS, "item": {"institution_id": "ins_secret"}},
        ]
        snapshot = exchange_and_get_accounts("public-sandbox")
        self.assertEqual([call.args[0] for call in post.call_args_list],
                         ["/item/public_token/exchange", "/accounts/get"])
        self.assertEqual(post.call_args_list[1].args[1]["access_token"], "access-sandbox")
        serialized = str(snapshot)
        for private in ("do-not-expose", "My Checking", "Sensitive name", "1234",
                        "item-secret", "ins_secret", "access-sandbox"):
            self.assertNotIn(private, serialized)

    def test_normalizes_categories_and_currency_totals(self):
        snapshot = normalize_accounts(ACCOUNTS)
        self.assertEqual([account["category"] for account in snapshot["accounts"]],
                         ["liquid_asset", "debt", "investment_asset"])
        self.assertEqual(snapshot["totalsByCurrency"]["USD"], {
            "liquidAssets": 1250.25, "investmentAssets": 8000.0, "debtBalances": 450.0,
        })
        self.assertEqual(snapshot["source"], "plaid_accounts_get")
        self.assertEqual(snapshot["environment"], "sandbox")

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


if __name__ == "__main__":
    unittest.main()
