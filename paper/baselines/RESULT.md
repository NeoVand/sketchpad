# RESULT: exact against length (BASELINES.md, Figure 1c)

Run 31 Oct 2026, 03:14–04:37 UTC, on Modal (app `sketchpad-baselines`, one H100 per job), as registered in
`paper/BASELINES.md`: the 220 problems of `problems.json` (seed 20261031), four systems, the registered prompt,
decoding, caps and scoring. Decisions the registration leaves open, and the 27B-slot choice, were committed before any
reply was scored (`DECISIONS.md`, commits `1aede29`, `0867aa5`).

**The 27B slot is `Qwen/Qwen3.5-27B-FP8`** (revision `97f5941b`), not bf16 Qwen3.5-27B: bf16 loads on one H100 but its
KV cache holds only 8 replies at the full context, and the registered worst case would have cost about $22 (deviation 1).

## Exact / 20

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sketchpad (E7, gate 1) | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 |
| Qwen3.5-0.8B, thinking | 0/20 | 0/20 | 0/20 | 0/20 | 0/20 | 3/20 | 0/20 | 0/20 | 0/20 | 0/20 | 0/20 |
| Qwen3.5-0.8B, no thinking | 0/20 | 0/20 | 0/20 | 0/20 | 0/20 | 15/20 | 8/20 | 0/20 | 0/20 | 0/20 | 0/20 |
| Qwen3.5-27B-FP8, thinking | 18/20 | 12/20 | 8/20 | 1/20 | 0/20 | 20/20 | 20/20 | 15/20 | 14/20 | 6/20 | 7/20 |

Totals: Sketchpad 220/220, 0.8B thinking 3/220, 0.8B no thinking 23/220, 27B-FP8 thinking 121/220.

## Replies at the token cap (32,768 thinking, 4,096 no thinking)

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sketchpad | — | — | — | — | — | — | — | — | — | — | — |
| 0.8B thinking | 20 | 20 | 20 | 20 | 20 | 17 | 20 | 20 | 20 | 20 | 20 |
| 0.8B no thinking | 8 | 20 | 20 | 20 | 20 | 4 | 9 | 14 | 20 | 19 | 20 |
| 27B-FP8 thinking | 2 | 8 | 10 | 19 | 20 | 0 | 0 | 4 | 6 | 11 | 13 |

## Median new tokens (Sketchpad: ticks, one batched forward pass each)

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sketchpad (ticks) | 11 | 31 | 101 | 301 | 1,001 | 16 | 48 | 96 | 240 | 510 | 880 |
| 0.8B thinking | 32,768 | 32,768 | 32,768 | 32,768 | 32,768 | 32,768 | 32,768 | 32,768 | 32,768 | 32,768 | 32,768 |
| 0.8B no thinking | 1,391 | 4,096 | 4,096 | 4,096 | 4,096 | 392 | 1,624 | 4,096 | 4,096 | 4,096 | 4,096 |
| 27B-FP8 thinking | 5,083 | 18,838 | 30,370 | 32,768 | 32,768 | 1,148 | 6,250 | 18,044 | 24,184 | 32,768 | 32,768 |

## Replies with no answer

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.8B thinking | 20 | 20 | 20 | 20 | 20 | 17 | 20 | 20 | 20 | 20 | 20 |
| 0.8B no thinking | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| 27B-FP8 thinking | 2 | 8 | 9 | 17 | 19 | 0 | 0 | 2 | 6 | 9 | 11 |

Sketchpad: every view of every run is a row of the certified table (64,700 views, **0 outside the table**), and every
step's answer equals its row's answer (0 wrong steps). No run errored.

## What the numbers say

- **Sketchpad, 220/220.** The certificate recomputed in the job (fp32, H100, the published adapter): 2,446/2,446 rows,
  minimum margins SUM 3.9598, EST 4.5097, MUL 6.3888, SUB 8.3613 (equal to E7's stored evaluation to 4 places). The
  whole set ran in lockstep in **1,001 batched forward passes** (the longest problem, + 1,000, has 1,001 ticks; batch
  up to 220 views), 200 s of H100.
- **The 27B's misses are mostly the cap.** 93 of its 220 replies ran to 32,768 tokens (83 of them still inside the
  thinking block); of the 127 that finished, 121 were exact (wrong: 2 at + 100, 1 at × 6, 3 at × 15). On long
  products its thinking mostly works in four-digit blocks (12 of the 16 finished replies at × 15 and × 20), and it gets
  7/20 at × 20 yet 1/20 at + 300: its addition is column by
  column with re-checks, and the tokens grow with the length. A larger cap would move its curve; the registered cap
  stands.
- **The stock 0.8B, thinking, does not finish.** 217 of 220 replies hit the 32,768-token cap inside the thinking block,
  190 of them ending in a repetition loop (the last 4,000 characters compress below 0.15; Qwen's model card warns that the 0.8B in thinking mode is prone to thinking loops); the 3
  that finished (× 2) were exact. Without thinking it writes the column steps out and gets them wrong: 0/20 even at
  + 10 (12 of 20 finished, all wrong; 8 ran to 4,096 tokens), 15/20 at × 2 and 8/20 at × 4.

## Predictions against results

Registered predictions (share exact) → result:

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sketchpad | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 |
| 0.8B thinking | 0.6 → 0 | 0.2 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0.9 → 0.15 | 0.3 → 0 | 0.05 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| 0.8B no thinking | 0.3 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0.6 → 0.75 | 0 → 0.4 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| 27B thinking (FP8) | 1 → 0.9 | 0.95 → 0.6 | 0.6 → 0.4 | 0.2 → 0.05 | 0 → 0 | 1 → 1 | 1 → 1 | 0.8 → 0.75 | 0.3 → 0.7 | 0.05 → 0.3 | 0 → 0.35 |

Sketchpad as predicted (the certificate's 1.0 everywhere). The 0.8B is worse than predicted with thinking (loops to the
cap) and on sums without it, better on small products without it. The 27B is below prediction on sums (the cap) and
well above it on long products (0.7 / 0.3 / 0.35 at 10 / 15 / 20 digits against 0.3 / 0.05 / 0).

## Deviations and choices

1. **27B slot: FP8 instead of bf16, for the budget.** Probe `probe_27b_2217` (synthetic prompt, no problem of the set):
   bf16 27B loads (50.2 GiB on the GPU), KV cache 297,080 tokens, maximum concurrency 8.06 at 36,864 tokens per request,
   356 tokens/s at batch 8. The registered worst case (220 × 32,768 tokens) would need at least 5.6 h of H100, about
   $22, over the $15 cap, so the rule fixed in `DECISIONS.md` chose the registration's fallback, the FP8 release
   (block-wise FP8 weights, bf16 KV cache; KV cache 635,361 tokens, concurrency 17.24). It finished all 220
   replies in 73 min, inside its 9,000 s deadline; nothing was cut.
2. **Sketchpad in lockstep.** The polyformer evaluation runs one problem at a time; here every problem's runtime
   (`e5_union.run_sum`, `e4_mul.run`, unchanged) runs in its own thread and one batched forward (`e5_union.batch`, the
   builder the certificate uses) answers all pending views. Every step's answer matched its table row, so batching
   changed no step.
3. **Sketchpad numerics.** fp32 PyTorch 2.14 with flash-linear-attention kernels, as in the E7 training and evaluation
   image; `causal_conv1d` falls back to the reference PyTorch implementation (as in every earlier run). The PyTorch
   adapter is the ungated E7, which CALC3 showed bit-identical to gate 1 (ONNX Runtime identity test).
4. **Stock-model precision.** vLLM 0.31.0 runs the 0.8B in bf16 (its checkpoint dtype) and the 27B as the FP8
   release; the registration does not fix a dtype. The 0.8B weights came from the polyformer volume snapshot, whose
   sha256 (`04b1c301…`) equals Qwen/Qwen3.5-0.8B on the Hub; Sketchpad's base is the same file.
5. **Scoring choices** (`DECISIONS.md`, `score.py`): no `</think>` in thinking mode means no answer; the answer in a box
   is its last digit run; the 300-character fallback takes the run inside the window (taking a run cut by the window's
   edge whole would have changed no reply's exactness). Presence penalty 0, as registered, although Qwen's card pairs
   the no-thinking setting with 1.5. Seeds per request: 20261031 + problem id.

## Spend

| job | call id | what | H100 time | cost |
|---|---|---|---|---|
| `sketchpad_e7` | `fc-01M67Z775HZRTPTGGWVH92DN4B` | certificate + 220 problems | ~5.0 min | ~$0.33 |
| `stock_0.8b` | `fc-01M67Z77V5PHQ15E87Q9DRXBPF` | 0.8B, both modes, 440 replies | ~14.6 min | ~$0.96 |
| `download_Qwen3.5-27B-FP8` | `fc-01M67Z78FPAX46YYN0KWH8BW36` | 30.9 GB to the volume, 129 s | CPU | <$0.05 |
| `download_Qwen3.5-27B` | `fc-01M67Z795JQJKZ3BS3XC12XYMM` | 55.6 GB to the volume, 167 s | CPU | <$0.05 |
| `probe_27b_2217` | `fc-01M67ZDJQWQ90KXNX945MPNEF8` | bf16 27B load + throughput | ~5.5 min | ~$0.36 |
| `stock_27b_fp8` | `fc-01M67ZQAPZ6K0AN9AGR0JJ0YW6` | 27B-FP8 thinking, 220 replies | ~73 min | ~$4.8 |

**Total about $7.1 of the $15 cap.** Modal's billing report (`modal billing report`, app `sketchpad-baselines`) shows
$4.64 for 03:00–04:00 UTC (H100 $4.44, CPU $0.08, memory $0.06, egress $0.05); the 04:00 hour had not posted when this
was written and is estimated from the FP8 job's 37 min of H100 after 04:00 at $3.95/h plus CPU and memory, about $2.5.
Per-job costs are estimates from container wall time at $3.95/h. No frontier model API was called.

## Files

- `problems.py`, `problems.json`: the generator and the 220 problems.
- `modal_app.py`, `spawn.py`, `calls.json`: the app, the launcher, the call ids.
- `sketchpad_run.py`, `stock_run.py`: the two runners.
- `score.py` → `results.json`: one record per (system, problem): system, family, n, a, b, truth, parsed answer, exact,
  tokens, hit_cap; Sketchpad adds ticks, views_off_table and wrong_steps; the stock models add finish reason, where the
  answer was parsed from, and the last 400 characters of the reply.
- `raw/`: every job's output as written on the volume (`raw.jsonl.gz` holds every full reply), so `python score.py
  raw/sketchpad_e7/results.json raw/stock_0.8b/raw.jsonl.gz raw/stock_27b_fp8/raw.jsonl.gz` rebuilds `results.json`.
- `DECISIONS.md`: what was fixed before scoring, and the bf16 probe.

## Frontier models (added 31 Oct 2026; registration and result in `paper/BASELINES.md`, "Frontier" and "Ten comparison models")

GPT-6.1 Sol (`gpt-6.1-sol`, reasoning effort high), Claude Opus 5.5 (`claude-opus-5-5`, effort high) and Gemini 4
Argon (`gemini-4-argon`, thinking level high), the same prompt, scorer and 32,768-token cap including reasoning, 20
per length: **217**, **216** and **207 / 220** exact; cap hits 0, 0 and 9; every miss a sum of 300 or 1,000 digits.
Runner `frontier_run.py` with one module per provider; raw replies `raw/frontier/*.jsonl`; `python score.py
raw/sketchpad_e7/results.json raw/stock_0.8b/raw.jsonl.gz raw/stock_27b_fp8/raw.jsonl.gz raw/frontier/gpt.jsonl
raw/frontier/claude.jsonl raw/frontier/gemini.jsonl` rebuilds `results.json`. Spend $30.03 (API, from usage). The
open tier (five models through Ollama cloud) is registered and not run: its key returns 402 on generation.

## Open models through Ollama cloud (added 31 Oct 2026; `paper/BASELINES.md`, "Open-tier result")

`deepseek-v4-pro:0813` 199, `mistral-large-4` 168, `gemma4:31b` 156, `glm-5.3` 152, `gpt-oss:120b` 149 of 220, at
their highest reasoning setting with the same prompt, scorer and cap. Kimi K3 was dropped on cost (Neo) and replaced
by `mistral-large-4`; its two pilot replies stay in `raw/frontier/ollama_kimi-k3.jsonl`. Usage $27.25 at
ollama.com/pricing rates. Add the five raw files to the `score.py` call above to rebuild `results.json`.
