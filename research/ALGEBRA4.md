# ALGEBRA, round 4: irrational roots as people write them, and fast

Measured on the M4 after the Algebra tab shipped (live at neovand.github.io/sketchpad/demo):

- `solve x^2-2=0` took **409 s**. Every other preset takes 2.8–21.5 s.
- The page shows `(0 ± √8)/2` with six-place bounds. There is no simplified radical and no answer line.

The cause is the irrational branch of the quadratic in `textbook.ts` (around line 252). It takes the integer square
root of D·10^(2·places) with places = 6 + len(2a) + 3, then proves a six-place bracket for each root by substitution.
That is a 20-plus-digit square root and several large Horner evaluations, all on the sheet.

## What people write, and what to build

```
x² − 2 = 0
0² − 4·1·(−2) = 8
√8 = √(4·2) = 2√2
x = (0 ± 2√2)/(2·1) = ±√2
check  x₁ + x₂ = 0 = −b/a,  x₁·x₂ = (0² − 8)/(4·1²) = −2 = c/a  ✓
x = ±√2 ≈ ±1.4142
```

1. **Simplify the radical.** Write D = s²·m with m square-free. Find s by trial division of D by squares k² for
   k = 2, 3, 5, 7, …, using `divmod` on the sheet; the runtime picks which k to try, as layout. Stop when k² > the
   remaining D, using `isqrt` (it is already there) to bound k. For a large D that is too slow: cap the trial at
   k ≤ 50 or so, keep √m unsimplified beyond that, and state the cap in `NOTES.md`.
2. **Reduce the fraction (−b ± s√m)/(2a).** Use the gcd of b, s and 2a, from Calc, and only when it is not 1. Write
   the result the textbook way, e.g. `±√2`, `(1 ± √33)/4`, `−1 ± √3`.
3. **Prove the roots exactly, without decimals.**
   - Vieta: the roots' sum must be −b/a and their product c/a. In integers: 2·(−b) = 2a·(−b/a), and for the product
     (b² − s²m) = 4ac.
   - s²·m = D is one more Calc multiply that proves the simplification.

   Every product and sum goes through Calc. This is the check for irrational roots in both light and strong mode. Say
   in `NOTES.md` why it is complete: Vieta plus a quadratic with integer coefficients pins the pair. Keep the
   substitution check for rational roots as it is.
4. **The approximation.**
   - Show `≈` to 4 decimal places, from √m to about 5 digits: isqrt(m·10^10), then one division by the reduced
     denominator.
   - Label it ≈ and do not "prove" it with a bracket; it is a rounded display, and the exact answer is the radical.
   - The six-place bracket path stays in the code behind an option (`places`, or `to k places`) for a typed request
     like `solve x^2-2=0 to 6 places`. The default demo path must not use it.
5. **Cubic factoring with an irrational quadratic factor** uses the same path.

## Done

- **Speed:** `solve x^2-2=0`, `solve 2x^2+3x-1=0` and `solve x^2-6x+4=0` are each under 12 s under the cost model.
  Report rows, calls and seconds.
- **Tests:**
  - every derivation line is true, with RefCalc evaluating the radicals symbolically: (p + q√m) arithmetic over the
    integers;
  - the Vieta check refuses a corrupted root: run a fault population of 200 and report the refusal rate;
  - existing suites pass.
- **Notation:** the derivation uses proper `−` and `√`, and `±` only where print uses it.
- **Hand-over:** update `NOTES.md`, commit on `algebra-textbook`, push nothing, $0. Finish with a short report that
  includes the three derivations as they read.
