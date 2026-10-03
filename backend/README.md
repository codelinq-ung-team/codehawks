# Life insurance chatbot backend

The chatbot uses Amazon Bedrock's Converse APIs with IAM authentication. The
deployed Python backend runs behind Lambda Web Adapter, an IAM-protected Function
URL, and the existing CloudFront distribution. Model credentials never enter the
repository, GitHub secrets, or frontend. Conversations are not stored, and the
backend does not log message bodies or raw provider errors.

## Configuration and deployment

Set the same **environment variables** in GitHub's `hackathon-admin` and
`hackathon` environments (these values are not secrets):

| GitHub variable | Value |
| --- | --- |
| `BEDROCK_MODEL_ID` | The exact authorized Bedrock model/profile ID or ARN, callable from `us-east-1` |
| `BEDROCK_MODEL_ARNS` | A JSON array of exact model/profile ARNs; no wildcards |

For a direct regional model, supply only its ARN, such as
`arn:aws:bedrock:us-east-1::foundation-model/<model-id>`. For an inference profile,
include its `us-east-1` ARN in account `394270749442` **and every underlying
foundation-model ARN in its destination regions**. Israel must confirm model
availability, any required provider access, and the ARN list. No default model
is selected automatically. A syntactically valid allowlist cannot prove account
access or profile destination completeness; the deployed smoke check verifies
actual inference.

After review and merge, run **Update hackathon AWS bootstrap** on `main`, followed
by **Deploy hackathon**. Actions uses the existing OIDC roles. The bootstrap
updates the runtime boundary and creates the Lambda-origin OAC. App deployment
rejects model settings that differ from the deployed bootstrap, packages pinned
dependencies, and sets Lambda's `MODEL_ID` through CloudFormation. Lambda uses its
own role to call Bedrock. Do not add a Bedrock key or long-lived AWS credentials.

The function has 512 MB memory, a 120-second timeout, reserved concurrency of two,
and seven-day logs. Concurrency limits simultaneous inference; it is not a daily
budget or per-user rate limit. User authentication, WAF, guardrails, and frontend
integration are outside this change.

The deployment smoke check verifies health, JSON input errors, one buffered model
reply, one streaming reply, and anonymous denial at the direct Function URL. It
makes two small, billable Bedrock requests and prints no conversation content.
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
client in `scripts/smoke_backend.py` demonstrates this; frontend files are unchanged.
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

Invalid input returns 400/413/415; disallowed Origin returns 403; missing
configuration or credentials returns 503; throttling returns 429; provider
failures return 502; provider timeouts return 504. Error details are sanitized.
Production accepts `https://codelinq.codehawks.org` and requests with no Origin;
this is not end-user authentication. Direct Function URL access requires AWS IAM
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

Tests stub Bedrock and do not use credentials or spend model tokens. The build
downloads pinned Linux-compatible wheels and produces ignored `build/backend.zip`
with an executable LF-terminated launcher and the reviewed reference files.

The optional local harness remains `python -m backend.server` on localhost.
Copy `.env.example` to `backend/.env` for nonsecret `MODEL_ID`,
`AWS_DEFAULT_REGION`, optional `AWS_PROFILE`, and `PORT`; shell variables win.
Production ignores `.env`. Local mode can serve the existing demo assets, but no
frontend files are packaged or modified. Consult Israel before making live model
calls in the shared account; otherwise use the offline tests. Local AWS use
remains read-only, and deployments run through Actions.

The prompt and `references/lincoln_calculator.md` retain the life insurance
education rules and reviewed CalcXML guidance. There are no policy uploads, live
insurer records, chat database, web retrieval, or calculator API integration.
Coverage discussions append the calculator link once if the model omitted it.
