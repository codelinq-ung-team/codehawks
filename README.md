# LincLife

LincLife is the Codelinc hackathon team's conversational life-insurance assessment,
served at https://codelinc.codehawks.org. The website and native Quest app use a
Python API to interpret answers; the applications validate those answers and
calculate educational coverage estimates. The website has a labeled scripted
fallback when the AI is unavailable.

## Repository layout

| Path | Purpose |
| --- | --- |
| [`apps/web/`](apps/web/README.md) | React and TypeScript website |
| [`apps/backend/`](apps/backend/README.md) | Flask API for intake, streaming chat, voice sessions, and pairing a browser with a headset |
| [`apps/advisor3d-web/`](apps/advisor3d-web/README.md) | WebXR prototype served at `/advisor3d/index.html` |
| [`apps/advisor3d-unity/`](apps/advisor3d-unity/README.md) | Native Unity Quest application |
| [`infra/`](infra/) | CloudFormation templates and namespace configuration |
| [`scripts/`](scripts/) | Build, validation, publishing, and migration tools; tests in `scripts/tests/` |
| [`docs/`](docs/README.md) | API and operational guides; historical plans and notes in `docs/planning/` |
| `.github/workflows/` | Validation and manual deployment workflows |
| `build/` | Ignored output: combined website in `build/site/`, Lambda ZIP in `build/backend.zip` |

Each application owns its dependencies and tests. Browser applications retain
independent npm lockfiles. Unity retains its standard `Assets/`, `Packages/`, and
`ProjectSettings/` directories. No generated deployment assets are committed.

## Local development

Use Python 3.12+ and Node 24, matching the CI Node version. Shell build scripts
require Bash (Git Bash works on Windows). Unity development requires Unity
6000.3.25f1 with Android Build Support; its standalone logic tests use .NET 9+.

Install Python development dependencies from the repository root:

```sh
python -m pip install -r requirements-dev.txt
```

Start the API from `apps/`, which exposes the existing `backend` Python package:

```sh
cd apps
python -m flask --app backend.app run --port 8000
```

In a separate terminal, start the website from the repository root:

```sh
cd apps/web
npm ci
npm run dev
```

The website proxies `/api` to localhost port 8000. Without model credentials, the
API returns an unavailable response and the website uses its scripted fallback.
The backend reads environment variables, not `.env` files. See the
[backend guide](apps/backend/README.md) for configuration and HTTP contracts.
Consult Israel before making live model calls in the shared AWS account.

For WebXR, run `npm ci` and `npm run dev` in `apps/advisor3d-web/`.
For native Quest builds and headset setup, follow the
[Unity guide](apps/advisor3d-unity/README.md).

## Validation and builds

From the repository root, run these commands in Bash:

```sh
(cd apps && python -m unittest discover -s backend/tests -v)
python -m unittest discover -s scripts/tests -v
cfn-lint infra/bootstrap.json infra/app.json
python scripts/validate_repo.py
python scripts/check_branding.py
bash scripts/build-app.sh
(cd apps/web && npm test && npm run lint)
(cd apps/advisor3d-web && npm test)
node --test scripts/tests/legacy_redirect.test.cjs
python scripts/build_backend.py
dotnet run --project apps/advisor3d-unity/Tests~
```

Python tests stub providers and run without paid inference. The builds install
locked npm dependencies and pinned Linux-compatible Python wheels. The combined
site build puts the website at `build/site/` and WebXR at
`build/site/advisor3d/`. Read the [Advisor3D guide](docs/advisor3d.md) before
changing build cleanup: publishing synchronizes the complete output with deletion.
Standalone .NET tests do not replace Unity editor or headset checks.

## Deployment and account boundaries

**Deployment remains on hold until Israel confirms configuration and explicitly
gives the go-ahead.** Existing AWS resources also require the staged
[namespace migration](docs/rename-migration.md) before renamed workflows run.
The backend uses approved Nova Pro and a shared limit of 30 Bedrock calls per
rolling 60 seconds. Deployment smoke checks include three billable model calls.

Read [AGENTS.md](AGENTS.md) and the [AWS guide](docs/agent-aws.md) before changing
infrastructure or deployment workflows. AWS changes run through reviewed
CloudFormation and manual GitHub Actions on `main`, using short-lived OIDC
credentials. Local AWS CLI use is read-only. Never commit credentials.

The repository owns the `codelinc-hackathon` namespace and only the exact legacy
resources documented for migration. Codehawks production infrastructure shares
the account and must remain untouched. The AWS guide covers bootstrap, deployment,
DNS, and teardown, including the required account-specific deletion confirmation.
