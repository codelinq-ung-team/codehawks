#!/usr/bin/env python3
"""Explicit, main-only Actions phases for the namespace migration."""
import argparse
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile

import aws_actions as actions
from bedrock_config import from_environment
from cloudflare_dns import records, transfer_site_cname, zone_id
from validate_repo import CONFIG, ROOT

LEGACY = json.loads((ROOT / "infra/legacy-config.json").read_text())
BRIDGE_ROLE = CONFIG["prefix"] + "-migration-cloudformation"


def sub(value):
    return {"Fn::Sub": value}


def role_arn(name):
    return f"arn:aws:iam::{CONFIG['account_id']}:role/{name}"


def stack(config, kind):
    result = actions.aws("cloudformation", "describe-stacks", "--stack-name", config[kind + "_stack"])["Stacks"][0]
    tags = {t["Key"]: t["Value"] for t in result.get("Tags", [])}
    if tags.get("Project") != config["prefix"]:
        raise RuntimeError("Migration stack ownership mismatch")
    if result["StackStatus"] not in ("CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"):
        raise RuntimeError("Finish or recover the existing stack operation before migrating")
    return result


def outputs(value):
    return {p["OutputKey"]: p["OutputValue"] for p in value.get("Outputs", [])}


def template(config, kind):
    body = actions.aws("cloudformation", "get-template", "--stack-name", config[kind + "_stack"], "--template-stage", "Original")["TemplateBody"]
    return json.loads(body) if isinstance(body, str) else body


def statements(value, role):
    return value["Resources"][role]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]


def allow(action, resource, condition=None):
    result = {"Effect": "Allow", "Action": action, "Resource": resource}
    if condition:
        result["Condition"] = condition
    return result


def migration_template(old, new):
    """Preserve the live bootstrap; add access only for these two namespaces."""
    result = copy.deepcopy(old)
    bridge = copy.deepcopy(new["Resources"]["BootstrapCloudFormationRole"])
    bridge.pop("DeletionPolicy", None)
    bridge.pop("UpdateReplacePolicy", None)
    bridge["Properties"]["RoleName"] = BRIDGE_ROLE
    # It belongs to the old stack and is removed when that stack is retired.
    bridge["Properties"]["Tags"] = copy.deepcopy(old["Resources"]["BootstrapRole"]["Properties"]["Tags"])
    bridge["DependsOn"] = "BootstrapCloudFormationRole"
    result["Resources"]["NamespaceMigrationRole"] = bridge
    iam = copy.deepcopy(next(s for s in statements(old, "BootstrapCloudFormationRole") if "iam:CreateRole" in s["Action"]))
    iam["Resource"] = sub("arn:${AWS::Partition}:iam::${AWS::AccountId}:role/" + BRIDGE_ROLE)
    if iam not in statements(result, "BootstrapCloudFormationRole"):
        statements(result, "BootstrapCloudFormationRole").append(iam)
    scoped = [sub("arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/" + name + "/*")
              for name in (CONFIG["bootstrap_stack"], CONFIG["app_stack"], LEGACY["app_stack"])]
    scoped += [sub("arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:changeSet/" + prefix + "-*/*")
               for prefix in (CONFIG["bootstrap_stack"], CONFIG["app_stack"], LEGACY["app_stack"])]
    grants = [allow(["cloudformation:CreateChangeSet", "cloudformation:DescribeChangeSet", "cloudformation:ExecuteChangeSet",
                     "cloudformation:DeleteChangeSet", "cloudformation:DescribeStacks", "cloudformation:GetTemplate",
                     "cloudformation:ListStackResources", "cloudformation:DeleteStack"], scoped),
              allow("iam:PassRole", [sub("arn:${AWS::Partition}:iam::${AWS::AccountId}:role/" + name)
                    for name in (BRIDGE_ROLE, CONFIG["cloudformation_role"], LEGACY["cloudformation_role"])],
                    {"StringEquals": {"iam:PassedToService": "cloudformation.amazonaws.com"}})]
    for grant in grants:
        if grant not in statements(result, "BootstrapRole"):
            statements(result, "BootstrapRole").append(grant)
    read_grant = allow(["cloudformation:DescribeStacks", "cloudformation:GetTemplate"], [
        sub("arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/" + name + "/*")
        for name in (CONFIG["app_stack"], CONFIG["bootstrap_stack"], LEGACY["bootstrap_stack"])])
    if read_grant not in statements(result, "TeardownRole"):
        statements(result, "TeardownRole").append(read_grant)
    return result


def apply_template(config, kind, value, service_role, overrides=None, create=False):
    """Use a compact inline change set; refuse resource replacement on updates."""
    overrides = overrides or {}
    parameters = [{"ParameterKey": name, "ParameterValue": overrides[name]} if name in overrides
                  else {"ParameterKey": name, "UsePreviousValue": True}
                  for name in value.get("Parameters", {}) if not create or name in overrides]
    body = json.dumps(value, separators=(",", ":"))
    if len(body.encode()) > 51200:
        raise RuntimeError("Migration template exceeds the CloudFormation inline limit")
    name = config[kind + "_stack"]
    change = f"{name}-migration-{os.environ['GITHUB_RUN_ID']}-{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}"
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "template.json"
        path.write_text(body)
        args = ["cloudformation", "create-change-set", "--stack-name", name,
                "--change-set-name", change, "--change-set-type", "CREATE" if create else "UPDATE",
                "--template-body", "file://" + str(path), "--capabilities", "CAPABILITY_NAMED_IAM",
                "--role-arn", role_arn(service_role), "--parameters", json.dumps(parameters)]
        if create:
            args += ["--tags", json.dumps([{"Key": "Project", "Value": config["prefix"]},
                                           {"Key": "Lifecycle", "Value": "ephemeral"},
                                           {"Key": "Owner", "Value": "Israel Jauregui"},
                                           {"Key": "ManagedBy", "Value": "CloudFormation"}])]
        actions.aws(*args)
    try:
        actions.aws("cloudformation", "wait", "change-set-create-complete", "--stack-name", name,
                    "--change-set-name", change, json_output=False)
    except subprocess.CalledProcessError:
        details = actions.aws("cloudformation", "describe-change-set", "--stack-name", name, "--change-set-name", change)
        if details["Status"] == "FAILED" and "didn't contain changes" in details.get("StatusReason", ""):
            actions.aws("cloudformation", "delete-change-set", "--stack-name", name, "--change-set-name", change)
            return
        raise
    details = actions.aws("cloudformation", "describe-change-set", "--stack-name", name, "--change-set-name", change)
    if not create and any(c.get("ResourceChange", {}).get("Replacement", "False") != "False" for c in details.get("Changes", [])):
        raise RuntimeError("Refusing resource replacement in an existing migration stack")
    actions.aws("cloudformation", "execute-change-set", "--stack-name", name, "--change-set-name", change)
    actions.aws("cloudformation", "wait", "stack-create-complete" if create else "stack-update-complete",
                "--stack-name", name, json_output=False)


def inventory(include_app=False):
    old_bootstrap = stack(LEGACY, "bootstrap")
    old_app = stack(LEGACY, "app") if include_app else None
    dns = records(zone_id(), LEGACY["site_domain"])
    result = {"account_id": CONFIG["account_id"], "region": CONFIG["region"],
              "legacy_bootstrap": old_bootstrap, "legacy_app": old_app,
              "legacy_dns": dns, "legacy_target": outputs(old_app).get("SiteDistributionDomainName") if old_app else None}
    if old_app:
        result["legacy_resources"] = actions.aws("cloudformation", "list-stack-resources", "--stack-name", LEGACY["app_stack"])["StackResourceSummaries"]
    folder = ROOT / "build"
    folder.mkdir(exist_ok=True)
    (folder / "rename-manifest.json").write_text(json.dumps(result, indent=2) + "\n")
    (folder / "legacy-bootstrap-before.json").write_text(json.dumps(template(LEGACY, "bootstrap"), indent=2) + "\n")
    if old_app:
        (folder / "legacy-app-before.json").write_text(json.dumps(template(LEGACY, "app"), indent=2) + "\n")
    return result


def prepare():
    inventory()
    old = template(LEGACY, "bootstrap")
    new = json.loads((ROOT / "infra/bootstrap.json").read_text())
    apply_template(LEGACY, "bootstrap", migration_template(old, new), LEGACY["bootstrap_cloudformation_role"])


def create_bootstrap():
    stack(LEGACY, "bootstrap")
    old = template(LEGACY, "bootstrap")
    if "NamespaceMigrationRole" not in old["Resources"]:
        raise RuntimeError("Run prepare before creating the new bootstrap")
    model, arns = from_environment()
    new = json.loads((ROOT / "infra/bootstrap.json").read_text())
    # An already-created bootstrap must be updated through its own final role.
    try:
        stack(CONFIG, "bootstrap")
    except subprocess.CalledProcessError as error:
        if "does not exist" not in (error.stderr or ""):
            raise
    else:
        raise RuntimeError("New bootstrap already exists; switch roles and use Update hackathon AWS bootstrap")
    apply_template(CONFIG, "bootstrap", new, BRIDGE_ROLE, {
        "BootstrapRevision": "0", "BedrockModelId": model,
        "BedrockModelArns": ",".join(arns)}, create=True)
    print(json.dumps(outputs(stack(CONFIG, "bootstrap")), indent=2))


def verify_new_site():
    from urllib.request import urlopen
    with urlopen("https://" + CONFIG["site_domain"], timeout=30) as response:
        if response.status != 200 or b"<title>LincLife</title>" not in response.read():
            raise RuntimeError("New website must pass its deployment checks before cutover")
    with urlopen("https://" + CONFIG["site_domain"] + "/api/health", timeout=30) as response:
        if response.status != 200 or json.load(response).get("status") != "ok":
            raise RuntimeError("New API health check failed")


def verify_bootstrap_handoff():
    current = stack(CONFIG, "bootstrap")
    if current.get("RoleARN") != role_arn(CONFIG["bootstrap_cloudformation_role"]):
        raise RuntimeError("Run the new bootstrap update successfully to hand off its service role before cutover or cleanup")


def set_new_alias(enabled):
    stack(CONFIG, "app")
    value = template(CONFIG, "app")
    if "LegacyAliasEnabled" not in value.get("Parameters", {}):
        raise RuntimeError("New app does not support the migration alias")
    apply_template(CONFIG, "app", value, CONFIG["cloudformation_role"], {"LegacyAliasEnabled": str(enabled).lower()})


def set_old_alias(enabled):
    stack(LEGACY, "app")
    value = template(LEGACY, "app")
    aliases = value["Resources"]["SiteDistribution"]["Properties"]["DistributionConfig"]["Aliases"]
    if any(name != LEGACY["site_domain"] for name in aliases):
        raise RuntimeError("Unexpected alias on legacy distribution")
    value["Resources"]["SiteDistribution"]["Properties"]["DistributionConfig"]["Aliases"] = [LEGACY["site_domain"]] if enabled else []
    apply_template(LEGACY, "app", value, LEGACY["cloudformation_role"])


def cutover(rollback=False):
    inventory(include_app=True)
    new = outputs(stack(CONFIG, "app"))
    old = outputs(stack(LEGACY, "app"))
    matches = records(zone_id(), LEGACY["site_domain"])
    if len(matches) != 1 or matches[0].get("type") != "CNAME" or matches[0].get("content", "").rstrip(".") not in (
            new["SiteDistributionDomainName"], old["SiteDistributionDomainName"]):
        raise RuntimeError("Legacy DNS conflict; refusing to change alias ownership")
    if rollback:
        set_new_alias(False)
        set_old_alias(True)
        transfer_site_cname(new["SiteDistributionDomainName"], old["SiteDistributionDomainName"])
    else:
        verify_bootstrap_handoff()
        verify_new_site()
        set_old_alias(False)
        set_new_alias(True)
        transfer_site_cname(old["SiteDistributionDomainName"], new["SiteDistributionDomainName"])
    print("Alias ownership and legacy DNS transfer completed.")


def cleanup(confirmation):
    if confirmation != f"DELETE LEGACY {LEGACY['prefix']} {CONFIG['account_id']}":
        raise RuntimeError("Legacy cleanup requires its own exact confirmation")
    verify_bootstrap_handoff()
    verify_new_site()
    new = outputs(stack(CONFIG, "app"))
    new_template = template(CONFIG, "app")
    params = {p["ParameterKey"]: p["ParameterValue"] for p in stack(CONFIG, "app")["Parameters"]}
    if params.get("LegacyAliasEnabled") != "true" or "LegacyRedirectFunction" not in new_template["Resources"]:
        raise RuntimeError("Complete alias cutover before cleanup")
    matches = records(zone_id(), LEGACY["site_domain"])
    if len(matches) != 1 or matches[0].get("type") != "CNAME" or matches[0].get("content", "").rstrip(".") != new["SiteDistributionDomainName"]:
        raise RuntimeError("Legacy DNS must point to the new deployment before cleanup")
    old = stack(LEGACY, "app")
    if template(LEGACY, "app")["Resources"]["SiteDistribution"]["Properties"]["DistributionConfig"]["Aliases"]:
        raise RuntimeError("Legacy distribution must release its alias before cleanup")
    inventory(include_app=True)
    certificate = next((p["ParameterValue"] for p in old.get("Parameters", []) if p["ParameterKey"] == "SiteCertificateArn"), None)
    if certificate:
        tags = actions.aws("acm", "list-tags-for-certificate", "--certificate-arn", certificate)["Tags"]
        if {t["Key"]: t["Value"] for t in tags}.get("Project") != LEGACY["prefix"]:
            raise RuntimeError("Legacy certificate ownership mismatch")
    # Use the old teardown role, old namespace guards, and preserve transferred DNS.
    original = actions.CONFIG
    try:
        actions.CONFIG = LEGACY
        resources = actions.owned_resources(old)
        if any(r["ResourceType"] == "AWS::CloudFormation::Stack" for r in resources):
            raise RuntimeError("Nested stack cleanup is unsupported")
        value = template(LEGACY, "app")
        value["Resources"]["SiteDistribution"]["Properties"]["DistributionConfig"]["Enabled"] = False
        apply_template(LEGACY, "app", value, LEGACY["cloudformation_role"])
        for resource in resources:
            if resource.get("ResourceStatus") in ("DELETE_COMPLETE", "DELETE_SKIPPED"):
                continue
            identity = resource.get("PhysicalResourceId")
            if not identity:
                continue
            if resource["ResourceType"] == "AWS::S3::Bucket":
                actions.empty_bucket(identity)
            elif resource["ResourceType"] == "AWS::ECR::Repository":
                actions.empty_repository(identity)
        actions.aws("cloudformation", "delete-stack", "--stack-name", LEGACY["app_stack"],
                    "--role-arn", role_arn(LEGACY["cloudformation_role"]))
        actions.aws("cloudformation", "wait", "stack-delete-complete", "--stack-name", LEGACY["app_stack"], json_output=False)
        if certificate:
            actions.aws("acm", "delete-certificate", "--certificate-arn", certificate)
        # Certificate-validation records are shared with the new certificate: retain them.
        actions.empty_bucket(LEGACY["artifacts_bucket"])
    finally:
        actions.CONFIG = original
    print("Legacy app retired. Israel: delete the legacy bootstrap in CloudFormation, then its retained role and OACs using the inventory artifact. Do not delete DNS or the shared OIDC provider.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("phase", choices=["inventory", "prepare", "create-bootstrap", "cutover", "rollback", "cleanup"])
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()
    original = actions.CONFIG
    actions.CONFIG = LEGACY
    try:
        actions.check_context("teardown" if args.phase == "cleanup" else "bootstrap")
    finally:
        actions.CONFIG = original
    if args.phase == "cleanup":
        cleanup(args.confirm)
    elif args.phase in ("cutover", "rollback"):
        cutover(args.phase == "rollback")
    else:
        {"inventory": inventory, "prepare": prepare, "create-bootstrap": create_bootstrap}[args.phase]()


if __name__ == "__main__":
    main()
