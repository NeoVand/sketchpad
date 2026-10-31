# Figures: the plan both the text and the figures follow

Neo, 31 Oct 2026: "I expect you to write a gorgeous paper with really beautiful figures and everything."

House style is Cobalt and Rose (`paper/figstyle/palette.json`, copied from polyformer `research/figstyle/` at
`3185c95b`):

- rose for ours, cobalt for the strongest alternative, blue-greys (by dash pattern) for baselines, violet only for
  theory and reference lines;
- white backgrounds, white-ended colour maps;
- no default matplotlib look: no frames, legends, grids or titles; labels sit at line ends;
- equations as real LaTeX (Computer Modern maths);
- panels aligned on shared rows and gutters, captions below, no empty quadrants, no label on a line;
- schematics designed with taste, never boxes and arrows.

Every data panel is built from a record file named in its caption source. Every schematic is drawn by hand in SVG; 3D
is done in Blender only if it earns its place.

**Process.** Use the OpenAI Images API with `gpt-image-2.5-sunburst` only, for design inspiration: 2–4 variants per
figure, with long explicit prompts, saved with their prompts. **No generated pixel goes into the paper**, because
Nature does not accept AI-generated images. Each figure is delivered twice:

- an SVG for the web page, light, at the page's column width;
- a vector PDF for the arXiv build.

The sources are scripts under `paper/figures/`.

## Figure 1. The sheet: one tick, any length, one certificate

The opening figure, showing the contribution at once.

- **a.** A real long multiplication on the sheet, drawn from the runtime's own layout: the three-cell window, and the
  digit the model writes next in rose.
- **b.** One tick: three cells in, one forward pass of Qwen3.5-0.8B, one digit and the next move out. Drawn as a lens
  over the sheet, not as boxes.
- **c.** Exact at any length: share exact against digits (10 to 1,000 and more).
  - Sketchpad in rose, flat at 1.
  - The strongest alternative in cobalt; baselines in blue-grey.
  - The baseline data does not exist yet: see the run rule in the writing brief.
- **d.** The certificate: all 2,446 views as one grid, shaded by margin (white-ended rose), the lowest margin marked,
  and "exact on these ⇒ exact on every run" as the caption's claim.

## Figure 2. The sheet machine

- **a.** The five tables as views: add, multiply, subtract, estimate a quotient digit, lower the guess. For each, a
  real view (its pixels) and its answer.
- **b.** A procedure as a walk over tables: long division by Knuth's Algorithm D laid out on its sheet, with the step
  sequence. Square root beside it.
- **c.** Waves: independent jobs share forward passes. Then the cost model against measured time, a scatter with the
  identity line, from the T3 timings: 0.065 s per call plus 0.037 s per row.
- **d.** T3: 200 of 200 exact; time by operation as a strip plot with the 12 s line.

## Figure 3. Certification

- **a.** Theorem P, sheet form: every run of any length decomposes into views from a finite set, and exactness on the
  set is exactness everywhere. A designed diagram: an unbounded tree of runs folding onto the finite set of views.
- **b.** No finite test suffices once state leaves the sheet: the counterexample machine (hidden state) that passes
  every test up to N and fails at N + 1.
- **c.** Margins per table, all 2,446 views, as distributions. The device's recheck of the weakest tenth is overlaid.
- **d.** Across devices: margin in PyTorch against the margin on the M4 (WebGPU, fp16), a scatter; fp16 against q4.

## Figure 4. Algebra as written

- **a.** A derivation, factoring x³ − 6x² + 11x − 6, typeset. Every rose number is threaded to the small column sum or
  product that the model wrote on its sheet.
- **b.** Refusals under planted faults: wrong roots 200 of 200; corrupted arithmetic 92.5% (textbook) against 86.5%
  (evaluation); light and strong checks.
- **c.** Seconds per example, textbook against evaluation, from the cost model and measured on the M4, with the 12 s
  line.

## Figure 5. Inside the model

- **a.** The logit lens: confidence in the final answer at each of the 24 layers, per table, as a heat map. The answer
  takes the lead at a fixed depth.
- **b.** The state that writes the answer, on its 3D map (the page's state space), clustered by answer: SUM and MUL,
  plus the calculator families once their maps land.
- **c.** The push at layer 20: push strength against the share of next steps changed, a dose-response curve.

## Figure 6. One model that decides

- **a.** The gate: one graph input. At 0 the model is stock, bit for bit; at 1 it is the sheet machine.
- **b.** Instruction-following against multi-step reasoning across the chat runs, against stock: IFEval points against
  GSM8K points, with the bars as a region. This is the seesaw and the on-policy fix.
- **c.** Opening the sheet: precision and recall.

The text fills in as the CHAT stream reports. This figure may move to Extended Data if chat does not pass.

## Extended Data (candidates)

- the per-table margin tables;
- the full T3 table;
- the algebra cost table (rows and calls);
- the chat runs P1 to P7;
- the fault populations;
- the Lean statement list.
