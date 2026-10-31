# numbers.md: every number in the paper and where it comes from

Paths: **P** = polyformer repository `main` (`/Users/neo/repos/polyformer`, at `0e81268e`); **C** = polyformer `chat`
worktree (`/Users/neo/repos/polyformer-wt/chat`, branch `chat` at `1164e8ec`, still running); **S** = this repository,
branch `paper`; **S-main** = this repository's `main` at `47b0cfe` (the algebra after this branch was cut); **L** = the
Lean package (`/Users/neo/repos/polyformer-wt/lean-p/research/lean`, branch `lean-p` at `a114d08b`); **HF** = the
published model `mohsenvand/sketchpad-0.8b-preview` at `2df87172`, whose certificate is copied in
`S paper/figures/data/certificate_e7.json`. "Derived" means computed here from a record; the command is given.

## Model, adapter, views

| Claim | Value | Source |
|---|---|---|
| Layers; full attention vs Gated DeltaNet | 24; 6 full attention (depths 4, 8, …, 24), 18 Gated DeltaNet | P `research/sketch/REPORT.md` 57; base `config.json` `layer_types` (`polyformer-wt/models/qwen3.5-0.8b`) |
| Hidden size, heads, vocabulary | 1,024; 8 query / 2 key-value heads; 248,320 | base `config.json` (`text_config`) |
| LoRA rank, alpha; layers | r 16, alpha 32, language layers only | P `research/sketch/CALC3.md` 73; adapter `adapter_config.json` |
| Patched matrices | 150 (q, k, v, o in 6 attention layers; in_proj_qkv, in_proj_z, out_proj in 18 GDN layers; gate, up, down in 24 MLPs) | C `research/sketch/chat/CHAT3.md` 105–108 |
| Adapter parameters; share of model | 10,223,616; 1.2% of 873,438,784 | Derived: rank × (in + out) over the 150 matrices matched by the adapter's `target_modules` regex against the base safetensors shapes; base total = all tensors in the base safetensors (vision encoder included) |
| Decoder graph size | 21 MB | P `CALC3.md` 128–129 |
| Precisions on the page | embedding q4, vision fp16, decoder fp16 | S `src/lib/sketchpad/models.ts` 55–62; HF certificate `dtype` |
| View size; image tokens | 32 × 96 px, three 32-px cells; 3 image tokens | S `src/lib/sketchpad/sprites.ts` 1–6; P `research/sketch/e2_column.py` 32 |
| Table sizes | SUM 242; MUL 1,100, ADD 220, ADZ 220, FLS 2, NXT 11 (1,553); SUB 242, EST 400, DEC 9 (651); 2,446 | P `CALC3.md` 76–82; S `src/lib/sketchpad/multiplier.ts` 39–48; P `modal/out/e7_s3_4000_h4.0_stop3.0_fast/files/e7_adapter_s3_h4_v2_cont/eval.json` |
| Cost model | 0.065 s per call + 0.037 s per view (M4, states on the GPU) | P `research/meta/SKETCHPAD3.md` 40; P `CALC3.md` 230 |
| A step about 0.1 s; 1,000-digit sum about 102 s | 0.065 + 0.037; 1,001 steps | P `SKETCHPAD3.md` 59 |
| Model download on the page | 1,913 MB (not stated in the paper) | P `CALC3.md` 22 |

## Training and certificates

| Claim | Value | Source |
|---|---|---|
| E7 recipe | hinge 4; cosine lr 2e-4 → 2e-5; KL to base on text; certificate every 100 steps; replay below hinge/2; stop at min margin ≥ 3.0 | P `CALC3.md` 73–76 |
| E7 first all rows; stop | step 1,200; step 1,600 | P `CALC3.md` 109, 112 |
| E7 training time and cost | 19.8 min H100, about $1.30 | P `CALC3.md` 411 |
| E7 perplexity | × 1.0048 of stock | P `CALC3.md` 112 |
| Server min margins per table | SUM 3.96, EST 4.51, MUL 6.39, ADZ 8.41, SUB 8.36, ADD 9.37, DEC 10.00, NXT 10.48, FLS 12.93 | P `CALC3.md` 114–116; `eval.json` `min_margin` |
| E7 end-to-end on the server | × 4: 20/20, 6: 10/10, 10: 5/5; + 10: 20/20, 100: 5/5, 1,000: 2/2 | P `CALC3.md` 122–123 |
| Padded vs unpadded SUM margins | max change 0.0018 | P `CALC3.md` 125–126 |
| Device certificate (gated E7, M4 WebGPU fp16) | 2,446/2,446; min addition 3.016, multiplier 6.516, calculator 4.609 | P `CALC3.md` 15, 341–343 |
| Full check time on the M4 | 3.5 min (20 + 133 + 55 s) | Derived from P `CALC3.md` 342–343 |
| Device min margin per table | SUM 3.02, MUL 6.52, ADD 9.50, ADZ 8.00, FLS 13.11, NXT 10.22, SUB 8.19, EST 4.61, DEC 10.09 | Derived: minimum per table over the HF certificate's `margins`, split in `MUL_DOMAIN` and calculator order (`S paper/figures/data/certificate_e7.json`) |
| Gated and ungated margins equal | all 2,446, to 1/1000 | P `CALC3.md` 16, 343–344 |
| Weakest tenth re-checked on a new device | `SPOT = 0.1` | S `src/lib/sketchpad/pad.svelte.ts` 220; P `CALC3.md` 22–23 |
| q4 decoder flipped earlier adapter's ADD rows | device −8.9 vs server +9.4; fp16 reproduces | S `src/lib/sketchpad/models.ts` 60–61 |
| First adders' q4 margins (Fig. 3d) | E2 server 3.56 vs device 0.59 | P `REPORT.md` 18 |

## Calculator and baselines

| Claim | Value | Source |
|---|---|---|
| T3: 200/200 exact; per set medians 7.0, 9.8, 7.0, 2.0 s; max 13.3, 16.5, 13.4, 4.7; over 12 s 1, 11, 4, 0 | as stated | P `CALC3.md` 276–281; recomputed from P `research/sketch/calc3_t3.json` (same values) |
| T3 medians of calls / views; cost-model medians | 65/90, 86/137, 61/84, 19/19; 7.6, 10.7, 7.1, 1.9 | P `CALC3.md` 278–281 |
| 184 of 200 within 12 s | 184 | P `CALC3.md` 51; `calc3_t3.json` |
| Wall time / cost model, median | **1.01** (1.0146; range 0.75–1.38) | Derived from `calc3_t3.json` rows (`wall / model`). **Conflict:** `CALC3.md` 285 says 1.02 (see QUESTIONS.md) |
| Device lost 3 times during T3 | 3 | P `CALC3.md` 305–313; `calc3_t3.json` `device_losses` |
| Gated T3 identical | 200/200, steps, views and answers identical | P `CALC3.md` 352–359 |
| Square-root scale rule checked | every radicand 1 to 999,999 | P `CALC3.md` 193 |
| Reference runtime, 1,000 cases per procedure, no view off the table | as stated | P `CALC3.md` 216–227 |
| Waves: four jobs 32 vs 73 passes | Fig. 2c | figure agent, `S paper/figures/fig2.py` |
| Baseline: exact / 20 per cell, totals 220, 121, 3, 23 | as in Extended Data Table 5 | S `paper/baselines/RESULT.md` 13–20 |
| Baseline cap hits per cell | as in Extended Data Table 5 | S `paper/baselines/RESULT.md` 27–31 |
| 27B: 93 of 99 failures at the budget; 121 of 127 finished exact | 93 = sum of cap hits; 99 = 220 − 121 | S `paper/baselines/RESULT.md` 23–31, 58 |
| 0.8B thinking loops | 217/220 at the cap, 190 in a repetition loop | S `paper/baselines/RESULT.md` 64 |
| Sketchpad baseline run | 64,700 views, 0 off the table, 1,001 batched passes | S `paper/baselines/RESULT.md` 48–52 |
| Baseline spend | about $7.1 | S `paper/baselines/RESULT.md` 117 |
| 27B slot: FP8, bf16 holds 8 replies | as stated | S `paper/baselines/DECISIONS.md` (probe section) |
| Frontier, 20 per length: GPT-6.1 Sol 217, Claude Opus 5.5 216, Gemini 4 Argon 207 of 220; cells as in Extended Data Table 5 | as stated | S `paper/BASELINES.md` "Ten comparison models" results; `paper/baselines/results.json` (systems `gpt high`, `claude high`, `gemini high`) |
| Frontier exact on every product length; all misses in + 300 and + 1,000 | GPT 2 + 1, Claude 1 + 3, Gemini 2 + 11 | same |
| Frontier cap hits | GPT 0, Claude 0, Gemini 9 (+300: 1, +1,000: 8) | same |
| Wrong digits in GPT and Claude misses | 1 to 637 | Derived from `results.json` (answer against truth from the right): GPT ids 64, 71, 84 (4, 1, 523); Claude ids 64, 83, 90, 93 (263, 5, 2, 637) |
| Frontier settings and IDs | `gpt-6.1-sol` (reasoning.effort high; created 2026-09-27); `claude-opus-5-5` (effort high; created_at 2026-09-21); `gemini-4-argon` (thinkingLevel high) | S `paper/BASELINES.md` "Frontier", "Ten comparison models" |
| Frontier spend | $30.03 (GPT $4.56, Claude $9.17, Gemini $16.30), from usage at the registered prices | `python frontier_run.py cost` |
| Open tier | registered, not run: Ollama `/api/chat` returns 402 (no usage credits) | S `paper/QUESTIONS.md` 14; `raw/frontier/ollama_*.jsonl` |

## Algebra

| Claim | Value | Source |
|---|---|---|
| Wrong roots refused | 200/200, both routes, both check modes | S `src/lib/sketchpad/program/NOTES.md` 3 |
| Corrupted arithmetic refused | textbook 185/200 (92.5%), evaluation 173/200 (86.5%); misses left the answer unchanged | S `NOTES.md` 3 |
| Six of eleven under 12 s, both routes and modes | 6/11 | S `NOTES.md` 5 |
| Textbook vs evaluation costs (light) | 3(x−2)+5=2x+14: 2.762 vs 4.530; (x+2)^5: 12.058 vs 33.066; factor: 16.900 vs 31.521; full table | S `NOTES.md` 7–21 and 106–122 |
| Exact radicals | x²−2: 86/65/7.407 s; 2x²+3x−1: 144/88/11.048; x²−6x+4: 133/96/11.161; with approximation 18.522, 25.060, 23.110 | S-main `src/lib/sketchpad/program/NOTES.md` 9–11 |
| Corrupted radical pairs refused | 200/200 each mode | S-main `NOTES.md` 1 |
| Tests | 264 (round 5); 2,200 generated cases per route and mode (round 3) | S-main `NOTES.md` 1; S `NOTES.md` 1 |
| Trial primes up to 50 | 50 | S-main `NOTES.md` (round 4 decisions) |
| Kronecker example | (x+2)^5 at 1000 = 1 010 040 080 080 032 | P `research/meta/SKETCHPAD3.md` (section 3); arithmetic check: 1002^5 = 1010040080080032 |

## Gate and chat

| Claim | Value | Source |
|---|---|---|
| Identity test | ORT 1.31.1 CPU; 2,500/2,500 chat calls; 2,688/2,688 rows; greedy 100/100 | P `CALC3.md` 12–14, 327–339 |
| E6 perplexity and IFEval | × 1.0065; IFEval 0.372 vs stock 0.536 (−16.4) | C `CHAT3.md` 181–186 |
| Stock few-shot opening | precision 0.971, recall 0.809 | C `CHAT3.md` 192 |
| P1–P6 rows of Extended Data Table 4 | as stated | C `CHAT3.md` 202–215 (P1), 243–257 (P2), 283–293 (P3), 328–340 (P4), 558–572 (P5), 615–627 (P6) |
| P6 today | precision 1.000, recall 0.991; word 0.856; equations 0.958; prose 0.975; IFEval 0.538 (+0.18); GSM8K −2.4; MMLU −2.2; 2,446 rows; perplexity × 1.007 | C `CHAT3.md` 615–627 |
| P6 paired IFEval flips | 51 stock-only, 52 P6-only | C `CHAT3.md` 629 |
| Fine-tune recall range shown none | 0.946 (P5) to 0.998 (P2) | C `CHAT3.md` 245–246, 560 |
| Training data | about 3,150 dialogues (3,000 + 150 single-digit replies in d2) and 547 stock GSM8K-train solutions; held-out 780 items | C `CHAT3.md` 227–229, 318–321, 718–722 |
| Page chat at gate 0 | as stated | C `CHAT3.md` (Report, "keep chat at gate 0") |

## Inside the model

| Claim | Value | Source |
|---|---|---|
| Median decision depth (E7, the 1,795 E6 rows) | SUM 19, MUL 20, ADD 18, ADZ 18 | Derived: median of `decides_at` per op in P `research/sketch/atlas_arithmetic-e7.json` |
| Answer top token through depth 15 | at most 13% (MUL 13.4%, ADZ 12.7%, ADD 11.8%, SUM 6.2%) | Derived: share of rows with `lens_margin[15] > 0` in the same file |
| E7 push after depth 20 | SUM 79/80, MUL 80/80 | P `CALC3.md` 130 |
| E5 push | SUM 8/80 after depth 18, 75/80 after depth 20 | P `research/sketch/steer.json` (`SUM@18` 0.1, `SUM@20` 0.9375). **Conflict:** `REPORT.md` 56 says 8/80 at L19 and 77/80 at L20 (see QUESTIONS.md) |
| Untouched reading | single cells exact; long numbers 98–99% per digit | P `REPORT.md` 26–28; P `research/sketch/PROBES.md` 9–12 |

## Lean

| Claim | Value | Source |
|---|---|---|
| Build | `lake build` 3,150 jobs, success; no `sorry`/`admit`/`axiom` | L, run 31 Oct 2026 (`lake build`; `grep -rnE "sorry|admit|^axiom" Polyformer/` empty) |
| Axioms of the stated theorems | `propext`, `Classical.choice`, `Quot.sound` or a subset | L `lake env lean AxiomCheck.lean`, run 31 Oct 2026 |
| Sheet form | `Sketchpad.sheet_exact_iff`, `Sketchpad.sheet_certified`: `propext`, `Quot.sound` | S `paper/lean/Sheet.lean`, compiled against L, 31 Oct 2026 |
| Lean and Mathlib version | 4.35.0 | L `README.md` (toolchain) |

## Literature

| Claim | Value | Source |
|---|---|---|
| Prior-art search | 50 arXiv abstracts, 30 Oct 2026 | P `research/audit/sketchpad3_gate/out.md` 3 |
| Lewandowski et al. checked rules | 1,857 | P `research/audit/priorart_all/out.md` 121–125 |
| References verified | 100 entries, 31 Oct 2026 | S `paper/refs_verified.md` |
| Algebra measured on the M4 (light check): 8 of 11 under 12 s; (x+2)^5 9.5 s, (2x−3)^4 10.4 s, (x+1)^10 17.1 s, factor 16.0 s, 3×3 21.5 s | as stated | `paper/figures/data/algebra_m4.json` (demo agent, 31 Oct, sketchpad `7f82207`) |
