# Sketchpad

A small vision-language model that computes exactly on its own sheet. Qwen3.5-0.8B, through one small adapter,
reads a rendered sheet three cells at a time and writes every digit itself, one forward pass per step; the sheet is
its only memory. Every view it can meet is certified, and the page re-checks the weakest of them on your GPU.

- **Paper and demo:** <https://neovand.github.io/sketchpad/> (the paper is a skeleton while the text is written; the
  demo still runs at <https://neovand.github.io/polyformer/sketchpad/> until it is ported).
- **Weights:** [mohsenvand/sketchpad-0.8b-preview](https://huggingface.co/mohsenvand/sketchpad-0.8b-preview) (the
  browser program) and [mohsenvand/sketchpad-0.8b-runs](https://huggingface.co/mohsenvand/sketchpad-0.8b-runs)
  (every training run with its evaluation).
- **History:** the research that led here is in [NeoVand/polyformer](https://github.com/NeoVand/polyformer);
  `PORTED.md` lists every file brought over and the commit it came from.

```bash
pnpm install
pnpm dev
```

Layout: `src/routes/+page.svelte` is the paper, `src/routes/demo/` the demo, `paper/` the writing plan, `research/`
the scripts that reproduce the paper's numbers.

Code and text are licensed under the Apache License 2.0 (`LICENSE`). The weights on Hugging Face carry their own license.
