"""Offline deployment safety and packaging regressions."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aws_actions
from bedrock_config import from_environment, validate_model_settings
from build_backend import package_backend
from smoke_backend import request
from validate_repo import ROOT, validate_app, validate_chat_bootstrap

MODEL = "amazon.nova-lite-v1:0"
ARN = "arn:aws:bedrock:us-east-1::foundation-model/" + MODEL
PROFILE = "us.amazon.nova-lite-v1:0"
PROFILE_ARN = "arn:aws:bedrock:us-east-1:394270749442:inference-profile/" + PROFILE


class ModelConfigTests(unittest.TestCase):
    def test_direct_model_and_arn(self):
        self.assertEqual(validate_model_settings(MODEL, [ARN]), (MODEL, [ARN]))
        self.assertEqual(validate_model_settings(ARN, [ARN]), (ARN, [ARN]))

    def test_cross_region_profile(self):
        arns = [PROFILE_ARN, ARN, ARN.replace("us-east-1", "us-west-2")]
        self.assertEqual(validate_model_settings(PROFILE, arns), (PROFILE, sorted(arns)))

    def test_wildcards_other_accounts_missing_targets_and_duplicates_rejected(self):
        cases = [(MODEL, ["*"]), (MODEL, [ARN + "*"]), ("*", [ARN]), (MODEL, [ARN, ARN]),
                 (MODEL, []), (MODEL, "not-a-list"), (MODEL, [ARN.replace("us-east-1", "eu-west-1")]),
                 (PROFILE, [PROFILE_ARN]), (PROFILE, [PROFILE_ARN.replace("394270749442", "123456789012"), ARN]),
                 ("different-model", [ARN]), (MODEL, [ARN, PROFILE_ARN])]
        for model, arns in cases:
            with self.subTest(model=model, arns=arns), self.assertRaises(ValueError):
                validate_model_settings(model, arns)

    def test_environment_is_required_and_json_only(self):
        with patch.dict(os.environ, {"BEDROCK_MODEL_ID": MODEL, "BEDROCK_MODEL_ARNS": json.dumps([ARN])}):
            self.assertEqual(from_environment(), (MODEL, [ARN]))
        with patch.dict(os.environ, {"BEDROCK_MODEL_ID": MODEL, "BEDROCK_MODEL_ARNS": ARN}):
            with self.assertRaises(ValueError):
                from_environment()


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.app = json.loads((ROOT / "infra/app.json").read_text())
        self.bootstrap = json.loads((ROOT / "infra/bootstrap.json").read_text())

    def test_templates_pass_ownership_checks(self):
        validate_app(self.app)
        validate_chat_bootstrap(self.bootstrap)

    def test_unsafe_runtime_changes_rejected(self):
        mutations = [
            ("ChatFunctionUrl", "AuthType", "NONE"),
            ("ChatFunction", "ReservedConcurrentExecutions", 100),
            ("ChatFunction", "ReservedConcurrentExecutions", 2),
            ("ChatRole", "PermissionsBoundary", None),
            ("ChatUrlPermission", "Principal", "*"),
            ("ChatInvokePermission", "SourceArn", "*"),
        ]
        for resource, field, value in mutations:
            with self.subTest(resource=resource, field=field):
                template = copy.deepcopy(self.app)
                template["Resources"][resource]["Properties"][field] = value
                with self.assertRaises(AssertionError):
                    validate_app(template)

    def test_wide_bedrock_boundary_rejected(self):
        statements = self.bootstrap["Resources"]["RuntimeBoundary"]["Properties"]["PolicyDocument"]["Statement"]
        statement = next(s for s in statements if "bedrock:InvokeModel" in s["Action"])
        statement["Resource"] = "*"
        with self.assertRaises(AssertionError):
            validate_chat_bootstrap(self.bootstrap)

    def test_html_error_rewrites_rejected(self):
        errors = self.app["Resources"]["SiteDistribution"]["Properties"]["DistributionConfig"]["CustomErrorResponses"]
        errors[0].update({"ResponseCode": 200, "ResponsePagePath": "/index.html"})
        with self.assertRaises(AssertionError):
            validate_app(self.app)

    def test_runtime_cannot_gain_other_service_permissions(self):
        role = self.app["Resources"]["ChatRole"]["Properties"]
        statements = role["Policies"][0]["PolicyDocument"]["Statement"]
        statements[1] = {"Effect": "Allow", "Action": "s3:*", "Resource": "*"}
        with self.assertRaises(AssertionError):
            validate_app(self.app)

    def test_limiter_configuration_and_permissions_are_required(self):
        for change in ("table_env", "table_resource", "permissions", "encryption", "tags"):
            with self.subTest(change=change):
                template = copy.deepcopy(self.app)
                resources = template["Resources"]
                if change == "table_env":
                    resources["ChatFunction"]["Properties"]["Environment"]["Variables"]["CHAT_RATE_LIMIT_TABLE"] = "other-table"
                elif change == "table_resource":
                    resources["ChatRateLimitTable"]["Properties"]["TableName"] = "other-table"
                elif change == "permissions":
                    statements = resources["ChatRole"]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]
                    next(s for s in statements if s["Action"] == ["dynamodb:GetItem", "dynamodb:PutItem"])["Resource"] = "*"
                elif change == "encryption":
                    resources["ChatRateLimitTable"]["Properties"]["SSESpecification"]["SSEEnabled"] = False
                else:
                    resources["ChatRateLimitTable"]["Properties"]["Tags"] = []
                with self.assertRaises(AssertionError):
                    validate_app(template)

    def test_boundary_mismatch_stops_deployment_before_writes(self):
        stack = {"Stacks": [{"Parameters": [
            {"ParameterKey": "BedrockModelId", "ParameterValue": MODEL},
            {"ParameterKey": "BedrockModelArns", "ParameterValue": ARN}],
            "Outputs": [{"OutputKey": "CloudFrontOriginAccessControlId", "OutputValue": "SITE"},
                        {"OutputKey": "ChatOriginAccessControlId", "OutputValue": "CHAT"}]}]}
        with patch.object(aws_actions, "aws", return_value=stack) as aws:
            self.assertEqual(aws_actions.bootstrap_settings(MODEL, [ARN]), ("SITE", "CHAT"))
            with self.assertRaises(ValueError):
                aws_actions.bootstrap_settings("other-model", [ARN])
            self.assertTrue(all(call.args[:2] == ("cloudformation", "describe-stacks") for call in aws.call_args_list))

    def test_bootstrap_preserves_trust_parameters(self):
        parameters = aws_actions.bootstrap_parameters(self.bootstrap, "42", MODEL, [ARN])
        values = {p["ParameterKey"]: p for p in parameters}
        self.assertEqual(values["BedrockModelArns"]["ParameterValue"], ARN)
        self.assertEqual(values["BedrockModelId"]["ParameterValue"], MODEL)
        self.assertEqual(values["BootstrapRevision"]["ParameterValue"], "42")
        for name in ("GitHubOidcProviderArn", "GitHubOrganizationId", "GitHubRepositoryId"):
            self.assertTrue(values[name]["UsePreviousValue"])

    def test_zip_has_reference_and_executable_launcher_without_dev_files(self):
        with tempfile.TemporaryDirectory() as directory:
            dependencies = Path(directory) / "dependencies"
            dependencies.mkdir()
            (dependencies / "boto3.py").write_text("# stand-in dependency for packaging test\n")
            output = Path(directory) / "backend.zip"
            package_backend(output, dependencies)
            with ZipFile(output) as archive:
                names = set(archive.namelist())
                self.assertIn("backend/references/lincoln_calculator.md", names)
                self.assertIn("backend/app.py", names)
                self.assertIn("backend/rate_limit.py", names)
                self.assertIn("backend/intake.py", names)
                self.assertNotIn("backend/server.py", names)
                self.assertNotIn("backend/config.py", names)
                self.assertIn("boto3.py", names)
                self.assertNotIn("backend/.env", names)
                self.assertFalse(any("tests/" in name or name.startswith("frontend/") for name in names))
                launcher = archive.getinfo("run.sh")
                self.assertEqual((launcher.external_attr >> 16) & 0o777, 0o755)
                self.assertNotIn(b"\r", archive.read("run.sh"))
                self.assertIn(b"python -m gunicorn", archive.read("run.sh"))
                self.assertIn(b"backend.app:app", archive.read("run.sh"))

    def test_smoke_client_hashes_exact_body_without_signing_credentials(self):
        body = b'{"messages":[]}'
        with patch("smoke_backend.urlopen") as open_url:
            request("/api/chat", body)
        req = open_url.call_args.args[0]
        self.assertEqual(req.data, body)
        self.assertEqual(req.get_header("X-amz-content-sha256"), hashlib.sha256(body).hexdigest())
        self.assertIsNone(req.get_header("Authorization"))


if __name__ == "__main__":
    unittest.main()
