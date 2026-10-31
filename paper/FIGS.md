# FIGS: beautiful figures for the paper

Neo, 31 Oct 2026: "We had made amazing figures in the past and got inspiration through using the image generation
model of OpenAI, the GPT Image 2.5 Sunburst. I expect you to write a gorgeous paper with really beautiful figures and
everything."

You build the figures in `paper/FIGURES.md`; read it first. That file is the plan. A writer agent works in the same
worktree, writing the text from the same plan.

- **Worktree:** `/Users/neo/repos/sketchpad-wt/paper`, branch `paper`.
- **Your paths:** `paper/figures/**`, `static/figures/**` and `paper/figstyle/**`. Commit only those, never with
  `git add -A`.
- **Pushing:** push nothing.

## Process (Neo's, from polyformer `research/FIG_V6_BRIEF.md`; read it for his taste)

1. **Style.** Copy polyformer `research/figstyle/` (palette.json, palette.py, nmi.mplstyle) to `paper/figstyle/`.
   Maths in matplotlib uses `math_fontfamily="cm"`, and tick labels are Helvetica.
2. **Inspiration.** Use the OpenAI Images API with `gpt-image-2.5-sunburst` only. Source `~/.polyformer_keys` in the
   shell, and never print, log or commit a key.
   - Write a long, explicit prompt for each figure: its content, panels, layout, the palette (Cobalt and Rose, white),
     typography, mood, and references (Nature, Quanta, Distill).
   - Make 2–4 variants per figure. Save each image with its prompt in `paper/figures/inspiration/`, which is
     git-ignored, and keep a contact sheet.
   - Cap $25. These images are references only. No generated pixel enters a figure.
3. **Build.**
   - Data panels in matplotlib, from the record files.
   - Schematics by hand in SVG, with deliberate typography and geometry: the sheet, the lens, the tree of runs folding
     onto the views, the gate.
   - Real sheet pixels come from the runtime's own sprite renderer (`src/lib/sketchpad/sprites.ts` and
     `sheet-view.ts`). Render them by script so the views in the figures are the model's true inputs.
   - 3D in Blender only where it earns its place. Blender 5.2 runs headless with `Blender -b -P script.py`; use
     absolute render paths.
4. **Data.**
   - Margins are in the certificate (`static/sketchpad/models/arithmetic/certificate.json` in polyformer, or the
     pinned Hugging Face revision `2df87172`, whose file is already on disk).
   - T3 timings: `research/sketch/calc3_t3.json`.
   - Algebra: `src/lib/sketchpad/program/NOTES.md` and its metrics.
   - The logit lens and maps: the inside data.
   - Chat: `research/sketch/chat/CHAT3.md`.
   - If a panel needs data no record has, say so to the orchestrator; never invent it. Figure 1c's baseline will come
     from the writer's registered baseline run (`paper/BASELINES.md`). Draw the panel with Sketchpad's own series and
     leave the baseline series to fill in.
5. **Deliver.** For each figure:
   - `static/figures/figN.svg`, for the light web page at about 700 px column width;
   - `paper/figures/out/figN.pdf`, vector, at 180 mm;
   - the script that makes both;
   - a contact sheet of all figures at 1440 px.

   Check every label against the data with an assertion in the script, and keep every label off every line.

## Report

In under 250 words: each figure's paths, which inspiration image fed which idea (with paths), the spend, and any
panel that is waiting on data.
