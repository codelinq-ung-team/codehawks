# Email users their LincLife findings

Research date: October 4, 2026. This is an implementation proposal; this PR does
not add an email endpoint or send messages.

## Recommendation and current readiness

Use Amazon SES v2 for a one-time email requested at the end of the results page.
It fits the existing AWS deployment and Lambda IAM credentials without an SMTP
password or another provider secret. Generate the summary deterministically from
the reviewed assessment, avoiding another model call and inconsistent figures.

Read-only checks of SES in `us-east-1` found:

| Setting | Observed value | Implication |
| --- | --- | --- |
| ProductionAccessEnabled | false | Arbitrary public recipients are currently blocked |
| SendingEnabled | true | Sandbox sending is available within its restrictions |
| Max24HourSend / MaxSendRate | 200 / 1 per second | Small demo quota, shared by this AWS account |
| SentLast24Hours | 0 | Snapshot only, not a reserved quota |
| Existing verified identity | `codehawks.org` | Shared production identity; do not modify or assume project ownership |

In the SES sandbox, recipients must also be verified, except SES mailbox simulator
addresses. Production access is regional and requires an AWS request. This is
the main launch dependency, even though a sender domain is already verified.
[SES sandbox and production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

Prefer a separate identity such as `mail.codelinc.codehawks.org` and a fixed sender
such as `Abe at LincLife <results@mail.codelinc.codehawks.org>`. These are proposed,
not configured. Add the required DKIM DNS records through reviewed deployment
changes. Do not alter the existing production identity or its notification setup.
[SES identity verification](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html).

At current à la carte pricing, 1,000 outbound messages cost $0.10 before data,
optional features, taxes, and other AWS services. For a hackathon the engineering
and production-access setup dominate the cost. Use shared IPs initially.
[SES pricing](https://aws.amazon.com/ses/pricing/).

## End-of-assessment experience

1. After results, offer **Email my summary**, alongside **Copy Summary**. ABE can
   say “Want a copy for later? I can email your summary.” Keep this optional.
2. Show a preview and ask for the recipient address outside the chat. Say clearly
   that it includes the financial figures they reviewed and sends one message.
   Do not put the address into a Bedrock prompt or enroll them in marketing.
3. Confirm address ownership with a short code. The initial email contains only
   the code, no financial results. In sandbox demos, preverify recipients in SES
   as well; the app's code verification does not bypass the SES sandbox.
4. After confirmation, send the reviewed snapshot. Editing the results requires
   a new preview/confirmation. Disable duplicate clicks while sending.
5. Show “Submitted for delivery” when SES accepts it; offer a copy/download fallback
   on failure. SES acceptance is not proof of inbox delivery.
   [SES SendEmail response semantics](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html).

Email contents: estimate date, estimated additional coverage, needs and resources
breakdown, years of support, omitted inputs, assumptions/limitations, and next steps.
Use the same figures as the results screen. Include one short educational-use note.
Do not include the conversation transcript, a product recommendation, or a claim
that coverage has been approved. Provide both plain text and escaped HTML.

## Concrete implementation outline

Proposed routes, all behind the existing CloudFront path with exact-body signing:

| Route | Request | Result |
| --- | --- | --- |
| `POST /api/results-email/start` | recipient, confirmed profile, consent=true, idempotency key | Generic accepted status and opaque challenge ID |
| `POST /api/results-email/confirm` | challenge ID, verification code | Queued/accepted status for the bound recipient and snapshot |
| `GET /api/results-email/<id>` | opaque receipt capability | Pending, submitted, delivered, or failed; no profile or email echoed |

The browser currently has no authenticated user or server-owned assessment. The
endpoint must validate field ids/statuses/ranges and **recompute** the estimate;
never accept arbitrary email text, a client-supplied total, From address, or headers.
Port the pure `apps/web/src/domain/calculator.ts` calculation/summary rules to the
Python backend with shared golden fixtures (including missing inputs and optional
fields), or factor a shared calculation service before building delivery. Keep
calculator version and snapshot hash with the challenge so the preview matches.

Store the challenge in a dedicated encrypted, short-lived DynamoDB table, with a
cryptographically random ID, hashed verification code, explicit expiration checks,
attempt limit, consent timestamp/version, bound recipient, snapshot and state.
Suggested code lifetime: 10 minutes; delete the profile after submission or expiry.
Do not rely on eventual DynamoDB TTL deletion for the logical expiration decision.
Use conditional writes for state transitions and idempotency; changing recipient
or profile cannot reuse an already confirmed challenge. This is proposed retention,
to be documented to users when implemented.

Start with a hard account-wide application cap below the SES quota, plus per-session
and per-recipient throttles, limited verification attempts and resend cooldowns.
The existing global Bedrock allowance does not limit email sends; use a separate
budget. CloudFront origin signing is not user authentication or bot protection.
Before public launch add a server-verified challenge/bot control at the email routes
and a trusted source of per-client rate limits. This protects the shared account's
sender reputation and limits unsolicited verification emails.

Use a dedicated worker role and a small queue for delivery. SES v2 `SendEmail`
does not expose an idempotency token: a worker must record a send claim and the SES
MessageId. If a network timeout leaves acceptance ambiguous, mark the job unknown
and reconcile delivery events; do not blindly resend. Queue redelivery and worker
crashes need explicit duplicate handling. Do not promise exactly-once delivery.

Use a project-specific SES configuration set for delivery, bounce, and complaint
events. Update the receipt status from those events, suppress bounced/complaining
recipients, and alarm before the global cap. Keep logs to opaque IDs and statuses;
exclude addresses, financial inputs, verification codes, and summary bodies.
[SES configuration sets](https://docs.aws.amazon.com/ses/latest/dg/using-configuration-sets.html),
[event notifications](https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity-using-notifications.html).

## Infrastructure and rollout

Implement through `infra/bootstrap.json`, `infra/app.json`, validation/teardown
scripts and main-branch workflows. SES is not currently part of the hackathon's
runtime boundary. Add `ses:SendEmail` only for the proposed exact identity ARN,
with `ses:FromAddress` restricted to the chosen sender, in both the worker's policy
and boundary. Give the API challenge/queue permissions instead of SES access.
Add only project-scoped identity/configuration-set/event/queue/table administration
permissions; preserve shared domains, identities and Codehawks infrastructure.
[SES IAM resource and address restrictions](https://docs.aws.amazon.com/ses/latest/dg/control-user-access.html).

Suggested implementation order:

1. Pure summary renderer and golden calculator fixtures; optional preview UI and
   copy/download remain usable without SES.
2. Challenge endpoints, bounded state storage and send budget, tested with a fake
   SES client. Reject invalid profiles, stale snapshots, expired/wrong codes,
   duplicate confirms and header injection before any send.
3. Reviewed project identity/DNS/IAM/queue changes, sandbox testing using the SES
   simulator and explicitly verified demo recipients. Test timeout ambiguity,
   retries, suppression and delivery-event authenticity.
4. Israel requests SES production access with the one-time, user-requested use case,
   recipient verification, expected volume, and bounce/complaint handling. Approval
   timing is not guaranteed. Deploy publicly only after production access and the
   recipient abuse controls are ready.

This request authorized research into email support. No SES configuration changes,
production-access request, verification messages, or customer emails were made.
