# ABE post-deployment review — October 4, 2026

## Scope and evidence

Reviewed only logs after [successful deployment 37181645749](https://github.com/codelinq-ung-team/codehawks/actions/runs/37181645749),
commit `fd7675c56adb32e18be0b61f5f9eb3986fca34cd`. The publish step completed
at 06:04:39 UTC; smoke checks completed at 06:04:45; the deployment completed
at **06:04:48 UTC / 02:04:48 EDT**. Use deployment completion as the conservative
cutoff, excluding deployment smoke calls. Lambda's `LastModified` was 06:04:07 UTC.
The code review uses main at `2efa052`; its only difference from the deployed tree
is removal of an unused policy research reference.

The captured window is **06:04:48–06:30:57 UTC**, October 4. The paginated AWS CLI
read returned 1,404 events from `/aws/lambda/codelinc-hackathon-app-chat`:

| Observation | Count | Interpretation |
| --- | ---: | --- |
| START / END / REPORT | 451 each | Lambda invocations, including polling; not 451 model calls |
| Adapter connection errors | 13 | Connection reset or incomplete HTTP response |
| Gunicorn WORKER TIMEOUT | 5 | Worker lifecycle problems; not proof that Nova timed out |
| Control server read-only filesystem errors | 4 | Gunicorn tried to create its control socket under the Lambda user's home |
| Conversation transcript events | 0 | No user/model text available to assess conversational quality |

`bedrock get-model-invocation-logging-configuration --query loggingConfig`
returned `null` in `us-east-1`. The deployed model is the regional
`amazon.nova-pro-v1:0`, and application code intentionally omits request/reply
logging. The legacy project's Lambda log group (see `infra/legacy-config.json`)
had zero events in the same window. No unrelated application's log contents or
pre-deployment events were read. Raw logs remain outside the repository.

**There are no transcripts to review in the available sources.** Do not attribute
the conversation fixes below to observed user complaints, or claim a measured
model-quality improvement. Bedrock invocation logging is disabled by default and
can capture model inputs and outputs when configured; it is regional/account-wide,
so enabling it would need a separate scoped logging decision in this shared account.
[AWS invocation logging documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html).

Reproduce the bounded log read (read-only; AWS CLI auto-paginates):

```sh
aws logs filter-log-events \
  --log-group-name /aws/lambda/codelinc-hackathon-app-chat \
  --start-time 1791093888000 --end-time 1791095457490 \
  --profile israel-admin --region us-east-1 --output json
aws bedrock get-model-invocation-logging-configuration \
  --profile israel-admin --region us-east-1 --query loggingConfig
aws lambda get-function-configuration \
  --function-name codelinc-hackathon-app-chat \
  --profile israel-admin --region us-east-1 \
  --query '{LastModified:LastModified,Model:Environment.Variables.MODEL_ID}'
```

Later reads can include delayed ingestion, so preserve the captured counts above
as a snapshot, rather than expecting exact equality forever.

## Fixes in this PR

### Runtime reliability — motivated by logs

The launcher disables Gunicorn's unused management socket, which otherwise uses
the user's home. This directly addresses the read-only filesystem error.
Worker temporary files explicitly use `/tmp`.

It also disables the worker heartbeat timeout and closes HTTP connections after
each response. Lambda can suspend the execution environment between invocations;
a wall-clock heartbeat can therefore expire while no request is running. Lambda's
120-second request timeout and the existing SDK network timeouts remain in place.
Closing local connections avoids reusing stale adapter-to-Gunicorn connections
across suspension, with the tradeoff of one extra local TCP connection per request.
The deployment launcher is Lambda-specific; do not copy its zero heartbeat
timeout into an always-running server without evaluating worker recovery.

The freeze/heartbeat and stale-connection explanations are **hypotheses consistent
with the runtime setup**, not root causes proven by the logs. There are no request
paths or HTTP statuses in these events, so we cannot identify affected screens
or calculate an end-user failure rate. Verify these mitigations after deployment.
[Gunicorn settings](https://gunicorn.org/reference/settings/),
[Lambda lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html).

### Conversational continuity — found in code review

Previously, `Chat.tsx` passed the last bot message as the assessment question.
After “What is gross income?”, that became “income before taxes,” replacing the
actual open income question. No dialogue history accompanied “does that include
my bonus?” The request now always includes the canonical open question and up to
six recent messages. The server validates roles, lengths, and count before inference.
Older clients can omit history. A little extra input context increases input tokens.

ABE's intake and results instructions now explicitly welcome brief small talk,
harmless jokes, and invited Lincoln wit. The results system prompt also names Abe,
matching the website. Small talk uses the existing `question` intent and leaves
the current field open. It does not trigger a new assessment flow or save a number.
The app still validates and confirms numbers, handles monthly conversion, and does
the estimate itself. The existing question-mark safeguard is retained.

### What to assess next

Use an explicitly opted-in demo session if conversation review is wanted. Record
only that session, with short retention and restricted access; do not silently
enable account-wide raw financial-chat logging. Useful checks include:

| Example (synthetic, not a real transcript) | Expected behavior |
| --- | --- |
| “What is gross income?” → “Does that include my bonus?” | Explain the follow-up with the income field still open |
| “Nice hat, Abe!” | Brief friendly reply; no profile change |
| “What does cash value mean?” | Useful explanation before any professional referral |
| “I make 6k a month” | Ask for confirmation before annualizing |
| “Should I count my 401k?” | Explain; never save 401,000 as an amount |
| An earlier bot example contains a dollar amount | Never adopt it as the user's new answer |

Offline tests establish request handling and field behavior, not how Nova will
phrase these replies. Live model evaluation was not run: AWS investigation was
read-only and no billable inference was requested.

## Validation and deployment handoff

- Backend: `cd apps && python -m unittest discover -s backend/tests -q` (59 tests).
- Deployment: `python -m unittest discover -s scripts/tests -q` (33 tests).
- Web: `cd apps/web && npm test` (33 tests), `npm run build`, `npm run lint`.
- Repository ownership and branding checks pass.
- The production process test now launches the actual `run.sh`, checks `/health`
  without AWS credentials, and verifies HTTP/1.1 connections close. Packaging
  checks preserve the Lambda launch settings.

No production deployment, IAM change, Bedrock logging change, inference call, or
email send was made. After an authorized deployment, compare a similarly bounded
window for adapter resets, worker timeouts, and control-socket errors, and exercise
a conversation after an idle pause. Email research and implementation steps are in
[the email proposal](email-results-proposal.md).
