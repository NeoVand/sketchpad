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
