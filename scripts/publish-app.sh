#!/usr/bin/env bash
set -euo pipefail

stack_name="codelinc-hackathon-app"
assets_bucket="$(aws cloudformation describe-stacks --stack-name "$stack_name" --query "Stacks[0].Outputs[?OutputKey=='AssetsBucketName'].OutputValue | [0]" --output text)"
distribution_id="$(aws cloudformation describe-stacks --stack-name "$stack_name" --query "Stacks[0].Outputs[?OutputKey=='SiteDistributionId'].OutputValue | [0]" --output text)"
distribution_domain="$(aws cloudformation describe-stacks --stack-name "$stack_name" --query "Stacks[0].Outputs[?OutputKey=='SiteDistributionDomainName'].OutputValue | [0]" --output text)"

test -d build/site
test "$assets_bucket" != "None"
test "$distribution_id" != "None"
test "$distribution_domain" != "None"

aws s3 sync build/site/ "s3://${assets_bucket}/" --delete --cache-control "public,max-age=300"
aws s3 cp build/site/index.html "s3://${assets_bucket}/index.html" --cache-control "public,max-age=60,must-revalidate"
aws cloudfront create-invalidation --distribution-id "$distribution_id" --paths '/*'

PYTHONPATH=scripts python3 - "$distribution_domain" <<'PY'
import sys
from cloudflare_dns import SITE_NAME, ensure_cname
ensure_cname(SITE_NAME, sys.argv[1])
PY
