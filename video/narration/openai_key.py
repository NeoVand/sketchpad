"""Reads OPENAI_API_KEY from the environment, or from a keys file named by KEYS_FILE (lines such as
`export OPENAI_API_KEY=...`). The key is returned, never printed or logged."""

import os
import re
from pathlib import Path


def key() -> str:
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"]
    keys = os.environ.get("KEYS_FILE")
    if not keys:
        raise SystemExit("set OPENAI_API_KEY, or KEYS_FILE to a file that defines it")
    text = Path(keys).expanduser().read_text()
    m = re.search(r"^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*['\"]?([^'\"\s]+)", text, re.M)
    if not m:
        raise SystemExit(f"OPENAI_API_KEY not found in {keys}")
    return m.group(1)
