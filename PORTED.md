# Ported from polyformer

One line per file brought over from [NeoVand/polyformer](https://github.com/NeoVand/polyformer), with the commit it
came from. After a file is ported it changes only here; the polyformer copy is frozen.

| Here                                                                | In polyformer                | Commit     | Notes                                        |
| ------------------------------------------------------------------- | ---------------------------- | ---------- | -------------------------------------------- |
| `src/routes/layout.css`                                             | `src/routes/layout.css`      | `441e3283` | design tokens; SET card colours removed      |
| `src/lib/ui/Icon.svelte`                                            | `src/lib/ui/Icon.svelte`     | `441e3283` |                                              |
| `src/lib/assets/favicon.svg`                                        | `src/lib/assets/favicon.svg` | `441e3283` | placeholder until Sketchpad has its own mark |
| `src/lib/ui/TopBar.svelte`                                          | `src/lib/ui/TopBar.svelte`   | `441e3283` | rewritten: Paper and Demo only               |
| `eslint.config.js`, `prettier.config.js`, `tsconfig.json`, `.npmrc` | same paths                   | `441e3283` |                                              |
| `.github/workflows/deploy.yml`                                      | same path                    | `441e3283` |                                              |
| `AGENTS.md`                                                         | `AGENTS.md`                  | `441e3283` | plus "This repository"                       |

## Still to port (after the SKETCHPAD3 streams land)

- the demo runtime and page: polyformer `src/lib/sketchpad/**`, `src/routes/sketchpad/**`, `static/sketchpad/`
  (sprites), with the pinned transformers.js 4.2.0 alias;
- the work-order runtime: `src/lib/sketchpad/program/**` (branch `program`);
- the scripts that reproduce shipped numbers: training (`research/sketch/e2_column.py`, `e4_*`, `e5_union.py`,
  `e6_slots.py` and E7/E8), the Modal app, ONNX patching (`patch_onnx_lora.py`, `patch_onnx_inside.py`), inside
  assets and the certificate tools;
- the Lean package for the theorems the paper states;
- the glossary (`research/meta/GLOSSARY.md`), trimmed to the terms the paper and page use.
