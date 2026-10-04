"""Build a Lambda ZIP from explicit runtime files and pinned dependencies."""
import argparse
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "apps/backend"
RUNTIME_FILES = (
    "__init__.py", "app.py", "intake.py", "llm.py", "pairing.py", "plaid.py", "prompts.py", "rate_limit.py", "voice.py",
    "references/lincoln_calculator.md",
    "recommendations.py", "policy_catalog.py", "references/lincoln_policies.md", "grounding.py",
)


def write_entry(archive, name, data, executable=False):
    # Explicit POSIX metadata also preserves the launcher when built on Windows.
    entry = ZipInfo(name)
    entry.create_system = 3
    entry.external_attr = (0o100755 if executable else 0o100644) << 16
    entry.compress_type = ZIP_DEFLATED
    archive.writestr(entry, data)


def package_backend(output, dependencies):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name in RUNTIME_FILES:
            write_entry(archive, "backend/" + name, (BACKEND / name).read_bytes())
        launcher = (BACKEND / "run.sh").read_bytes().replace(b"\r\n", b"\n")
        write_entry(archive, "run.sh", launcher, executable=True)
        for path in sorted(Path(dependencies).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc":
                name = path.relative_to(dependencies).as_posix()
                if name.startswith(("backend/", "run.sh")):
                    raise ValueError("Dependency conflicts with backend runtime files.")
                write_entry(archive, name, path.read_bytes())
    print(f"Packaged backend: {output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "build/backend.zip")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as directory:
        dependencies = Path(directory)
        subprocess.run([
            sys.executable, "-m", "pip", "install", "--requirement", str(BACKEND / "requirements.txt"),
            "--target", str(dependencies), "--only-binary=:all:", "--no-compile",
            "--platform", "manylinux2014_x86_64", "--implementation", "cp", "--python-version", "3.12",
        ], check=True)
        package_backend(args.output, dependencies)


if __name__ == "__main__":
    main()
