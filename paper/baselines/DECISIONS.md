# Decisions fixed before any reply was scored

Written 31 Oct 2026 (UTC 03:20), after the jobs were spawned and before any output was read. `BASELINES.md` is not
changed; these are the points it leaves open, and the rule for the 27B slot.

## The 27B slot

The registration asks for the largest dense Qwen3.5 that runs on one H100 under vLLM (Qwen3.5-27B, bf16), else
`Qwen/Qwen3.5-27B-FP8`, else Qwen3.5-9B. The bf16 weights are 55.6 GB, which leaves about 15–20 GB of an 80 GB H100 for
the KV cache and the Gated DeltaNet states, so it may load and still be too slow to finish 220 thinking replies at a
32,768-token cap inside the $15 cap.

Rule: a probe job loads bf16 27B (`probe_27b`), records vLLM's KV-cache size and times decoding on a synthetic prompt
(no problem of the set is sent) at batches 8, 32 and 96. The registered worst case is every reply at the cap:
220 × 32,768 = 7.21 M new tokens. Its time is bounded below by 7.21 M ÷ (the measured throughput at the largest
measured batch the KV cache can hold at the 36,864-token context; short-context throughput, so optimistic). bf16 is
used if that bound costs no more than the budget left under the $13 stop line, less $1 kept for the other jobs;
otherwise the FP8 release, as the registration's fallback, recorded as a budget deviation. If FP8 fails to load,
Qwen3.5-9B. The 27B job runs with a deadline at the budget line; any reply it has not finished by then is reported as
not run, never scored.

## Scoring (also in `score.py`)

- "After the thinking block" means after the last `</think>`. In thinking mode a reply with no `</think>` has nothing
  after the thinking block, so no answer (counted). In no-thinking mode the template has already closed the block, so
  the whole generation is the reply.
- Inside the last `\boxed{…}` (braces matched), separators between digits are removed and the answer is the last run
  of digits (for a box holding one integer, that integer).
- The 300-character fallback takes the last digit run as it lies inside the final 300 characters of the reply (after
  separators are removed). `score.py` also reports any reply whose exactness would change if a run cut by the
  window's left edge were taken whole.
- Sampling as registered: no presence penalty. (Qwen's model card pairs the no-thinking setting T 0.7 / top-p 0.8 with
  presence penalty 1.5 for vision-language tasks; the registration does not list it, so it is 0 here.)
- Seeds: per request, 20261031 + problem id (0–219), the same for both modes and every model.

## Sketchpad

The adapter is the published file (`mohsenvand/sketchpad-0.8b-preview` at `2df87172`, `arithmetic/adapter`,
sha256 `453ae613…`), downloaded in the job and checked, on the base whose weights hash to `04b1c301…` (= Qwen3.5-0.8B,
the same file the stock 0.8B runs use). fp32 PyTorch as in the polyformer E7 evaluation; flash-linear-attention kernels
as in the E7 training and evaluation image. The certificate (2,446 rows) is recomputed in the job before any problem.
