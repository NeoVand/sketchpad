# Two controls a reviewer asked for

Two control experiments on Modal, for the Sketchpad paper. The budget is $5 in total, and nothing runs on the M4's GPU.

1. **The base model on the same views.** How well does the unadapted Qwen3.5-0.8B do on E7's 2,446 views, under the same pinned prompt?
2. **The push at every depth.** We add E7's class-mean intervention (the push) after every depth from 1 to 23.

## Registration (written 2026-10-31 18:24:50 CDT, before any spend)

### Predictions, verbatim from the brief

1. **Base zero-shot:** at most 5% of the 2,446 views pass; no table passes completely.
2. **Base 8-shot:** at most 30% of views pass; no table with more than 20 rows passes completely.
3. **E7 sweep:** share moved ≤ 0.2 at every depth ≤ 18 for both tables; ≤ 0.3 at depth 19; ≥ 0.95 at depth 20; ≥ 0.9 at depths 21–23.

### How each prediction is judged (fixed before launch)

- **Prediction 1** is judged on setting `zs`: the base model, zero-shot, with the deployed prompt, over all 2,446 views.
  - Setting `zs_tf` (defined below) is also reported. It gets its own hit or miss as a secondary check.
- **Prediction 2** is judged on the views that are not in the 8-shot prefix. There are 2,380 of them: 2,446 minus 66 example views (8 per table, and FLS's 2).
  - It is judged twice, with a separate hit or miss for each form:
    - `fs`, whose query is the deployed slot form;
    - `fs_tf`, whose query is in the written-answer form the examples show. This is the most favourable form for the base model.
  - The tables with more than 20 rows are SUM, MUL, ADD, ADZ, SUB and EST.
  - Counts over all 2,446 views, and over the 66 example views on their own, are also reported.
- **Prediction 3** is judged on the primary sweep (method below). A second draw of targets is reported but not judged.

### Gates (fixed before launch)

- **Experiment 1:** E7, run through the same scorer, must pass 2,446/2,446 with a minimum margin within 0.01 of 3.9598 (SUM, from `eval_e7_server.json`). Otherwise the job stops and I report.
- **Experiment 2:** at depth 20, the push must reproduce `steer_digit.json` (SUM 79/80, MUL 80/80) to within one view per table. Otherwise the sweep stops. One view is allowed because the run is on an H100 in fp32, while the published run was on the M4, and a borderline view can flip. Any difference is reported.

## Method

The model is Qwen3.5-0.8B in fp32, with the same snapshot on the Modal volume `polyformer-sketch` at `/model`.

Both jobs run on the deployed app `polyformer-sketch`. They use a new function, `ctrl_h100_fast`: an H100 with the flash-linear-attention kernels, as in the E7 training and evaluation job, plus `vol.reload()` at the start.

The scripts are new files in `polyformer/research/sketch/`:
- `base_control.py`;
- `steer_sweep.py`, which runs `inside_steer.py` unchanged.

Launch them with `modal/launch.py basectl` and `modal/launch.py steersweep`.

The E7 adapter is `/vol/runs/e7_s3_4000_h4.0_stop3.0_fast/files/e7_adapter_s3_h4_v2_cont`.

### Experiment 1: base-model control

**The query.** Every query uses the server certificate's prompt form, `e6_slots.batch`:
- `OP<|vision_start|><|image_pad|><|vision_end|>=` for SUM;
- the same plus the two slots `??` for the other eight tables.

Outputs are read at `=`, `?` and `?`. The margin at a position is the correct token's logit minus the best other token's, over the full vocabulary (`e2_column.margins`). A view passes when every margin is above 0.

The script checks that, with no prefix, its batch builder gives `e6_slots.batch`'s tensors exactly.

**Settings.**
- `e7`: the sanity check. E7, zero-shot, through this scorer and through `e5_union.certify`.
- `zs`: the base model, zero-shot, with the deployed prompt.
- `fs`: the base model, 8-shot. Before the deployed query comes a prefix of 8 solved views from the same table.
  - Each solved view is `OP<image>=`, then its correct output tokens, then a newline.
  - The prefix is drawn with `random.Random(0)`, in table order SUM, MUL, ADD, ADZ, FLS, NXT, SUB, EST, DEC.
  - The prefix is the same for every query of a table, so each step is still a function of the view alone.
  - FLS has only 2 views, so its prefix shows each of them 4 times, in a seeded order.
- `zs_tf` and `fs_tf`: the same as `zs` and `fs`, except for how the 2nd and 3rd outputs are read.
  - They are read after the true earlier outputs (teacher forcing: the model is fed the correct earlier tokens), not at the slots. This is the form the examples show.
  - Every margin above 0 then means that greedy decoding writes exactly the right outputs.
  - SUM has only one output, so its two forms are the same.

**How the sequence is built.** Sequences are built from token ids, and each view's segment goes through the processor as in the certificate. This keeps every output a single-character token; tokenising `=c` or `-N` as text would merge them.

Each image uses the model's own placeholders: one `<|vision_start|><|image_pad|><|vision_end|>` per view. All nine images sit in one sequence, with no chat template.

The script checks the batched logits against single-row forwards for each setting. The largest difference must be below 1e-2.

**What is reported**, per table and in total:
- views passing;
- the share of output positions where the argmax is correct;
- the median and minimum view margin, where a view's margin is its minimum over positions.

### Experiment 2: depth sweep of E7's push

**The script.** `inside_steer.py`, unchanged, with BY = `digit`, as for `steer_digit.json`. It works at the first output position:
- it adds `mu[target] − mu[source]` to the residual entering `layers[d]`, which is the stream after depth d;
- it uses 80 views per table, with seed 0.

The share moved is the fraction of the 80 views whose first output becomes the target's:
- for SUM, the target's sum code;
- for MUL, the target's digit.

**The states.** The class means come from E7's build states on the M4, `/vol/atlas/e7_states_m4_4450ea06.npy` (1,795 rows; CALC3.md gives its sha256 as `7dda5763…`), with `atlas.json`'s 1,795 rows.

**Primary sweep.** `inside_steer.py` draws its views, then one target per view at each depth, from one generator, in order. So the sweep runs it once per depth, from 1 to 23, and every depth sees the same 80 views and targets as the published layer-20 run. Depth 20 runs first, as the reproduction.

**Secondary.** One run over depths 1 to 23 in a single call, the way `steer.json` was made. This is a second draw of targets.

**Depths.** Depth d means after d layers. Depths 4, 8, …, 24 come after full-attention layers; the others come after Gated DeltaNet layers. The paper's claim is that the decision is made in layer index 19, the fifth full-attention layer, which spans depth 19 → 20.

## Results (appended 2026-10-31 18:40 CDT; the predictions above are unchanged)

### Verdicts

| Prediction | Judged on | Result | Verdict |
|---|---|---|---|
| 1. Base zero-shot: ≤ 5% of views pass; no table passes completely | `zs`, all 2,446 views | 12 pass (0.49%), all of them SUM; no table complete | **hit** |
| 1, secondary | `zs_tf` | the same 12 (0.49%); no table complete | hit |
| 2. Base 8-shot: ≤ 30% pass; no table with > 20 rows passes completely | `fs`, 2,380 non-example views | 35 pass (1.47%), all SUM; no table complete | **hit** |
| 2, most favourable form | `fs_tf`, 2,380 non-example views | 158 pass (6.64%); no table complete (the best is ADD, 26/212) | **hit** |
| 3. E7 sweep: ≤ 0.2 at every depth ≤ 18, both tables; ≤ 0.3 at 19; ≥ 0.95 at 20; ≥ 0.9 at 21–23 | primary sweep | MUL meets every clause. SUM fails two: 0.3875 at depth 18 (> 0.2) and 0.475 at depth 19 (> 0.3). Both tables meet the clauses at 20 and at 21–23 | **missed** (SUM at depths 18 and 19) |

### Gates

- **E7 sanity: passed.** Through this scorer, E7 passes 2,446/2,446 with a minimum margin of 3.9598 (SUM). That equals `eval_e7_server.json` to four decimals. `e5_union.certify`, run in the same job, gives the same count and the same per-table minima.
- **Batch builder:** with no prefix, it gives `e6_slots.batch`'s tensors exactly.
- **Batched vs single forwards:** the largest logit difference is 0.006 (`zs`), 0.007 (`fs`) and 0.006 (`fs_tf`), all below 1e-2.
- **Depth-20 reproduction: exact.** SUM 79/80 and MUL 80/80, as in `steer_digit.json`. The states file's sha256 is `7dda5763…`, as CALC3.md gives it.

### Experiment 1: the base model on E7's views

"Positions correct" is the share of output positions where the argmax is the correct token. A view's margin is its minimum over positions; a view passes when that margin is above 0.

#### E7 sanity (deployed form)

| table | views | pass | positions correct | median margin | min margin |
|---|---:|---:|---:|---:|---:|
| SUM | 242 | 242 | 100.0% | 13.77 | 3.96 |
| MUL | 1,100 | 1,100 | 100.0% | 13.54 | 6.39 |
| ADD | 220 | 220 | 100.0% | 12.22 | 9.37 |
| ADZ | 220 | 220 | 100.0% | 12.08 | 8.41 |
| FLS | 2 | 2 | 100.0% | 13.16 | 12.93 |
| NXT | 11 | 11 | 100.0% | 15.46 | 10.48 |
| SUB | 242 | 242 | 100.0% | 12.76 | 8.36 |
| EST | 400 | 400 | 100.0% | 11.27 | 4.51 |
| DEC | 9 | 9 | 100.0% | 12.76 | 10.00 |
| **total** | 2,446 | 2,446 | 100.0% | 12.76 | 3.96 |

#### (a) Base, zero-shot, deployed prompt (`zs`)

| table | views | pass | positions correct | median margin | min margin |
|---|---:|---:|---:|---:|---:|
| SUM | 242 | 12 | 5.0% | −3.61 | −10.56 |
| MUL | 1,100 | 0 | 0.3% | −6.44 | −10.50 |
| ADD | 220 | 0 | 0.9% | −9.89 | −10.71 |
| ADZ | 220 | 0 | 0.3% | −9.15 | −9.92 |
| FLS | 2 | 0 | 0.0% | −8.17 | −9.89 |
| NXT | 11 | 0 | 0.0% | −8.91 | −9.56 |
| SUB | 242 | 0 | 1.7% | −7.07 | −9.64 |
| EST | 400 | 0 | 2.6% | −9.44 | −10.06 |
| DEC | 9 | 0 | 0.0% | −7.46 | −7.98 |
| **total** | 2,446 | 12 | 1.1% | −7.21 | −10.71 |

**What the base model writes.** Its most common first output is a space.

**The 12 passing views** are SUM views that show a single digit and nothing to add: `__0`, `__1`, `__2`, `__3`, `__5`, `_0_`, `_00`, `_1_`, `_2_`, `_20`, `_3_` and `_5_`. The model copies that digit.

**At the slots:** no second or third output is ever correct.

**Teacher-forced reading (`zs_tf`):** the same 12 views pass, 2.3% of positions are correct, and the median margin is −7.38.

#### (b) Base, 8-shot (`fs`): the 2,380 views not in the prefix

| table | views | pass | positions correct | median margin | min margin |
|---|---:|---:|---:|---:|---:|
| SUM | 234 | 35 | 15.0% | −2.83 | −10.47 |
| MUL | 1,092 | 0 | 21.1% | −3.33 | −9.56 |
| ADD | 212 | 0 | 5.5% | −5.20 | −6.09 |
| ADZ | 212 | 0 | 5.2% | −4.35 | −5.17 |
| FLS | 0 | — | — | — | — |
| NXT | 3 | 0 | 33.3% | −2.19 | −3.22 |
| SUB | 234 | 0 | 37.3% | −4.74 | −12.31 |
| EST | 392 | 0 | 39.2% | −2.64 | −4.82 |
| DEC | 1 | 0 | 33.3% | −2.04 | −2.04 |
| **total** | 2,380 | 35 | 22.8% | −3.70 | −12.31 |

Two other groupings of `fs`:
- **all 2,446 views:** 38 pass, 23.3% of positions correct;
- **the 66 example views:** 3 pass, 40.7% of positions correct.

So even with each view's own answer in the prompt, the base model reads it back at the slots for only 3 of 66.

#### (b′) Base, 8-shot, teacher-forced reading (`fs_tf`), the most favourable form: non-example views

| table | views | pass | positions correct | median margin | min margin |
|---|---:|---:|---:|---:|---:|
| SUM | 234 | 35 | 15.0% | −2.83 | −10.47 |
| MUL | 1,092 | 17 | 42.0% | −1.74 | −11.02 |
| ADD | 212 | 26 | 60.1% | −0.74 | −5.58 |
| ADZ | 212 | 25 | 55.5% | −0.88 | −4.05 |
| FLS | 0 | — | — | — | — |
| NXT | 3 | 0 | 55.6% | −3.40 | −3.71 |
| SUB | 234 | 21 | 50.1% | −1.64 | −13.30 |
| EST | 392 | 34 | 46.8% | −2.01 | −4.82 |
| DEC | 1 | 0 | 66.7% | −2.04 | −2.04 |
| **total** | 2,380 | 158 | 45.8% | −1.66 | −13.30 |

Two other groupings of `fs_tf`:
- **all 2,446 views:** 191 pass, 46.6% of positions correct;
- **the 66 example views:** 33 pass, 76.9% of positions correct.

**Where the 8-shot SUM passes come from.** They are copy-the-digit views, sums with a 0, and sums equal to 9; the prefix shows two 9s. The carry codes `a`–`j` are not learned from 8 examples.

**The prefixes**, written as view `=` outputs, with `_` for a blank cell:

| table | prefix |
|---|---|
| SUM | `176=e _79=g 156=c 186=f _87=f __9=9 _5_=5 1_8=9` |
| MUL | `894=67A 728=22A 520=01A 875=16A 632=02A 346=81A 932=92A 184=21A` |
| ADD | `_65=11M _31=40M 175=31M _21=30M 143=80M 185=41M _58=31M 123=60M` |
| ADZ | `163=01F 188=71F 14_=50F _33=60F _71=80F _22=40F 169=61F _16=70F` |
| FLS | `1__=1-N ___=_-N 1__=1-N ___=_-N ___=_-N ___=_-N 1__=1-N 1__=1-N` |
| NXT | `8__=--M 2__=--M 7__=--M 6__=--M 9__=--M 3__=--M 1__=--M ___=--H` |
| SUB | `167=81S 193=50S 107=21S 192=60S __2=81S _10=10S 147=61S 175=10S` |
| EST | `747=9-M 639=7-M 429=4-M 209=2-M 005=0-N 139=1-M 428=5-M 407=5-M` |
| DEC | `4__=3-C 6__=5-C 8__=7-C 1__=0-C 2__=1-C 5__=4-C 7__=6-C 3__=2-C` |

### Experiment 2: E7's push at every depth

Each cell is the share moved, out of 80 views.
- **Primary:** one run per depth, so every depth sees the same views and targets. This is `steer_e7_sweep.json`.
- **Second draw:** one call over depths 1–23, which draws new targets at each depth.

| depth | after layer (0-based) | SUM | MUL | SUM, 2nd draw | MUL, 2nd draw |
|---:|---|---:|---:|---:|---:|
| 1–15 | 0–14 (full attention after layers 3, 7, 11) | 0/80 at every depth | 0/80 | 0/80 | 0/80 |
| 16 | 15 (full attention, 4th) | 7/80 (0.0875) | 0/80 | 6/80 | 0/80 |
| 17 | 16 (Gated DeltaNet) | 8/80 (0.10) | 0/80 | 12/80 | 0/80 |
| 18 | 17 (Gated DeltaNet) | 31/80 (0.3875) | 0/80 | 35/80 | 0/80 |
| 19 | 18 (Gated DeltaNet) | 38/80 (0.475) | 0/80 | 44/80 | 0/80 |
| 20 | 19 (full attention, 5th) | 79/80 (0.9875) | 80/80 | 80/80 | 80/80 |
| 21 | 20 (Gated DeltaNet) | 79/80 | 80/80 | 80/80 | 80/80 |
| 22 | 21 (Gated DeltaNet) | 80/80 | 80/80 | 80/80 | 80/80 |
| 23 | 22 (Gated DeltaNet) | 80/80 | 80/80 | 80/80 | 80/80 |

**What this says about the paper's claim.**
- **MUL fits the claim exactly.** The push moves nothing after any depth up to 19 and moves every view from depth 20. The digit is decided in layer 19, the fifth full-attention layer.
- **For SUM, layer 19 completes the decision but does not make all of it.**
  - Part of it already exists after layer 15 (the fourth full-attention layer), and after Gated DeltaNet layers 17 and 18: 39% of views move at depth 18 and 48% at depth 19.
  - Layer 19 is still the largest single step: +0.51, from 0.475 to 0.9875. The next largest is +0.29, across layer 17.
  - The second draw agrees within 6 views at every depth.
- **A wording that fits both tables:** "the push has no effect before depth 16 for either table; for the multiplier it takes effect exactly across the fifth full-attention layer (depth 19 → 20); for the adder it takes partial effect from depth 16 and completes across that same layer."

### Spend and calls

| Job | Call | What | Wall |
|---|---|---|---|
| `basectl_1825` | `fc-01M6A4GCN32P9ETY3X7M8RBKVB` | `base_control.py`: E7 sanity, `zs`, `zs_tf`, `fs`, `fs_tf` | 142 s |
| `steersweep_1825` | `fc-01M6A4GDAXDT4AKA95NSHJR59Q` | `steer_sweep.py`: 23 single-depth runs and one multi-depth run | 624 s |

**Cost.** Modal's billing report gives $1.00 for app `polyformer-sketch` in the hour 23:00 UTC on 31 Oct, the only sketch jobs in that hour: $0.948 for the H100, $0.023 for CPU and $0.031 for memory. That is inside the $5 cap. Nothing ran on the M4's GPU.

**Outputs on the volume** (`polyformer-sketch`):
- `runs/basectl_1825/files/`: `base_control.json`, and `base_control_rows.json` with every view's margins and argmax per setting;
- `runs/steersweep_1825/files/`: `steer_e7_sweep.json`, and `steer_e7_sweep_detail.json` with the counts, the second draw and the states hash.

**Figure data:**
- `figures/data/base_control.json` is the summary, with an `about` field.
- `figures/data/steer_e7_sweep.json` is flat, keyed `SUM@d` and `MUL@d`, like `steer.json`.

**Deviations from the brief.** All of these were fixed before launch.
- **Extra settings.** The teacher-forced readings `zs_tf` and `fs_tf` were added.
- **Example form.** Each 8-shot example is `OP<image>=` + outputs + newline, built from token ids. FLS's prefix repeats its 2 views.
- **One run per depth.** The primary sweep runs `inside_steer.py` once per depth, not as one multi-depth call.
- **Reproduction tolerance.** The depth-20 gate allowed one view of difference; none was needed.
- **States.** The class means come from E7's M4 build states (1,795 rows), not from the 2,446-row Modal states in `e7atlas_2153`.
- **Deployment.** The app now mounts `polyformer` main's `research/sketch`. CALC's worktree differs: its `inside_atlas.py` takes `e7`, and main's does not. Redeploy from that worktree before launching its jobs.
