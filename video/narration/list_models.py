"""Lists the account's OpenAI models whose id mentions audio, tts or speech (ids only)."""

import json
import urllib.request

from openai_key import key

req = urllib.request.Request("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key()}"})
with urllib.request.urlopen(req, timeout=60) as r:
    data = json.load(r)["data"]
ids = sorted(m["id"] for m in data)
for i in ids:
    if any(s in i for s in ("audio", "tts", "speech", "realtime", "voice")):
        print(i)
print(f"({len(ids)} models in all)")
