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

### Connected headset follow-up

At the user's request, USB/ADB also identified a connected Quest 3S running the
Advisor3D app. Its package was last updated at 02:02:17 EDT. A read-only logcat
query for that app process, starting at the same 02:04:48 EDT cutoff, returned
only 10 Unity lifecycle entries (pause/focus/window/memory events at 02:29:01).
The currently retained buffer contained no user/assistant text. The app's external
files contained IL2CPP runtime assets, not saved transcripts; its production
package is not debuggable, so `run-as` cannot read private app storage.

`Voice.cs` sends voice directly to OpenAI Realtime and adds transcribed user and
assistant messages to `Store.State.messages`. `Store.cs` keeps those messages
in memory only; they are not persisted across launches. Thus Bedrock logs would
not contain the VR voice conversation even if invocation logging were enabled.
A still-running session may show its transcript in the headset UI, but no transcript
was recovered over USB. Logcat retention is finite; this does not prove that no
conversation took place. No restart, reinstall, log clearing, or app-data change
was performed.

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

### Disable the unused Gunicorn control socket

The launcher adds `--no-control-socket`. Gunicorn otherwise tries to create its
management socket under the Lambda user's read-only home, matching the four
control-server filesystem errors in the captured logs.
[Gunicorn settings](https://gunicorn.org/reference/settings/).

The connection errors and worker timeouts remain unresolved findings. This PR
does not change heartbeat timeouts, keep-alive behavior, or temporary directories.

### Send the actual open question in web intake

Main's `Chat.tsx` passes the last bot message as the assessment question. After
ABE explains a field, that explanation replaces the question in the next request.
The website now constructs `question` from the current assessment step. A regression
test checks that an explanation about gross income does not replace the open
income question when the user next asks about their bonus.

This is a request-context correction established by code inspection, not a finding
from user transcripts. It does not add conversation history or change ABE's prompts,
personality, numeric validation, API schema, or the VR voice flow.

## Validation and handoff

Run the backend and deployment test suites, web tests/build/lint, and repository
ownership and branding checks. The added regression covers the open-question bug;
packaging checks require the control-socket flag, and the server startup smoke test
includes that flag.

No production deployment, IAM change, Bedrock logging change, inference call, or
email send was made. After deployment, check that the control-socket error no
longer appears. Connection errors and worker timeouts need separate investigation.
Email research and implementation steps are in [the email proposal](email-results-proposal.md).
