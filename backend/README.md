# Life insurance chatbot backend

The chatbot uses Amazon Bedrock's Converse APIs with IAM authentication. The
deployed Python Flask API runs in Gunicorn behind Lambda Web Adapter, an IAM-protected Function
URL, and the existing CloudFront distribution. Model credentials never enter the
repository, GitHub secrets, or frontend. Conversations are not stored, and the
backend does not log message bodies or raw provider errors.

## Configuration and deployment

Israel approved the following model for this deployment. He owns arranging the
same **GitHub environment variables** in `hackathon-admin` and `hackathon`
(these values are not secrets):

| GitHub variable | Value |
| --- | --- |
| `BEDROCK_MODEL_ID` | `amazon.nova-pro-v1:0` |
| `BEDROCK_MODEL_ARNS` | `["arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0"]` |

Nova Pro replaced Nova Lite on 2026-10-03. On 14 hard chat answers Nova Lite
invented values for fields the user had not mentioned four times and recorded a
question as "not sure"; Nova Pro did neither, at about 0.8s per reply instead of
0.6s. Earlier notes below that mention Nova Lite describe the first deployment.

In his [PR #7 review reply](https://github.com/codelinq-ung-team/codehawks/pull/7#issuecomment-5974178108),
Israel reported this model as `AUTHORIZED` and `AVAILABLE` in account
`394270749442`, region `us-east-1`. This Amazon model requires no third-party
provider agreement or application inference profile. Both environments were
missing these variables at review time. No billable inference was run, so the
deployed Lambda role's inference path remains unverified.

For a direct regional model, supply only its ARN, such as
`arn:aws:bedrock:us-east-1::foundation-model/<model-id>`. For an inference profile,
include its `us-east-1` ARN in account `394270749442` **and every underlying
foundation-model ARN in its destination regions**. Israel must confirm model
availability, any required provider access, and the ARN list. No default model
is selected automatically. A syntactically valid allowlist cannot prove account
access or profile destination completeness; the deployed smoke check verifies
actual inference.

After review and merge, wait for Israel to confirm configuration in both
environments and explicitly give the deployment go-ahead. Keep deployment and
its three billable smoke calls on hold until that confirmation. Then run
**Update hackathon AWS bootstrap** on `main` and wait for it to succeed before
running **Deploy hackathon** on `main`. Actions uses the existing OIDC roles.
The bootstrap updates the runtime boundary and creates the Lambda-origin OAC. App deployment
rejects model settings that differ from the deployed bootstrap, packages pinned
dependencies, and sets Lambda's `MODEL_ID` through CloudFormation. Lambda uses its
own role to call Bedrock. Do not add a Bedrock key or long-lived AWS credentials.

The function has 512 MB memory, a 120-second timeout, and seven-day logs. A shared
DynamoDB admission limit allows **30 Bedrock calls in any rolling 60 seconds**
across all users, Lambda instances, and buffered/streaming requests. Additional
requests return JSON HTTP 429 before inference; limiter failures return sanitized
503 errors and never invoke Bedrock. Invalid requests and health checks consume
no allowance. An admitted call consumes its allowance even if inference fails.
The table stores only admission timestamps and a revision token, not chat data.
The limit is sized for the website, where each typed chat answer is one call; when
it is reached the site falls back to its built-in script until the window clears.
This limits request volume, not simultaneous calls or daily spending. Existing
input and output bounds still apply. User authentication, WAF, and guardrails are
not included.

Israel reported that the bootstrap update succeeded, but the app stack reached
`UPDATE_ROLLBACK_COMPLETE`: reserving two executions would leave fewer than the
required ten unreserved executions in this account, whose quota is ten. AWS
rejected a quota request of twelve because it must exceed the default of 1000.
This template removes the reservation rather than increasing account capacity.
Publishing and the Bedrock smoke check never ran, so that deployment made no
Nova Lite inference calls. Keep deployment paused until this fix is reviewed and
merged and Israel gives the go-ahead. No bootstrap permission changes are needed
for this fix; the existing boundary already covers the limiter table operations.

The deployment smoke check verifies that the LinqLife site is published, health,
JSON input errors, one buffered model reply, one intake reading, one streaming
reply, and anonymous denial at the direct Function URL. It makes three small,
billable Bedrock requests and prints no conversation content.
The smoke requests use the same limiter; do not bypass the limit or retry model
calls automatically when the allowance is exhausted.
`verify_only` skips backend packaging, deployment, and inference. Live smoke checks
run only through the main-branch deployment workflow. See
[the AWS guide](../docs/agent-aws.md) for account boundaries and teardown.

## HTTP contract

Send `POST /api/chat` with `Content-Type: application/json`:

```json
{"messages":[{"role":"user","content":"Hello!"}],"stream":true}
```

Requests must fit within 65536 bytes. Include 1-40 user/assistant messages, each
with nonempty content of at most 12000 characters; the final role must be `user`.
The server sends the system prompt and reviewed calculator reference separately
to Bedrock. Earlier conversation messages provide context; clients own history.

**Deployed POST requests must also include `x-amz-content-sha256`: the lowercase
hex SHA-256 digest of the exact UTF-8 request body bytes.** CloudFront signs origin
requests using its OAC, but Lambda requires a signed payload hash. This header is
not an API key. Hash and send the same serialized bytes. The backend deployment
client in `scripts/smoke_backend.py` demonstrates this, and the website does the
same in `codelinq_frontend/src/intake/ai.ts`.
[AWS documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)

Streaming is the default. The response is `application/x-ndjson`, with each event
flushed as it arrives:

```json
{"delta":"Hello!"}
{"delta":" How can I help?"}
{"done":true}
```

Network reads can split or combine lines. Buffer until a newline before parsing.
Only assistant text is forwarded; reasoning blocks are omitted. Before streaming
starts, failures return JSON `{ "error": "..." }` with an HTTP error status. After
streaming starts, failures emit an error event without `done`. A connection closing
without `done` means the reply is incomplete. Only retain completed replies in
conversation history. Explicit `stream:false` returns a single JSON `{ "reply":
"..." }` response instead.

### Guided intake for the website

The LinqLife chat sends each typed answer to `POST /api/intake` (same headers as
above, not streamed):

```json
{"step":"income","question":"About how much do you earn in a year, before taxes?",
 "answer":"around eighty grand","known":{"household":"kids","totalDebt":180000}}
```

`step` is one of the site's field ids (`household`, `youngestAge`, `income`,
`support`, `years`, `mortgage`, `otherDebts`, `finalExpenses`, `education`,
`existing`, `savings`). `question` (up to 600 characters) and `answer` (up to 1000)
are required. `known` optionally lists answers so far by field id, plus `totalDebt`.
The reply is the model's reading, checked by the server:

```json
{"intent":"answer","value":80000,"household":null,"period":null,"extra":{},"say":""}
```

`intent` is `answer`, `unsure`, `skip`, `why`, `question`, or `unclear`. `value` is
dollars, years or age; `household` is `both`, `partner`, `kids`, `others` or `none`;
`period` is `month` or `year` only when the user said so. `extra` holds other fields
whose figures the user typed in the same message. `say` is Abe's wording for
explanations and re-asks. A message ending in `?` is never returned as an answer,
and a reading without a usable value comes back as `unclear`. The site validates
ranges and confirms every figure itself; the model never does the estimate's math.
Nothing is stored or logged. Errors use the same statuses as `/api/chat`.

### Voice session for the Quest app

The Unity app (`advisor3d-unity`) talks with Abe through OpenAI's Realtime API. The
headset connects to OpenAI directly; this server only issues the credential. Send
`POST /api/voice/session` with the same headers as above and the body `{}`:

```json
{"clientSecret":"ek_...","url":"wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1",
 "model":"gpt-realtime-2.1","voice":"ash"}
```

`clientSecret` expires 60 seconds after it is issued and is sent as the WebSocket's
`Authorization: Bearer` header. The session it opens is fixed in `backend/voice.py`:
the model, the `ash` voice, Abe's spoken instructions and the `record_answer` tool.
Each session counts against the shared admission limit. The route needs
an OpenAI key (below). Without one it returns 503 and the app keeps its tapped and
typed chat.

On AWS the key lives in the Secrets Manager secret `codelinq-hackathon-app-openai-api-key`,
which the app stack creates. The function's environment holds only the secret's ARN
(`OPENAI_API_KEY_SECRET`); it reads the value when a session is requested and keeps
it for five minutes. To turn voice on, Israel adds the key as the `OPENAI_VOICE_TOKEN`
secret of the GitHub `hackathon` environment and runs **Deploy hackathon** on `main`:

```sh
gh secret set OPENAI_VOICE_TOKEN --env hackathon --repo codelinq-ung-team/codehawks
```

The deploy passes it to the stack as a hidden (`NoEcho`) parameter. A deploy without
the GitHub secret keeps whatever key the stack already has; before the first one the
secret holds the placeholder `unset` and the route returns 503. To change the key,
update the GitHub secret and deploy again. No bootstrap update is needed: the
runtime boundary and the CloudFormation role already cover secrets in the app
namespace. The deployment smoke check does not start a voice session.

The route is unauthenticated like the others, so anyone who can reach it can start
sessions on the key: set a spend limit on the OpenAI project. For local work, set
`OPENAI_API_KEY` in the environment instead; `advisor3d-unity/README.md` has the steps.

Invalid input returns 400/413/415; missing
configuration or credentials returns 503; throttling returns 429; provider
failures return 502; provider timeouts return 504. Error details are sanitized.
Production delegates origin authorization to CloudFront and IAM.
Direct Function URL access requires AWS IAM
authorization and grants CloudFront access only for this distribution.

`GET /health` is the adapter readiness endpoint. `GET /api/health` exposes the
same lightweight status through CloudFront. Neither calls Bedrock. Production
serves API routes only; the ZIP contains no frontend assets. CloudFront no longer
rewrites 403/404 errors into a successful HTML response.

## Local development and offline checks

Requires Python 3.12+. From the repository root:

```powershell
python -m pip install -r requirements-dev.txt
python -m unittest discover -s backend/tests -v
python -m unittest discover -s scripts/tests -v
cfn-lint infra/bootstrap.json infra/app.json
python scripts/validate_repo.py
python scripts/build_backend.py
```

Backend tests stub Bedrock and DynamoDB and run offline without AWS credentials
or paid inference. Deployment tests in `scripts/tests/` also run offline. The build
downloads pinned Linux-compatible wheels and produces ignored `build/backend.zip`
with an executable LF-terminated launcher and the reviewed reference files.

Gunicorn serves `backend.app:app` in production. The Lambda ZIP contains only
the production modules, reference, launcher, and dependencies.

To run the website against the API locally, start the production app and the
site's dev server, which proxies `/api` to port 8000:

```sh
MODEL_ID=amazon.nova-pro-v1:0 AWS_DEFAULT_REGION=us-east-1 python -m flask --app backend.app run --port 8000
cd codelinq_frontend && npm ci && npm run dev
```

Without AWS credentials the API returns 503 and the chat falls back to its script.

Configure local settings through environment variables; the backend does not
load `.env` files. Consult Israel before making live model calls in the shared
account. Local AWS use remains read-only, and deployments run through Actions.

CloudFormation sets `CHAT_RATE_LIMIT_TABLE` on Lambda. Missing table configuration
fails closed whenever `AWS_LAMBDA_FUNCTION_NAME` is present. Local development
bypasses the limiter only when neither variable is present; setting a table name
enables the shared limiter locally too.

The prompt and `references/lincoln_calculator.md` retain the life insurance
education rules and reviewed CalcXML guidance. There are no policy uploads, live
insurer records, chat database, web retrieval, or calculator API integration.
Coverage discussions append the calculator link once if the model omitted it.
