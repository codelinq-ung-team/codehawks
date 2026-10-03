"""Private local environment configuration."""
import os
from pathlib import Path


def load_local_env():
    """Load only documented server settings; existing environment wins."""
    path = Path(__file__).resolve().parent / ".env"
    if not path.exists():
        return
    allowed = {"GROQ_API_KEY", "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "PORT"}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name, value = name.strip(), value.strip()
        if name in allowed:
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            os.environ.setdefault(name, value)

