"""The stock Qwen3.5 models on the BASELINES.md problem set under vLLM, inside the Modal container (modal_app.py).

One engine per job; every (mode, problem) is one request, all submitted at once and stepped by vLLM's own scheduler.
Each finished reply is appended to /out/<job>/raw.jsonl as it lands (the volume is committed every minute), so a job
that dies or reaches its deadline keeps every reply it finished, and a rerun of the same job skips them.

Prompt: the registered user turn, no system prompt, the model's own chat template with `enable_thinking` set
explicitly. Decoding (BASELINES.md): thinking T 0.6, top-p 0.95, top-k 20, cap 32,768 new tokens; no thinking T 0.7,
top-p 0.8, top-k 20, cap 4,096; no other penalty (min-p 0, presence 0, repetition 1); one sample per problem with the
per-request seed 20261031 + problem id. `generation_config="vllm"` so nothing from the model's generation_config.json
overrides these.
"""

import json
import logging
import pathlib
import time

SEED = 20261031
HF = "/out/hf"
MODELS = {
    # the very weights Sketchpad starts from (sha256 04b1c301... = Qwen/Qwen3.5-0.8B main, rev 2fc06364)
    "0.8b": {"path": "/psk/model", "name": "Qwen/Qwen3.5-0.8B", "max_model_len": 36864, "gpu_mem": 0.90,
             "max_num_seqs": 256},
    "27b": {"path": f"{HF}/Qwen--Qwen3.5-27B--fc05daec", "name": "Qwen/Qwen3.5-27B@fc05daec", "max_model_len": 36864,
            "gpu_mem": 0.93, "max_num_seqs": 128},
    "27b-fp8": {"path": f"{HF}/Qwen--Qwen3.5-27B-FP8--97f5941b", "name": "Qwen/Qwen3.5-27B-FP8@97f5941b",
                "max_model_len": 36864, "gpu_mem": 0.93, "max_num_seqs": 128},
    "9b": {"path": f"{HF}/Qwen--Qwen3.5-9B--c2022362", "name": "Qwen/Qwen3.5-9B@c2022362", "max_model_len": 36864,
           "gpu_mem": 0.92, "max_num_seqs": 192},
}
MODES = {
    "thinking": {"enable_thinking": True, "temperature": 0.6, "top_p": 0.95, "top_k": 20, "max_tokens": 32768},
    "nothink": {"enable_thinking": False, "temperature": 0.7, "top_p": 0.8, "top_k": 20, "max_tokens": 4096},
}


class Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        msg = record.getMessage()
        if any(k in msg for k in ("KV cache", "concurrency", "Loading weights took", "Model loading took",
                                  "memory", "num_gpu_blocks", "Available")):
            self.lines.append(msg)


def build(model_key):
    from vllm import LLM

    cap = Capture()
    logging.getLogger("vllm").addHandler(cap)
    m = MODELS[model_key]
    t0 = time.time()
    llm = LLM(model=m["path"], tokenizer=m["path"], max_model_len=m["max_model_len"],
              gpu_memory_utilization=m["gpu_mem"], max_num_seqs=m["max_num_seqs"], seed=SEED,
              limit_mm_per_prompt={"image": 0, "video": 0}, generation_config="vllm", enable_prefix_caching=False)
    info = {"model_key": model_key, "model": m["name"], "path": m["path"], "load_seconds": round(time.time() - t0, 1),
            "max_model_len": m["max_model_len"], "gpu_memory_utilization": m["gpu_mem"],
            "max_num_seqs": m["max_num_seqs"]}
    try:
        cc = llm.llm_engine.vllm_config.cache_config
        info["num_gpu_blocks"], info["block_size"] = cc.num_gpu_blocks, cc.block_size
        info["kv_cache_dtype"] = str(cc.cache_dtype)
        mc = llm.llm_engine.vllm_config.model_config
        info["dtype"], info["quantization"] = str(mc.dtype), str(mc.quantization)
    except Exception as e:  # noqa: BLE001
        info["cache_config_error"] = repr(e)
    info["vllm_log"] = cap.lines[-20:]
    return llm, info


def params(mode, pid):
    from vllm import SamplingParams

    c = MODES[mode]
    return SamplingParams(n=1, temperature=c["temperature"], top_p=c["top_p"], top_k=c["top_k"], min_p=0.0,
                          presence_penalty=0.0, frequency_penalty=0.0, repetition_penalty=1.0,
                          max_tokens=c["max_tokens"], seed=SEED + pid, skip_special_tokens=False)


def probe(job, model_key, commit, sizes=(8, 32, 96), steps=1024):
    """Load, report the KV capacity, and time decoding on a synthetic prompt (no problem of the set is touched)."""
    import vllm
    from vllm import SamplingParams

    out = pathlib.Path("/out") / job
    out.mkdir(parents=True, exist_ok=True)
    llm, info = build(model_key)
    info["vllm"] = vllm.__version__
    sp = SamplingParams(max_tokens=steps, ignore_eos=True, temperature=0.6, top_p=0.95, top_k=20)
    prompt = "Write out the integers from 1 to 100000 in words, one per line."
    info["throughput"] = []
    for n in sizes:
        t = time.time()
        res = llm.generate([prompt] * n, sp, use_tqdm=False)
        dt = time.time() - t
        toks = sum(len(r.outputs[0].token_ids) for r in res)
        info["throughput"].append({"batch": n, "new_tokens": toks, "seconds": round(dt, 1),
                                   "tokens_per_s": round(toks / dt, 1)})
        (out / "probe.json").write_text(json.dumps(info, indent=1))
        commit()
    return info


def run(job, model_key, modes, deadline_s, commit):
    import vllm
    from vllm.sampling_params import RequestOutputKind

    t_start = time.time()
    out = pathlib.Path("/out") / job
    out.mkdir(parents=True, exist_ok=True)
    raw = out / "raw.jsonl"
    done = set()
    if raw.exists():
        for line in raw.read_text().splitlines():
            r = json.loads(line)
            done.add((r["mode"], r["id"]))
    problems = json.loads(pathlib.Path("/src/baselines/problems.json").read_text())["problems"]
    llm, info = build(model_key)
    info.update({"job": job, "vllm": vllm.__version__, "modes": {m: MODES[m] for m in modes}, "seed": SEED,
                 "resumed_with": len(done)})
    tok = llm.get_tokenizer()
    reqs, longest = {}, 0
    for mode in modes:
        for p in problems:
            text = tok.apply_chat_template([{"role": "user", "content": p["prompt"]}], tokenize=False,
                                           add_generation_prompt=True, enable_thinking=MODES[mode]["enable_thinking"])
            ids = tok.encode(text, add_special_tokens=False)
            longest = max(longest, len(ids) + MODES[mode]["max_tokens"])
            if p["id"] == 0:
                info[f"rendered_prompt_{mode}"] = text
            if (mode, p["id"]) not in done:
                reqs[f"{mode}:{p['id']}"] = (mode, p, ids)
    info["longest_prompt_plus_cap"] = longest
    assert longest <= MODELS[model_key]["max_model_len"], longest
    (out / f"info_{int(t_start)}.json").write_text(json.dumps(info, indent=1))
    commit()

    eng = llm.llm_engine
    for rid, (mode, p, ids) in reqs.items():
        sp = params(mode, p["id"])
        sp.output_kind = RequestOutputKind.FINAL_ONLY
        eng.add_request(rid, {"prompt_token_ids": ids}, sp)
    n_done, last_commit, t_gen, finished = 0, time.time(), time.time(), set()
    with open(raw, "a") as f:
        while eng.has_unfinished_requests():
            for o in eng.step():
                if not o.finished:
                    continue
                mode, p, ids = reqs[o.request_id]
                c = o.outputs[0]
                rec = {"job": job, "model_key": model_key, "model": MODELS[model_key]["name"], "mode": mode,
                       "id": p["id"], "family": p["family"], "n": p["n"], "prompt_tokens": len(ids),
                       "tokens": len(c.token_ids), "finish_reason": c.finish_reason,
                       "hit_cap": len(c.token_ids) >= MODES[mode]["max_tokens"], "seed": SEED + p["id"],
                       "text": c.text}
                f.write(json.dumps(rec) + "\n")
                finished.add(o.request_id)
                n_done += 1
            if time.time() - last_commit > 60:
                f.flush()
                (out / "progress.json").write_text(json.dumps(
                    {"done_this_run": n_done, "submitted": len(reqs), "gen_seconds": round(time.time() - t_gen)}))
                commit()
                last_commit = time.time()
            if time.time() - t_start > deadline_s:
                left = [r for r in reqs if r not in finished]
                f.flush()
                eng.abort_request(left)
                (out / "deadline.json").write_text(json.dumps(
                    {"stopped_at_s": round(time.time() - t_start), "done_this_run": n_done, "aborted": left}))
                break
    summary = {"job": job, "done_this_run": n_done, "submitted": len(reqs),
               "gen_seconds": round(time.time() - t_gen, 1), "total_seconds": round(time.time() - t_start, 1)}
    (out / "progress.json").write_text(json.dumps(summary))
    commit()
    return summary
