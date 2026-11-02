"""Design references only: Nature does not accept AI-generated images, so no generated pixel enters a figure.

Calls the OpenAI Images API with gpt-image-2.5-sunburst (Neo: no other image model) for each prompt in
inspiration_prompts.json and saves inspiration/<id>__vN.jpg beside inspiration/<id>__vN.txt (the exact prompt sent).
The folder is git-ignored. A cost ledger (inspiration/ledger.json) estimates spend from the returned usage at
gpt-image-1's high-quality rates (text in $5, image in $10, image out $40 per million tokens), the dearest public rates
we know. A call starts only while the estimate plus $0.50 per call in flight stays under the $25 cap.

The key is read from the environment and never printed or written:

    OPENAI_API_KEY=... python paper/figures/inspire.py [ids ...]
"""
import base64
import concurrent.futures as cf
import io
import json
import os
import pathlib
import sys
import time
import urllib.request

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "inspiration"
MODEL = "gpt-image-2.5-sunburst"
CAP = 25.0
RATE = {"text": 5e-6, "image_in": 10e-6, "image_out": 40e-6}
LEDGER = OUT / "ledger.json"


def spent():
    return sum(e.get("usd_est", 0.0) for e in json.loads(LEDGER.read_text())) if LEDGER.exists() else 0.0


def call(prompt, size="1536x1024", quality="high"):
    body = json.dumps({"model": MODEL, "prompt": prompt, "size": size, "quality": quality, "n": 1}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=body, method="POST",
                                 headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"],
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())


def job(fid, prompt, k):
    out = OUT / f"{fid}__v{k + 1}.jpg"
    if out.exists():
        return None
    (OUT / f"{fid}__v{k + 1}.txt").write_text(prompt)
    t0 = time.time()
    try:
        d = call(prompt)
    except Exception as e:  # the error's text, never the request
        msg = e.read().decode()[:300] if hasattr(e, "read") else str(e)[:300]
        return {"id": fid, "k": k, "model": MODEL, "error": msg}
    img = Image.open(io.BytesIO(base64.b64decode(d["data"][0]["b64_json"]))).convert("RGB")
    img.save(out, quality=90)
    u = d.get("usage", {})
    det = u.get("input_tokens_details", {})
    usd = (det.get("text_tokens", u.get("input_tokens", 0)) * RATE["text"]
           + det.get("image_tokens", 0) * RATE["image_in"] + u.get("output_tokens", 0) * RATE["image_out"])
    return {"id": fid, "k": k, "model": MODEL, "file": out.name, "usage": u, "usd_est": round(usd, 4),
            "seconds": round(time.time() - t0)}


def main(ids):
    OUT.mkdir(exist_ok=True)
    P = json.loads((HERE / "inspiration_prompts.json").read_text())
    todo = [(f["id"], f["prompt"] + "\n\nStyle: " + P["style"], k) for f in P["figures"]
            if not ids or f["id"] in ids for k in range(f["variants"])]
    ledger = json.loads(LEDGER.read_text()) if LEDGER.exists() else []
    with cf.ThreadPoolExecutor(4) as ex:
        futs = []
        for t in todo:
            if spent() + 0.5 * (len(futs) + 1) > CAP:
                print("cap reached; skipping", t[0], t[2], flush=True)
                continue
            futs.append(ex.submit(job, *t))
        for fu in cf.as_completed(futs):
            r = fu.result()
            if r is None:
                continue
            print(json.dumps({k: v for k, v in r.items() if k != "usage"}), flush=True)
            if "usd_est" in r:
                ledger.append(r)
                LEDGER.write_text(json.dumps(ledger, indent=1))
    print(f"estimated spend {spent():.2f} USD of cap {CAP}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
