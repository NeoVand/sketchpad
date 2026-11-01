"""Reads OPENAI_API_KEY from ~/.polyformer_keys (or the environment). The key is returned, never printed or logged."""

import os
import re
from pathlib import Path


def key() -> str:
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"]
    text = (Path.home() / ".polyformer_keys").read_text()
    m = re.search(r"^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*['\"]?([^'\"\s]+)", text, re.M)
    if not m:
        raise SystemExit("OPENAI_API_KEY not found in ~/.polyformer_keys")
    return m.group(1)
