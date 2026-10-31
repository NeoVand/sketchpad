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

## Frontier (registered 31 Oct 2026, before any generation call)

Neo, 31 Oct 2026: "yes, add all 3: GPT 6.1 Sol (high), Claude Opus 5.5 (high) and Gemini 4 Argon (high)". Only the
providers' model-list endpoints have been called so far (no generation, no cost), to read the exact IDs.

### Models and settings

| system | API model ID | how it was found | reasoning "high" | cap (output incl. reasoning) | API |
|---|---|---|---|---|---|
| GPT-6.1 Sol | `gpt-6.1-sol` (no dated snapshot; `created` 2026-09-27 in `/v1/models`) | OpenAI `/v1/models`; model page developers.openai.com/api/docs/models/gpt-6.1-sol | `reasoning.effort = "high"` (values low, medium default, high, xhigh, max) | `max_output_tokens = 32768`; reasoning tokens count toward it (developers.openai.com/api/docs/guides/reasoning) | Responses API, official `openai` Python SDK |
| Claude Opus 5.5 | `claude-opus-5-5` | Anthropic model table (claude-api skill, platform.claude.com/docs/en/about-claude/pricing) | `output_config.effort = "high"`; thinking is always on for this model (adaptive); no `thinking` parameter sent | `max_tokens = 32768`; thinking tokens count toward it | Messages API, streamed, official `anthropic` Python SDK |
| Gemini 4 Argon | `gemini-4-argon` (model `version` 3.0 in the model list) | Gemini `/v1beta/models` (`outputTokenLimit` 32768, `thinking: true`); ai.google.dev/gemini-api/docs/models | `thinkingConfig.thinkingLevel = "high"` (values low, medium default, high) | `maxOutputTokens = 32768`; thought tokens count toward it (ai.google.dev/gemini-api/docs/thinking) | `generateContent`, official `google-genai` Python SDK |

- **Problems, prompt, scorer:** the same 220 problems (`problems.json`, seed 20261031), the same user turn, no system
  prompt; scored by `score.py` exactly as registered above (the last `\boxed{}` in the visible reply, else the last
  digit run in the final 300 characters, separators removed). Reasoning is hidden by these APIs, so the visible reply
  is the whole reply.
- **The cap:** 32,768 output tokens including reasoning, as for Qwen3.5-27B. A reply that stops at the cap (OpenAI
  `status: incomplete`, reason `max_output_tokens`; Anthropic `stop_reason: max_tokens`; Gemini `finishReason:
  MAX_TOKENS`) is wrong and counted.
- **Sampling:** each provider's defaults; one sample per problem; no sampling parameters are sent (these reasoning
  models reject or ignore them).
- **No fallback model:** Anthropic's server-side refusal fallback is not enabled, because a fallback model would
  answer in Claude Opus 5.5's place. A refusal (`stop_reason: refusal`) counts as no answer and is reported.
- **Names in the paper:** the model's product name and the API ID, "accessed 31 October 2026"; GPT-6.1 Sol also with
  its listed creation date.

### Prices (per million tokens, standard tier, read 31 Oct 2026)

| model | input | output (incl. reasoning) | source |
|---|---|---|---|
| GPT-6.1 Sol | $2.00 | $10.00 | developers.openai.com/api/docs/pricing; developers.openai.com/api/docs/models/gpt-6.1-sol |
| Claude Opus 5.5 | $4.00 | $20.00 | platform.claude.com/docs/en/about-claude/pricing |
| Gemini 4 Argon | $2.00 | $10.00 (through 30 Nov 2026) | ai.google.dev/gemini-api/docs/pricing |

Worst case, every reply at the cap: 220 × 32,768 = 7.2 M output tokens per model, about $72 (GPT), $144 (Claude), $72
(Gemini), $288 in all, over the **$75 cap** for the three together.

### Pilot, projection and the cut rule

1. Pilot: 2 problems per model at the hardest lengths, the first + 1,000 problem (id 80) and the first × 20 problem
   (id 200). Tokens from the usage fields.
2. Projection: every one of the 220 problems is costed at the pilot's mean tokens per reply for its family (sums at
   the + 1,000 mean, products at the × 20 mean), an upper bound since shorter problems need fewer tokens.
3. If the projection for all three is at most $75, run all 220. If not, run 10 problems per length (the first 10 of
   each cell, 110 problems) if that projection is at most $75, and record the cut here before running. If neither
   fits, stop and write it in `QUESTIONS.md`.
4. Concurrency at most 8 requests per provider, exponential backoff on rate limits and server errors (up to 6
   retries); a reply that still fails is recorded as an error, not scored as wrong without saying so.
5. Actual cost from the usage fields at the prices above; raw replies kept in `baselines/raw/frontier/`.

### Predictions (share exact, before any reply)

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GPT-6.1 Sol (high) | 1 | 1 | 1 | 0.6 | 0.1 | 1 | 1 | 1 | 0.9 | 0.6 | 0.4 |
| Claude Opus 5.5 (high) | 1 | 1 | 0.95 | 0.5 | 0.05 | 1 | 1 | 1 | 0.85 | 0.5 | 0.3 |
| Gemini 4 Argon (high) | 1 | 1 | 0.95 | 0.5 | 0.05 | 1 | 1 | 1 | 0.85 | 0.5 | 0.3 |

The frontier models will likely solve the short problems; they fail, if at all, by the length of the work against a
32,768-token budget. Sketchpad's claim is the certificate at every length, not a win on short problems.

### Credential note (at registration)

`ANTHROPIC_API_KEY` in `~/.polyformer_keys` returns `401 authentication_error: invalid x-api-key` on `/v1/models`. The
OpenAI and Gemini keys work. Claude Opus 5.5 runs only after the key is replaced; until then its row stays "not run".

### Pilot result and the cut (31 Oct 2026, before the full run)

Pilot replies (`raw/frontier/*.jsonl`), usage fields, at the registered prices:

| model | + 1,000 (id 80): output tokens (reasoning), cost | × 20 (id 200): output tokens (reasoning), cost |
|---|---|---|
| GPT-6.1 Sol | 11,984 (11,640), $0.121 | 2,093 (2,070), $0.021 |
| Gemini 4 Argon | 28,517 (27,509), $0.289 | 9,358 (7,756), $0.094 |
| Claude Opus 5.5 | not run (key fails) | not run |

Projection by the registered rule (sums at the + 1,000 cost, products at the × 20 cost): GPT 100 × 0.121 + 120 × 0.021
= **$14.6**; Gemini 100 × 0.289 + 120 × 0.094 = **$40.2**. Claude Opus 5.5 could not be piloted; costed at the larger
of the two pilots' tokens per family at its own prices (28,517 and 9,358 output tokens at $20 per million): **$80.3**
(deviation: a projection from the other models, not its own pilot). All three at 20 per length: **$135**, over the
$75 cap. At **10 per length** (110 problems, the first 10 of each cell): $7.3 + $20.1 + $40.2 = **$67.6**, under it.

**The cut:** the frontier models run on the first 10 problems of each cell (`frontier_run.py full gpt gemini
--per-cell 10`). Claude Opus 5.5 runs the same 110 when its key works, after its own two-problem pilot; if its own
pilot projects the three over $75 in total, it stops there. The projection is an upper bound (short problems use far
fewer tokens), so the actual spend is expected well below it; extending to 20 per length later asks only the missing
problems.

### Frontier result (31 Oct 2026; per problem in `results.json`, raw replies in `raw/frontier/`)

Run 10 per length as registered after the pilot (110 problems), concurrency 8 per provider. Seven Gemini requests
failed at once on a client-side bug in the runner (a second SDK client was dropped and closed its connection pool;
fixed with a lock); they cost nothing and were asked again, and every problem has exactly one scored reply.

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GPT-6.1 Sol (high), exact / 10 | 10 | 10 | 10 | 9 | 9 | 10 | 10 | 10 | 10 | 10 | 10 | 108 / 110 |
| Gemini 4 Argon (high), exact / 10 | 10 | 10 | 10 | 9 | 5 | 10 | 10 | 10 | 10 | 10 | 10 | 104 / 110 |
| GPT-6.1 Sol, replies at the cap | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Gemini 4 Argon, replies at the cap | 0 | 0 | 0 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| GPT-6.1 Sol, median output tokens | 73 | 244 | 1,872 | 3,468 | 12,752 | 29 | 77 | 146 | 556 | 788 | 1,721 | |
| Gemini 4 Argon, median output tokens | 632 | 2,004 | 5,152 | 13,206 | 32,211 | 313 | 1,266 | 2,838 | 4,262 | 7,408 | 12,161 | |

- **GPT-6.1 Sol's two errors:** id 64 (+ 300), four wrong digits in a 301-digit answer; id 84 (+ 1,000), every digit
  wrong from the 73rd from the right on (523 of 1,001). Both replies finished well inside the budget (3,212 and
  10,162 tokens).
- **Gemini 4 Argon's six misses:** five replies ran out of budget (ids 63, 83, 84, 86, 87); id 82 (+ 1,000) finished
  with 872 wrong digits from the 25th on.
- **Claude Opus 5.5:** not run (the key fails; `QUESTIONS.md` 13).
- **Spend, from the usage fields at the registered prices:** GPT-6.1 Sol $2.18 (215,663 output tokens), Gemini 4
  Argon $8.27 (820,188), **$10.46 in all** of the $75 cap; the projection's upper bound was $27.4 for these two.

Against the predictions: both are better than predicted on long sums and products (GPT 0.9 at + 300 and + 1,000
against 0.6 and 0.1 predicted; both 1.0 on every product length against 0.3–0.9).

### Extension to 20 per length (31 Oct 2026, before the run)

The 110-problem run cost $10.46 against the projection's $27.4 upper bound for these two models (the three-model
projection at 10 per length was $67.6). The cut rule allows extending by asking only the missing problems, so GPT-6.1
Sol and Gemini 4 Argon now run the other 10 problems of every cell (`frontier_run.py full gpt gemini`; the 110
already answered are not asked again), making every baseline 20 per length. Expected cost: about the first half's,
$10–12, for a total near $21, inside the same $75 cap; the run stops if the running total passes $60, leaving room
for Claude Opus 5.5. Same models, settings, prompt, cap and scorer. Claude Opus 5.5 waits for a working key.

## Ten comparison models (registered 31 Oct 2026, before any further generation call)

Neo, 31 Oct 2026: "just do 10 models in total, use a barchart maybe? like the ones ppl use in benchmarks". The
comparison is Sketchpad against ten models, every one on the same 220 problems (20 per length), prompt, scorer and
32,768-token cap including reasoning:

| tier | model | setting |
|---|---|---|
| frontier | GPT-6.1 Sol (`gpt-6.1-sol`) | reasoning effort high (above) |
| frontier | Claude Opus 5.5 (`claude-opus-5-5`) | effort high (above) |
| frontier | Gemini 4 Argon (`gemini-4-argon`) | thinking level high (above) |
| Qwen | Qwen3.5-27B (FP8 release) | thinking (done) |
| Qwen | Qwen3.5-0.8B | its better setting, no thinking (23/220, done); the thinking run (3/220) stays in Extended Data |
| open, Ollama cloud | `gpt-oss:120b`, `deepseek-v4-pro:0813`, `kimi-k3`, `glm-5.3`, `gemma4:31b` | highest reasoning (below) |

`nemotron-3-super` and `mistral-large-4`, suggested earlier, are dropped by Neo's choice; neither has been called.

### Claude Opus 5.5 (the key now works: `/v1/models/claude-opus-5-5` returns 200, `created_at` 2026-09-21)

Its own two-problem pilot first (ids 80 and 200), then 20 per length if the three frontier models' total projects
within $75: spend on record (GPT-6.1 Sol and Gemini 4 Argon at 20 per length when their extension ends) plus Claude's
projection by the registered rule (100 × its + 1,000 cost + 120 × its × 20 cost). Else 10 per length, and the
paper's comparison says so for Claude. The runner refuses new requests past $60 of frontier spend in all.

### The open tier through Ollama cloud

API `https://ollama.com/api/chat` with `Authorization: Bearer $OLLAMA_API_KEY`, through the official `ollama` Python
package (`Client(host="https://ollama.com")`), `stream=False`, the registered user turn, no system prompt, provider
default sampling, `options.num_predict = 32768` (Ollama counts every generated token, thinking included, in
`eval_count`). The answer is scored on `message.content`; `message.thinking` is kept in the raw file. A reply with
`done_reason: "length"` is at the cap. Concurrency 2 per model; exponential backoff on 429 and 5xx, up to 6 retries; a
request that still fails is recorded as an error and not scored. Cost $0 on the free tier; `prompt_eval_count` and
`eval_count` are recorded.

The 25 models in `https://ollama.com/api/tags` on 31 Oct 2026: `beam`, `muse-spark-open`, `glm-5.3`,
`deepseek-v4-pro:0813`, `deepseek-v4.1-flash`, `gemma4:31b`, `nemotron-3-ultra`, `glm-5.3-flash`, `kimi-k3`,
`kimi-k2.7-code`, `minimax-m3.1-flash`, `nemotron-3-super`, `nemotron-3-nano:30b`, `mimo-v2.6-flash`,
`mistral-large-4`, `clef:27b`, `mimo-v2.6-pro`, `gpt-oss:120b`, `gpt-oss:20b`, `glm-5.2`, `minimax-m2.7`, `minimax-m3`,
`deepseek-v4.1-flash:1017`, `kimi-k2.6`, `mistral-large-3:675b`.

The five, from `https://ollama.com/api/show` (no generation):

| model | parameters (Ollama) | weights | capabilities | reasoning setting | Ollama `modified_at` |
|---|---|---|---|---|---|
| `gpt-oss:120b` (OpenAI) | 116.8 B (mixture of experts) | MXFP4 | completion, tools, thinking | `think: "high"` | 2025-08-05 |
| `deepseek-v4-pro:0813` (DeepSeek) | 1,650 B | FP8 | completion, tools, thinking | `think: true` | 2026-08-13 |
| `kimi-k3` (Moonshot AI) | 2,812 B | MXFP4 | vision, thinking, completion, tools | `think: true` | 2026-07-27 |
| `glm-5.3` (Z.ai) | 753 B | FP8 | completion, thinking, tools | `think: true` | 2026-08-28 |
| `gemma4:31b` (Google) | 32.7 B dense | BF16 | completion, thinking, tools, vision | `think: true` | 2026-04-02 |

These are "open" by weights; three of them (DeepSeek, Kimi, GLM) are larger than any frontier model's published
size, so the tier is defined by access (open weights, free endpoint), not by size.

### Predictions (before any reply from these six)

| model | exact / 220 | + 1,000 (of 20) | × 20 (of 20) |
|---|---|---|---|
| Claude Opus 5.5 (high) | 200 | 4 | 12 |
| `gpt-oss:120b` (high) | 165 | 1 | 6 |
| `deepseek-v4-pro:0813` | 195 | 8 | 14 |
| `kimi-k3` | 190 | 6 | 12 |
| `glm-5.3` | 185 | 5 | 10 |
| `gemma4:31b` | 120 | 0 | 1 |

### Claude Opus 5.5 pilot (31 Oct 2026, before its full run)

+ 1,000 (id 80): 8,737 output tokens, $0.178; × 20 (id 200): 2,661 tokens, $0.053. Projection at 20 per length
by the registered rule: 100 × 0.178 + 120 × 0.053 = **$24.2**. With GPT-6.1 Sol and Gemini 4 Argon at $18.6 on record
and about $21 when their extension ends, the three total about **$45**, inside $75: Claude Opus 5.5 runs all 220.

### Results at 20 per length (31 Oct 2026; per problem in `results.json`)

| system | + 10 | + 30 | + 100 | + 300 | + 1,000 | × 2 | × 4 | × 6 | × 10 | × 15 | × 20 | total | at cap | cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GPT-6.1 Sol (high) | 20 | 20 | 20 | 18 | 19 | 20 | 20 | 20 | 20 | 20 | 20 | **217** | 0 | $4.56 |
| Claude Opus 5.5 (high) | 20 | 20 | 20 | 19 | 17 | 20 | 20 | 20 | 20 | 20 | 20 | **216** | 0 | $9.17 |
| Gemini 4 Argon (high) | 20 | 20 | 20 | 18 | 9 | 20 | 20 | 20 | 20 | 20 | 20 | **207** | 9 | $16.30 |

All three are exact on every product length; every miss is a sum of 300 or 1,000 digits. GPT-6.1 Sol's misses (ids 64,
71, 84) and Claude Opus 5.5's (ids 64, 83, 90, 93) ended inside the budget with 1 to 637 wrong digits; 9 of Gemini 4
Argon's 13 misses hit the cap. Frontier spend **$30.03** of the $75 cap (stop at $60 never reached). Against the
predictions: all three are better than predicted (Claude 216 against 200; its + 1,000 17 against 4 and × 20 20 against
12).

**Open tier:** not run. `/api/chat` returns 402 "Add usage credits or subscribe" for all five models (`QUESTIONS.md` 14).

### Open tier: usage and the stop (31 Oct 2026, before any further Ollama call)

Neo subscribed to Ollama Pro ($60 of usage credit a month). Rates from `https://ollama.com/pricing` (read 31 Oct
2026; "Prices are per million tokens"; "Usage is measured in tokens at each model's rates"):

| model | input | output | note |
|---|---|---|---|
| `gpt-oss:120b` | $0.15 | $0.60 | |
| `deepseek-v4-pro:0813` | $1.32 | $3.96 | peak rate; off-peak $0.66 / $1.98 (outside 12:00–18:00 UTC on weekdays, all weekend) |
| `kimi-k3` | $3.00 | $15.00 | |
| `glm-5.3` | $1.40 | $4.40 | |
| `gemma4:31b` | $0.14 | $0.40 | the page lists `gemma4` |

Usage per reply is costed as `prompt_eval_count` × input + `eval_count` × output (thinking included), at the peak
rate for DeepSeek, so the recorded usage is an upper bound on what Ollama meters.

1. Pilot: ids 80 (+ 1,000) and 200 (× 20) per model.
2. Projection by the registered rule (100 × the + 1,000 cost + 120 × the × 20 cost per model). If the five project
   over **$55**, the most expensive models are cut to 10 per length (the first 10 of each cell), largest projected
   cost first, until the total projects under $55; the cut is recorded here before the run. If even that does not fit,
   stop and write it in `QUESTIONS.md`.
3. The runner refuses new Ollama requests once the recorded Ollama usage passes $55.

### Open-tier pilot and projection (31 Oct 2026): over the stop, not run further

| model | + 1,000 (id 80): output tokens, usage | × 20 (id 200): output tokens, usage | projection, 220 | projection, 110 |
|---|---|---|---|---|
| `gpt-oss:120b` | 32,768 (cap), $0.020 | 32,768 (cap), $0.020 | $4.34 | $2.17 |
| `deepseek-v4-pro:0813` | 32,768 (cap), $0.131 | 6,043, $0.024 | $15.95 | $7.97 |
| `kimi-k3` | 32,768 (cap), $0.494 | 7,283, $0.110 | $62.57 | $31.29 |
| `glm-5.3` | 32,768 (cap), $0.146 | 32,768 (cap), $0.144 | $31.90 | $15.95 |
| `gemma4:31b` | 32,768 (cap), $0.013 | 19,494, $0.008 | $2.28 | $1.14 |
| **all five** | | | **$117.04** | **$58.52** |

By the registered rule the cut to 10 per length does not bring the five under $55 either ($58.52), so the open tier
stops after its pilot (usage $1.10), and the decision goes to `QUESTIONS.md` 15. Seven of the ten pilot replies ran
to the 32,768-token cap.
