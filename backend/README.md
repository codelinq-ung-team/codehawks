# Local life insurance chatbot

## File layout

```text
backend/
  server.py                 HTTP routes, local UI serving, streaming transport
  llm.py                    Provider requests, validation, text stream parsing
  config.py                 Private .env loading and environment precedence
  prompts.py                Assistant instructions and calculator reference loading
  check_provider.py         Safe live provider/streaming diagnostics
  references/
    lincoln_calculator.md   Reviewed calculator guidance
  tests/
    test_chat.py            Offline HTTP and streaming integration tests
  .env.example              Placeholder settings for local setup
  .env                      Private settings (ignored by Git)
frontend/local-demo/         Minimal demo UI; separate from backend logic
```

Run all commands below from the repository root. Module and direct script startup
are supported: `python -m backend.server` or `python backend/server.py`.
From inside `backend/`, `python server.py` also works.
Frontend teams can connect to `POST /api/chat`
using the streaming contract below; Markdown rendering belongs to the frontend.

## Local setup

Requires Python 3.12+; no additional packages. Run from the repository root.
The default provider is Groq at `https://api.groq.com/openai/v1` using
`openai/gpt-oss-20b`, available on Groq's Free plan within its rate limits.
On a paid Developer plan, normal usage charges apply; this app does not change
your account plan. The model is configurable with `LLM_MODEL`.
Replies stream into the chat as they are generated, with earlier messages included
for context. Markdown parsing remains the frontend team's responsibility.

PowerShell setup:

```powershell
# Read the key privately without writing it in shell history:
$groqCredential = Read-Host 'Groq API key' -AsSecureString
$env:GROQ_API_KEY = [System.Net.NetworkCredential]::new('', $groqCredential).Password
python -m backend.server
```

Open **http://127.0.0.1:8000** to use the chat page. It includes starter questions,
streaming replies, retryable errors, and a new-conversation button. History is kept only
in browser memory and cleared on refresh; messages are sent to Groq for inference.
Do not provide personal identifiers or sensitive records. The server has no chat
database and does not log message bodies. Remove the key from the shell after use:
`Remove-Item Env:GROQ_API_KEY`.

`LLM_API_KEY` is an optional alternative and takes precedence over `GROQ_API_KEY`.
For another OpenAI-compatible provider, also set `LLM_BASE_URL` and `LLM_MODEL`.
The base URL must include `/v1` if required; the backend appends `/chat/completions`.
Alternatively, copy `backend/.env.example` to `backend/.env` and set the key there.
The server loads `backend/.env` on startup; environment variables take precedence.
The private `.env` file is ignored by Git. Never put a real key in `.env.example`.

The server adds life insurance instructions to every request. It asks for missing
policy and situation details, explains redacted excerpts, identifies assumptions,
and avoids inventing coverage or recommending irreversible policy changes. It is an
educational assistant, not a licensed advisor or an insurer coverage determination.
No policy uploads, live insurer records, or web retrieval are implemented.

The assistant uses the reviewed input framework from
[Lincoln Financial's CalcXML calculator](https://calcxml.com/calculators/life-insurance-calculator?skn=458&r=1)
when discussing coverage needs. `backend/references/lincoln_calculator.md` is included in every
model request. It guides intake, links to the calculator, and explains results
users paste, including the distinction between total and additional coverage.
This is a reviewed reference, not a live calculator API integration. Its formula
and exact numerical outputs have not been replicated; independent estimates
must be labeled. User financial information is not automatically sent to CalcXML.

The server listens on localhost only. `GET /health` reports server availability;
it does not test provider credentials. Send `POST /api/chat` with JSON:

```json
{"messages":[{"role":"user","content":"Hello!"}],"stream":true}
```

Streaming is the default. The response is `application/x-ndjson`: each line is a
separate JSON event, flushed as it arrives. Network reads may split or combine
events; buffer until a newline before parsing. Only assistant text is forwarded.

```json
{"delta":"Hello!"}
{"delta":" How can I help?"}
{"done":true}
```

Before any text is sent, failures return JSON errors with an HTTP error status.
After streaming starts, failures return an `{"error":"..."}` event without a
`done` event. Treat a connection closing without `done` as an incomplete reply;
only commit completed replies to conversation history. Include earlier user and
assistant messages in subsequent requests. The backend does not store history.
The working stream consumer is in `frontend/local-demo/chat.js`.

For clients that require a single JSON response, explicitly send `stream:false`:

```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages, stream: false }),
});
const data = await response.json();
if (!response.ok) throw new Error(data.error);
messages.push({ role: 'assistant', content: data.reply });
```

Errors return `{ "error": "..." }` with HTTP status 400/413/415 for invalid
requests, 503 for missing configuration, 429 for provider rate limits, 502 for
provider failures, or 504 for provider timeouts. Raw provider errors and keys are
never returned. HTTPS is required for remote providers; localhost HTTP is allowed
for development. Redirects are refused to protect the API key.

Run offline integration checks with `python -m unittest discover -s backend/tests -v`.
Tests use a local fake provider and do not spend API credits.

To diagnose provider access without printing your key, run
`python -m backend.check_provider`. This checks Groq's model list and sends one tiny
test completion, which may use API credits. It reports authentication, model
availability, and a safe error code. If a model is unavailable, choose one listed
for your account, set `LLM_MODEL` in `backend/.env`, and restart the server. Existing
shell environment variables override `.env`; clear a stale `LLM_MODEL` override
with `Remove-Item Env:LLM_MODEL -ErrorAction SilentlyContinue` before restarting.

This UI lives in `frontend/local-demo/` to keep it separate from the team's public frontend.
This is a local backend; AWS runtime/HTTP hosting has not been provisioned. Before
public deployment, connect application authentication and rate limiting and deploy
through the repository's reviewed CloudFormation/GitHub Actions process.

References: [Groq models](https://console.groq.com/docs/models),
[Groq model deprecations](https://console.groq.com/docs/deprecations),
[Groq API](https://console.groq.com/docs/api-reference),
[NAIC life insurance guide](https://content.naic.org/consumer/life-insurance.htm).
