# QUESTIONS: decisions the paper needs

From the paper's writer, 31 Oct 2026. Each item says what the draft does today, so nothing is blocked.

## Record conflicts (I did not pick silently; the draft uses the value marked)

1. **T3 wall time against the cost model.** `research/sketch/CALC3.md` line 285 says the median ratio is 1.02 (range
   0.76–1.38). The per-problem record `research/sketch/calc3_t3.json` gives 1.0146 (range 0.755–1.380), which rounds to
   1.01; Figure 2c also prints 1.01. **Draft: 1.01**, from the per-problem record.
2. **The class-mean push in E5.** `research/sketch/REPORT.md` line 56 says SUM 8/80 at layer 19 and 77/80 at layer
   20. `research/sketch/steer.json`, which Figure 6c draws, has SUM 8/80 at 18 and 75/80 at 20, and no value at 19.
   **Draft: steer.json** (8/80 after depth 18, 75/80 after depth 20). The E7 numbers (79/80, 80/80 after depth 20)
   are from `CALC3.md` line 130 and agree everywhere.

## Theorems

3. **The fourth theorem's name.** The outline calls it "Cache policy: when a certificate measured on one device
   carries to another". In the Lean package these are two results: Corollary P2 (`sel_eq_of_close`,
   `regeneration_of_close`: a certificate with margin above 2τ carries to any path within τ) and the cache policy
   (`policy_tick_eq`: decoding through a cached prefix with eviction gives the pinned step's logits). **Draft:**
   Theorem 4, "Transfer across code paths", states Corollary P2 and cites the cache policy in its proof as a path
   with τ = 0. Confirm, or say which you meant.
4. **Theorem P in sheet form is a new Lean file.** The package states Theorem P for (state, event) tokens. The sheet
   form (the state is the whole configuration; the model reads only a view) is `paper/lean/Sheet.lean`
   (`Sketchpad.sheet_exact_iff`, `Sketchpad.sheet_certified`), proved by instantiating the package's
   `regeneration_trace_iff`; it compiles against `lean-p` at `a114d08b` with axioms `propext`, `Quot.sound`. Should
   it move into the package on `lean-p`?

## Figures

5. **Figure order.** Nature numbers figures in order of first mention. The sections run 6 (the gate) then 7 (inside),
   so in the text `fig6.svg` (the gate) is **Fig. 5** and `fig5.svg` (inside) is **Fig. 6**. Either the figure agent
   renames the files, or the two sections swap. **Draft:** order of the outline; file names untouched. The gate figure
   stays in the main text although chat has not passed (FIGURES.md allowed moving it to Extended Data): panel a, the
   bit-for-bit gate, is a result today.
6. **Figure 1c has no baseline series yet.** It reads `paper/figures/data/baselines.json`, which is in the figure
   agent's path. The registered run is done (`paper/baselines/results.json`, `RESULT.md`): Sketchpad 220/220,
   Qwen3.5-27B-FP8 with thinking 121/220, Qwen3.5-0.8B 3/220 thinking and 23/220 without. Sums (10–1,000 digits) and
   products (2–20 digits) are two families; one x axis "digits per number" needs two series per system or two small
   panels. The caption in the draft already describes the panel with the baselines.
7. **Figure 6c (inside) labels its dashed line "layer 19 full attention"** (0-based layer index), while the text counts
   depth as layers applied (the full-attention layers end at depths 4, 8, …, 24; the push works after depth 20).
   Suggest the label "full attention, ends at depth 20".

## Content

8. **Author line and affiliation.** The draft says "Author line to be confirmed".
9. **A frontier baseline?** Not registered (BASELINES.md says why: the claim is a certificate at any length). If you
   want GPT- or Claude-class models on the same 220 problems, it is a separate registration, about $10 by API.
10. **"What we did not find"** uses the prior-art search of 30 Oct (50 abstracts; `research/audit/sketchpad3_gate`).
    The sentence on algebra is updated from "evaluation and Kronecker substitution" to textbook algebra; the gate's
    reason ("every arithmetic step by a learned, certified executor") is unchanged. A fresh live search before
    posting would cost about an hour.
11. **The chat section is a status note** (P6 today: IFEval at stock, recall 0.991; word 0.856, GSM8K −2.4, MMLU −2.2
    short of their bars). P7 is running on `chat`; when it reports, update the `::: status` block in
    `paper/paper.md` §6 and Extended Data Table 4.
12. **The PDF is not linked from the page.** `paper/tex/main.pdf` builds; serving it needs a copy under `static/` at
    publish time. Say if you want the link.

## Decided by Neo (31 Oct 2026)

- Author line: Mostafa 'Neo' Mohsenvand, MIT Media Lab.
- The fourth theorem as "Transfer across code paths" (sel_eq_of_close, regeneration_of_close, policy_tick_eq): "ok".
- Frontier baselines in Figure 1c: "yes, add all 3: GPT 6.1 Sol (high), Claude Opus 5.5 (high) and Gemini 4 Argon (high)".

## Frontier baseline (31 Oct 2026)

13. **The Anthropic key does not work.** `ANTHROPIC_API_KEY` in the local keys file returns `401
    authentication_error: invalid x-api-key` (request `req_011CgZmVoEiQanpe2F6jQExw`, `/v1/models`). The OpenAI and
    Gemini keys work. Claude Opus 5.5 is registered (`BASELINES.md`, "Frontier") but cannot run until the key is
    replaced; `frontier_run.py full claude` then runs it with nothing else to change. Until then the paper says
    "not run" for it.

14. **The Ollama key cannot generate.** `https://ollama.com/api/tags` and `/api/show` return 200, but every
    `/api/chat` call returns **402 "Add usage credits or subscribe"** (one smoke request per model on problem 0, all
    five models, 31 Oct; the errors are in `paper/baselines/raw/frontier/ollama_*.jsonl`, not scored). The open tier is
    registered (`BASELINES.md`, "Ten comparison models") and the runner is ready (`frontier_run.py full ollama`).
    Options, by what each breaks:
    - **Add Ollama credits** (Neo's account; a purchase only Neo can make). Breaks nothing; cost unknown until the
      plan page is read; 5 × 220 replies of up to 32,768 tokens.
    - **Run the open weights on Modal with vLLM**, as for Qwen3.5-27B. `gpt-oss:120b` (117 B, MXFP4) and `gemma4:31b`
      (33 B) fit one H100, about $5–8 for both. `glm-5.3` (753 B, FP8) needs 8 GPUs, roughly $30–60;
      `deepseek-v4-pro` (1.65 T) and `kimi-k3` (2.8 T) need more than one 8-GPU node, which is expensive and slow to
      set up. Breaks the "free" premise; keeps the same weights.
    - **The labs' own APIs** (DeepSeek, Moonshot, Z.ai) with new keys. Cheap per token; breaks "one access route for
      the open tier" and needs keys Neo does not have here.
    - **Report the comparison with five models** (three frontier, two Qwen) until one of the above lands. The text
      and Extended Data Table 5 are written that way today, with the open tier marked as registered and not run.

15. **The open tier's pilot projects over the $55 stop.** Ollama's own rates (ollama.com/pricing), the registered
    upper-bound rule (every sum costed like the 1,000-digit pilot, every product like the 20-digit one): **$117** for
    the five at 20 per length, **$58.5** at 10 per length. Pilot usage so far $1.10; nothing else has run. Seven of the
    ten pilot replies hit the 32,768-token cap, so the hard cells will cost the cap and mostly fail. Kimi K3 is the
    expensive one ($15 per million output tokens: $62.6 of the $117). Options:
    - **Run with the running-usage stop only.** The projection is an upper bound: short problems use a few hundred
      tokens (GPT-6.1 Sol: 73 tokens at + 10 against 12,752 at + 1,000), and the frontier models' actual spend was
      22–45% of theirs. Expected about $30–50 for all five at 20 per length; the runner stops at $55, which could leave
      Kimi K3's longest cells unfinished. Breaks the registered projection rule.
    - **Four open models at 20 per length, Kimi K3 at 10.** Projects $54.5 + $31.3 = $85.8 as an upper bound; same
      caveat. Or **without Kimi K3**: the other four project $54.5, inside $55 even as an upper bound; breaks "ten
      models" (nine).
    - **DeepSeek at its off-peak rate** (today is a Saturday, off-peak all day): all five at 10 per length then
      project $54.5. Breaks the conservative peak-rate assumption, and leaves the open tier at 10 per length.
    - **More Ollama credit** beyond the Pro plan's $60, so the registered rule passes as is.

16. **The replacement for Kimi K3 does not fit either.** `mistral-large-4` (Mistral AI, 1,050 B, thinking; $0.70 /
    $2.10 per million) is the cheapest per output token of the three candidates, and both its pilot replies hit the
    32,768-token cap: projection $15.19 for 220, against $8.50 left. The other candidates cost more per output token
    (MiniMax-M3 $2.40, Nemotron-3-Ultra $3.00), so none fits under the cap-based upper bound. Five open models now
    project $61.69 at 20 per length (DeepSeek off-peak). Options:
    - **Cut GLM-5.3 to 10 per length** (the open tier's original cut rule, largest projected cost first): $45.74,
      inside $55. Four open models at 20 per length, GLM-5.3 at 10.
    - **Swap GLM-5.3 for Nemotron-3-Ultra** (NVIDIA, 550 B, $3.00 output against GLM's $4.40): about $51 if it caps like
      GLM; needs its own pilot. Changes a second model.
    - **Run all five at 20 per length with only the running $55 stop.** The projection prices every sum like the
      1,000-digit pilot; short problems use far fewer tokens, so the actual spend is likely lower, but these models
      often run to the cap, and the stop could leave the last problems unrun.
    - **More credit**, beyond the Pro plan's $60.
