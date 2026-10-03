# AWS and deployment guide for agents

## Ownership and access

The hackathon shares the AWS account `394270749442` (`us-east-1`) with the existing Codehawks website. Its CloudFormation stacks include `BradsUnitedSite`, `BradsUnitedGitHubAccess`, `codehawks-bootstrap`, `codehawks-backend-bootstrap`, and `CDKToolkit`. **Leave those stacks, resources, domains, buckets, roles, state, and DNS alone.** The hackathon owns the independent `codelinq-hackathon-*` resources in [the checked-in configuration](../infra/config.json). `Lifecycle=ephemeral` records that these are temporary. It has its own bootstrap, role policies, names, and artifact bucket. The initial bootstrap was seeded by Israel; after this IaC change reaches `main`, Israel must run **Actions → Update hackathon AWS bootstrap** once to attach the restricted CloudFormation service role. Later bootstrap updates are GitHub Actions first. Its stack deliberately reuses the account's GitHub OIDC provider; that shared provider was created for other sites, is outside the hackathon stack, and must survive teardown.

Israel Jauregui owns and administers the AWS account. Other agents and contributors use AWS through the repository's main-branch GitHub Actions workflows. Each job assumes its exact, short-lived OIDC role; the Actions environment and AWS role jointly restrict which workflow can assume it. There are no long-lived AWS GitHub secrets. Pull-request validation does not get AWS credentials. The teardown Actions environment requires Israel's approval.

Do not deploy, upload artifacts, create stacks, or delete resources with the local AWS CLI, an SDK, or a framework CLI. Local CLI use is for read-only investigation only. Useful examples:

```sh
aws sts get-caller-identity --profile israel-admin
aws cloudformation list-stacks --profile israel-admin --region us-east-1
aws cloudformation describe-stacks --profile israel-admin --region us-east-1 --stack-name codelinq-hackathon-app
aws cloudformation describe-stack-events --profile israel-admin --region us-east-1 --stack-name codelinq-hackathon-app
aws s3 ls --profile israel-admin
```

Never put credentials in the repo, console logs, pull requests, or workflow files. Do not set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `AWS_SESSION_TOKEN` in GitHub. The GitHub CLI commands in this guide configure GitHub, not AWS; use the authenticated repository owner account.

## Infrastructure and deployment

CloudFormation is the current IaC format. Keep the deployment workflow independent of the app framework. Add infrastructure to [`infra/app.json`](../infra/app.json); include `RuntimePermissionsBoundaryArn` as its `AllowedPattern` already does. The first deploy creates the isolated private assets bucket and gives future app stacks a deletion boundary. It intentionally picks neither a framework nor a public web-hosting design. Once the team chooses a stack, implement its build and publish steps as `scripts/build-app.sh` and `scripts/publish-app.sh`. The deploy workflow calls each only when present. Keep those files safe to run from the checked-in `main` branch; do not put secrets, credentials, or an untrusted user input in shell commands. A template may provision its own runtime resources in `infra/app.json`; the Actions workflow packages the template, applies it to the single named app stack with the dedicated CloudFormation service role, and publishes outputs in the Actions run summary.

Make each deployed name start with `codelinq-hackathon-app-` and keep all SSM parameters under `/codelinq-hackathon/app/`. For log groups, use `/aws/lambda/codelinq-hackathon-app-*` or `/codelinq-hackathon/app/*`. Apply the four standard tags to every named resource, especially buckets. The deploy role writes only to the hackathon artifact bucket, app assets, and app ECR repositories. CloudFormation itself has permissions for common S3, Lambda, DynamoDB, logs, SQS, ECR, SSM, and Secrets Manager resources within the namespace. Attach the exported runtime boundary to each runtime role declared by the app template; it permits data access within the same app namespace. The initial boundary supports Lambda runtime roles and the listed app data services; extend it before using another runtime. The boundary limits runtime IAM privileges even if a template's inline role policy asks for more.

These are the initial service permissions, not a grant to use other account resources. The app's CloudFormation role can **not** manage the bootstrap IAM roles or artifact bucket. A separate bootstrap CloudFormation role can manage those bootstrap resources and nothing in the Codehawks stacks. The bootstrap updater has its own short-lived GitHub role, and its `hackathon-admin` environment is pinned to `main`, requires Israel to approve each run, and prevents reviewer bypass. Since GitHub prevents people from approving their own environment run, a different authorized repository collaborator must start bootstrap updates and teardown; Israel then approves them. Use the AWS console as Israel for the final bootstrap deletion. If the chosen app needs CloudFront, API Gateway, Cognito, an external queue or database, network resources, another AWS service, IAM managed policies, or nested stacks, add and review matching least-privilege permissions in [`infra/bootstrap.json`](../infra/bootstrap.json) and [`scripts/validate_repo.py`](../scripts/validate_repo.py) in the same pull request **before deploying that service**. Update the bootstrap by selecting **Actions → Update hackathon AWS bootstrap** and having Israel approve the environment request. Do not widen resource patterns to cover Codehawks or attach administrator policies. Do not add nested stacks until deployment, permission, and recursive teardown support have each been implemented and reviewed.

If an app change also needs new bootstrap permissions, first merge the reviewed IaC changes. An authorized collaborator starts **Actions → Update hackathon AWS bootstrap**, and Israel approves the run in `hackathon-admin`. After the permissions update completes, manually select **Actions → Deploy hackathon → Run workflow** for the app deployment. The deploy workflow intentionally doesn't run on a bootstrap-only template change.

Run the local CloudFormation lint and ownership checks and open a pull request:

```sh
python -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements-dev.txt
cfn-lint infra/bootstrap.json infra/app.json
python scripts/validate_repo.py
```

After the reviewed change reaches `main`, select **Actions → Deploy hackathon → Run workflow** and choose whether to deploy or run a credentials-only OIDC check. Only Israel or a repo administrator should trigger it. Look at the completed run's summary for the deployed stack's outputs. A fresh checkout with no selected application framework can deploy the private infrastructure baseline; it is not yet a publicly reachable site.

## End-of-hackathon teardown

Use **Actions → Tear down hackathon → Run workflow** on `main`, and enter exactly `DELETE codelinq-hackathon 394270749442`. Review the run's resource inventory first. Israel must approve the protected `hackathon-teardown` job. It refuses a mismatched app-stack tag, an unrelated bucket, a bucket with another Project tag, an unimplemented nested stack, or nonempty-object/ECR deletion errors. It deletes and waits for the `codelinq-hackathon-app` stack, empties the versioned contents and markers of tagged app buckets, then empties the seven-day build-artifact bucket. This action permanently deletes app data.

After the action succeeds, sign in to AWS as Israel, open CloudFormation in `us-east-1`, select `codelinq-hackathon-bootstrap`, and delete it. The bootstrap CloudFormation role has `DeletionPolicy: Retain` and `UpdateReplacePolicy: Retain` because AWS CloudFormation is still using it while the stack deletes its other resources. After the stack completes, delete the remaining `codelinq-hackathon-cloudformation-bootstrap` role from the IAM console. This removes every hackathon role, the runtime boundary, and the artifact bucket while leaving a step-by-step audit trail. Do not delete the shared `token.actions.githubusercontent.com` OIDC provider; do not delete or alter any Codehawks stack.

## Repository map

| Path | Purpose |
| --- | --- |
| [`infra/bootstrap.json`](../infra/bootstrap.json) | Disposable IAM OIDC roles, runtime boundary, and encrypted artifact bucket |
| [`infra/app.json`](../infra/app.json) | Small private CloudFormation starting stack |
| [`infra/config.json`](../infra/config.json) | Verified account, region, namespace, and stack names |
| [`.github/workflows/validate.yml`](../.github/workflows/validate.yml) | Pull-request validation, no AWS credentials |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | Main-only OIDC verification and deployment |
| [`.github/workflows/teardown.yml`](../.github/workflows/teardown.yml) | Main-only, confirmation-protected, Israel-reviewed app teardown |
| [`.github/workflows/bootstrap.yml`](../.github/workflows/bootstrap.yml) | Israel-reviewed update to the isolated bootstrap |
| [`scripts/aws_actions.py`](../scripts/aws_actions.py) | Deploy and app cleanup implementation, refuses local writes |
| [`scripts/validate_repo.py`](../scripts/validate_repo.py) | Hackathon account/name/boundary and cleanup safety checks |
