#!/usr/bin/env python3
"""AWS mutations for the protected Actions jobs. Local agents use read-only CLI."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

from cloudflare_dns import delete_acm_validation, delete_owned_cname, ensure_acm_validation
from validate_repo import CONFIG, ROOT, validate_app
from bedrock_config import from_environment, validate_model_settings


def aws(*args, json_output=True):
    command = ["aws", *args, "--region", CONFIG["region"], "--no-cli-pager"]
    if json_output:
        command += ["--output", "json"]
    result = subprocess.run(command, check=True, text=True, capture_output=json_output)
    return json.loads(result.stdout or "{}") if json_output else None


def check_context(mode):
    assert os.environ.get("GITHUB_ACTIONS") == "true", "Run writes through GitHub Actions. Israel owns AWS account access."
    assert os.environ.get("GITHUB_REPOSITORY") == CONFIG["repository"], "Wrong repository"
    assert os.environ.get("GITHUB_REF") == "refs/heads/main", "Only main may deploy or tear down"
    identity = aws("sts", "get-caller-identity")
    assert identity["Account"] == CONFIG["account_id"], "Wrong AWS account"
    role = {
        "deploy": CONFIG["deploy_role"],
        "teardown": CONFIG["teardown_role"],
        "bootstrap": "codelinq-hackathon-github-bootstrap",
    }[mode]
    assert identity["Arn"].startswith(f"arn:aws:sts::{CONFIG['account_id']}:assumed-role/{role}/"), "Unexpected AWS role"
    return identity


def describe_app():
    # Preserve real failures (AccessDenied, networking, throttling). Only an exact
    # CloudFormation 'does not exist' error is equivalent to an absent stack.
    try:
        return aws("cloudformation", "describe-stacks", "--stack-name", CONFIG["app_stack"])["Stacks"][0]
    except subprocess.CalledProcessError as error:
        if "ValidationError" in error.stderr and "does not exist" in error.stderr:
            return None
        raise


def hackathon_certificate():
    """Find only the tagged public certificate for this exact subdomain."""
    certificates = aws("acm", "list-certificates").get("CertificateSummaryList", [])
    matches = []
    for item in certificates:
        if item.get("DomainName") != CONFIG["site_domain"]:
            continue
        tags = aws("acm", "list-tags-for-certificate", "--certificate-arn", item["CertificateArn"]).get("Tags", [])
        values = {tag["Key"]: tag["Value"] for tag in tags}
        if values.get("Project") == CONFIG["prefix"] and values.get("Lifecycle") == "ephemeral":
            matches.append(item["CertificateArn"])
    if len(matches) > 1:
        raise RuntimeError("Multiple hackathon ACM certificates exist for the site domain; resolve manually")
    return matches[0] if matches else None


def ensure_site_certificate():
    """Request, DNS-validate, and wait for the single hackathon site certificate."""
    certificate = hackathon_certificate()
    if certificate is None:
        certificate_tags = [
            {"Key": "Project", "Value": CONFIG["prefix"]},
            {"Key": "Owner", "Value": "Israel Jauregui"},
            {"Key": "Lifecycle", "Value": "ephemeral"},
            {"Key": "ManagedBy", "Value": "GitHubActions"},
        ]
        result = aws(
            "acm", "request-certificate", "--domain-name", CONFIG["site_domain"],
            "--validation-method", "DNS", "--idempotency-token", "codelinqhackathon",
            "--tags", json.dumps(certificate_tags),
        )
        certificate = result["CertificateArn"]

    deadline = time.monotonic() + 1500
    while time.monotonic() < deadline:
        details = aws("acm", "describe-certificate", "--certificate-arn", certificate)["Certificate"]
        status = details["Status"]
        if status == "ISSUED":
            return certificate
        if status in ("FAILED", "REVOKED", "EXPIRED"):
            raise RuntimeError(f"Hackathon ACM certificate entered terminal status {status}: {details.get('FailureReason', '')}")
        options = details.get("DomainValidationOptions", [])
        for option in options:
            record = option.get("ResourceRecord")
            if record:
                ensure_acm_validation(record)
        time.sleep(15)
    raise TimeoutError("ACM certificate did not validate within 25 minutes; check Cloudflare DNS and rerun deploy")


def bootstrap_settings(model, arns):
    stacks = aws("cloudformation", "describe-stacks", "--stack-name", CONFIG["bootstrap_stack"])["Stacks"]
    outputs = {item["OutputKey"]: item["OutputValue"] for item in stacks[0].get("Outputs", [])}
    parameters = {item["ParameterKey"]: item["ParameterValue"] for item in stacks[0].get("Parameters", [])}
    configured = validate_model_settings(parameters.get("BedrockModelId", ""),
                                        parameters.get("BedrockModelArns", "").split(","))
    if configured != (model, arns):
        raise ValueError("Bedrock settings differ from the deployed runtime boundary; update bootstrap first.")
    oac = outputs.get("CloudFrontOriginAccessControlId")
    chat_oac = outputs.get("ChatOriginAccessControlId")
    if not oac or not chat_oac:
        raise RuntimeError("Bootstrap stack needs both site and chat OACs; run the bootstrap update first.")
    return oac, chat_oac


def deploy():
    validate_app(json.loads((ROOT / "infra/app.json").read_text()))
    model, arns = from_environment()
    oac, chat_oac = bootstrap_settings(model, arns)
    if not (ROOT / "build/backend.zip").is_file():
        raise ValueError("Build the backend artifact before deploying.")
    certificate = ensure_site_certificate()
    revision = os.environ["GITHUB_SHA"]
    # Abe's voice. Without the Actions secret the stack keeps the key it already has ("unset" at first).
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    voice = [f"OpenAiApiKey={key}"] if key else []
    with tempfile.TemporaryDirectory() as directory:
        packaged = Path(directory) / "packaged.json"
        aws("cloudformation", "package", "--template-file", str(ROOT / "infra/app.json"),
            "--s3-bucket", CONFIG["artifacts_bucket"], "--s3-prefix", f"builds/{revision}",
            "--output-template-file", str(packaged), "--use-json", json_output=False)
        aws("cloudformation", "deploy", "--template-file", str(packaged),
            "--s3-bucket", CONFIG["artifacts_bucket"], "--s3-prefix", f"templates/{revision}",
            "--stack-name", CONFIG["app_stack"], "--role-arn",
            f"arn:aws:iam::{CONFIG['account_id']}:role/{CONFIG['cloudformation_role']}",
            "--capabilities", "CAPABILITY_NAMED_IAM", "--parameter-overrides",
            f"RuntimePermissionsBoundaryArn={CONFIG['runtime_boundary']}",
            f"SiteCertificateArn={certificate}", f"CloudFrontOriginAccessControlId={oac}",
            f"ChatOriginAccessControlId={chat_oac}", f"BedrockModelId={model}", f"BedrockModelArns={','.join(arns)}", *voice,
            "--tags", f"Project={CONFIG['prefix']}", "Owner=Israel Jauregui", "Lifecycle=ephemeral", "ManagedBy=CloudFormation",
            "--no-fail-on-empty-changeset", json_output=False)
    stack = describe_app()
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    text = json.dumps(stack.get("Outputs", []), indent=2)
    print(text)
    if summary:
        with open(summary, "a") as handle:
            handle.write(f"### Hackathon deployment\n\nAccount `{CONFIG['account_id']}`, stack `{CONFIG['app_stack']}`.\n\n```json\n{text}\n```\n")


def update_bootstrap():
    model, arns = from_environment()
    revision = os.environ["GITHUB_RUN_NUMBER"]
    assert revision.isdecimal() and len(revision) <= 12, "Unexpected GitHub Actions run number"
    template = ROOT / "infra/bootstrap.json"
    assert template.stat().st_size <= 51200, "Bootstrap template exceeds CloudFormation's inline template limit"
    change_set = f"codelinq-hackathon-bootstrap-{revision}"
    parameters = bootstrap_parameters(json.loads(template.read_text()), revision, model, arns)
    aws("cloudformation", "create-change-set", "--stack-name", CONFIG["bootstrap_stack"],
        "--change-set-name", change_set, "--change-set-type", "UPDATE",
        "--template-body", f"file://{template}", "--capabilities", "CAPABILITY_NAMED_IAM",
        "--parameters", json.dumps(parameters),
        "--role-arn", f"arn:aws:iam::{CONFIG['account_id']}:role/{CONFIG['bootstrap_cloudformation_role']}",
        "--description", "Update isolated codelinq hackathon bootstrap")

    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        details = aws("cloudformation", "describe-change-set", "--stack-name", CONFIG["bootstrap_stack"],
                      "--change-set-name", change_set)
        if details["Status"] == "CREATE_COMPLETE":
            break
        if details["Status"] == "FAILED":
            raise RuntimeError(f"Bootstrap change set failed: {details.get('StatusReason', 'unknown reason')}")
        time.sleep(5)
    else:
        raise TimeoutError("Bootstrap change set did not finish within 10 minutes")

    aws("cloudformation", "execute-change-set", "--stack-name", CONFIG["bootstrap_stack"],
        "--change-set-name", change_set, json_output=False)
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        status = aws("cloudformation", "describe-stacks", "--stack-name", CONFIG["bootstrap_stack"])["Stacks"][0]["StackStatus"]
        if status in ("UPDATE_COMPLETE", "IMPORT_COMPLETE"):
            break
        if status.startswith(("UPDATE_ROLLBACK_", "IMPORT_ROLLBACK_")):
            raise RuntimeError(f"Bootstrap stack update ended in {status}")
        time.sleep(10)
    else:
        raise TimeoutError("Bootstrap stack update did not complete within 30 minutes")
    result = aws("cloudformation", "describe-stacks", "--stack-name", CONFIG["bootstrap_stack"])
    print(json.dumps(result["Stacks"][0].get("Outputs", []), indent=2))


def bootstrap_parameters(template, revision, model, arns):
    """Preserve existing account/trust settings while explicitly updating model access."""
    updates = {"BootstrapRevision": revision, "BedrockModelId": model, "BedrockModelArns": ",".join(arns)}
    return [{"ParameterKey": name, "ParameterValue": updates[name]} if name in updates
            else {"ParameterKey": name, "UsePreviousValue": True}
            for name in template["Parameters"]]


def owned_resources(stack):
    if stack is None:
        return []
    assert {t["Key"]: t["Value"] for t in stack.get("Tags", [])}.get("Project") == CONFIG["prefix"], "Stack ownership tag mismatch"
    # AWS CLI paginates this list automatically.
    return aws("cloudformation", "list-stack-resources", "--stack-name", CONFIG["app_stack"])["StackResourceSummaries"]


def empty_bucket(bucket):
    assert bucket == CONFIG["artifacts_bucket"] or bucket.startswith("codelinq-hackathon-app-"), "Refusing an unrelated bucket"
    tags = aws("s3api", "get-bucket-tagging", "--bucket", bucket)["TagSet"]
    assert {t["Key"]: t["Value"] for t in tags}.get("Project") == CONFIG["prefix"], "Bucket ownership tag mismatch"
    while True:
        # Re-read the first page after deleting; this also handles null versions
        # and delete markers, without skipping objects as pagination shifts.
        page = aws("s3api", "list-object-versions", "--bucket", bucket, "--max-keys", "1000", "--no-paginate")
        objects = [{"Key": item["Key"], "VersionId": item["VersionId"]}
                   for kind in ("Versions", "DeleteMarkers") for item in page.get(kind, [])]
        if not objects:
            break
        result = aws("s3api", "delete-objects", "--bucket", bucket, "--delete", json.dumps({"Objects": objects, "Quiet": True}))
        assert not result.get("Errors"), f"S3 cleanup errors: {result['Errors']}"
    print(f"Emptied {bucket}")


def empty_repository(repository):
    assert repository.startswith("codelinq-hackathon-app-"), "Refusing an unrelated ECR repository"
    while True:
        page = aws("ecr", "list-images", "--repository-name", repository, "--max-results", "100", "--no-paginate")
        images = page.get("imageIds", [])
        if not images:
            break
        result = aws("ecr", "batch-delete-image", "--repository-name", repository, "--image-ids", json.dumps(images))
        assert not result.get("failures"), f"ECR cleanup errors: {result['failures']}"


def teardown(confirmation):
    assert confirmation == f"DELETE {CONFIG['prefix']} {CONFIG['account_id']}", "Confirmation does not match this hackathon and account"
    stack = describe_app()
    resources = owned_resources(stack)
    assert not any(r["ResourceType"] == "AWS::CloudFormation::Stack" for r in resources), "Nested stack cleanup must be implemented first"
    print("Stack-owned cleanup inventory:", json.dumps(resources, indent=2))
    certificate = hackathon_certificate()
    if stack:
        outputs = {item["OutputKey"]: item["OutputValue"] for item in stack.get("Outputs", [])}
        distribution_domain = outputs.get("SiteDistributionDomainName")
        if distribution_domain:
            delete_owned_cname(CONFIG["site_domain"], distribution_domain)
    if certificate:
        details = aws("acm", "describe-certificate", "--certificate-arn", certificate)["Certificate"]
        for option in details.get("DomainValidationOptions", []):
            record = option.get("ResourceRecord")
            if record:
                delete_acm_validation(record)
    for resource in resources:
        if resource["ResourceStatus"] in ("DELETE_COMPLETE", "DELETE_SKIPPED"):
            continue
        physical_id = resource.get("PhysicalResourceId")
        if not physical_id:
            continue
        if resource["ResourceType"] == "AWS::S3::Bucket":
            empty_bucket(physical_id)
        elif resource["ResourceType"] == "AWS::ECR::Repository":
            empty_repository(physical_id)
        elif resource["ResourceType"] == "AWS::CloudFront::Distribution":
            distribution = aws("cloudfront", "get-distribution-config", "--id", physical_id)
            config = distribution["DistributionConfig"]
            if config.get("Enabled"):
                config["Enabled"] = False
                aws("cloudfront", "update-distribution", "--id", physical_id,
                    "--if-match", distribution["ETag"], "--distribution-config", json.dumps(config))
                aws("cloudfront", "wait", "distribution-deployed", "--id", physical_id, json_output=False)
    if stack:
        aws("cloudformation", "delete-stack", "--stack-name", CONFIG["app_stack"],
            "--role-arn", f"arn:aws:iam::{CONFIG['account_id']}:role/{CONFIG['cloudformation_role']}")
        aws("cloudformation", "wait", "stack-delete-complete", "--stack-name", CONFIG["app_stack"])
    if certificate:
        aws("acm", "delete-certificate", "--certificate-arn", certificate, json_output=False)
    empty_bucket(CONFIG["artifacts_bucket"])
    message = ("Workload, CloudFront distribution, certificate and DNS record deleted; artifacts emptied. Israel: delete codelinq-hackathon-bootstrap "
               "in the us-east-1 CloudFormation console to remove the artifact bucket and IAM access. "
               "The shared GitHub OIDC provider and Codehawks production resources remain outside this stack.")
    print(message)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as handle:
            handle.write(f"### Teardown\n\n{message}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["deploy", "teardown", "verify-deploy", "update-bootstrap"])
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()
    check_context({"teardown": "teardown", "update-bootstrap": "bootstrap"}.get(args.operation, "deploy"))
    if args.operation == "deploy":
        deploy()
    elif args.operation == "teardown":
        teardown(args.confirm)
    elif args.operation == "update-bootstrap":
        update_bootstrap()
    else:
        print("GitHub OIDC, repository, branch, account and deployment role verified. No resources changed.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        print(error.stderr or str(error))
        raise SystemExit(error.returncode)
