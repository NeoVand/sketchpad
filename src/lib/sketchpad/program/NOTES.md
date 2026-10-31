Round 3 passes **222 tests**, including **2,200 generated correctness cases per path/check mode**, exact checks of the textbook rewrites, strict TypeScript, ESLint, Prettier and **150 reference-cost comparisons**. **$0; RefCalc only.** Committed on `algebra-textbook`; nothing pushed.

Both paths refuse **200/200 wrong roots (100%)** in each check mode. Textbook refuses **185/200 arithmetic faults (92.5%)**; evaluation refuses **173/200 (86.5%)**. All missed faults leave the answer unchanged in these samples. Fault locations differ because the procedures differ; these rates do not establish protection against arbitrary corruption.

Decisions: textbook is the default, light remains the default check, and evaluation stays an explicit mode. Pascal's additions use fewer rows than the recurrence for every supported positive exponent; the zero exponent ties. **Six of eleven orders are under 12 modeled seconds in both paths and both check modes.** The expansions, larger system and factoring still miss that target.

Seconds below; each pair is **light / strong**. ✓ means both are below 12 s. Full rows/calls/seconds follow the examples.

| Work order          |      Textbook s |      Evaluation s | Both <12 s |
| ------------------- | --------------: | ----------------: | ---------- |
| 6×6 product         |   6.542 / 6.542 |     6.542 / 6.542 | ✓          |
| 3(x−2)+5=2x+14      |   2.762 / 4.291 |     4.530 / 6.449 | ✓          |
| 7x+13=2026−4x       |   7.619 / 7.479 |   11.825 / 11.685 | ✓          |
| 2×2 system          |   5.895 / 5.895 |     9.843 / 9.399 | ✓          |
| Expand (x+2)⁵       | 12.058 / 30.716 |   33.066 / 41.974 | —          |
| Expand (2x−3)⁴      | 12.474 / 31.735 |   36.014 / 45.005 | —          |
| Expand (x+1)¹⁰      | 21.924 / 68.047 | 142.208 / 164.736 | —          |
| Bracketed quadratic |   5.718 / 7.904 |    9.799 / 11.660 | ✓          |
| x²−x−6=0            |   8.779 / 8.779 |   11.129 / 11.129 | ✓          |
| 3×3 system          | 22.806 / 22.806 |   26.536 / 25.426 | —          |
| Factor x³−6x²+11x−6 | 16.900 / 19.252 |   31.521 / 33.483 | —          |

The requested derivations follow. Typed-side checks are shown, except the expansion uses light mode. Repeated left sides in the expansion are written as a continuous equality chain.

`solve 3(x-2)+5=2x+14`

```text
3(x − 2) + 5 = 2x + 14
3x − 3·2 + 5 = 2x + 14
3x − 6 + 5 = 2x + 14    -(3·2) = -6
3x − 1 = 2x + 14    -6 + 5 = -1
3x − 2x = 14 + 1
x = 15    3 − 2 = 1,   14 + 1 = 15
3(15 − 2) + 5 = 44 = 2·15 + 14  ✓
x = 15
```

`solve x^2-x-6=0`

```text
x² − x − 6 = 0
(-1)² − 4·1·(-6) = 25
√25 = 5
x = (1 − 5)/(2·1) = -2
x = (1 + 5)/(2·1) = 3
(-2)² + 2 − 6 = 0  ✓
3² − 3 − 6 = 0  ✓
x = -2, 3
```

`expand (x+2)^5`

```text
(x + 2)⁵
= x⁵ + 5·2x⁴ + 10·2²x³ + 10·2³x² + 5·2⁴x + 2⁵
= x⁵ + 5·2x⁴ + 10·4x³ + 10·8x² + 5·16x + 32
= x⁵ + 10x⁴ + 40x³ + 80x² + 80x + 32
(1 + 2)⁵ = 243 = 1⁵ + 10·1⁴ + 40·1³ + 80·1² + 80·1 + 32  ✓
(x + 2)⁵ = x⁵ + 10x⁴ + 40x³ + 80x² + 80x + 32
```

`solve 2x+3y=7,x-y=1`

```text
2x + 3y = 7
x − y = 1
2x − 2y = 2    Multiply equation 2 by 2
2x + 3y − (2x − 2y) = 7 − 2    Subtract the scaled equation 2 from the scaled equation 1
5y = 5
y = 1
2x + 3·1 = 7    Back-substitute the known values
2x = 7 − 3
2x = 4
x = 2
2·2 + 3·1 = 7  ✓
2 − 1 = 1  ✓
x = 2,   y = 1
```

`factor x^3-6x^2+11x-6`

```text
x³ − 6x² + 11x − 6
Candidates:  1, -1, 2, -2, 3, -3, 6, -6
1³ − 6·1² + 11·1 − 6 = 0
1 | 1 -6 11 -6
  |    1 -5  6
  ----------
  | 1 -5  6  0
x³ − 6x² + 11x − 6 = (x − 1)(x² − 5x + 6)
1³ − 6·1² + 11·1 − 6 = 0  ✓
(-5)² − 4·1·6 = 1
√1 = 1
x = (5 − 1)/(2·1) = 2
x = (5 + 1)/(2·1) = 3
2 | 1 -5  6
  |    2 -6
  -------
  | 1 -3  0
x² − 5x + 6 = (x − 2)(x − 3)
2³ − 6·2² + 11·2 − 6 = 0  ✓
3³ − 6·3² + 11·3 − 6 = 0  ✓
x³ − 6x² + 11x − 6 = (x − 1)(x − 2)(x − 3)
```

## Round 3 full cost table

Each cell is **rows / calls after waves / seconds**. ✓ marks strictly below 12 seconds. Seconds are `0.037 × rows + 0.065 × calls`; they are predictions, not device timings. Calls count the sheet procedures' forward passes, not high-level Calc invocations.

| Work order                            | Textbook light r/c/s | Textbook strong r/c/s | Evaluation light r/c/s | Evaluation strong r/c/s |
| ------------------------------------- | -------------------: | --------------------: | ---------------------: | ----------------------: |
| `123456 * 654321`                     |        96/46/6.542 ✓ |         96/46/6.542 ✓ |          96/46/6.542 ✓ |           96/46/6.542 ✓ |
| `solve 3(x-2)+5=2x+14`                |        36/22/2.762 ✓ |         58/33/4.291 ✓ |          75/27/4.530 ✓ |           97/44/6.449 ✓ |
| `solve 7x+13=2026-4x`                 |        97/62/7.619 ✓ |        102/57/7.479 ✓ |        165/88/11.825 ✓ |         170/83/11.685 ✓ |
| `solve 2x+3y=7,x-y=1`                 |        75/48/5.895 ✓ |         75/48/5.895 ✓ |         194/41/9.843 ✓ |          182/41/9.399 ✓ |
| `expand (x+2)^5`                      |        159/95/12.058 |        398/246/30.716 |         458/248/33.066 |          697/249/41.974 |
| `expand (2x-3)^4`                     |        172/94/12.474 |        415/252/31.735 |         492/274/36.014 |          735/274/45.005 |
| `expand (x+1)^10`                     |       322/154/21.924 |        901/534/68.047 |       2359/845/142.208 |        2938/862/164.736 |
| `solve (2x-3)(x+5)=x^2+1-16`          |        79/43/5.718 ✓ |        117/55/7.904 ✓ |         177/50/9.799 ✓ |         215/57/11.660 ✓ |
| `solve x^2-x-6=0`                     |       102/77/8.779 ✓ |        102/77/8.779 ✓ |        162/79/11.129 ✓ |         162/79/11.129 ✓ |
| `solve 2x+3y-z=1, x-y+2z=3, 3x+y+z=8` |       323/167/22.806 |        323/167/22.806 |         538/102/26.536 |          508/102/25.426 |
| `factor x^3-6x^2+11x-6`               |       195/149/16.900 |        241/159/19.252 |         483/210/31.521 |          529/214/33.483 |

## Round 3 API and verification

`run(source, calc)` now selects `{ path: 'textbook', checkMode: 'light' }`. Use `{ path: 'evaluation' }` for the retained procedure and `{ checkMode: 'strong' }` to check the typed sides. The original result text, coefficient grids and trace remain available. Evaluation mode retains its existing grids; its algebra derivation list is empty.

Each statement returns `derivation.lines`, with `tex`, `kind`, optional `note`, `calls` and `numbers`. Calls index **RunResult.trace**, not the statement's sliced trace; `traceOffset` locates that slice. A copied named value may refer to an earlier statement's call. Each computed-number occurrence has its own stable HTML id, source call, result field, original digits, displayed digits and sign/decimal-layout metadata. Typed literals, structural exponents, unit coefficients and trial candidates need no model output id. Notes can contain ordinary explanatory text or TeX arithmetic. A refusal returns only the given lines, withholding unverified results.

The additional proof fields are testable mathematical data. A solving equation need not hold for every x: its rewrite is checked by comparing the old left-minus-right expression with the appropriately scaled new one. Each polynomial identity is evaluated with RefCalc at enough distinct points in every variable to establish equality at its degree. Root substitutions, endpoint signs, candidate divisibility, numeric table entries and number-to-trace links are checked separately. The fixed-seed generated algebra cases run those derivation checks too. Focused rendering tests exercise KaTeX, copied names, rational synthetic tables, zero coefficients, higher total degrees, fractional equations and irrational brackets.

Assumptions beyond the requested display: retain an independent collection confirmation at x=y=z=1 before trusting the light check; bound divisor enumeration at 10000 trials; preserve the earlier conservative `complete: false` factor result. The confirming point sums collected coefficients through Calc because every variable is one. It is an internal guard, not an extra solving line. A single confirming point is not a proof against arbitrary arithmetic corruption. Factor candidates are enumerated as ±p/q and may contain equivalent unreduced fractions; arithmetic and acceptance checks still run through Calc. An unresolved factor remains visible. Irrational brackets are checked against the original typed equation in strong mode and the original collected coefficients in light mode.

The choice of Pascal additions is measured in `binomial-costs.json` for exponents 0 through 12; the multiplicative recurrence is retained as a tested alternative. Integer equation elimination keeps fractions out of the row operations; final divisions and back-substitution can produce fractions. Native answer arithmetic would remove sheet cost but violate the Calc boundary, so it is not used in the textbook runtime. The evaluation path remains the requested comparison. No model, provider request, server or watch process was used.

The fault populations keep the earlier source seeds and wrong offered roots. For each procedure, arithmetic targets are sampled inside its initial coefficient-evaluation/collection work, including its confirmation. The exact target inputs agree between light and strong within a path. A changed schedule changes the available positions and hence the sampled targets, so the percentage difference between paths is descriptive rather than a controlled estimate of relative fault tolerance. Miss details remain in the JSON files. Recomputed evaluation costs and refusal results match the frozen round-two artifacts exactly.

## Reproduce round 3

Run from this worktree only. The report environment variable writes only artifacts in this directory; ordinary tests write none.

```sh
PROGRAM_REPORT=1 nice -n 19 pnpm vitest run src/lib/sketchpad/program
pnpm exec tsc --ignoreConfig --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --strict --types node src/lib/sketchpad/program/*.ts
pnpm exec eslint src/lib/sketchpad/program
pnpm exec prettier --check research/ALGEBRA3.md research/GLOSSARY.md src/lib/sketchpad/program
python3 src/lib/sketchpad/program/verify_costs.py
python3 src/lib/sketchpad/program/verify_round3.py
```

`round3-{path}-{mode}.json` contains all eleven costs, population counts, fault details and demo TeX; `derivations-{mode}.json` contains the requested examples without highlight markup. The cost audit independently recomputes decimal seconds, rates, thresholds and count totals and compares the evaluation path with round two. The reference-cost audit reads only this repository's Python reference. All changes were authored here; nothing was copied from or changed in another checkout.

## Earlier implementation record (ported; superseded above)

Round 2 passes **97 tests**, including **2,200 generated correctness cases per mode**. TypeScript, ESLint, formatting and the 150 reference-cost comparisons pass.

Both modes refuse **200/200 wrong roots (100%)** and **173/200 evaluation faults (86.5%)**. The 27 missed faults leave the answers unchanged; this does not establish protection against arbitrary corruption.

**Six of eleven demo orders are below 12 modeled seconds in both modes.** Light is the default; strong remains available.

| Work order          | Light s | Strong s |
| ------------------- | ------: | -------: |
| 6×6 product         |    6.54 |     6.54 |
| 3(x−2)+5=2x+14      |    4.53 |     6.45 |
| 7x+13=2026−4x       |   11.82 |    11.69 |
| 2×2 system          |    9.84 |     9.40 |
| Expand (x+2)^5      |   33.07 |    41.97 |
| Expand (2x−3)^4     |   36.01 |    45.01 |
| Expand (x+1)^10     |  142.21 |   164.74 |
| Bracketed quadratic |    9.80 |    11.66 |
| x²−x−6=0            |   11.13 |    11.13 |
| 3×3 system          |   26.54 |    25.43 |
| Factor x³−6x²+11x−6 |   31.52 |    33.48 |

The three expansions, the 3×3 system and factoring still miss the target. Their row costs alone exceed 12 seconds, so more batching cannot fix them: they need fewer arithmetic rows or faster certified operations. Spend: **$0**. All changes stay under `src/lib/sketchpad/program/`, committed only on `program`; nothing pushed.

## Round 2 complete cost table

The source work orders below are exactly the nine Round 1 comparisons plus the two requested additions. Columns show rows, model calls **after waves**, and `0.037 × rows + 0.065 × calls` seconds. The gate is strictly below 12 seconds; these are predictions, not device measurements. Model calls are forward passes in the sheet procedures, not the number of high-level Calc invocations.

| Work order                            | Light rows | Light calls | Light s | Strong rows | Strong calls | Strong s | Both <12 s |
| ------------------------------------- | ---------: | ----------: | ------: | ----------: | -----------: | -------: | ---------- |
| `123456 * 654321`                     |         96 |          46 |   6.542 |          96 |           46 |    6.542 | Yes        |
| `solve 3(x-2)+5=2x+14`                |         75 |          27 |   4.530 |          97 |           44 |    6.449 | Yes        |
| `solve 7x+13=2026-4x`                 |        165 |          88 |  11.825 |         170 |           83 |   11.685 | Yes        |
| `solve 2x+3y=7,x-y=1`                 |        194 |          41 |   9.843 |         182 |           41 |    9.399 | Yes        |
| `expand (x+2)^5`                      |        458 |         248 |  33.066 |         697 |          249 |   41.974 | No         |
| `expand (2x-3)^4`                     |        492 |         274 |  36.014 |         735 |          274 |   45.005 | No         |
| `expand (x+1)^10`                     |       2359 |         845 | 142.208 |        2938 |          862 |  164.736 | No         |
| `solve (2x-3)(x+5)=x^2+1-16`          |        177 |          50 |   9.799 |         215 |           57 |   11.660 | Yes        |
| `solve x^2-x-6=0`                     |        162 |          79 |  11.129 |         162 |           79 |   11.129 | Yes        |
| `solve 2x+3y-z=1, x-y+2z=3, 3x+y+z=8` |        538 |         102 |  26.536 |         508 |          102 |   25.426 | No         |
| `factor x^3-6x^2+11x-6`               |        483 |         210 |  31.521 |         529 |          214 |   33.483 | No         |

For direct comparison with Round 1, the linear demonstration fell from 22.393 to 4.530 seconds in light mode; `(x+2)^5` fell from 149.326 to 33.066 seconds. The latter is a substantial reduction but still fails the live-demo requirement. Strong is sometimes cheaper than light: the typed equation can contain fewer products than the recovered coefficient check. The names describe what is checked, not a guaranteed timing order.

## What the remaining orders need

A row-only lower bound is the time left if all model-call overhead vanished. Every remaining light-mode order already exceeds the target on that lower bound. With this model, at most 324 rows could fit below 12 seconds even with zero calls; any actual calls require a smaller row budget. This is a necessary bound, not a promise that reducing to that row count would suffice.

| Remaining order     | Light row-only s | Strong row-only s | Light rows to remove even with zero calls |
| ------------------- | ---------------: | ----------------: | ----------------------------------------: |
| Expand (x+2)^5      |           16.946 |            25.789 |                                       134 |
| Expand (2x−3)^4     |           18.204 |            27.195 |                                       168 |
| Expand (x+1)^10     |           87.283 |           108.706 |                                      2035 |
| 3×3 system          |           19.906 |            18.796 |                                       214 |
| Factor x³−6x²+11x−6 |           17.871 |            19.573 |                                       159 |

- **Expansions:** the bound, packed power and verification still produce too many rows. More economical coefficient arithmetic, such as a binomial coefficient recurrence for a single linear power or coefficient convolution for products, is the standard alternative to packing. It can still use Calc for every changed number, preserving condition 2, but changes the brief's chosen expansion procedure and needs its own measured cost study. No speed claim for that alternative has been tested here.
- **3×3 systems:** recovery by evaluating each equation at several points, elimination and final checks dominate the rows. Further reuse of evaluated terms across points, a cheaper certified linear-system procedure, or explicit permission for additional zero/unit-row copying would be needed. Waves already share the independent equations, points, products and elimination cells.
- **Factoring:** coefficient recovery, synthetic divisions and original-coefficient root checks remain substantial. More economical coefficient recovery and reuse of already completed factor proofs are the next procedure-level candidates. The unproved quotient must remain visible, and any new scheme still needs the exact checks.
- **A different mechanism:** genuinely faster certified digit procedures or newly measured lower per-row model cost could change these bounds. Computing answers with native BigInt would be fast but breaks condition 2 (the model computes); it was not used outside the reference/test machinery. Relabeling these five cases as fast would conflict with condition 11 (the live demonstration).

The current implementation therefore satisfies the requested correctness and comparison work, but does **not** make all demonstration beats fit the target.

## Runtime changes and decisions

The arithmetic boundary now includes exactly the new contract method:

```ts
wave<T>(jobs: (() => Promise<T>)[]): Promise<T[]>;
```

`RefCalc` measures each job in its own frame, sums its rows, and takes the maximum job call count. Nested waves compose recursively; sequential work outside a wave adds normally. The reference executes job factories serially for deterministic, browser-portable accounting; the sheet provider can run those factories concurrently. Reference serialization is not charged as model serialization. The nested-wave tests independently compare the composed cost with isolated job costs.

Factories must represent independent jobs; they must not start promises before entering the wave. `TraceCalc` forwards waves to the provider and drains started jobs after a failure, even if that provider rejects early, so work cannot spill into the next statement's trace. `LyingCalc` selects the chosen invocation before awaiting its result, keeping a deterministic fault target when completions are reordered.

At each evaluation point, both typed sides are represented as a dependency graph: a map of calculations and the results each needs. Identical expressions and intermediate powers share one computed result. Only ready, independent nodes enter a wave. A cached result is completed before its consumers run; a pending shared promise is never incorrectly charged as free work in another job. Positive-power aliases no longer insert unnecessary scheduling barriers. Every point has its own graph; values from different substitution points are not conflated.

Recovery evaluates points in the requested order: 0, 1, −1, 2, and onward. Linear and quadratic coefficients use their direct finite-difference formulas; higher degrees reorder the sampled values for the existing general difference procedure. Every recovery still has a separate confirming point. Both sides, the independent expression nodes, all points, system equations, Cramer determinants, products and independent Bareiss cells share waves. Independent factor-root checks are collected into a wave after the successive factor divisions. Irrational-root bounds and their endpoint checks also share independent work.

Expansion now reads base-10 groups from the packed digit string. No division by the base occurs. Only a signed-group correction and its carry to the next group use Calc, and only when needed. Leading sign changes remain sign layout. The coefficient bound and overflow check remain active. Light expansion checks one additional point, x = 1; strong checks the previous points −1, 0, 1 and 2, in a wave.

Fraction reduction first performs the division that was needed anyway. A zero remainder returns the integer quotient immediately; otherwise Euclid continues from that remainder instead of repeating the initial division. Reduction by a unit denominator copies the already computed number. A leading coefficient of +1 or −1 in Horner's rule likewise copies the existing input digit row, changing only its sign if needed; it creates no digits by host arithmetic.

A quadratic with a sheet-produced zero constant has a zero-root candidate and a remaining linear root. This avoids an unnecessary discriminant and square root. Both candidates still pass the selected check, and duplicate zero roots are not printed twice. This is a procedure over recovered numeric coefficients, not rewriting the typed equation.

Grid-only powers are now display expressions, rather than extra numerical calculations. `GridRow.cells` is an array of `Rational | { expression: string }`. Coefficients, typed-side values and checked roots remain actual computed values; a label such as `(2/1)^3` must not be presented as a computed digit row. This removes arithmetic whose only purpose was formatting the grid.

### Check modes and API

```ts
await run(source, calc); // light by default
await run(source, calc, { checkMode: 'strong' });
```

`AlgebraResult.checkMode` and each root check's `mode` identify the chosen mode. This must remain visible to the consuming page: a light check is not a claim of strong typed-side substitution.

- **Light:** the degree-confirming point plus integer-only Horner evaluation on the recovered coefficient row. At p/q it computes the numerator after multiplication by q to the polynomial's degree; there is no fraction normalization inside that check. Systems check their recovered integer equations with denominators cleared. Irrational brackets check signs using the recovered integer polynomial.
- **Strong:** exact fractions substituted into both original typed sides, followed by exact equality or opposite-sign checks. Equality needs no extra subtraction once both sides are available. This is the Round 1 check strength, with the faster shared evaluator and scheduling.

Assumptions made here: a strict `<12`-second gate for reporting; x = 1 as expansion's single light checking point; symbolic labels for grid-only powers; deterministic serial reference execution with wave cost composition. These do not claim actual simultaneous JavaScript execution in RefCalc or measured device throughput. The contract itself authorizes the new default light mode; retaining strong by default would preserve the older checking premise but is not uniformly more expensive on these examples.

## Validation and limitations

The same seeded 1,000 expression cases and 200 cases each for linear equations, quadratics, 2×2 systems, 3×3 systems, expansion and factoring run in **each** mode. Both modes use the original independent BigInt-rational, determinant, coefficient-convolution and known-factor oracles. The integration suite also runs in both modes. Tests cover nested and empty waves, multi-operation jobs, rejection cleanup, wrappers, shared-expression dependencies, signed group carry chains, integer-only rational-root checks, mode visibility, concurrent providers and the six successful timing gates.

The fault suites use identical offered roots and identical source/call-index pairs in both modes; an explicit cross-mode assertion verifies that identity. Each mode refuses all 200 incorrect roots and 173 of the 200 injected evaluation faults. All 27 missed faults produce exactly the same result line as their uncorrupted run, with no observed wrong answer. Each miss is retained in the corresponding report JSON.

These faults target the first evaluation point, now x = 0, using the current schedule. Round 1 used x = −1 and different call positions. The mode comparison is controlled; comparing the Round 2 percentage with Round 1's percentage is **not** evidence that the check became stronger. The common degree confirmation catches most effective perturbations before the modes diverge.

A separate directed test changes a coefficient row after confirmation: light accepts a root that satisfies that changed row, while strong rejects it against the typed equation. This intentionally demonstrates the weaker premise of light checking. Matching refusal percentages on the specified population do not establish equivalent protection against other faults or a malicious provider.

The completed suite was rerun, the report populations/counts were checked, and every demo's cost was recomputed from its recorded rows and calls. `verify_costs.py` separately rechecks all 150 frozen arithmetic values, rows and calls against the supplied Python reference. The individual arithmetic cost formulas remain unchanged.

Current commands, from this worktree root:

```sh
PROGRAM_REPORT=1 nice -n 19 pnpm vitest run src/lib/sketchpad/program
nice -n 19 python3 src/lib/sketchpad/program/verify_costs.py
nice -n 19 pnpm exec eslint src/lib/sketchpad/program
nice -n 19 pnpm exec prettier --check src/lib/sketchpad/program
nice -n 19 pnpm exec tsc --ignoreConfig --noEmit --target es2022 --module esnext --moduleResolution bundler --types node --strict --skipLibCheck src/lib/sketchpad/program/*.ts
```

`round2-light.json` and `round2-strong.json` contain the full population statistics, eleven demo row/call totals, threshold flags and missed-fault cases. `metrics.json` remains the Round 1 archive. Reporting writes only inside this folder. No server, watch process, model run, network service or paid service was used.

## Round 2 commit record

- `2afb1b9e`: nested wave accounting and shared expression dependencies.
- `1fca3774`: failed-wave cleanup before the next statement.
- `2363f5dc`: light/strong checks, digit-group unpacking and parallel algebra scheduling.
- `1bf120c2`: matched correctness and fault populations in both modes.
- `d705943a`: zero-constant quadratic shortcut, power scheduling barriers and timing regressions.

The final notes/metrics commit records the verified result. All Round 2 edits are confined to this stream's folder and branch; no push occurred.

## Glossary candidates — Round 2 additions

- **Wave [zoo]:** independent sheet jobs sharing model forward passes. Authorized by the orchestrator in PROGRAM2 (30 Oct 2026); rows add and the longest job determines calls. It reduces waiting between independent calculations without making their digit work free.
- **Dependency graph [zoo]:** a map of calculations and which earlier results each needs. A standard compiler/scheduling technique, used in this implementation on 30 Oct 2026; it allows shared expressions without undercounting their dependent work.
- **Shared expression / common subexpression elimination [zoo]:** reuse of an identical already computed expression rather than computing it again. A standard compiler technique, applied here per evaluation point on 30 Oct 2026; it reduces rows and preserves the point's exact inputs.
- **Light check:** the recovered coefficient row is checked with integer arithmetic after a degree confirmation. Authorized in PROGRAM2 (30 Oct 2026); it reduces some checking work while relying on that row remaining correct.
- **Strong check:** substituting a proposed root into both original typed sides with exact fractions. Required by Round 1 and retained as an option by PROGRAM2 (30 Oct 2026); it can catch coefficient-row mistakes that the light check cannot.
- **Row-only lower bound:** the modeled time from rows with all call overhead set to zero. Derived here from PROGRAM2's cost model (30 Oct 2026); it proves when additional waves alone cannot meet the target.
- **Coefficient convolution / binomial recurrence [zoo]:** respectively forming product coefficients from sums of coefficient products, or obtaining successive coefficients of a power from the previous coefficient. Standard polynomial arithmetic alternatives, proposed for later measurement here (30 Oct 2026); they might reduce packing work but have not been benchmarked by this stream.

## Round 1 archive — historical behavior and costs

The following report and API description record Round 1. The Round 2 behavior, commands and display contract above supersede them.

Passed: 49 tests covering 1,000 expressions, 200 each of six algebra families, and 150 reference-cost comparisons. TypeScript, ESLint and formatting checks pass.

Refusals: wrong roots 200/200 (100%); corrupted evaluations 168/200 (84%). The 32 missed faults left the answers unchanged; this is not a guarantee against arbitrary corruption.

Modeled seconds below show the median (middle case) and the 95th percentile (95% of cases at or below it), to expose typical and slower cases. Dry-run figures are simpler examples, not matched populations.

| Problem          | Median s | 95th s |     Prior dry-run s |
| ---------------- | -------: | -----: | ------------------: |
| Expressions      |    118.9 |  433.6 | No matched workload |
| Linear equations |     70.7 |  105.4 |                 4–8 |
| Quadratics       |     84.4 |  975.2 |                  29 |
| 2×2 systems      |     76.0 |  104.6 |                   5 |
| 3×3 systems      |    315.1 |  425.0 |        Not measured |
| Expansion        |    722.1 | 3219.4 |              21–118 |
| Factoring        |    209.8 |  651.7 |        Not measured |

Decisions: accept implicit multiplication and higher-degree solving; truncate decimals; keep unproved factors visible. Correctness passes, but these costs miss the short-demo target. Spend: $0. Changes committed only on `program`; nothing pushed.

## What ships

`index.ts` exports the parser, runner, Calc implementations, and display types. Production code in this folder is pure TypeScript with no browser, model or network dependency. `RefCalc` is a native-BigInt test double, not a trained model. Pass the CALC stream's implementation of the identical `Calc` interface to use the sheet.

```ts
import { RefCalc, run } from '$lib/sketchpad/program';

const calc = new RefCalc();
const output = await run('solve 3(x-2)+5=2x+14', calc);
// output.lines: ['= x = 15']
// output.results[0].algebra: recovered coefficients, grid, checked roots
// output.trace: every Calc invocation, operands and result
// calc.total: predicted sheet rows, model calls and seconds
```

`run` returns one `= ...` line per statement, per-line traces and a combined trace. Parse errors throw `ParseError` with a token and location, for the page to display. Arithmetic domain errors become `= error: ...`; failed checks become exactly `= check failed`, with no claimed algebra result. A failed assignment removes its old binding before later statements run.

`AlgebraResult` exposes ascending-power coefficients, grids, exact rational roots, exact bracket bounds for irrational roots, checks, unproved guesses and remaining factors. Systems return roots in x/y/z order. `factors` contains the actual proved `(q x - p)` factors, including multiplicity; multiplying those by `remaining` reproduces the recovered polynomial. Higher-degree results always set `complete: false`, even when the remaining factor is constant, to preserve the contract's conservative wording.

The runtime creates no arithmetic answer digits with host arithmetic. Sign changes, digit counts, decimal-point placement, loop counters, point selection and the explicitly untrusted root-search stage use host layout/control. All coefficient recovery, fractions, determinant arithmetic, exact divisions, root checks and signed unpacking use `Calc`. Integer results are already digit rows and need no arithmetic merely to display them.

## Grammar and precision decisions

- ASCII `* / - sqrt(...)` and Unicode `× ÷ − √(...)` share the same syntax. A work order may be plain text or a complete `sheet` fence. Statements occupy separate nonblank lines.
- Implicit multiplication is accepted before a name/function or `(`: `2x`, `3(x-2)`, and `(x-1)(x+2)`. Multiplication and division associate left to right, including implicit multiplication. Adjacent numeric literals are errors.
- Powers bind more tightly than unary minus. Exponents are signed literal integers with magnitude at most 12; polynomial exponents must be nonnegative. Products can have total degree above 12. An exponent expression such as `2^(1+2)` is rejected. `0^0` follows the empty-product convention and is 1.
- `x`, `y`, and `z` are reserved unknowns and cannot be assigned. Other names hold earlier numeric results. A single equation uses x; systems use x/y or x/y/z. Systems must be syntactically linear even when nonlinear terms would cancel.
- The seam limits single-equation solving to quadratics, while PROGRAM explicitly requests higher-degree solving. The implementation follows the more specific brief and marks higher-degree results as incomplete.
- `to k places` accepts 0 through 100. Each division and square root truncates toward zero to that precision; the final line is padded to that precision. Without the suffix, each division/root remains exact if it terminates within 12 places, otherwise truncates to 12. An ellipsis propagates after any truncation. Addition, multiplication and powers operate on those resulting values. A finite literal may contain more places, but default display still uses at most 12.
- Algebra evaluation always uses exact fractions, ignoring expression-display precision. An approximate named value is refused. Fractional coefficients are supported for solving and systems. Recovery on integer syntax uses exact factorial division; fractional syntax carries an exact numerator/denominator and checks each reduction division has remainder zero.
- `expand` and `factor` accept integer literal coefficients, integer-valued names, signs, sums, products and nonnegative powers. Direct decimal literals and division are rejected there; this syntactic restriction guarantees the integer-coefficient premise needed by packing. A separately assigned exact integer can be used as a coefficient.
- A zero determinant reports that there is no unique solution; it does not distinguish inconsistency from infinitely many solutions.
- Six-place irrational roots are displayed as an exact radical form plus adjacent six-place bounds. Both bounds are checked in the original equation with exact fractions. If two close roots occupy the same six-place cell, the opposite-sign check can fail; the runtime refuses rather than displaying an unproved decimal. A directed test covers that case.

Assumptions not supplied by Neo: truncation rather than rounding to nearest; reserved unknown names; a 100-place display cap; literal-only exponents; bounded candidate search. Rounding to nearest could also preserve model computation, at additional arithmetic cost. Retaining exact fractions through ordinary expression division would reduce some work but would change the seam's per-operation precision rule. Unlimited candidate search could find additional factors but would worsen the live-demo constraint (condition 11).

## Procedures and their limits

Coefficient recovery evaluates both typed sides at degree + 1 points starting at -1, then uses the next point as confirmation. Successive differences and numerical Newton basis conversion recover the coefficient row; this never rewrites the typed expression. The grid includes evaluated powers, both sides, differences and recovered coefficients.

The linear and quadratic formulas run on Calc. A rational root is reduced by Euclid's gcd and checked by exact substitution in both typed sides. A quadratic with a nonsquare discriminant uses extra root digits to locate a six-place interval, then checks opposite signs in the typed equation. Negative discriminants report no real roots.

Two-variable systems use Cramer's rule. Three-variable systems use Bareiss elimination with row swaps and exact division, then exact back-substitution. Each equation is evaluated at the origin, its unit points and a separate confirming point. Every returned solution is substituted into every original equation.

Expansion uses a positive-coefficient bound evaluated on Calc, chooses a decimal base strictly larger than twice that bound, and evaluates the typed polynomial at that base. Signed base digits are unpacked through Calc. The recovered polynomial is checked at -1, 0, 1 and 2. Both the bound and packed evaluation appear in the display grid.

Higher-degree solving and factoring propose real roots using ordinary approximate JavaScript numbers. The search splits intervals using derivative-root candidates, then tries nearby rational values with denominators up to 256 that appear to divide the leading coefficient. These are explicitly labeled “not certified.” Exact synthetic division by `(q x - p)` and substitution into the original typed equation must both pass before a root is reported. Large roots outside safe JavaScript integer range, larger denominators, numerical instability and unfound irrational roots can remain unproved. Their quotient stays visible; no completeness claim is made.

The arithmetic boundary is a trusted Calc implementation. A confirming point is a consistency check, not an adversarial certificate for the provider. One corrupted intermediate value can be multiplied by zero and disappear. A malicious provider changing several coordinated calls can evade these checks. The tests do not claim otherwise.

## Validation and reproducibility

The population harness uses independent native-BigInt rational arithmetic for expressions and linear equations, independent determinants for systems, coefficient convolution for expansions, and known factor products for factoring. Quadratics include 67 rational-root, 67 irrational-root and 66 no-real-root cases. Irrational brackets are checked independently with integer cross-products. Factoring checks multiplicities and reconstructs the full coefficient row from the proved factors and remaining scalar.

The frozen cost vectors contain 30 cases for each of addition, subtraction, multiplication, division and square root. They were generated with Python seed 39; `verify_costs.py` rereads the actual reference procedures and checks all values, rows and calls without writing outside this folder. The reference square-root normalizer has no zero case; `RefCalc` uses one halt row for zero, covered separately.

The two fault populations are separate: 200 deliberately wrong offered roots, then 200 single-call `+1` corruptions inside the first typed evaluation of mixed linear/quadratic equations. The latter deliberately includes zero-masked arithmetic. Every injected call is reached; every miss, source statement and call index is preserved in `metrics.json`. Misses were compared with the uncorrupted run's exact result line, and all were unchanged. This sampling is not a claim about corruption of every possible call or operand.

`metrics.json` contains the fixed seeds, population sizes, full-precision statistics, exact-demo row/call totals and all misses. Median uses the mean of the two central costs; the 95th percentile uses the nearest-rank rule. Final population runs reproduced the same unformatted metrics SHA-256:

`ec003320ad8b14ebd074189333642e9b3bab56bf88e1d9b7ac53b1a2e764cb8e`

Prettier changes whitespace in the committed JSON; rerunning the reporting command restores the reproducible unformatted bytes. All model estimates use `0.065 × calls + 0.037 × rows` seconds. Here “calls” means model forward passes in the ported sheet procedure, not the number of high-level Calc invocations. No measured model latency or model accuracy is claimed.

Commands, from this worktree root:

```sh
PROGRAM_REPORT=1 nice -n 19 pnpm vitest run src/lib/sketchpad/program
nice -n 19 python3 src/lib/sketchpad/program/verify_costs.py
nice -n 19 pnpm exec eslint src/lib/sketchpad/program
nice -n 19 pnpm exec prettier --check src/lib/sketchpad/program
nice -n 19 pnpm exec tsc --ignoreConfig --noEmit --target es2022 --module esnext --moduleResolution bundler --types node --strict --skipLibCheck src/lib/sketchpad/program/*.ts
```

The isolated TypeScript command checks this stream without generating or changing Svelte project files. No dev server or watch process was started. No model or paid service was used.

## Same-example cost comparison

The earlier figures below are reread from `research/sketch/calc_dryrun.md`, states left on the GPU. They are rounded to whole seconds in that source. This runtime includes the actual typed evaluations, coefficient recovery, exact fractions, checks, display grid arithmetic and decimal formatting. The source's algebra estimates simplify or omit some of those steps. These differences explain why the comparison is not a model-speed regression measurement.

| Work order                   | Rows | Model calls | Runtime s | Prior dry-run s |
| ---------------------------- | ---: | ----------: | --------: | --------------: |
| `123456 * 654321`            |   96 |          46 |       6.5 |               7 |
| `solve 3(x-2)+5=2x+14`       |  224 |         217 |      22.4 |               4 |
| `solve 7x+13=2026-4x`        |  394 |         361 |      38.0 |               8 |
| `solve 2x+3y=7,x-y=1`        |  252 |         246 |      25.3 |               5 |
| `expand (x+2)^5`             | 1803 |        1271 |     149.3 |              23 |
| `expand (2x-3)^4`            | 1808 |        1231 |     146.9 |              21 |
| `expand (x+1)^10`            | 8264 |        4366 |     589.6 |             118 |
| `solve (2x-3)(x+5)=x^2+1-16` |  516 |         484 |      50.6 |              29 |
| `solve x^2-x-6=0`            |  392 |         358 |      37.8 |              29 |

The same-width product matches the ported reference cost exactly before display rounding. The general algebra procedures are too expensive for the plan's short live-demo target. No training money should be spent on the assumption that the earlier simplified estimates describe this scheduler. Optimizing the schedule and reducing grid-only arithmetic are follow-up choices for the parent stream, not evidence of a faster model.

## Scope, alternatives and commit record

This stream changes only `src/lib/sketchpad/program/`, on branch `program`, and never pushes. The contract assigns shared-glossary edits to the orchestrator; candidates below are ready to lift. No other worktree or branch was touched.

The field is computer algebra. The plan's standard alternatives are symbolic rewriting and recovery by numerical evaluation. This stream implements evaluation as instructed. Host-side answer arithmetic would be faster but breaks condition 2 (the model computes). A single confirming point protects against some accidental errors, but claiming arbitrary-provider certification would break condition 5 (checkable exactness). Presenting these costs as a fast live demonstration would conflict with condition 11. These limitations remain visible.

Small implementation/test commits:

- `8ea40f54`: parser, arithmetic, traced reference Calc, Python-derived cost vectors and initial notes.
- `8767226b`: evaluation-based algebra, runner, exports and integration cases.
- `62805cb9`: precision edge cases, polynomial grammar boundaries and redundant integer-work removal.
- `a79fcde9`: seeded acceptance populations and live Python cost verification.

The final report/metrics commit completes the stream. There are no remote pushes.

## Glossary candidates

- **Computer algebra:** computation with mathematical expressions and equations. A long-established field; the SKETCHPAD3 plan (30 Oct 2026) chooses evaluation over rewriting for this runtime. It frames the alternatives without inventing a new field.
- **Rational number:** an integer numerator divided by a nonzero integer denominator. Classical arithmetic, used throughout this implementation (30 Oct 2026) to check equations without decimal rounding.
- **Interpolation [zoo]:** recovering polynomial coefficients from values at chosen points. The plan cites black-box polynomial work by Kaltofen and Trager (1990); this implementation uses classical successive differences and numerical Newton basis conversion. It permits coefficient recovery using Calc alone.
- **Finite differences / Newton basis [zoo]:** successive adjacent differences of a value table, expressed in products associated with chosen evaluation points. Classical numerical methods, implemented here on 30 Oct 2026; they recover coefficients without rewriting the user's expression.
- **Kronecker substitution [zoo]:** packing polynomial coefficients into digits of one sufficiently large integer. The plan credits Kronecker (1882); this stream uses its integer-coefficient premise to expand by arithmetic and signed digit extraction.
- **Synthetic division / Horner [zoo]:** dividing or evaluating a coefficient row by repeated multiplication and addition. Named in the PROGRAM brief (30 Oct 2026); used to prove proposed linear factors and to evaluate recovered coefficient rows.
- **Cramer's rule [zoo]:** solving a square linear system using ratios of determinants. Named in the SKETCHPAD3 plan (30 Oct 2026); used for two unknowns.
- **Bareiss elimination [zoo]:** elimination using exact integer divisions to avoid growing fractions. Named in the SKETCHPAD3 plan (30 Oct 2026); used for three unknowns, including row swaps.
- **Bracket [zoo]:** two bounds where a continuous function has opposite signs. The classical intermediate value theorem guarantees a root between them; this implementation (30 Oct 2026) uses exact arithmetic to check displayed irrational-root bounds.
- **Float64 candidate:** an approximate number in JavaScript's ordinary numeric format. Used only in the candidate search implemented here (30 Oct 2026), never accepted as a root without exact proof.
- **Median / 95th percentile:** respectively the middle measured cost and a cost covering at least 95% of the population. Standard descriptive statistics; the report generated here (30 Oct 2026) uses them to expose typical and slower predicted workloads.

- **Wave [zoo]:** independent sheet jobs sharing model forward passes; authorized by the orchestrator in PROGRAM2 (30 Oct 2026). Its call count is the longest job, and its row count is the sum, so it reduces scheduling cost without changing arithmetic.
