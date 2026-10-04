#!/usr/bin/env python3
"""Offline ownership checks, in addition to cfn-lint's AWS schema checks."""
import json
from pathlib import Path
from bedrock_config import ADAPTER_LAYER, ARN_PATTERN, BEDROCK_ACTIONS, MODEL_PATTERN

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
    "AWS::CloudFront::Function": "Name",
}


def validate_app(template):
    assert template["Parameters"]["SiteCertificateArn"]["AllowedPattern"] == "^arn:aws:acm:us-east-1:394270749442:certificate/[0-9a-f-]+$"
    assert template["Parameters"]["CloudFrontOriginAccessControlId"]["AllowedPattern"] == "^[A-Z0-9]+$"
    distributions = [r for r in template["Resources"].values() if r["Type"] == "AWS::CloudFront::Distribution"]
    assert len(distributions) == 1, "The site stack must own exactly one CloudFront distribution"
    assert distributions[0]["Properties"]["DistributionConfig"]["Aliases"] == [
        CONFIG["site_domain"],
        {"Fn::If": ["LegacyAliasEnabled", CONFIG["legacy_domain"], {"Ref": "AWS::NoValue"}]},
    ]
    assert template["Parameters"]["LegacyAliasEnabled"] == {
        "Type": "String", "Default": "false", "AllowedValues": ["false", "true"],
        "Description": "Enable only after the legacy distribution releases its alias.",
    }
    assert template["Conditions"]["LegacyAliasEnabled"] == {"Fn::Equals": [{"Ref": "LegacyAliasEnabled"}, "true"]}
    redirect = template["Resources"]["LegacyRedirectFunction"]["Properties"]
    assert redirect["FunctionCode"] == (ROOT / "infra/legacy-redirect.js").read_text().rstrip("\n")
    assert redirect["AutoPublish"] is True
    assert redirect["FunctionConfig"]["Runtime"] == "cloudfront-js-2.0"
    assert distributions[0]["Properties"]["DistributionConfig"]["DefaultCacheBehavior"]["FunctionAssociations"] == [
        {"EventType": "viewer-request", "FunctionARN": {"Fn::GetAtt": ["LegacyRedirectFunction", "FunctionARN"]}}
    ]
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
            prefix = "codelinc-hackathon-app-"
            if resource["Type"] == "AWS::SSM::Parameter":
                prefix = "/codelinc-hackathon/app/"
            if resource["Type"] == "AWS::Logs::LogGroup":
                assert value.startswith(("/aws/lambda/codelinc-hackathon-app-", "/codelinc-hackathon/app/")), f"{logical_id}: log group is outside the hackathon"
            else:
                assert value.startswith(prefix), f"{logical_id}: {name_key} must start with {prefix}"
        if resource["Type"] == "AWS::IAM::Role":
            assert properties.get("PermissionsBoundary") == {"Ref": "RuntimePermissionsBoundaryArn"}, f"{logical_id}: runtime boundary required"
        if resource["Type"] == "AWS::S3::Bucket":
            tags = {item["Key"]: item["Value"] for item in properties.get("Tags", [])}
            assert tags.get("Project") == CONFIG["prefix"], f"{logical_id}: Project tag required by cleanup"
    validate_chat(template)


def validate_model_parameters(template):
    parameters = template["Parameters"]
    assert parameters["BedrockModelId"]["AllowedPattern"] == MODEL_PATTERN, "Validate model IDs without wildcards"
    assert parameters["BedrockModelArns"]["Type"] == "CommaDelimitedList"
    assert parameters["BedrockModelArns"]["AllowedPattern"] == ARN_PATTERN, "Model ARN allowlist must be account-scoped and wildcard-free"
    assert "Default" not in parameters["BedrockModelId"], "Require an explicitly authorized model"
    assert "Default" not in parameters["BedrockModelArns"], "Require explicitly authorized model ARNs"


def validate_bedrock_statements(statements):
    found = []
    for statement in statements:
        actions = statement.get("Action", [])
        actions = [actions] if isinstance(actions, str) else actions
        assert "*" not in actions, "Do not grant all AWS actions to an app runtime"
        if any(action.startswith("bedrock:") for action in actions):
            assert statement["Effect"] == "Allow"
            assert sorted(actions) == sorted(BEDROCK_ACTIONS), "Only the two Bedrock inference actions are allowed"
            assert statement["Resource"] == {"Ref": "BedrockModelArns"}, "Use the exact model ARN allowlist"
            found.append(statement)
    return found


def validate_chat(template):
    validate_model_parameters(template)
    resources = template["Resources"]
    function = resources["ChatFunction"]["Properties"]
    assert function["Role"] == {"Fn::GetAtt": ["ChatRole", "Arn"]}
    assert function["Runtime"] == "python3.12" and function["Architectures"] == ["x86_64"]
    assert function["Layers"] == [ADAPTER_LAYER], "Only the pinned streaming adapter layer is allowed"
    assert "ReservedConcurrentExecutions" not in function, "Use shared admission control without reserving account concurrency"
    assert function["Timeout"] == 120 and function["MemorySize"] == 512
    assert function["Handler"] == "run.sh" and function["Code"] == "../build/backend.zip"
    variables = function["Environment"]["Variables"]
    assert variables["MODEL_ID"] == {"Ref": "BedrockModelId"}
    assert variables["CHAT_RATE_LIMIT_TABLE"] == {"Ref": "ChatRateLimitTable"}
    assert variables["PAIRING_TABLE"] == {"Ref": "PairingTable"}
    assert variables["AWS_LAMBDA_EXEC_WRAPPER"] == "/opt/bootstrap"
    assert variables["AWS_LWA_INVOKE_MODE"] == "response_stream"
    assert variables["AWS_LWA_READINESS_CHECK_PATH"] == "/health"
    # The voice key is a Secrets Manager secret the function reads when it needs it; only its ARN is in the environment.
    assert variables["OPENAI_API_KEY_SECRET"] == {"Ref": "VoiceApiKeySecret"}
    secret = resources["VoiceApiKeySecret"]
    assert secret["Type"] == "AWS::SecretsManager::Secret"
    assert secret["Properties"]["Name"] == "codelinc-hackathon-app-openai-api-key"
    assert secret["Properties"]["SecretString"] == {"Ref": "OpenAiApiKey"}
    key = template["Parameters"]["OpenAiApiKey"]
    assert key["NoEcho"] is True and key["Default"] == "unset", "The key is hidden, and voice is off until it is supplied"
    assert set(variables) == {"MODEL_ID", "CHAT_RATE_LIMIT_TABLE", "PAIRING_TABLE", "OPENAI_API_KEY_SECRET", "PORT", "AWS_LAMBDA_EXEC_WRAPPER", "AWS_LWA_PORT",
                              "AWS_LWA_READINESS_CHECK_PATH", "AWS_LWA_READINESS_CHECK_HEALTHY_STATUS",
                              "AWS_LWA_INVOKE_MODE", "AWS_LWA_ENABLE_COMPRESSION"}, "No API keys or AWS credentials in the runtime environment"
    url = resources["ChatFunctionUrl"]["Properties"]
    assert url["AuthType"] == "AWS_IAM" and url["InvokeMode"] == "RESPONSE_STREAM"
    assert url["TargetFunctionArn"] == {"Fn::GetAtt": ["ChatFunction", "Arn"]}
    source = {"Fn::Sub": "arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${SiteDistribution}"}
    for name, action in (("ChatUrlPermission", "lambda:InvokeFunctionUrl"), ("ChatInvokePermission", "lambda:InvokeFunction")):
        permission = resources[name]["Properties"]
        assert permission["FunctionName"] == {"Ref": "ChatFunction"}
        assert permission["Action"] == action and permission["Principal"] == "cloudfront.amazonaws.com"
        assert permission["SourceArn"] == source, "Only this distribution may invoke chat"
    assert resources["ChatUrlPermission"]["Properties"]["FunctionUrlAuthType"] == "AWS_IAM"
    assert resources["ChatInvokePermission"]["Properties"]["InvokedViaFunctionUrl"] is True
    assert resources["ChatLogGroup"]["Properties"]["RetentionInDays"] == 7
    table = resources["ChatRateLimitTable"]
    assert table["Type"] == "AWS::DynamoDB::Table"
    assert table["Properties"]["TableName"] == "codelinc-hackathon-app-chat-rate-limit"
    assert table["Properties"]["BillingMode"] == "PAY_PER_REQUEST"
    assert table["Properties"]["SSESpecification"] == {"SSEEnabled": True}
    assert table["Properties"]["AttributeDefinitions"] == [{"AttributeName": "id", "AttributeType": "S"}]
    assert table["Properties"]["KeySchema"] == [{"AttributeName": "id", "KeyType": "HASH"}]
    # A browser and a headset share answers through this table for up to two hours; expired items are removed.
    pairing = resources["PairingTable"]
    assert pairing["Type"] == "AWS::DynamoDB::Table"
    assert pairing["Properties"]["TableName"] == "codelinc-hackathon-app-pairing"
    assert pairing["Properties"]["BillingMode"] == "PAY_PER_REQUEST"
    assert pairing["Properties"]["SSESpecification"] == {"SSEEnabled": True}
    assert pairing["Properties"]["TimeToLiveSpecification"] == {"AttributeName": "expires", "Enabled": True}
    assert pairing["Properties"]["AttributeDefinitions"] == [{"AttributeName": "id", "AttributeType": "S"}]
    assert pairing["Properties"]["KeySchema"] == [{"AttributeName": "id", "KeyType": "HASH"}]
    for name in ("ChatFunction", "ChatRole", "ChatLogGroup", "ChatRateLimitTable", "PairingTable", "VoiceApiKeySecret"):
        tags = {tag["Key"]: tag["Value"] for tag in resources[name]["Properties"]["Tags"]}
        assert tags == {"Project": CONFIG["prefix"], "Owner": "Israel Jauregui",
                        "Lifecycle": "ephemeral", "ManagedBy": "CloudFormation"}
    policies = resources["ChatRole"]["Properties"]["Policies"]
    statements = [s for policy in policies for s in policy["PolicyDocument"]["Statement"]]
    assert len(validate_bedrock_statements(statements)) == 1
    assert len(statements) == 5, "Chat needs only scoped inference, admission control, pairing, logging, and its one secret"
    reading = [s for s in statements if s["Action"] == "secretsmanager:GetSecretValue"]
    assert reading == [{"Effect": "Allow", "Action": "secretsmanager:GetSecretValue",
                        "Resource": {"Ref": "VoiceApiKeySecret"}}], "Chat may read only the voice key"
    limiter = [s for s in statements if s["Action"] == ["dynamodb:GetItem", "dynamodb:PutItem"]]
    assert limiter == [{"Effect": "Allow", "Action": ["dynamodb:GetItem", "dynamodb:PutItem"],
                        "Resource": {"Fn::GetAtt": ["ChatRateLimitTable", "Arn"]}}], "Admission control may access only its own table"
    sharing = [s for s in statements if "dynamodb:DeleteItem" in s["Action"]]
    assert sharing == [{"Effect": "Allow", "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"],
                        "Resource": {"Fn::GetAtt": ["PairingTable", "Arn"]}}], "Pairing may access only its own table"
    logging = [s for s in statements if s["Action"] == ["logs:CreateLogStream", "logs:PutLogEvents"]]
    assert logging == [{"Effect": "Allow", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
                        "Resource": {"Fn::Sub": "arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/codelinc-hackathon-app-chat:log-stream:*"}}], "Chat may write only its own log streams"
    assert not resources["ChatRole"]["Properties"].get("ManagedPolicyArns"), "Do not bypass the scoped inline runtime policy"
    for resource in resources.values():
        if resource["Type"] == "AWS::IAM::Role":
            for policy in resource["Properties"].get("Policies", []):
                validate_bedrock_statements(policy["PolicyDocument"]["Statement"])
    distribution = resources["SiteDistribution"]["Properties"]["DistributionConfig"]
    errors = distribution.get("CustomErrorResponses", [])
    assert {error["ErrorCode"] for error in errors} == {403, 404, 500, 502, 503, 504}
    assert all(error == {"ErrorCode": error["ErrorCode"], "ErrorCachingMinTTL": 0} for error in errors), "Do not cache or rewrite API errors into HTML"
    behavior = [b for b in distribution["CacheBehaviors"] if b["PathPattern"] == "/api/*"]
    assert len(behavior) == 1 and behavior[0]["TargetOriginId"] == "HackathonChat"
    assert behavior[0]["CachePolicyId"] == "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", "Disable API caching"
    assert behavior[0]["OriginRequestPolicyId"] == "b689b0a8-53d0-40ab-baf2-68738e2966ac", "Forward payload hash and Origin, exclude viewer Host"
    assert "POST" in behavior[0]["AllowedMethods"] and behavior[0]["Compress"] is False
    origin = [o for o in distribution["Origins"] if o["Id"] == "HackathonChat"]
    assert len(origin) == 1 and origin[0]["OriginAccessControlId"] == {"Ref": "ChatOriginAccessControlId"}
    assert origin[0]["CustomOriginConfig"]["OriginProtocolPolicy"] == "https-only"


def validate_chat_bootstrap(template):
    validate_model_parameters(template)
    resources = template["Resources"]
    statements = resources["RuntimeBoundary"]["Properties"]["PolicyDocument"]["Statement"]
    assert len(validate_bedrock_statements(statements)) == 1
    oac = resources["ChatOriginAccessControl"]
    assert oac["Type"] == "AWS::CloudFront::OriginAccessControl"
    assert oac["DeletionPolicy"] == oac["UpdateReplacePolicy"] == "Retain", "Israel removes the generated OAC after app teardown"
    assert oac["DependsOn"] == "BootstrapCloudFormationRole"
    config = oac["Properties"]["OriginAccessControlConfig"]
    assert config["Name"] == "codelinc-hackathon-app-chat-oac"
    assert config["OriginAccessControlOriginType"] == "lambda"
    assert config["SigningBehavior"] == "always" and config["SigningProtocol"] == "sigv4"
    assert template["Outputs"]["ChatOriginAccessControlId"]["Value"] == {"Fn::GetAtt": ["ChatOriginAccessControl", "Id"]}
    statements = resources["CloudFormationRole"]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]
    layer = [s for s in statements if s["Action"] == "lambda:GetLayerVersion"]
    assert len(layer) == 1 and layer[0]["Resource"] == ADAPTER_LAYER, "Layer reads must use the exact adapter ARN"


def main():
    assert CONFIG["account_id"] == "394270749442"
    assert CONFIG["repository"] == "codelinq-ung-team/codehawks"
    assert CONFIG["repository_owner_id"] == "337436199"
    assert CONFIG["repository_id"] == "1403496059"
    assert CONFIG["app_stack"] == "codelinc-hackathon-app"
    assert CONFIG["bootstrap_stack"] == "codelinc-hackathon-bootstrap"
    assert CONFIG["site_domain"] == "codelinc.codehawks.org"
    assert CONFIG["legacy_domain"] == "codelinq.codehawks.org"
    assert CONFIG["cloudflare_zone"] == "codehawks.org"
    app = json.loads((ROOT / "infra/app.json").read_text())
    validate_app(app)
    bootstrap = json.loads((ROOT / "infra/bootstrap.json").read_text())
    validate_chat_bootstrap(bootstrap)
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
