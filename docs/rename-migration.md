# Codelinc / LincLife migration

The code, frontend folder/package, backend prompts, WebXR app, and Unity display
name now use Codelinc/LincLife. The canonical hostname is `codelinc.codehawks.org`.
AWS identities move from `codelinq-hackathon` to `codelinc-hackathon` by creating
independent stacks, not by replacing resources inside the old stack.

**Do not deploy until Israel confirms the protected-environment configuration and
explicitly gives the deployment go-ahead.** Local AWS commands remain read-only.
All migration writes run through reviewed CloudFormation in main-branch Actions.
The migration and normal workflows share the `hackathon-aws` concurrency group.

## Before starting

- Merge this change through a PR; confirm `main` passes validation.
- In `hackathon-admin`, copy the existing bootstrap `AWS_ROLE_ARN` into
  `LEGACY_AWS_ROLE_ARN`. In `hackathon-teardown`, copy the existing teardown
  `AWS_ROLE_ARN` into `LEGACY_AWS_ROLE_ARN`. Keep these variables throughout the migration.
- Add `CLOUDFLARE_API_TOKEN` to `hackathon-admin` as well as the existing deploy and
  teardown environments; use the same token restricted to the `codehawks.org` zone.
- Keep matching approved `BEDROCK_MODEL_ID` and `BEDROCK_MODEL_ARNS` in the admin
  and deploy environments. Do not change models during the rename.
- Existing browser sessions do not transfer to the new origin. Both web apps use
  `linclife:v1` for session state; the older assessment component uses
  `linclife-assessment-answers`. The new rate-limit table starts fresh. No answers
  or old application data are copied. Static assets are rebuilt from source.

## Run phases in this order

1. **Migrate hackathon namespace → inventory.** Download the run's inventory
   artifact. It records old bootstrap IDs, parameters, OAC outputs, DNS, and its
   deployed template. The cutover inventory adds app resource IDs and the deployed
   app template after migration read permissions exist. Keep this handoff outside
   the repo; it contains no credentials.
2. **Migrate hackathon namespace → prepare.** Update the deployed legacy bootstrap
   template without changing existing names, trust, or model settings. Add the
   temporary migration service role, exact-stack migration permissions, and
   read-only checks for cleanup. This phase uses the old admin role.
3. **Migrate hackathon namespace → create-bootstrap.** Create the independent new
   bootstrap using the temporary service role. Its output lists the new role ARNs,
   artifact bucket, runtime boundary, and OACs. If creation fails, inspect/recover
   that stack before proceeding; do not blindly retry stack creation.
4. Update `AWS_ROLE_ARN` to the new `BootstrapRoleArn` in `hackathon-admin`, new
   `DeployRoleArn` in `hackathon`, and new `TeardownRoleArn` in `hackathon-teardown`.
   Preserve `LEGACY_AWS_ROLE_ARN`; migration phases continue using old roles.
5. Run **Update hackathon AWS bootstrap** successfully using the new admin role.
   This hands the new stack to its final service role. Verify its `RoleARN` is
   `codelinc-hackathon-cloudformation-bootstrap`; cutover and cleanup refuse the
   temporary role. Creation uses revision zero so the first normal update always
   changes the revision and performs the service-role handoff.
6. Run **Deploy hackathon → verify_only**, then deploy normally. The new app stack
   starts with `LegacyAliasEnabled=false`. The deployment requests one tagged ACM
   certificate with exactly both hostnames, builds/publishes both web apps, creates
   the new CNAME, and runs the existing three billable Bedrock smoke calls.
7. Rehearse Home → Basics → Chat → Review → Results at the new domain and verify
   streaming chat, offline fallback, WebXR, and the rebuilt Quest app. Rebuild Unity
   using its documented editor; its Android package ID remains unchanged.
8. **Migrate hackathon namespace → cutover.** Check new-site health and legacy DNS,
   release the old alias through its stack, claim it through the new app stack,
   and transfer only the exact recorded CNAME. A brief old-host interruption is
   expected between CloudFormation updates. Both hostnames then use the new backend;
   browser requests on the old hostname receive a 308 redirect preserving path and
   query. API paths keep working without a redirect. Verify bookmarks with hash
   routes in a browser, since fragments are not sent to CloudFront.
9. Keep the old app stack until the complete cutover checks pass. **Migrate hackathon
   namespace → cleanup** requires exactly `DELETE LEGACY codelinq-hackathon 394270749442`.
   It uses the old teardown role, verifies new-site health, alias ownership and DNS,
   disables/deletes the old app through CloudFormation, deletes its owned certificate,
   and empties its app/artifact buckets. It never removes the transferred hostname
   or ACM validation records, which the new certificate also needs.
10. Israel deletes `codelinq-hackathon-bootstrap` in the CloudFormation console,
    then its retained CloudFormation service role and both retained OACs using the
    inventory artifact. Deleting that stack also removes the temporary migration
    role. Do not delete the new resources or the shared GitHub OIDC provider.

## Recovery and final teardown

Before legacy cleanup, **rollback** releases the old alias from the new distribution,
restores it to the old distribution, and restores the exact CNAME target. The new
hostname stays available. Rerun cutover after resolving the failure. If a phase
stops between alias updates, rerun that phase or rollback; never force an unrelated
DNS target. Preserve every inventory artifact, especially the first run before
cutover. If cleanup partially fails, use its inventory and inspect stack events;
finish the remaining owned cleanup through reviewed Actions or Israel's documented
final bootstrap cleanup rather than running local AWS writes.

Normal teardown requires `DELETE codelinc-hackathon 394270749442` and refuses while
the legacy app stack still exists. After migration it deletes both matching CNAMEs,
the shared certificate and validation records, and the new app resources. Israel
then performs the documented new-bootstrap and retained-role/OAC cleanup.

## Deliberate old-name exceptions

- `codelinq-ung-team` remains the real GitHub organization in URLs, repository checks,
  and ID-bound OIDC trust. No organization or repository transfer is performed.
- `System.Linq` and `Newtonsoft.Json.Linq` are actual C# library namespaces.
- `codelinq.codehawks.org` remains in HTTPS certificate coverage and redirect logic.
- `infra/legacy-config.json`, the migration confirmation, and this runbook record old
  identities for migration and cleanup. The new teardown role has read-only access
  to the exact old app stack to protect shared certificate-validation records.
- Git history is unchanged. Local `.pnpm-store` copies are preserved but untracked.

`python scripts/check_branding.py` checks tracked and new source files and rejects
remaining old branding outside these exceptions. CI also tests the redirect and
migration safeguards. Offline checks do not establish live IAM, DNS, or headset
behavior; the staged deployment/rehearsal above must verify those.
