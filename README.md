# Codelinq hackathon

This repository is the hackathon team's **infrastructure-as-code home**. AWS changes go through reviewed CloudFormation in GitHub Actions, authenticated using short-lived GitHub OIDC credentials. Local AWS CLI credentials belong only to Israel Jauregui and are reserved for read-only inspection. Never commit AWS keys or use personal AWS credentials for deploys.

Start with [the guide for agents](docs/agent-aws.md). It explains account boundaries, safe resource naming, how to deploy an app in any chosen stack, where to add the build and publish adapters, and how to remove hackathon resources.

`infra/bootstrap.json` creates hackathon-only roles, a runtime permissions boundary, and a temporary artifact bucket. `infra/app.json` is a small, private, stack-neutral starting point; the app stack is created by Actions after the team chooses its runtime. Pull requests and pushes run CloudFormation lint and ownership checks. Changes to the app template or application code on `main` run the deploy workflow. The teardown workflow requires a typed account-specific confirmation and Israel's review.

The `codelinq-hackathon` namespace and its independent bootstrap protect the Codehawks website infrastructure. At the end of the event, run **Tear down hackathon** in GitHub Actions; then Israel deletes `codelinq-hackathon-bootstrap` in CloudFormation. AWS CLI commands shown in the agent guide inspect state only.
