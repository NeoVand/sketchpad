"""Sketchpad on the BASELINES.md problem set, inside the Modal container (function `sketchpad` of modal_app.py).

The system is the reference Python runtime of the E7 evaluation in the research archive (`e5_union.evaluate`), unchanged:
`e5_union.run_sum(act, a, b)` for sums and `e4_mul.run(a, b, mul)` for products, with E7's slotted prompt form
(`import e7_calc` installs e6_slots' batch and run policy and E7's tables into e5_union). The model is Qwen3.5-0.8B
(fp32, as in the evaluation) plus the published E7 adapter (`mohsenvand/sketchpad-0.8b-preview` at 2df87172,
`arithmetic/adapter`; checked by sha256). PyTorch with the adapter is the ungated E7, which CALC3 showed bit-identical to
gate 1.

Lockstep: every problem's runtime runs in its own thread; its `act(op, view)` posts the view and waits. When every live
runtime has posted (or ended), one batched forward (`e5_union.batch`, the batch builder the certificate uses) answers
all of them at once, so the whole set is about as many forward passes as the longest problem has ticks. Each view is
checked against the 2,446 certified rows; the answer is also compared with the table's answer for that row.
"""

import hashlib
import json
import os
import pathlib
import shutil
import sys
import tempfile
import threading
import time

SKETCH_SRC = "/src/sketch"
MODEL_LINK = os.environ["SKETCH_MODEL_LINK"]  # the path hard-coded in e2_column.py (set by modal_app.py)
MODEL_VOL = "/psk/model"
VOL_ADAPTER = "/psk/runs/e7_s3_4000_h4.0_stop3.0_fast/files/e7_adapter_s3_h4_v2_cont"
HF_REPO = "mohsenvand/sketchpad-0.8b-preview"
HF_REV = "2df871728a9d24d1e102a327d1f1475457c53962"
ADAPTER_SHA = "453ae61334e0f6269802c2be29781f7d349c5cee67ced80f47ebc766b7800217"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Lockstep:
    """Collects one view from every live runtime, answers them all with one batched forward, repeats."""

    def __init__(self, n):
        self.cv = threading.Condition()
        self.req, self.ans, self.alive = {}, {}, n

    def ask(self, wid, op, v):
        with self.cv:
            self.req[wid] = (op, v)
            self.cv.notify_all()
            while wid not in self.ans:
                self.cv.wait()
            return self.ans.pop(wid)

    def done(self):
        with self.cv:
            self.alive -= 1
            self.cv.notify_all()

    def serve(self, forward, log):
        rounds, sizes = 0, []
        while True:
            with self.cv:
                while len(self.req) < self.alive:
                    self.cv.wait()
                if not self.req:
                    return rounds, sizes
                batch, self.req = self.req, {}
            answers = forward(list(batch.values()))
            rounds += 1
            sizes.append(len(batch))
            if rounds % 100 == 0:
                log(f"round {rounds}: {len(batch)} views")
            with self.cv:
                self.ans.update(zip(batch.keys(), answers))
                self.cv.notify_all()


def main(job, commit):
    out = pathlib.Path("/out") / job
    out.mkdir(parents=True, exist_ok=True)
    logf = open(out / "run.log", "a")

    def log(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        logf.write(line + "\n")
        logf.flush()

    t0 = time.time()
    # the archive's scripts, unchanged, in a scratch copy: only the device is patched ("mps" -> "cuda")
    work = pathlib.Path(tempfile.mkdtemp(prefix="sk-")) / "sketch"
    shutil.copytree(SKETCH_SRC, work)
    f = work / "e2_column.py"
    src = f.read_text()
    assert 'dev = "mps"' in src
    f.write_text(src.replace('dev = "mps"', 'dev = "cuda"'))
    link = pathlib.Path(MODEL_LINK)
    link.parent.mkdir(parents=True, exist_ok=True)
    if not link.exists():
        link.symlink_to(MODEL_VOL)
    sys.path.insert(0, str(work))

    import torch
    from huggingface_hub import hf_hub_download
    from peft import PeftModel

    import e2_column as e2
    import e4_mul as e4
    import e5_union as u
    import e7_calc  # noqa: F401  (E7's rows and the slotted batch / policy of e6_slots, installed into e5_union)

    B = e4.B
    meta = {"job": job, "torch": torch.__version__, "gpu": torch.cuda.get_device_name(0), "rows": len(u.ROWS)}
    try:
        import fla  # noqa: F401

        meta["flash_linear_attention"] = True
    except ImportError:
        meta["flash_linear_attention"] = False

    # the published adapter at the pinned revision; the volume copy is the same file
    adir = pathlib.Path(tempfile.mkdtemp(prefix="adapter-"))
    for fn in ("adapter_model.safetensors", "adapter_config.json"):
        hf_hub_download(HF_REPO, f"arithmetic/adapter/{fn}", revision=HF_REV, local_dir=adir)
    adapter = adir / "arithmetic" / "adapter"
    meta["adapter"] = f"{HF_REPO}@{HF_REV}/arithmetic/adapter"
    meta["adapter_sha256"] = sha256(adapter / "adapter_model.safetensors")
    meta["volume_e7_adapter_sha256"] = sha256(pathlib.Path(VOL_ADAPTER) / "adapter_model.safetensors")
    meta["base_sha256"] = sha256(pathlib.Path(MODEL_VOL) / "model.safetensors-00001-of-00001.safetensors")
    assert meta["adapter_sha256"] == ADAPTER_SHA, meta
    log(json.dumps(meta))

    model = PeftModel.from_pretrained(e2.load_base(), str(adapter)).eval()
    t1 = time.time()
    ok, by_op, mins, fails = u.certify(model)
    meta["certificate"] = {"certified": ok, "rows": len(u.ROWS), "by_op": by_op,
                           "min_margin": {k: round(v, 4) for k, v in mins.items()}, "fails": fails[:20],
                           "seconds": round(time.time() - t1, 1)}
    log("certificate " + json.dumps(meta["certificate"]))
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    commit()

    rowset = set(u.ROWS)
    _answer = u.answer

    def safe_answer(op, v):  # only the answer's length matters to the batch builder; an off-table view cannot crash it
        try:
            return _answer(op, v)
        except Exception:  # noqa: BLE001
            return ["-"] * (1 if op == "SUM" else 3)

    u.answer = safe_answer

    @torch.no_grad()
    def forward(rows):
        inp, spans = u.batch(rows)
        lg = model(**inp).logits
        return [[u.ID_CHAR.get(int(lg[i, p].argmax()), "?") for p in pos] for i, (pos, _) in enumerate(spans)]

    problems = json.loads(pathlib.Path("/src/baselines/problems.json").read_text())["problems"]
    ls = Lockstep(len(problems))
    recs = [None] * len(problems)

    def worker(i, p):
        st = {"ticks": 0, "off_table": 0, "wrong_steps": 0}
        limit = 4 * (p["n"] + 2) ** 2 + 50

        def act(op, v):
            st["ticks"] += 1
            if st["ticks"] > limit:
                raise RuntimeError(f"tick limit {limit}")
            on = (op, v) in rowset
            st["off_table"] += not on
            got = ls.ask(i, op, v)
            if on and got != list(_answer(op, v)):
                st["wrong_steps"] += 1
            return got

        mul = lambda op, v: (lambda o: (B if o[0] == "_" else o[0], o[1], o[2]))(act(op, v))  # as in evaluate()
        err, got = None, None
        try:
            got = u.run_sum(act, p["a"], p["b"]) if p["family"] == "add" else e4.run(p["a"], p["b"], mul)[0]
        except Exception as e:  # noqa: BLE001
            err = repr(e)
        finally:
            ls.done()
        recs[i] = {"system": "sketchpad", "id": p["id"], "family": p["family"], "n": p["n"], "a": p["a"], "b": p["b"],
                   "truth": p["truth"], "answer": got, "exact": got == p["truth"], "tokens": None, "hit_cap": False,
                   "ticks": st["ticks"], "views_off_table": st["off_table"], "wrong_steps": st["wrong_steps"],
                   "error": err}

    threads = [threading.Thread(target=worker, args=(i, p), daemon=True) for i, p in enumerate(problems)]
    t2 = time.time()
    for t in threads:
        t.start()
    rounds, sizes = ls.serve(forward, log)
    for t in threads:
        t.join()
    meta["run"] = {"batched_forwards": rounds, "views": sum(sizes), "max_batch": max(sizes),
                   "seconds": round(time.time() - t2, 1), "total_seconds": round(time.time() - t0, 1)}
    log("run " + json.dumps(meta["run"]))
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    (out / "results.json").write_text(json.dumps(recs, indent=1))
    commit()
    cells = {}
    for r in recs:
        c = cells.setdefault(f"{r['family']}{r['n']}", [0, 0, 0])
        c[0] += r["exact"]
        c[1] += 1
        c[2] += r["views_off_table"]
    log("cells " + json.dumps(cells))
    return {"job": job, "cells": cells, "run": meta["run"], "certificate": meta["certificate"]["certified"]}
