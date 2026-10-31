# BASELINES: exact against length, for Figure 1c

Registered 31 Oct 2026 by the paper's writer, before any run. Figure 1c plots the share of problems answered exactly
against operand length for Sketchpad and the strongest alternatives that compute inside the model, with no tool. No
record has this for the base model or a larger open model (the end-to-end runs in polyformer
`research/sketch/CALC3.md` cover Sketchpad alone, at 2–20 problems per length), so it is run here.

## What runs

Two problem families, one fixed set, the same for every system:

| family | operand length n (digits, each operand) | problems per n |
|---|---|---|
| addition `a + b` | 10, 30, 100, 300, 1,000 | 20 |
| multiplication `a × b` | 2, 4, 6, 10, 15, 20 | 20 |

220 problems in all. Operands are uniform n-digit positive integers (leading digit 1–9), drawn from Python's
`random.Random(20261031)` in the table's order (family, then n, then problem), written as plain digit strings. The
generator and the set are committed with the results (`paper/baselines/problems.json`).

Systems:

1. **Sketchpad** (rose): the published E7 adapter (`mohsenvand/sketchpad-0.8b-preview` at `2df87172`, gate 1) in
   PyTorch on the server, with the reference Python runtime of the polyformer E7 evaluation (adder for sums, the
   multiplier for products). The certificate predicts 1.0 in every cell.
2. **Qwen3.5-0.8B, thinking** (blue-grey): the stock base, chat template with thinking on, the same weights Sketchpad
   starts from.
3. **Qwen3.5-0.8B, no thinking** (blue-grey, dashed): the stock base, thinking off.
4. **Qwen3.5-27B, thinking** (cobalt, the strongest alternative): the largest dense Qwen3.5 that runs on one H100. If
   it cannot run there under vLLM, the FP8 release `Qwen/Qwen3.5-27B-FP8`; failing that, Qwen3.5-9B. The choice is
   recorded before any scoring.

Prompt (user turn, no system prompt): `What is {a} + {b}? Give the exact integer. Put the final answer in \boxed{}.`
(`×` for products). Decoding: Qwen's recommended settings for each mode (thinking: temperature 0.6, top-p 0.95,
top-k 20; no thinking: temperature 0.7, top-p 0.8, top-k 20), one sample per problem, fixed seed. Token cap 32,768
new tokens with thinking, 4,096 without.

## How it is scored

- The answer is the content of the last `\boxed{…}` in the reply after the thinking block; if there is none, the last
  run of digits in the reply's final 300 characters. Separators inside a run of digits (commas, spaces, thin spaces,
  `\,`, `{,}`) are removed.
- Exact means the integer equals Python's `a + b` or `a * b`. A reply that hits the token cap, or has no answer, is
  wrong; both are counted and reported.
- Reported per cell: exact / 20, replies at the cap, median tokens. Sketchpad also reports ticks and any view outside
  the certified table (there must be none).

## Predictions (mine, before the run)

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sketchpad | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 0.8B thinking | 0.6 | 0.2 | 0 | 0 | 0 | 0.9 | 0.3 | 0.05 | 0 | 0 | 0 |
| 0.8B no thinking | 0.3 | 0 | 0 | 0 | 0 | 0.6 | 0 | 0 | 0 | 0 | 0 |
| 27B thinking | 1 | 0.95 | 0.6 | 0.2 | 0 | 1 | 1 | 0.8 | 0.3 | 0.05 | 0 |

## Kill and cap

- Cap **$15** on Modal for everything here; stop at $13 and report what has run.
- No frontier model through an API in this registration. The paper's claim is a certificate at any length, which a
  frontier comparison does not test; a frontier series, if Neo wants one, is a separate registration (`QUESTIONS.md`).
- Nothing here trains anything; the M4 is not used.

## Result (31 Oct 2026; full record `paper/baselines/RESULT.md`, per problem `results.json`)

Run 03:14–04:37 UTC on Modal, about $7.1 of the $15 cap. The 27B slot is `Qwen/Qwen3.5-27B-FP8` (bf16 loads but holds
only 8 replies at full length; the registered worst case would have cost about $22), fixed before scoring in
`baselines/DECISIONS.md`.

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sketchpad (E7, gate 1) | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 220 |
| Qwen3.5-0.8B, thinking | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 3 |
| Qwen3.5-0.8B, no thinking | 0 | 0 | 0 | 0 | 0 | 15 | 8 | 0 | 0 | 0 | 0 | 23 |
| Qwen3.5-27B-FP8, thinking | 18 | 12 | 8 | 1 | 0 | 20 | 20 | 15 | 14 | 6 | 7 | 121 |

Sketchpad read 64,700 views, all of them certified rows, in 1,001 batched forward passes. Replies at the token cap:
0.8B thinking 217/220, 0.8B no thinking 174/220, 27B-FP8 93/220; of the 27B's 127 finished replies, 121 were exact.
