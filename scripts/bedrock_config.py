"""Validate nonsecret model settings before either protected AWS workflow."""
import json
import os
import re

ACCOUNT_ID = "394270749442"
REGION = "us-east-1"
MODEL_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$"
ARN_PATTERN = (
    r"^arn:aws:bedrock:[a-z]{2}-[a-z]+-[0-9]:"
    r"(:foundation-model/[A-Za-z0-9._:-]+|394270749442:"
    r"(inference-profile|application-inference-profile)/[A-Za-z0-9._:-]+)$"
)
BEDROCK_ACTIONS = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
ADAPTER_LAYER = "arn:aws:lambda:us-east-1:753240598075:layer:LambdaAdapterLayerX86:30"


def validate_model_settings(model_id, arns):
    if not isinstance(model_id, str) or not re.fullmatch(MODEL_PATTERN, model_id):
        raise ValueError("BEDROCK_MODEL_ID must be a model/profile ID or ARN without wildcards.")
    if (not isinstance(arns, list) or not 1 <= len(arns) <= 20
            or any(not isinstance(arn, str) or not re.fullmatch(ARN_PATTERN, arn) for arn in arns)):
        raise ValueError("BEDROCK_MODEL_ARNS must contain 1-20 exact Bedrock model/profile ARNs in the hackathon account.")
    if len(set(arns)) != len(arns):
        raise ValueError("BEDROCK_MODEL_ARNS must not contain duplicates.")
    roots = [arn for arn in arns if arn.split(":")[3] == REGION
             and (arn == model_id or arn.split("/", 1)[1] == model_id)]
    if len(roots) != 1:
        raise ValueError("The selected MODEL_ID must match exactly one us-east-1 model/profile ARN in BEDROCK_MODEL_ARNS.")
    root = roots[0]
    if ":foundation-model/" in root:
        if arns != [root]:
            raise ValueError("A direct regional model must have only its own ARN in the allowlist.")
    elif not any(":foundation-model/" in arn for arn in arns):
        raise ValueError("An inference profile also requires its destination foundation-model ARNs.")
    elif any(":foundation-model/" not in arn and arn != root for arn in arns):
        raise ValueError("Allow only the selected inference profile and its destination foundation models.")
    return model_id, sorted(arns)


def from_environment():
    try:
        arns = json.loads(os.environ.get("BEDROCK_MODEL_ARNS", ""))
    except (ValueError, TypeError):
        raise ValueError("Set BEDROCK_MODEL_ARNS to a JSON array in the protected GitHub environment.") from None
    return validate_model_settings(os.environ.get("BEDROCK_MODEL_ID", ""), arns)


if __name__ == "__main__":
    from_environment()
    print("Bedrock model settings validated; no credentials are required.")
