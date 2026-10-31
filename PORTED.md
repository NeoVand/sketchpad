# Ported from polyformer

One line per file brought over from [NeoVand/polyformer](https://github.com/NeoVand/polyformer), with the commit it
came from. After a file is ported it changes only here; the polyformer copy is frozen.

| Here                                                                | In polyformer                                   | Commit     | Notes                                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `src/routes/layout.css`                                             | `src/routes/layout.css`                         | `441e3283` | design tokens; SET card colours removed                                                               |
| `src/lib/ui/Icon.svelte`                                            | `src/lib/ui/Icon.svelte`                        | `441e3283` |                                                                                                       |
| `src/lib/assets/favicon.svg`                                        | `src/lib/assets/favicon.svg`                    | `441e3283` | replaced (31 Oct) by Sketchpad's own mark, `static/logo/sketchpad-mark.svg`                           |
| `src/lib/ui/TopBar.svelte`                                          | `src/lib/ui/TopBar.svelte`                      | `441e3283` | rewritten: Paper and Demo only                                                                        |
| `eslint.config.js`, `prettier.config.js`, `tsconfig.json`, `.npmrc` | same paths                                      | `441e3283` |                                                                                                       |
| `.github/workflows/deploy.yml`                                      | same path                                       | `441e3283` |                                                                                                       |
| `AGENTS.md`                                                         | `AGENTS.md`                                     | `441e3283` | plus "This repository"                                                                                |
| `src/lib/sketchpad/adder.ts`                                        | `src/lib/sketchpad/adder.ts`                    | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/multiplier.ts`                                   | `src/lib/sketchpad/multiplier.ts`               | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/calc-sheet.ts`                                   | `src/lib/sketchpad/calc-sheet.ts`               | `d5eb4d79` | 31 Oct: display only (row names, phase, who wrote a cell, decimal places); the views are unchanged    |
| `src/lib/sketchpad/calc-tables.ts`                                  | `src/lib/sketchpad/calc-tables.ts`              | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/calc-task.ts`                                    | `src/lib/sketchpad/calc-task.ts`                | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/sheet-calc.ts`                                   | `src/lib/sketchpad/sheet-calc.ts`               | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/sprites.ts`                                      | `src/lib/sketchpad/sprites.ts`                  | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/sources.ts`                                      | `src/lib/sketchpad/sources.ts`                  | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/hash.ts`                                         | `src/lib/sketchpad/hash.ts`                     | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/inside.ts`                                       | `src/lib/sketchpad/inside.ts`                   | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/protocol.ts`                                     | `src/lib/sketchpad/protocol.ts`                 | `d5eb4d79` | device-loss messages; a certificate can resume from a row                                             |
| `src/lib/sketchpad/models.ts`                                       | `src/lib/sketchpad/models.ts`                   | `d5eb4d79` | the program (folder, revision, calculator) in one line; `HAS_CALC` follows it; dev-only local program |
| `src/lib/sketchpad/worker.ts`                                       | `src/lib/sketchpad/worker.ts`                   | `d5eb4d79` | watches the WebGPU device; a dev hook destroys it; resumable certificate                              |
| `src/lib/sketchpad/pad.svelte.ts`                                   | `src/lib/sketchpad/pad.svelte.ts`               | `d5eb4d79` | device-loss recovery; work orders (`runAlgebra`); shared sheet calculator                             |
| `src/lib/sketchpad/sheet-view.ts`                                   | `src/lib/sketchpad/sheet-view.ts`               | `d5eb4d79` | the model's writing drawn in rose on the display sheet                                                |
| `src/lib/sketchpad/theme.svelte.ts`                                 | `src/lib/sketchpad/theme.svelte.ts`             | `d5eb4d79` | light only: Cobalt and Rose for the canvases                                                          |
| `src/lib/sketchpad/panel.css`                                       | `src/lib/sketchpad/panel.css`                   | `d5eb4d79` | restyled                                                                                              |
| `src/lib/sketchpad/Sheet.svelte`                                    | `src/lib/sketchpad/Sheet.svelte`                | `d5eb4d79` | restyled, light only                                                                                  |
| `src/lib/sketchpad/Inset.svelte`                                    | `src/lib/sketchpad/Inset.svelte`                | `d5eb4d79` | restyled; the strip is shown as the model reads it                                                    |
| `src/lib/sketchpad/Machine.svelte`                                  | `src/lib/sketchpad/Machine.svelte`              | `d5eb4d79` | restyled                                                                                              |
| `src/lib/sketchpad/Lens.svelte`                                     | `src/lib/sketchpad/Lens.svelte`                 | `d5eb4d79` | restyled                                                                                              |
| `src/lib/sketchpad/StateSpace.svelte`                               | `src/lib/sketchpad/StateSpace.svelte`           | `d5eb4d79` | restyled                                                                                              |
| `src/lib/sketchpad/StateMap.svelte`                                 | `src/lib/sketchpad/StateMap.svelte`             | `d5eb4d79` | restyled, light only                                                                                  |
| `src/lib/sketchpad/Certificate.svelte`                              | `src/lib/sketchpad/Certificate.svelte`          | `d5eb4d79` | restyled, light only                                                                                  |
| `src/lib/sketchpad/Chat.svelte`                                     | `src/lib/sketchpad/Chat.svelte`                 | `d5eb4d79` | restyled                                                                                              |
| `src/lib/sketchpad/calc.spec.ts`                                    | `src/lib/sketchpad/calc.spec.ts`                | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/inside.spec.ts`                                  | `src/lib/sketchpad/inside.spec.ts`              | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/runtime.spec.ts`                                 | `src/lib/sketchpad/runtime.spec.ts`             | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/index.ts`                                | `src/lib/sketchpad/program/index.ts`            | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/parse.ts`                                | `src/lib/sketchpad/program/parse.ts`            | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/run.ts`                                  | `src/lib/sketchpad/program/run.ts`              | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/calc.ts`                                 | `src/lib/sketchpad/program/calc.ts`             | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/arithmetic.ts`                           | `src/lib/sketchpad/program/arithmetic.ts`       | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/algebra.ts`                              | `src/lib/sketchpad/program/algebra.ts`          | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/core.test.ts`                            | `src/lib/sketchpad/program/core.test.ts`        | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/algebra.test.ts`                         | `src/lib/sketchpad/program/algebra.test.ts`     | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/waves.test.ts`                           | `src/lib/sketchpad/program/waves.test.ts`       | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/populations.test.ts`                     | `src/lib/sketchpad/program/populations.test.ts` | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/cost-fixtures.json`                      | `src/lib/sketchpad/program/cost-fixtures.json`  | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/metrics.json`                            | `src/lib/sketchpad/program/metrics.json`        | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/round2-light.json`                       | `src/lib/sketchpad/program/round2-light.json`   | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/round2-strong.json`                      | `src/lib/sketchpad/program/round2-strong.json`  | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/verify_costs.py`                         | `src/lib/sketchpad/program/verify_costs.py`     | `d5eb4d79` |                                                                                                       |
| `src/lib/sketchpad/program/NOTES.md`                                | `src/lib/sketchpad/program/NOTES.md`            | `d5eb4d79` | PROGRAM stream report; its commit hashes are polyformer's                                             |
| `src/routes/demo/+page.svelte`                                      | `src/routes/sketchpad/+page.svelte`             | `d5eb4d79` | rebuilt: four parts, light; Calculate on with the calculator program; Algebra wired                   |
| `static/sketchpad/sprites.png`                                      | `static/sketchpad/sprites.png`                  | `d5eb4d79` | the training glyphs; byte for byte                                                                    |
| `static/sketchpad/sprites.json`                                     | `static/sketchpad/sprites.json`                 | `d5eb4d79` |                                                                                                       |
| `research/sketch/calc_tables.py`                                    | `research/sketch/calc_tables.py`                | `d5eb4d79` | writes the calculator's 651 rows (calc.spec.ts reads them)                                            |
| `research/sketch/calc_tables.json`                                  | `research/sketch/calc_tables.json`              | `d5eb4d79` | its output, unformatted                                                                               |
| `research/sketch/calc_dryrun.py`                                    | `research/sketch/calc_dryrun.py`                | `d5eb4d79` | the reference arithmetic `calc_tables.py` and `verify_costs.py` read                                  |
| `transformers-420` alias in package.json                            | `transformers-420` in package.json              | `d5eb4d79` | `npm:@huggingface/transformers@4.2.0`, the runtime the tables were verified on                        |
| `pnpm-workspace.yaml`                                               | `pnpm-workspace.yaml`                           | `d5eb4d79` | build scripts off for onnxruntime-node, protobufjs, sharp                                             |

## Left in polyformer

- The exploration pages and `src/routes/sketchpad/` itself (its page is now `src/routes/demo/`); the dark theme.
- The dev page's E7 folder (`arithmetic-e7`): the page loads programs from Hugging Face only (`models.ts`, `PUBLISHED`).

## Still to port

- the scripts that reproduce shipped numbers: training (`research/sketch/e2_column.py`, `e4_*`, `e5_union.py`,
  `e6_slots.py` and E7/E8), the Modal app, ONNX patching (`patch_onnx_lora.py`, `patch_onnx_inside.py`), inside
  assets and the certificate tools;
- the Lean package for the theorems the paper states;
- the glossary (`research/meta/GLOSSARY.md`), trimmed to the terms the paper and page use.
