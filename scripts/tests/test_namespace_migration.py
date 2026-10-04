"""Offline migration regressions; no AWS or Cloudflare credentials needed."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aws_actions
import cloudflare_dns as dns
import migrate_namespace as migration
from validate_repo import CONFIG, ROOT, validate_app


class DnsTests(unittest.TestCase):
    def test_transfer_refuses_unexpected_target_or_ambiguous_records_before_writes(self):
        cases = [[], [{"type": "A"}], [{"type": "CNAME", "content": "unrelated.cloudfront.net"}],
                 [{"type": "CNAME", "content": "old"}] * 2]
        for matches in cases:
            with self.subTest(matches=matches), patch.object(dns, "zone_id", return_value="ZONE"), \
                 patch.object(dns, "records", return_value=matches), patch.object(dns, "request") as request:
                with self.assertRaises(RuntimeError):
                    dns.transfer_site_cname("old", "new")
                request.assert_not_called()

    def test_transfer_is_exact_name_and_idempotent(self):
        record = {"type": "CNAME", "id": "ID", "content": "old.", "proxied": False}
        with patch.object(dns, "zone_id", return_value="ZONE"), patch.object(dns, "records", return_value=[record]), \
             patch.object(dns, "request") as request:
            dns.transfer_site_cname("old", "new")
            self.assertEqual(request.call_args.args[:2], ("PUT", "/zones/ZONE/dns_records/ID"))
            self.assertEqual(request.call_args.args[2]["name"], CONFIG["legacy_domain"])
            self.assertEqual(request.call_args.args[2]["content"], "new")
            record["content"] = "new"
            request.reset_mock()
            dns.transfer_site_cname("old", "new")
            request.assert_not_called()


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.new = json.loads((ROOT / "infra/bootstrap.json").read_text())
        # Stand-in for a deployed old template, retaining the real GitHub owner.
        raw = json.dumps(self.new).replace("codelinc-hackathon", "codelinq-hackathon")
        self.old = json.loads(raw)

    def test_prepare_preserves_old_resources_and_model_trust(self):
        updated = migration.migration_template(self.old, self.new)
        self.assertEqual(updated["Parameters"], self.old["Parameters"])
        for name in self.old["Resources"]:
            before = copy.deepcopy(self.old["Resources"][name])
            after = copy.deepcopy(updated["Resources"][name])
            if name in ("BootstrapRole", "BootstrapCloudFormationRole", "TeardownRole"):
                before["Properties"].pop("Policies")
                after["Properties"].pop("Policies")
            self.assertEqual(after, before, name)
        self.assertEqual(updated["Resources"]["NamespaceMigrationRole"]["Properties"]["RoleName"], migration.BRIDGE_ROLE)
        self.assertEqual(migration.migration_template(updated, self.new), updated)

    def test_stack_guard_rejects_unowned_and_busy_stacks(self):
        for stack in [{"Tags": [], "StackStatus": "CREATE_COMPLETE"},
                      {"Tags": [{"Key": "Project", "Value": CONFIG["prefix"]}], "StackStatus": "UPDATE_IN_PROGRESS"}]:
            with patch.object(aws_actions, "aws", return_value={"Stacks": [stack]}):
                with self.assertRaises(RuntimeError):
                    migration.stack(CONFIG, "app")

    def test_handoff_refuses_temporary_bootstrap_service_role(self):
        with patch.object(migration, "stack", return_value={"RoleARN": migration.role_arn(migration.BRIDGE_ROLE)}):
            with self.assertRaises(RuntimeError):
                migration.verify_bootstrap_handoff()

    def test_initial_bootstrap_requires_exact_identity_and_owned_role_template(self):
        legacy = migration.LEGACY
        live = {"StackName": legacy["bootstrap_stack"], "StackStatus": "UPDATE_COMPLETE", "Tags": [],
                "StackId": f"arn:aws:cloudformation:{CONFIG['region']}:{CONFIG['account_id']}:stack/{legacy['bootstrap_stack']}/id",
                "RoleARN": migration.role_arn(legacy["bootstrap_cloudformation_role"])}
        with patch.object(migration, "template", return_value=self.old), \
             patch.object(aws_actions, "aws", return_value={"Stacks": [live]}):
            self.assertEqual(migration.stack(legacy, "bootstrap"), live)
            for key, value in (("StackName", "unrelated"), ("StackId", "wrong-account"),
                               ("RoleARN", "wrong-role"), ("Tags", [{"Key": "Project", "Value": "other"}])):
                changed = {**live, key: value}
                self.assertFalse(migration.verified_initial_bootstrap(legacy, "bootstrap", changed))
            self.assertFalse(migration.verified_initial_bootstrap(legacy, "app", live))
            self.assertFalse(migration.verified_initial_bootstrap(CONFIG, "bootstrap", live))
            self.old["Resources"]["BootstrapRole"]["Properties"]["Tags"] = []
            self.assertFalse(migration.verified_initial_bootstrap(legacy, "bootstrap", live))

    def test_legacy_bootstrap_update_adds_ownership_stack_tags(self):
        with patch.dict(os.environ, {"GITHUB_RUN_ID": "1"}), patch.object(aws_actions, "aws", return_value={}) as calls:
            migration.apply_template(migration.LEGACY, "bootstrap", self.old, migration.LEGACY["bootstrap_cloudformation_role"])
            args = calls.call_args_list[0].args
            tags = json.loads(args[args.index("--tags") + 1])
            self.assertIn({"Key": "Project", "Value": migration.LEGACY["prefix"]}, tags)

    def test_cutover_and_rollback_order_and_dns_preflight(self):
        def live(config, kind):
            domain = "new.cloudfront.net" if config is CONFIG else "old.cloudfront.net"
            return {"Outputs": [{"OutputKey": "SiteDistributionDomainName", "OutputValue": domain}]}
        for rollback in (False, True):
            operations = []
            with patch.object(migration, "inventory"), patch.object(migration, "stack", side_effect=live), \
                 patch.object(migration, "records", return_value=[{"type": "CNAME", "content": "old.cloudfront.net"}]), \
                 patch.object(migration, "zone_id", return_value="ZONE"), patch.object(migration, "verify_new_site"), \
                 patch.object(migration, "verify_bootstrap_handoff"), \
                 patch.object(migration, "set_old_alias", side_effect=lambda value: operations.append(("old", value))), \
                 patch.object(migration, "set_new_alias", side_effect=lambda value: operations.append(("new", value))), \
                 patch.object(migration.time, "sleep", side_effect=lambda seconds: operations.append(("wait", seconds))), \
                 patch.object(migration, "transfer_site_cname", side_effect=lambda *values: operations.append(("dns", values))):
                migration.cutover(rollback)
            self.assertEqual(operations, [
                ("new", False) if rollback else ("old", False),
                ("dns", ("new.cloudfront.net", "old.cloudfront.net") if rollback else ("old.cloudfront.net", "new.cloudfront.net")),
                ("wait", 300),
                ("old", True) if rollback else ("new", True),
            ])
        with patch.object(migration, "inventory"), patch.object(migration, "stack", side_effect=live), \
             patch.object(migration, "records", return_value=[]), patch.object(migration, "zone_id"), \
             patch.object(migration, "set_old_alias") as mutate:
            with self.assertRaises(RuntimeError):
                migration.cutover()
            mutate.assert_not_called()

    def test_cleanup_requires_its_own_confirmation(self):
        with patch.object(aws_actions, "aws") as aws:
            with self.assertRaises(RuntimeError):
                migration.cleanup("DELETE codelinc-hackathon 394270749442")
            aws.assert_not_called()

    def test_cleanup_preserves_transferred_dns_and_validation_records(self):
        old = {"Parameters": [{"ParameterKey": "SiteCertificateArn", "ParameterValue": "OLD_CERT"}]}
        new = {"Parameters": [{"ParameterKey": "LegacyAliasEnabled", "ParameterValue": "true"}],
               "Outputs": [{"OutputKey": "SiteDistributionDomainName", "OutputValue": "new.cloudfront.net"}]}
        legacy_template = {"Resources": {"SiteDistribution": {"Properties": {"DistributionConfig": {"Aliases": []}}}}}
        current_template = {"Resources": {"LegacyRedirectFunction": {}}}
        def live(config, kind):
            return new if config is CONFIG else old
        def deployed(config, kind):
            return copy.deepcopy(current_template if config is CONFIG else legacy_template)
        def aws(*args, **kwargs):
            if args[:2] == ("acm", "list-tags-for-certificate"):
                return {"Tags": [{"Key": "Project", "Value": migration.LEGACY["prefix"]}]}
            return {}
        with patch.object(migration, "verify_new_site"), patch.object(migration, "verify_bootstrap_handoff"), \
             patch.object(migration, "stack", side_effect=live), patch.object(migration, "template", side_effect=deployed), \
             patch.object(migration, "inventory"), patch.object(migration, "zone_id"), \
             patch.object(migration, "records", return_value=[{"type": "CNAME", "content": "new.cloudfront.net"}]), \
             patch.object(migration, "apply_template") as apply, patch.object(aws_actions, "owned_resources", return_value=[]), \
             patch.object(aws_actions, "empty_bucket"), patch.object(aws_actions, "aws", side_effect=aws) as calls, \
             patch.object(dns, "request") as request:
            migration.cleanup("DELETE LEGACY codelinq-hackathon 394270749442")
            request.assert_not_called()
            self.assertFalse(apply.call_args.args[2]["Resources"]["SiteDistribution"]["Properties"]["DistributionConfig"]["Enabled"])
            deletes = [call for call in calls.call_args_list if call.args[:2] == ("acm", "delete-certificate")]
            self.assertEqual(deletes[0].args[-1], "OLD_CERT")
        self.assertIs(aws_actions.CONFIG, CONFIG)

    def test_existing_stack_replacement_is_refused(self):
        def aws(*args, **kwargs):
            if args[:2] == ("cloudformation", "describe-change-set"):
                return {"Changes": [{"ResourceChange": {"Replacement": "True"}}]}
            return {}
        with patch.dict(os.environ, {"GITHUB_RUN_ID": "1"}), patch.object(aws_actions, "aws", side_effect=aws) as calls:
            with self.assertRaises(RuntimeError):
                migration.apply_template(CONFIG, "bootstrap", self.new, CONFIG["bootstrap_cloudformation_role"])
            self.assertFalse(any(call.args[:2] == ("cloudformation", "execute-change-set") for call in calls.call_args_list))

    def test_new_teardown_refuses_live_legacy_stack_before_writes(self):
        with patch.object(aws_actions, "aws", return_value={"Stacks": [{}]}) as aws:
            with self.assertRaises(RuntimeError):
                aws_actions.teardown("DELETE codelinc-hackathon 394270749442")
            self.assertEqual(aws.call_count, 1)
            self.assertEqual(aws.call_args.args[:2], ("cloudformation", "describe-stacks"))

    def test_new_teardown_preserves_access_errors(self):
        with patch.object(aws_actions, "aws", side_effect=subprocess.CalledProcessError(1, "aws", stderr="AccessDenied")):
            with self.assertRaises(subprocess.CalledProcessError):
                aws_actions.teardown("DELETE codelinc-hackathon 394270749442")

    def test_certificate_must_cover_both_exact_hosts(self):
        def aws(*args, **kwargs):
            if args[1] == "list-certificates":
                return {"CertificateSummaryList": [{"DomainName": CONFIG["site_domain"], "CertificateArn": "CERT"}]}
            if args[1] == "list-tags-for-certificate":
                return {"Tags": [{"Key": "Project", "Value": CONFIG["prefix"]}, {"Key": "Lifecycle", "Value": "ephemeral"}]}
            return {"Certificate": {"SubjectAlternativeNames": [CONFIG["site_domain"]]}}
        with patch.object(aws_actions, "aws", side_effect=aws):
            with self.assertRaises(RuntimeError):
                aws_actions.hackathon_certificate()

    def test_template_rejects_unconditional_legacy_alias_or_different_redirect(self):
        source = json.loads((ROOT / "infra/app.json").read_text())
        source["Resources"]["SiteDistribution"]["Properties"]["DistributionConfig"]["Aliases"] = [CONFIG["site_domain"], CONFIG["legacy_domain"]]
        with self.assertRaises(AssertionError):
            validate_app(source)


if __name__ == "__main__":
    unittest.main()
