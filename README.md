# Codelinq hackathon

This repository is the hackathon team's **infrastructure-as-code home**. Following the one-time bootstrap, AWS changes go through CloudFormation in GitHub Actions, authenticated using short-lived GitHub OIDC credentials. Any collaborator with repository write access can run the main-branch workflows; the GitHub environments have no required-reviewer approval gates. Local AWS CLI use is reserved for Israel Jauregui's read-only inspections. Never commit AWS keys or use personal AWS credentials for deploys.

Start with [the guide for agents](docs/agent-aws.md). It explains account boundaries, safe resource naming, deployment to `https://codelinq.codehawks.org`, how to add app infrastructure and build steps, and how to remove hackathon resources.

The LinqLife website lives in [`codelinq_frontend/`](codelinq_frontend/) and is served at the
site root. Its chat with Abe sends each typed answer to `POST /api/intake`, where Nova Lite
reads it into a structured field; the site checks that reading, keeps the question order, and
does all the math itself. If the AI can't be reached, the chat carries on with its built-in
script and says so. `scripts/build-app.sh` builds the website and Advisor3D into `app/public/`
during deploy; that folder is not committed.

The backend uses a shared limit of 30 Bedrock calls per rolling 60 seconds instead of Lambda
reserved concurrency, which failed under this account's quota. Deployment remains on hold
until Israel gives the go-ahead. See [the backend guide](backend/README.md) for the failure
report and the API contract.

A life insurance chatbot lives in [`backend/`](backend/README.md). It uses Amazon Bedrock through Lambda's IAM role, accepts conversation messages at `POST /api/chat`, and streams NDJSON replies. CloudFormation and GitHub Actions provision its private streaming Lambda origin behind CloudFront. Israel approved Nova Lite (`amazon.nova-lite-v1:0`) and owns arranging the documented model variables in both protected environments. After merge, wait for his configuration confirmation and explicit deployment go-ahead; then update the bootstrap successfully before deploying from `main`. Deployment and its three billable smoke calls remain on hold until that confirmation. See its guide for offline deployment checks, local development, and the required deployed POST payload-hash header.

`infra/bootstrap.json` creates hackathon-only roles, a runtime permissions boundary, a temporary artifact bucket, and the CloudFront origin access control. `infra/app.json` serves a starter page from a private S3 bucket through CloudFront with ACM HTTPS. GitHub Actions writes the DNS-only `codelinq.codehawks.org` record in Cloudflare. Pull requests and pushes run CloudFormation lint and ownership checks. Deployments run manually from **Actions → Deploy hackathon** on `main`. The teardown workflow requires the typed account-specific confirmation `DELETE codelinq-hackathon 394270749442`; any collaborator with repository write access can run it without a separate approval.

The `codelinq-hackathon` namespace and its independent bootstrap protect the Codehawks website infrastructure. At the end of the event, run **Tear down hackathon** in GitHub Actions; then Israel deletes the bootstrap stack, its retained role, and both retained OACs. AWS CLI commands shown in the agent guide inspect state only.

A Quest 3S WebXR prototype of the assessment lives in [`advisor3d/`](advisor3d/) and is served at `/advisor3d/index.html`. Anything that builds or cleans `app/public/` must read [the Advisor3D guide](docs/advisor3d.md) first.
