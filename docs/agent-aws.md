# AWS and deployment guide for agents

## Ownership and access

The hackathon shares the AWS account `394270749442` (`us-east-1`) with the existing Codehawks website. Its CloudFormation stacks include `BradsUnitedSite`, `BradsUnitedGitHubAccess`, `codehawks-bootstrap`, `codehawks-backend-bootstrap`, and `CDKToolkit`. **Leave those stacks, resources, domains, buckets, roles, state, and DNS alone.** The hackathon owns the independent `codelinq-hackathon-*` resources in [the checked-in configuration](../infra/config.json). `Lifecycle=ephemeral` records that these are temporary. Israel used local AWS CLI writes only for the initial bootstrap: creating its tagged roles and artifact bucket, matching trust to GitHub's ID-bound token, and attaching the restricted CloudFormation service role. After this one-time setup, keep local AWS CLI use read-only. The stack deliberately reuses the account's GitHub OIDC provider; that shared provider was created for other sites, is outside the hackathon stack, and must survive teardown. OIDC trust pins immutable GitHub owner ID `337436199` and repo ID `1403496059` along with each protected environment.

Israel Jauregui owns and administers the AWS account. Other agents and contributors use AWS through the repository's main-branch GitHub Actions workflows. Each job assumes its exact, short-lived OIDC role; the Actions environments restrict deployments to `main`, and the AWS role further restricts what each workflow can do. There are no long-lived AWS GitHub secrets. Pull-request validation does not get AWS credentials. The hackathon environments have no required-reviewer gates, so repository collaborators with write access can start the workflows without an approver.

Following Israel's one-time initial bootstrap, do not deploy, upload artifacts, create stacks, or delete resources with the local AWS CLI, an SDK, or a framework CLI. Local CLI use is for read-only investigation only. Useful examples:

```sh
aws sts get-caller-identity --profile israel-admin
aws cloudformation list-stacks --profile israel-admin --region us-east-1
aws cloudformation describe-stacks --profile israel-admin --region us-east-1 --stack-name codelinq-hackathon-app
aws cloudformation describe-stack-events --profile israel-admin --region us-east-1 --stack-name codelinq-hackathon-app
aws s3 ls --profile israel-admin
```

Never put credentials in the repo, console logs, pull requests, or workflow files. Do not set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `AWS_SESSION_TOKEN` in GitHub. The GitHub CLI commands in this guide configure GitHub, not AWS; use the authenticated repository owner account.

## Infrastructure and deployment

For deployments that include the Bedrock backend, follow the configuration and
Israel's explicit go-ahead requirement in [Bedrock backend deployment](#bedrock-backend-deployment)
before running the bootstrap and deployment workflows described below.

CloudFormation is the current IaC format. The current site uses a private S3 bucket behind CloudFront with a DNS-validated ACM certificate for `codelinq.codehawks.org`. Cloudflare publishes a DNS-only CNAME; the apex domain and existing Codehawks records are outside this repo. The bootstrap stack owns the CloudFront origin access control (OAC), while the app stack owns its distribution and private bucket policy. Add infrastructure to [`infra/app.json`](../infra/app.json); include `RuntimePermissionsBoundaryArn` as its `AllowedPattern` already does. The app can add Lambda, DynamoDB, SQS, and other resources already covered by the scoped service role. Keep framework builds in `scripts/build-app.sh` and static output in `app/public/`; the checked-in publish script syncs that directory, invalidates this distribution, and updates only the one CNAME. Keep workflow scripts safe to run from `main`; do not put secrets, credentials, or untrusted user input in shell commands. The Actions workflow packages and applies the template to the one named app stack with the dedicated CloudFormation service role and reports outputs in the run summary.

Make each deployed name start with `codelinq-hackathon-app-` and keep all SSM parameters under `/codelinq-hackathon/app/`. For log groups, use `/aws/lambda/codelinq-hackathon-app-*` or `/codelinq-hackathon/app/*`. Apply the four standard tags to each taggable resource, especially buckets and the distribution; the CloudFront OAC API does not support tags. The deploy role writes to the hackathon artifact bucket, app assets, app ECR repositories, creates only the tagged ACM certificate for `codelinq.codehawks.org`, and invalidates only hackathon-tagged distributions. CloudFormation itself has permissions for the site distribution and common S3, Lambda, DynamoDB, logs, SQS, ECR, SSM, and Secrets Manager resources within the namespace. Attach the exported runtime boundary to each runtime role declared by the app template; it permits data access within the same app namespace. The initial boundary supports Lambda runtime roles and the listed app data services; extend it before using another runtime. The boundary limits runtime IAM privileges even if a template's inline role policy asks for more.

These are the initial service permissions, not a grant to use other account resources. The app's CloudFormation role can **not** manage the bootstrap IAM roles or artifact bucket. A separate bootstrap CloudFormation role can manage those bootstrap resources and nothing in the Codehawks stacks. The bootstrap updater has its own short-lived GitHub role, and its `hackathon-admin` environment is pinned to `main` without an approval gate. Use the AWS console as Israel for the final bootstrap deletion. If the chosen app needs API Gateway, Cognito, an external queue or database, network resources, another AWS service, IAM managed policies, or nested stacks, add and review matching least-privilege permissions in [`infra/bootstrap.json`](../infra/bootstrap.json) and [`scripts/validate_repo.py`](../scripts/validate_repo.py) in the same pull request **before deploying that service**. Update the bootstrap by selecting **Actions → Update hackathon AWS bootstrap** on `main`. Do not widen resource patterns to cover Codehawks or attach administrator policies. Do not add nested stacks until deployment, permission, and recursive teardown support have each been implemented and reviewed.

Before the first site deploy, add the same `CLOUDFLARE_API_TOKEN` secret to the GitHub `hackathon` and `hackathon-teardown` environments. Create a Cloudflare API token with only **Zone / Zone / Read**, **Zone / DNS / Read**, and **Zone / DNS / Edit**, scoped to the `codehawks.org` zone. Do not add it to the repo, a workflow file, or chat. The deploy workflow uses it to publish only the ACM validation CNAMEs and `codelinq.codehawks.org`; teardown removes only those records when their values still match this stack. If the token is absent or a record conflicts with an existing DNS entry, deployment stops rather than overwriting unrelated DNS.

If an app change also needs new bootstrap permissions, first merge the IaC changes. Any collaborator with write access can start **Actions → Update hackathon AWS bootstrap** on `main`. After the permissions update completes, select **Actions → Deploy hackathon → Run workflow** for the app deployment. The deploy workflow intentionally doesn't run on a bootstrap-only template change.

Run the local CloudFormation lint and ownership checks and open a pull request:

```sh
python -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements-dev.txt
cfn-lint infra/bootstrap.json infra/app.json
python scripts/validate_repo.py
```

For initial setup, merge the IaC change and add the Cloudflare environment secrets described above. Any collaborator with write access can run **Actions → Update hackathon AWS bootstrap** on `main`, then **Actions → Deploy hackathon → Run workflow**. Deployments are manual from `main`, so agents can prepare and merge app changes before a collaborator starts the AWS deployment. A deploy requests and validates the ACM certificate, creates the CloudFront distribution, syncs `app/public/`, then points the DNS-only CNAME at that distribution. The first CloudFront distribution can take several minutes to finish provisioning. Verify `https://codelinq.codehawks.org` after the run completes.

## Bedrock backend deployment

The backend uses Lambda's IAM role for Bedrock inference; there is no Bedrock API
key. Israel owns arranging the following matching nonsecret variables in the
`hackathon-admin` and `hackathon` GitHub environments:

| GitHub variable | Approved value |
| --- | --- |
| `BEDROCK_MODEL_ID` | `amazon.nova-lite-v1:0` |
| `BEDROCK_MODEL_ARNS` | `["arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0"]` |

In his [PR #7 review reply](https://github.com/codelinq-ung-team/codehawks/pull/7#issuecomment-5974178108),
Israel reported the model as `AUTHORIZED` and `AVAILABLE` in account
`394270749442`, region `us-east-1`. No third-party provider agreement or
application inference profile is required. Both environments were missing these
variables at review time. He did not run a billable inference call; the deployed
Lambda role's inference path remains unverified.

`BEDROCK_MODEL_ARNS` is a JSON array
of exact model/profile ARNs, including every destination foundation-model ARN for
cross-region profiles. Israel confirms access and destinations before deployment.
No wildcard model resources or account-wide Bedrock policies are allowed. The
templates require these parameters; changing a model requires updating the
bootstrap boundary before deploying the app. Deploy refuses differing settings.

The bootstrap owns the retained `codelinq-hackathon-app-chat-oac`, which signs
requests to the app's IAM-protected streaming Function URL. The runtime role has
only the two scoped Bedrock inference actions and access to its own logs, with
the exported runtime boundary attached. CloudFormation can read only the pinned
Lambda Web Adapter layer version in addition to the existing app permissions.
The backend artifact is packaged in Actions with `scripts/build_backend.py` and
uploaded only to the hackathon artifact bucket by the existing packaging step.
Pull-request tests remain fully offline and receive no AWS credentials.
Production runs the Flask API in Gunicorn through Lambda Web Adapter. The
standard-library HTTP server is a local harness and is excluded from the ZIP.

After merging, wait for Israel to confirm configuration in both environments
and explicitly give the deployment go-ahead. Keep deployment and its two
billable smoke calls on hold until that confirmation. Then run
**Update hackathon AWS bootstrap** on `main` and wait for it to succeed before
running **Deploy hackathon** on `main`.
The deploy workflow runs the backend smoke check through CloudFront, including
two small billable model requests. It does not log prompt or reply bodies.
The `/api/*` behavior has caching disabled and forwards the required request
headers without the viewer Host. Callers must supply `x-amz-content-sha256` on
POST requests; see [the backend contract](../backend/README.md). Global 403/404
HTML rewrites are removed to preserve API errors. Reserved concurrency of two
limits parallel inference; user authentication, WAF, and guardrails are deferred.

## End-of-hackathon teardown

Use **Actions → Tear down hackathon → Run workflow** on `main`, and enter exactly `DELETE codelinq-hackathon 394270749442`. The workflow has no approval gate, so any collaborator with write access can run it. It refuses a mismatched app-stack tag, an unrelated bucket, a bucket with another Project tag, an unimplemented nested stack, or nonempty-object/ECR deletion errors. It removes the matching hostname and certificate validation records, disables CloudFront, deletes and waits for the `codelinq-hackathon-app` stack, removes the tagged ACM certificate, empties the versioned contents and markers of tagged app buckets, then empties the seven-day build-artifact bucket. This action permanently deletes app data and disables `codelinq.codehawks.org`.

After the action succeeds, sign in to AWS as Israel, open CloudFormation in `us-east-1`, select `codelinq-hackathon-bootstrap`, and delete it. The bootstrap CloudFormation role has `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` because AWS CloudFormation is still using it while the stack deletes its other resources. Both CloudFront OACs are also retained because their generated IDs are unknown until creation, and granting broad OAC deletion permission would let the bootstrap role delete other OACs in the account. After the stack completes, delete `codelinq-hackathon-cloudformation-bootstrap` from IAM and the managed `codelinq-hackathon-bootstrap-oac-v2` and `codelinq-hackathon-app-chat-oac` from CloudFront; these OACs can be removed only after the app distribution has been deleted. Record both IDs from the bootstrap outputs before deleting the stack. An earlier failed setup attempt may also have left an untracked `codelinq-hackathon-bootstrap-oac`; delete that only if it is still present and no distribution uses it. This removes every hackathon role, the runtime boundary, OACs, and artifact bucket while leaving a step-by-step audit trail. Do not delete the shared `token.actions.githubusercontent.com` OIDC provider; do not delete or alter any Codehawks stack.

## Repository map

| Path | Purpose |
| --- | --- |
| [`infra/bootstrap.json`](../infra/bootstrap.json) | Disposable IAM OIDC roles, runtime boundary, and encrypted artifact bucket |
| [`infra/app.json`](../infra/app.json) | Private S3 site, CloudFront distribution, and app CloudFormation stack |
| [`infra/config.json`](../infra/config.json) | Verified account, region, namespace, and stack names |
| [`.github/workflows/validate.yml`](../.github/workflows/validate.yml) | Pull-request validation, no AWS credentials |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | Main-only OIDC verification and deployment |
| [`.github/workflows/teardown.yml`](../.github/workflows/teardown.yml) | Main-only, confirmation-protected app teardown; no approval gate |
| [`.github/workflows/bootstrap.yml`](../.github/workflows/bootstrap.yml) | Main-only update to the isolated bootstrap; no approval gate |
| [`scripts/aws_actions.py`](../scripts/aws_actions.py) | Deploy and app cleanup implementation, refuses local writes |
| [`scripts/cloudflare_dns.py`](../scripts/cloudflare_dns.py) | Exact-name, conflict-safe Cloudflare validation and site CNAME management |
| [`scripts/publish-app.sh`](../scripts/publish-app.sh) | Uploads the static site, invalidates CloudFront, and sets its DNS-only CNAME |
| [`scripts/validate_repo.py`](../scripts/validate_repo.py) | Hackathon account/name/boundary and cleanup safety checks |
