# ALGEBRA, round 3: algebra as people write it

Neo, 31 Oct 2026, after running the Algebra demo: "no one's going to notice that this is algebra because of the method
we have taught. If we could translate that method into what algebra is normally written, like with the symbols and so
on, it would strike a chord." Shown two options, he chose **textbook steps**:

```
3(x − 2) + 5 = 2x + 14
3x − 6 + 5 = 2x + 14      3·2 = 6
3x − 1 = 2x + 14          −6 + 5 = −1
3x − 2x = 14 + 1
x = 15                    3 − 2 = 1, 14 + 1 = 15
check  3(15 − 2) + 5 = 44 = 2·15 + 14  ✓

(x + 2)⁵
= x⁵ + 5·2x⁴ + 10·4x³ + 10·8x² + 5·16x + 2⁵
= x⁵ + 10x⁴ + 40x³ + 80x² + 80x + 32
```

There is no retraining and no change to the model or to the sheet the model reads. This is the runtime, in this repo
(`src/lib/sketchpad/program/`). The code was ported from polyformer at `d5eb4d79` and now lives only here. Work in
this worktree, `/Users/neo/repos/sketchpad-wt/algebra` (branch `algebra-textbook`), commit there, and push nothing.

## The rule (unchanged from the contract)

The runtime holds the procedure and the model computes every number. Two kinds of step:

- **Layout, done by the runtime:** rewriting structure (which terms multiply, which terms collect, moving a term
  across), copying a typed number, a sign flip, decimal points and scaling.
- **Through `Calc`:** any step that makes a new number: a product, a sum, a difference, a quotient, a root. The
  `Calc` interface and its waves are unchanged.

## What to build

A textbook path for every work order, which becomes the default for the demo:

1. **Linear and quadratic equations.**
   - Expand products over sums: distribute, multiply binomials term by term.
   - Evaluate the numeric products, then collect like terms on each side.
   - Linear: move x-terms left and constants right, then divide; reduce a fraction only when the remainder is not 0.
   - Quadratic: one side equals 0, then the formula with its numbers shown: b² − 4ac, √, (−b ± √)/2a.
     - A zero constant factors out x.
     - An irrational root keeps today's proven six-place bracket, written as (−b ± √D)/2a ≈ the bounds.
2. **Systems (2×2 and 3×3): elimination as written.** "Multiply the first equation by 2 and subtract it from the
   second", then back-substitution, as equations in x, y, z, not matrices. Integer row operations; no fractions until
   the final divisions.
3. **Expand.**
   - A power of a binomial, (ax + b)ⁿ: the binomial theorem with the coefficients shown, as in the example.
     - Binomial coefficients come from Pascal's rule (additions) or the multiplicative recurrence, whichever costs
       fewer rows. Measure both.
   - Products of polynomials: distribute, then collect.
4. **Factor (cubic and quadratic).**
   - The rational root theorem: list the candidates ±p/q.
   - Test candidates by substitution (Horner), stopping at the first root.
   - Divide by synthetic division, shown as the usual three-row table.
   - The quadratic factor comes from the formula or by inspection.
5. **Every answer is checked by substitution.**
   - Light: substitute into the collected form with Horner.
   - Strong: substitute into both typed sides.

   Keep today's refusal behaviour: a failed check refuses the answer.

Keep the evaluation path ("algebra by evaluation") as a mode, with its tests, for comparison. The default becomes
textbook.

## The derivation, for the display

Return, beside today's result, a `Derivation`: an ordered list of lines. Each line carries:

- `tex`: KaTeX source of the line. Give each number that the model computed on that line a stable id, e.g. with
  `\htmlId{n12}{...}`, or return spans alongside.
- `kind`: given, expand, evaluate, collect, move, divide, formula, check, or result.
- `note`: an optional side note, such as `3·2 = 6`.
- `calls`: the indices into the trace of the `Calc` calls whose results appear on that line, so the page can light
  each number the moment the model writes it.

Lines must read like a careful student's work: no skipped step a reader would need, and no step a reader would find
silly. Use ×, ·, − and superscripts as in print.

## Done

1. **Tests.** Every existing correctness suite passes on the textbook path, in both check modes. Add tests that each
   derivation line is true: its left equals its right as polynomials, evaluated by `RefCalc`.
2. **Refusal rates.** Re-run the same 200 + 200 fault populations on the textbook path (wrong roots; corrupted
   arithmetic) and report the refusal rate of each.
3. **Cost table.** For the same eleven work orders (`NOTES.md`), report rows, calls (after waves) and seconds under
   the cost model, for light and strong, with the evaluation path beside for comparison. Mark which are under 12 s.
4. **Quality gates.** TypeScript, ESLint and Prettier pass.
5. **Hand-over.**
   - Update the top of `NOTES.md`.
   - Commit on `algebra-textbook`.
   - Finish with a short report that includes the derivation for `solve 3(x-2)+5=2x+14`, `solve x^2-x-6=0`,
     `expand (x+2)^5`, `solve 2x+3y=7, x-y=1` and `factor x^3-6x^2+11x-6`, as the lines would read.

$0. No model runs: `RefCalc` only.
