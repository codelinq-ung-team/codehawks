# Backend — LincLife API

Python 3.12+ and Flask, with boto3 for AWS calls and Gunicorn in production.
The website and native Quest app share this API. Production runs on AWS Lambda
through Lambda Web Adapter and CloudFront; local development runs Flask directly.

## How it works

`app.py` validates and routes JSON requests. `intake.py` interprets answers using
Amazon Bedrock; the clients validate the readings and calculate coverage.
`recommendations.py` also calculates the gap on the server and validates model
choices against `policy_catalog.py`. `llm.py` handles buffered/streaming chat,
and `prompts.py` supplies instructions and reviewed references.

| API | Purpose and provider |
| --- | --- |
| `GET /api/health` (also `/health`) | Health check; no provider call |
| `POST /api/intake` | Read an answer using Bedrock Converse |
| `POST /api/chat` | Bedrock Converse or ConverseStream chat |
| `POST /api/recommendations` | Bedrock-assisted, catalog-validated policy comparison |
| `POST /api/plaid/link-token` | Plaid Sandbox `/link/token/create` |
| `POST /api/plaid/exchange` | Plaid token exchange, then `/accounts/get` |
| `POST /api/voice/session` | OpenAI Realtime temporary credential for the Quest app |
| `POST /api/pair`, `/api/pair/join`; `GET/POST /api/pair/<id>` | Browser/headset answer handoff |

`plaid.py` returns redacted account types and balances; it does not retrieve income
or transactions. `pairing.py` stores temporary answers in DynamoDB (memory locally).
`rate_limit.py` uses DynamoDB for the deployed shared inference limit. Secrets
Manager supplies deployed Plaid and voice credentials. Chat history remains
client-managed; pairing is the exception that stores assessment answers server-side.

## Run locally

From the repository root:

```sh
python -m pip install -r apps/backend/requirements.txt
cd apps
python -m flask --app backend.app run --port 8000
```

Set configuration in the launching terminal; `.env` files are **not loaded**:

| Environment variable | When needed |
| --- | --- |
| `MODEL_ID` | Bedrock model ID; approved deployment uses `amazon.nova-pro-v1:0` |
| `AWS_PROFILE`, `AWS_DEFAULT_REGION` | Your authenticated local AWS profile and model region |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Plaid Sandbox credentials |
| `PLAID_ENV`, `PLAID_CLIENT_NAME` | Defaults: `sandbox`, `LincLife`; only Sandbox is supported |
| `OPENAI_API_KEY` | Optional Quest voice sessions |

Without provider configuration, affected endpoints report unavailable; the website
still offers its scripted intake. Start the [frontend](../web/README.md) separately.
See the [AWS guide](../../docs/agent-aws.md) before using the shared account.

## Tests and detailed contracts

From `apps/`, run `python -m unittest discover -s backend/tests -v`. Tests stub
providers and require no live inference. Production packaging is handled by
`scripts/build_backend.py` from the repository root.

See the [backend guide](../../docs/backend-guide.md) for request/response examples,
streaming, deployed request hashing, configuration details, and deployment history.
