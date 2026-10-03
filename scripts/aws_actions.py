#!/usr/bin/env python3
"""AWS mutations for the protected Actions jobs. Local agents use read-only CLI."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

from validate_repo import CONFIG, ROOT, validate_app


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


def deploy():
    validate_app(json.loads((ROOT / "infra/app.json").read_text()))
    revision = os.environ["GITHUB_SHA"]
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
    revision = os.environ["GITHUB_RUN_NUMBER"]
    assert revision.isdecimal() and len(revision) <= 12, "Unexpected GitHub Actions run number"
    aws("cloudformation", "deploy", "--template-file", str(ROOT / "infra/bootstrap.json"),
        "--stack-name", CONFIG["bootstrap_stack"], "--role-arn",
        f"arn:aws:iam::{CONFIG['account_id']}:role/{CONFIG['bootstrap_cloudformation_role']}",
        "--capabilities", "CAPABILITY_NAMED_IAM", "--parameter-overrides", f"BootstrapRevision={revision}",
        "--no-fail-on-empty-changeset", json_output=False)
    result = aws("cloudformation", "describe-stacks", "--stack-name", CONFIG["bootstrap_stack"])
    print(json.dumps(result["Stacks"][0].get("Outputs", []), indent=2))


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
    if stack:
        aws("cloudformation", "delete-stack", "--stack-name", CONFIG["app_stack"],
            "--role-arn", f"arn:aws:iam::{CONFIG['account_id']}:role/{CONFIG['cloudformation_role']}")
        aws("cloudformation", "wait", "stack-delete-complete", "--stack-name", CONFIG["app_stack"])
    empty_bucket(CONFIG["artifacts_bucket"])
    message = ("Workload deleted and artifacts emptied. Israel: delete codelinq-hackathon-bootstrap "
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
