# Codelinq hackathon

This repository is the hackathon team's **infrastructure-as-code home**. Following the one-time bootstrap, AWS changes go through reviewed CloudFormation in GitHub Actions, authenticated using short-lived GitHub OIDC credentials. Local AWS CLI use is reserved for Israel Jauregui's read-only inspections. Never commit AWS keys or use personal AWS credentials for deploys.

Start with [the guide for agents](docs/agent-aws.md). It explains account boundaries, safe resource naming, deployment to `https://codelinq.codehawks.org`, how to add app infrastructure and build steps, and how to remove hackathon resources.

`infra/bootstrap.json` creates hackathon-only roles, a runtime permissions boundary, a temporary artifact bucket, and the CloudFront origin access control. `infra/app.json` serves a starter page from a private S3 bucket through CloudFront with ACM HTTPS. GitHub Actions writes the DNS-only `codelinq.codehawks.org` record in Cloudflare. Pull requests and pushes run CloudFormation lint and ownership checks. Deployments run manually from **Actions → Deploy hackathon** on `main`. The teardown workflow requires a typed account-specific confirmation and Israel's review.

The `codelinq-hackathon` namespace and its independent bootstrap protect the Codehawks website infrastructure. At the end of the event, run **Tear down hackathon** in GitHub Actions; then Israel deletes the bootstrap stack, its retained role, and the retained OAC. AWS CLI commands shown in the agent guide inspect state only.
