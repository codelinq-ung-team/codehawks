# codeLinc 11 Path 2 build plan

Propose one conversational life-insurance assessment that a user can complete, understand, and revise. Four people have 20 hours remaining. This is a proposed scope, not an adopted team decision. Get the full journey working by hour 10 and freeze features by hour 14.

## Sources and confirmed facts

Reviewed October 3, 2026.

- `brief.docx` contains four embedded slide images, with printed slide numbers 15, 17, 18, and 19. All four were inspected. The slides carry a 2025 copyright; that does not establish when the challenge was issued or whether this is the complete current template.
- Slide 15 identifies codeLinc 11, Path 2, Life Insurance. The required tool uses conversational AI to gather dependents, income, debts, and existing coverage; produces a personalized needs assessment with reasons; and communicates the math without causing confusion or anxiety. Explaining term versus whole life and personalizing their tradeoffs are stretch goals.
- Slides 17 and 18 add background about education expenses, affordability, and coverage types. They do not specify a calculation method. Slide 19 shows resource titles, but the screenshots contain no recoverable destination links.
- The user confirmed four people and 20 remaining hours. Names, strengths, stack, and deployment experience remain unknown.
- No existing plan, code, project template beyond the supplied slides, or organizer clarification was found. `brief.md` is empty. `Design Tools.md` contains visual guidance, not a stack decision.

The [organizer's event page](https://codelinc11.devpost.com/) requests an application, source link, access credentials, description, and demo. It refers to mobile development, challenge-only work, disclosure of future licensing costs, one entry, and a maximum five-minute presentation with the team onsite. These are published requirements, not team choices.

The [rules page](https://codelinc11.devpost.com/rules) permits teams of three to eight and requires permission to display Lincoln branding. Four people fit that published range. Use an original project name and visual identity unless permission exists.

## Missing facts and conflicts

| Status | Fact to resolve | Immediate effect and planning assumption |
| --- | --- | --- |
| CONFLICT | Event header says October 4 at 11:00 a.m. EDT; submission text says 10:30 a.m. EST. | Confirm with onsite organizers. Plan for October 4 at 10:30 a.m. local Eastern time, and finish earlier. Do not use the later header to justify extra build time. |
| CONFLICT | Rules list a 10:30 p.m. start, while the overview describes a 24-hour event and the team is already planning. | Use the user's 20-hour working budget. Confirm which onsite schedule governs. |
| MISSING | Full template and mobile eligibility. The overview also allows a programming project aligned with templates. | Confirm whether a responsive web app qualifies. Do not treat that as permission for a browser-only submission. |
| MISSING | Chosen stack, deployment setup, four people's strengths and names. | Keep any existing team choice. Allocate roles below by experience in hour 0. No stack migration is proposed. |
| MISSING | AI provider, access credentials, quota, permitted models, and rules on AI-assisted development. | The brief requires AI in the product. Development-assistance permissions and provider constraints are separate questions. Check them before relying on generated code or a particular provider. |
| MISSING | Approved assessment method and acceptable simplifications. | Ask a mentor to review the proposed prototype model in hour 1. Do not describe it as Lincoln's method. |
| MISSING | Submission destination, source-access policy, credential expectations for an anonymous app, and any onsite rubric updates. | Person D checks these in hour 0 and records answers here. Prepare a working source link and explicit access instructions. |

No numeric judging weights were found. AWS appears in the event title, but the reviewed materials do not establish mandatory AWS use. VR is not requested. Published challenge-only development language means advance implementation cannot be assumed eligible.

## Choose the approach

These estimates assume the team uses tools it already knows. Platform eligibility remains unresolved.

| Approach | Usefulness | Build effort | Unfamiliar dependencies | Demo reliability |
| --- | --- | --- | --- | --- |
| Guided text conversation with confirmed fields and a separate calculator | Collects the required facts and explains an editable result | Medium, feasible within the proposed schedule | One model service | Highest of these options because calculation and progress survive model failure |
| Open-ended chatbot that generates the entire assessment | Flexible questions, but missing facts and inconsistent math are harder to catch | Medium initially, high to make dependable | Model service and extensive response validation | Lower; unpredictable responses can derail the journey |
| Voice-first conversation | Useful for users who prefer speaking | High | Speech input, audio output, permissions, and model service | Lower in a noisy venue |

Recommend guided text conversation. It directly covers the required workflow and leaves enough time for integration. Use the team's familiar eligible client platform and a small server endpoint for AI calls. If there is no existing choice, select the simplest organizer-approved platform someone on the team can deploy in hour 0.

## One complete user journey

The primary user is a parent whose household depends on their income and who does not know how existing insurance compares with the support they want to provide. They would use this tool to turn household details into an understandable estimate and a summary they can discuss with a financial professional.

1. The user starts an assessment. The app briefly explains the output and asks who depends on their income.
2. A guided AI conversation collects annual income, the annual amount the household would need replaced, the desired support period, outstanding debts, optional future expenses, and existing coverage. Questions explain each input. Unknown amounts stay marked unknown; the app never turns them into zero silently.
3. The user reviews a structured summary and corrects misunderstandings. The app requires confirmation of every amount used in the calculation.
4. The app calculates the estimated additional coverage and displays each contribution. A short explanation ties the result to the user's confirmed goals and support period.
5. The user changes one assumption, such as support years, and sees the result and explanation update together.
6. The user copies the final summary, including inputs, assumptions, calculation, and unresolved questions. They now have a concrete starting point for a coverage discussion. No staff action is required to finish this journey.

The endpoint is an understandable, revisable needs assessment. Policy purchase, underwriting, and a staff dashboard are outside this scope.

## Calculation and observable completion

Proposed prototype model, subject to mentor review:

`additionalCoverage = max(0, annualSupportNeeded * supportYears + debtsToCover + futureExpenses - existingCoverage)`

Annual income gives context; it is not automatically the amount to replace. Ask for the household's annual support goal. Dependents inform the conversation and support period, not an unexplained multiplier. Ask users to exclude costs already counted in the support amount when entering debts or future expenses. Do not silently derive support years from a child's age.

This simplified model omits inflation, investment returns, taxes, asset offsets, and detailed household cash flows. Show those limits beside the result. It produces a scenario estimate, not a premium quote or an approved insurance recommendation. General background on obligations and resources is available in the [VA needs calculator](https://insurance.va.gov/NeedsCalculator); this proposed formula is not a reproduction of that calculator.

| Essential step | Input | Expected behavior | Verification |
| --- | --- | --- | --- |
| Collect facts | Natural-language answers containing the required household facts | AI asks relevant follow-ups and proposes structured values | Complete a fresh session with differently worded answers; inspect the confirmed values |
| Resolve uncertainty | Missing amount, negative debt, or an ambiguous monthly/annual amount | Ask for clarification; keep the previous valid state; block an unqualified final estimate while required values are unknown | Try each case and confirm no silent zero or unit conversion |
| Confirm | User edits an extracted amount | Only confirmed, validated values reach the calculator | Change a value in the review screen and inspect the calculator input |
| Assess | Confirmed values in the sample below | Display the expected total and all arithmetic terms | Compare with a hand calculation |
| Explain | Assessment and confirmed household goals | Explanation uses those facts and agrees with every displayed number | Read it against the structured assessment; reject inconsistent generated numbers |
| Revise | Change support years from 10 to 8 | Total and explanation update without starting over | Expected sample total becomes $420,000 |
| Finish | Copy-summary action | Copied text includes current inputs, result, assumptions, and unknowns | Paste into a plain text editor and compare with the screen |
| Recover | Force a model timeout or malformed response | Preserve confirmed answers, offer retry and structured entry, and show a calculation with fixed explanatory text | Finish the journey with the service unavailable; disclose that fallback mode lacks live AI |

Use fictional sample data: one dependent child; annual income $75,000; annual support goal $40,000; support period 10 years; debts $180,000; future expenses $20,000; existing coverage $100,000. The result is $500,000. With eight support years it is $420,000. With existing coverage above total needs, show zero additional coverage under these assumptions, not a claim that the user is fully protected.

The live conversation, validation, calculator, revision, and copy action must actually work. Fictional household details are sample data. A replayed conversation is demo evidence, not live AI. No carrier, quote, advisor, or account integration is planned or simulated as working. If the budget comes up, record it as a discussion goal without inventing premiums.

## Four bounded owners

Assign human names in hour 0. Proposed directories describe ownership boundaries and can be mapped to the chosen stack. Person D owns integration and shared contracts. Each owner edits their own area; request changes to another owner's files through that owner.

| Proposed owner | Task and affected area | Dependency | Completion condition |
| --- | --- | --- | --- |
| Person A, client developer | Conversation screen and review editing in `client/intake/` | Shared profile contract and Person C's endpoint | A user can answer, correct fields, confirm, and recover from an error on the target device |
| Person B, calculation developer | Validation and deterministic model in `domain/`; result, revision, and copy UI in `client/results/` | Mentor-reviewed assumptions and shared assessment contract | Sample totals and zero case pass; every displayed number comes from the calculator; summary reflects edits |
| Person C, AI developer | Model adapter, prompts, and server route in `server/conversation/` | Provider access and profile contract | Live answers yield validated proposed fields and the next question; timeout and malformed-output cases preserve state |
| Person D, integration and demo owner | Shared contracts, app composition, deployment configuration, fixtures, README, and demo materials | Inputs from A, B, and C; organizer answers | First full journey runs by hour 10; target-device demo, access checks, cost disclosures, and packet are ready by hour 18 |

Person D defines `Profile`, `Assessment`, and `ConversationReply` before parallel implementation. `Profile` carries dependents, annual income, annual support goal, support years, debts, future expenses, existing coverage, units, and confirmation status. Unknown values remain distinct from zero. `Assessment` carries totals, calculation terms, assumptions, and unresolved fields. `ConversationReply` carries proposed field changes and a next question; it cannot override confirmed values silently.

The client applies validation before confirmation. Person B's calculator is the authority for numbers. Person C's AI explains a supplied assessment and asks follow-ups. Keep provider credentials on the server and exclude household answers from routine logs. Use session-only state for the prototype, with a reset action; disclose any provider processing or retention that Person C verifies.

## Schedule and largest risk

All hour ranges are estimates measured from the team's planning start. The 20-hour budget is elapsed time, not an expectation of 80 productive person-hours; stagger breaks and keep one person available for integration. The earlier confirmed submission cutoff takes precedence over this relative schedule.

| Elapsed hours | Milestone |
| --- | --- |
| 0 to 1 | D confirms platform, deadline, template, and submission access; assigns names and contracts. C proves one real model call. B reviews the calculation with a mentor. A opens the initial flow on the target device. |
| 1 to 3 | Build a thin path from one answer through confirmation to a displayed calculation. D proves deployment and target-device access. |
| 3 to 8 | Owners complete their bounded areas. Integrate continuously; do not leave connection work until hour 10. |
| 8 to 10 | D leads the first complete fresh-session journey, including one edit and copying the result. Cut optional work if this is not complete. |
| 10 to 14 | Verify ambiguous input, unknown values, model failure, zero additional coverage, and target-device layout. Fix core defects. Freeze features at hour 14. |
| 14 to 16 | Rehearse the entire presentation in under five minutes. Capture working screenshots or a backup recording and explain architecture. |
| 16 to 18 | Prepare source access, setup instructions, app access, written description, limitations, provider costs, and dependency licensing costs. Verify access from a clean session. |
| 18 to 20 | Submit through the confirmed channel, verify receipt, and keep a final buffer for access or demo failures. Stop earlier if required by the organizer's cutoff. |

The largest demo dependency is live AI access that can reliably produce usable fields on venue Wi-Fi. In the first hour, run one typical answer, one ambiguous answer, and one forced failure through the real server endpoint from the intended client. Confirm credentials, quota, response validation, and recovery before adding conversation polish.

If the provider fails, retain the structured interview, deterministic calculation, and fixed explanations. Retry the same approved provider or use another permitted provider only if access is already available. This preserves a usable workflow, but does not satisfy the brief's live conversational-AI requirement by itself. Disclose that gap and prioritize restoring one live AI path over stretch features.

If mobile packaging is required, cut visual polish and optional output formats before changing the agreed client platform. The target-device deployment experiment belongs in hours 0 to 3 because packaging discovered at hour 18 can prevent submission.

## Evidence for judging

The organizer lists ten criteria. The labels below paraphrase them; evidence is our proposal. No score weights are invented. See the [published judging criteria](https://codelinc11.devpost.com/).

| Judging focus | Evidence to prepare |
| --- | --- |
| Usability | Fresh user follows the questions, fixes an amount, and reads the result without coaching |
| Required behavior and impact | Demonstrate every required brief element and explain the parent's useful outcome |
| Design originality | Show how confirmed facts constrain AI explanations and support revision |
| Presentation | Rehearsed five-minute story with a live complete journey and backup evidence |
| Working functionality | Hand-verified totals, changed assumptions, invalid input, and service-failure recovery |
| Technology choices | Explain why the selected familiar client and model service fit the task |
| User security | Demonstrate server-held keys, session reset, and documented handling of user inputs |
| Technical originality | Demonstrate the separation of proposed AI fields, confirmed facts, and computed results |
| Architecture and process | One diagram or slide explaining client, server, model, and calculator, plus this scope plan |
| Appropriate complexity | Explain how each implemented component completes the journey and show that required behavior is present |

## Cut list and deferred work

- Defer term versus whole-life explanations and personalized product tradeoffs until the complete required journey works. The brief marks them as stretch goals. Do not equate all permanent insurance with whole life; the [Lincoln resource](https://www.lincolnfinancial.com/public/individuals/products/lifeinsurance/permanentlife) distinguishes product categories.
- Defer voice input and avatar presentation. They add permissions, latency, and venue noise problems without completing another essential step.
- Defer accounts, saved histories, and staff dashboards. The proposed user can finish in one session, and persistence adds work and data handling.
- Defer carrier quotes, underwriting, policy purchase, and advisor booking. External integrations can prevent the demo and are unnecessary for an understandable needs estimate.
- Defer PDF generation, charts, and animations. Copying the summary completes the journey with less implementation work.
- If the full path is late at hour 10, cut free-form side questions, visual polish, and all stretch content. Keep guided AI intake, confirmation, visible math, revision, and a final summary.
- If reliability is still poor at hour 14, use fixed result prose instead of generated result prose. Retain real AI for guided intake, and keep the output personalized through confirmed data and calculated terms.

Completion means the proposed journey meets the observable checks above and the packet is ready for the confirmed submission channel. This file records a plan, not completed implementation or observed test results.
