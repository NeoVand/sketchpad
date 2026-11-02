# WRITE: the paper, properly

Neo, 31 Oct 2026: "When are we writing the paper? All I see is an outline ... I expect you to write a gorgeous paper
with really beautiful figures and everything."

You write the full paper. Another agent builds the figures from `paper/FIGURES.md`, in the same worktree; you both
follow that plan. You may refine a panel there, and say so in your commit message.

- **Worktree:** `/Users/neo/repos/sketchpad-wt/paper`, branch `paper`, cut from sketchpad `main` at `8d60ecb`.
- **Commits:** commit only your own paths, never with `git add -A`. The figure agent commits `paper/figures/**` and
  `static/figures/**`.
- **Pushing:** push nothing; the orchestrator merges and publishes.

## What to produce

1. **One source, two outputs.**
   - The paper's text lives in `paper/paper.md`: Markdown with `$…$` and `$$…$$` maths, `[@key]` citations, figure
     blocks that point at `static/figures/*.svg` (web) and `paper/figures/out/*.pdf` (LaTeX), tables and theorem
     blocks. References go in `paper/refs.bib`.
   - The site's paper page (`/`, today the skeleton in `src/routes/+page.svelte` and `src/lib/paper/outline.ts`)
     renders `paper.md` at build time: KaTeX, numbered figures, theorems, citations and references, a text column
     with a margin column, light, Cobalt and Rose. Make it beautiful; it is the face of the work.
   - A small converter (`paper/build-tex.ts` or similar) writes `paper/tex/main.tex` from the same source.
   - `tectonic` is installed (`/opt/homebrew/bin/tectonic`). Build `paper/tex/main.pdf` and check that it compiles
     cleanly. There is no pandoc on this machine.
2. **The paper itself.** About 4,500 words of main text plus Methods, in Nature's shape. Sections, from
   `paper/OUTLINE.md`:
   1. Introduction
   2. The sheet machine
   3. Certification: the four theorems Neo chose, stated precisely, with proof sketches and their Lean names
   4. A calculator on the sheet
   5. Algebra as written
   6. One model that decides
   7. Inside the model
   8. Related work
   9. Limits

   Then Methods, Extended Data and the appendix (the Lean package, the certificate format, reproduction).
3. **The abstract:** the problem, "Here we …", the results with numbers, and what follows.

## Sources (read them; every number comes from one)

- **Sketchpad record (research archive):** `research/sketch/REPORT.md`, `research/sketch/CALC3.md`,
  `research/sketch/calc3_t3.json`, `research/sketch/chat/CHAT3.md` (on the research archive's `main`, merged; the chat stream
  is still running on the `chat` worktree at the research archive's chat worktree).
- **Plans and prior-art gates:** `research/meta/SKETCHPAD.md`, `SKETCHPAD2.md`, `SKETCHPAD3.md`,
  `research/meta/sketchpad3/*`, `research/audit/sketchpad3_gate/out.md` (the prior-art gate: which sentences are
  allowed), and `research/meta/META_REPORT.md` ("What survives": the theorem prior art is "partially known": Moore
  1956, Cai 2017, Lewandowski 2026, Abbe 2024).
- **This repo:** `src/lib/sketchpad/program/NOTES.md` (algebra costs and refusals), `src/lib/sketchpad/**` (the
  runtime as built).
- **The Lean package:** the research archive (branch `lean-p`), with its
  `README.md` and `STATUS.md`. Before stating a theorem, check that its Lean statement compiles with 0 `sorry`. The
  memory note says elan and Lean 4.35 are at `~/.elan` and not on PATH; check with `#print axioms`.
- **The glossary:** the research archive's `research/meta/GLOSSARY.md`. Use its plain definitions.
- **Earlier paper work, for voice and figure taste:** the research archive's `research/FIG_V6_BRIEF.md` and
  `research/PAPER_V2_PLAN.md`.

## Rules (Neo's)

- **Voice.** Active and owning: "we certify", "we prove", "we show". Name the method (Sketchpad) and use the name.
  State findings; never narrate the project's history. Limits are stated once, plainly. No sentence talks about the
  paper ("this section describes …").
- **Novelty.** Every "first", "new" or "not found" is either verified against a live search, with its source, or
  removed. Use only the sentences the prior-art gate allowed. Theorem P and no-finite-test are routine lifts of known
  results (Moore 1956; Cai et al. 2017): state them, credit them, and do not sell them.
- **Citations.** Every reference is real, and you check it: fetch its arXiv or DOI page, and confirm authors, title
  and year. Keep the verification log in `paper/refs_verified.md`. Write a very good literature review: neural
  arithmetic (Neural GPU, NALU, the length-generalisation work), tool use and program-aided reasoning (Toolformer,
  PAL, ToRA, ReTool), verification of networks on finite input sets, procedure-stepping LLMs (CAEF), vision-language
  models reading rendered text, and continual learning for the gate (LwF, progressive networks, X-LoRA, RL's Razor,
  on-policy distillation).
- **Numbers.** Every number traces to a record file. Keep a `paper/numbers.md` table: claim, value, source path and
  line. If records disagree, say so to the orchestrator; do not pick one silently.
- **Plain words.** Define every term at first use, in a sentence; the reader knows what a neural network is, and
  little more.
- **What is not done.** The chat section reports what is true today (the gate is exact; the fine-tune is in progress,
  with its current best numbers) and is easy to update. The same holds for irrational roots in algebra, which Codex
  is fixing.

## Baseline runs (only if the paper needs them)

Figure 1c needs a baseline: share exact against digits for the strongest alternatives, for example stock
Qwen3.5-0.8B with chain of thought and a larger open model. If no record has it:

1. Register the run first, in `paper/BASELINES.md`: what, how scored, predictions.
2. Run it on Modal, not the M4, with a cap of $15.
3. Frontier models through an API: only if you can justify it, cap $10. Keys are in the local keys file; never print,
   log or commit them.
4. Report the spend.

## Report

When the draft is complete and the page and PDF build, report in under 300 words:

- the word count;
- the sections;
- what is still waiting on a result;
- the citations verified;
- the numbers table;
- any record conflicts;
- the paths to screenshots of the page (1440 and 375) and to the PDF.
