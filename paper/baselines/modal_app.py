"""Modal app `sketchpad-baselines` for BASELINES.md (Figure 1c): Sketchpad and the stock Qwen3.5 models on one fixed set.

Volumes: `sketchpad-baselines` (new; outputs under /out/<job>/, model downloads under /out/hf/) and the training
volume named by SKETCH_VOLUME, mounted read-only at /psk (the Qwen3.5-0.8B snapshot at /psk/model, the E7 run).
The sketch scripts of the research archive (SKETCH_SRC) are mounted unchanged at /src/sketch; this folder at
/src/baselines. SKETCH_MODEL_LINK is the model path those scripts hard-code.

  uvx --with modal modal deploy modal_app.py
  uvx --with modal python spawn.py <what>        # spawns, records the call id in calls.json, exits
"""
import os
import pathlib

import modal

HERE = pathlib.Path(__file__).parent
SKETCH = pathlib.Path(os.environ["SKETCH_SRC"])
APP = "sketchpad-baselines"
out_vol = modal.Volume.from_name("sketchpad-baselines", create_if_missing=True)
psk_vol = modal.Volume.from_name(os.environ["SKETCH_VOLUME"]).read_only()
app = modal.App(APP)

OWN = ["raw/**", "out/**", "results.json", "RESULT.md", "calls.json", "__pycache__/**"]

# Sketchpad: the image of the E7 runs (run_h100_fast in the archive's research/sketch/modal/sketch_modal.py),
# pip layers first, local files last
sk_image = (modal.Image.debian_slim(python_version="3.12")
            .pip_install("torch==2.14.0", "torchvision", "transformers==5.17.0", "peft", "pillow", "accelerate",
                         "safetensors")
            .pip_install("flash-linear-attention")
            .add_local_dir(SKETCH, "/src/sketch",
                           ignore=["**/*.png", "**/*.pt", "**/*.safetensors", "e3_browser/**", "e0/**", "modal/**"])
            .add_local_file("/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/Menlo.ttc")
            .add_local_file(SKETCH.parent / "PRIMER.md", str(SKETCH.parent / "PRIMER.md"))
            .env({"SKETCH_MODEL_LINK": os.environ.get("SKETCH_MODEL_LINK", "")})
            .add_local_dir(HERE, "/src/baselines", ignore=OWN))

# stock models: the official vLLM image (vLLM 0.31.0, 5 Oct 2026)
vllm_image = (modal.Image.from_registry("vllm/vllm-openai:v0.31.0")
              .entrypoint([])
              # Modal could not find the image's Python (uv-installed): name it `python` on the PATH
              .run_commands("python3 -c 'import sys, vllm; print(sys.executable, sys.version, vllm.__version__)'",
                            "ln -sf $(python3 -c 'import sys; print(sys.executable)') /usr/local/bin/python",
                            "python --version")
              .env({"VLLM_CACHE_ROOT": "/out/vllm_cache", "HF_HUB_DISABLE_TELEMETRY": "1"})
              .add_local_dir(HERE, "/src/baselines", ignore=OWN))


@app.function(image=vllm_image, cpu=8.0, memory=16 * 1024, timeout=3 * 3600, volumes={"/out": out_vol}, retries=0)
def download(repo: str, revision: str):
    import os
    import time

    from huggingface_hub import snapshot_download

    out_vol.reload()
    dst = f"/out/hf/{repo.replace('/', '--')}--{revision[:8]}"
    t = time.time()
    snapshot_download(repo, revision=revision, local_dir=dst, max_workers=16)
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(dst) for f in fs)
    out_vol.commit()
    return {"repo": repo, "revision": revision, "path": dst, "gb": round(size / 1e9, 2), "seconds": round(time.time() - t)}


@app.function(image=vllm_image, gpu="H100", timeout=4 * 3600, volumes={"/out": out_vol, "/psk": psk_vol}, retries=0)
def stock(job: str, model_key: str, modes: list, deadline_s: float):
    import sys

    out_vol.reload()
    sys.path.insert(0, "/src/baselines")
    import stock_run

    return stock_run.run(job, model_key, modes, deadline_s, out_vol.commit)


@app.function(image=vllm_image, gpu="H100", timeout=1800, volumes={"/out": out_vol, "/psk": psk_vol}, retries=0)
def probe(job: str, model_key: str):
    import sys

    out_vol.reload()
    sys.path.insert(0, "/src/baselines")
    import stock_run

    return stock_run.probe(job, model_key, out_vol.commit)


@app.function(image=sk_image, gpu="H100", cpu=(2.0, 8.0), memory=(16 * 1024, 64 * 1024), timeout=3600,
              volumes={"/out": out_vol, "/psk": psk_vol}, retries=0)
def sketchpad(job: str):
    import sys

    out_vol.reload()
    sys.path.insert(0, "/src/baselines")
    import sketchpad_run

    return sketchpad_run.main(job, out_vol.commit)
