#!/usr/bin/env python3
"""Reject stale branding while documenting identity and migration exceptions."""
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EXCEPTIONS = {
    "infra/legacy-config.json": "Recorded old resource identities for migration and cleanup",
    "docs/rename-migration.md": "Migration history and instructions",
    "scripts/tests/test_namespace_migration.py": "Legacy identity and domain regression fixtures",
    ".github/workflows/migrate-namespace.yml": "Exact legacy cleanup confirmation",
}
ALLOWED_TOKENS = ("codelinq-ung-team", "codelinq.codehawks.org", "System.Linq", "Newtonsoft.Json.Linq",
                  "stack/codelinq-hackathon-app/*")


def check():
    # Include new source files before they have been staged; respect ignored build/cache files.
    paths = subprocess.check_output(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=ROOT).decode().split("\0")
    errors = []
    for name in sorted(set(paths) - {""}):
        path = ROOT / name
        if not path.is_file():
            continue  # A directory move may leave deleted entries in the index until staging.
        if name.startswith(".pnpm-store/"):
            errors.append(name + ": cache must not be tracked")
            continue
        if re.search("l" + "inq", name, re.I):
            errors.append(name + ": stale filename")
        if name in EXCEPTIONS:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeError:
            continue
        for token in ALLOWED_TOKENS:
            content = content.replace(token, "")
        for number, line in enumerate(content.splitlines(), 1):
            if re.search("l" + "inq", line, re.I):
                errors.append(f"{name}:{number}: stale branding")
    if errors:
        raise SystemExit("\n".join(errors))
    print("Branding scan passed; remaining references are library, GitHub identity, or documented migration exceptions.")


if __name__ == "__main__":
    check()
