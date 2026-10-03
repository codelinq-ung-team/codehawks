#!/usr/bin/env python3
"""Offline ownership checks, in addition to cfn-lint's AWS schema checks."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "infra/config.json").read_text())
NAMES = {
    "AWS::S3::Bucket": "BucketName",
    "AWS::IAM::Role": "RoleName",
    "AWS::Lambda::Function": "FunctionName",
    "AWS::DynamoDB::Table": "TableName",
    "AWS::SQS::Queue": "QueueName",
    "AWS::ECR::Repository": "RepositoryName",
    "AWS::SSM::Parameter": "Name",
    "AWS::SecretsManager::Secret": "Name",
    "AWS::Logs::LogGroup": "LogGroupName",
}


def validate_app(template):
    assert template["Parameters"]["SiteCertificateArn"]["AllowedPattern"] == "^arn:aws:acm:us-east-1:394270749442:certificate/[0-9a-f-]+$"
    assert template["Parameters"]["CloudFrontOriginAccessControlId"]["AllowedPattern"] == "^[A-Z0-9]+$"
    distributions = [r for r in template["Resources"].values() if r["Type"] == "AWS::CloudFront::Distribution"]
    assert len(distributions) == 1, "The site stack must own exactly one CloudFront distribution"
    assert distributions[0]["Properties"]["DistributionConfig"]["Aliases"] == [CONFIG["site_domain"]]
    assert distributions[0]["Properties"]["DistributionConfig"]["ViewerCertificate"]["AcmCertificateArn"] == {"Ref": "SiteCertificateArn"}
    assert distributions[0]["Properties"]["Tags"]
    assert {tag["Key"]: tag["Value"] for tag in distributions[0]["Properties"]["Tags"]}.get("Project") == CONFIG["prefix"]
    for logical_id, resource in template["Resources"].items():
        properties = resource.get("Properties", {})
        retained = logical_id == "BootstrapCloudFormationRole" and resource.get("DeletionPolicy") == "Retain" and resource.get("UpdateReplacePolicy") == "Retain"
        assert resource.get("DeletionPolicy", "Delete") != "Retain" or retained, f"{logical_id}: retained resources need a deletion and replacement cleanup design"
        assert resource.get("UpdateReplacePolicy", "Delete") != "Retain" or retained, f"{logical_id}: replacement retention needs a cleanup design"
        assert not properties.get("DeletionProtectionEnabled", False), f"{logical_id}: disable deletion protection for the hackathon"
        assert resource["Type"] != "AWS::CloudFormation::Stack", "Nested stacks need deployment permissions and recursive teardown support first"
        name_key = NAMES.get(resource["Type"])
        if name_key:
            value = properties.get(name_key, "")
            if isinstance(value, dict):
                value = value.get("Fn::Sub", "")
            assert isinstance(value, str), f"{logical_id}: use a literal name or Fn::Sub"
            prefix = "codelinq-hackathon-app-"
            if resource["Type"] == "AWS::SSM::Parameter":
                prefix = "/codelinq-hackathon/app/"
            if resource["Type"] == "AWS::Logs::LogGroup":
                assert value.startswith(("/aws/lambda/codelinq-hackathon-app-", "/codelinq-hackathon/app/")), f"{logical_id}: log group is outside the hackathon"
            else:
                assert value.startswith(prefix), f"{logical_id}: {name_key} must start with {prefix}"
        if resource["Type"] == "AWS::IAM::Role":
            assert properties.get("PermissionsBoundary") == {"Ref": "RuntimePermissionsBoundaryArn"}, f"{logical_id}: runtime boundary required"
        if resource["Type"] == "AWS::S3::Bucket":
            tags = {item["Key"]: item["Value"] for item in properties.get("Tags", [])}
            assert tags.get("Project") == CONFIG["prefix"], f"{logical_id}: Project tag required by cleanup"


def main():
    assert CONFIG["account_id"] == "394270749442"
    assert CONFIG["repository"] == "codelinq-ung-team/codehawks"
    assert CONFIG["repository_owner_id"] == "337436199"
    assert CONFIG["repository_id"] == "1403496059"
    assert CONFIG["app_stack"] == "codelinq-hackathon-app"
    assert CONFIG["bootstrap_stack"] == "codelinq-hackathon-bootstrap"
    assert CONFIG["site_domain"] == "codelinq.codehawks.org"
    assert CONFIG["cloudflare_zone"] == "codehawks.org"
    app = json.loads((ROOT / "infra/app.json").read_text())
    validate_app(app)
    bootstrap = json.loads((ROOT / "infra/bootstrap.json").read_text())
    assert not any(r["Type"] == "AWS::IAM::OIDCProvider" for r in bootstrap["Resources"].values()), "The shared OIDC provider must remain outside this stack"
    assert bootstrap["Resources"]["CloudFrontOriginAccessControl"]["Type"] == "AWS::CloudFront::OriginAccessControl"
    assert bootstrap["Outputs"]["CloudFrontOriginAccessControlId"]["Value"] == {"Fn::GetAtt": ["CloudFrontOriginAccessControl", "Id"]}
    assert bootstrap["Resources"]["CloudFrontOriginAccessControl"]["DeletionPolicy"] == "Retain"
    trust_subjects = [("DeployRole", "hackathon"), ("TeardownRole", "hackathon-teardown"), ("BootstrapRole", "hackathon-admin")]
    for role, environment in trust_subjects:
        trust = bootstrap["Resources"][role]["Properties"]["AssumeRolePolicyDocument"]["Statement"][0]
        claims = trust["Condition"]["StringEquals"]
        assert claims["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
        expected = f"repo:${{GitHubOrganization}}@${{GitHubOrganizationId}}/${{GitHubRepositoryName}}@${{GitHubRepositoryId}}:environment:{environment}"
        assert claims["token.actions.githubusercontent.com:sub"] == {"Fn::Sub": expected}
    print("Repository ownership and teardown checks passed.")


if __name__ == "__main__":
    main()
