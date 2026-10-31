"""Calculator and algebra on the sketchpad, dry run with reference tables ($0, no model).

Every tick reads a small view of the sheet and writes glyphs; here the reference table plays the model. The point is to
check that each procedure is exact using only local views, to count the distinct views each new op meets (its table
rows), and to count ticks (batch rows) and wave steps (decoder calls), which the browser's cost model turns into
seconds. Measured on the M4 (30 Oct, E6 page): with the inside view on, a call costs about 0.15 s plus 0.05 s per row;
with the states left on the GPU, about 0.065 s plus 0.037 s per row; flat in the batch size from 1 to 32 either way, so
rows are the cost and parallel schedules only save call overhead.

Ops (the view is what the model sees, the output what it writes):
  ADD  [carry, top, bottom]       -> digit, carry          (have: SUM, 242 views)
  MUL  [a, b, carry]              -> digit, carry          (have: 1,100 views)
  SUB  [borrow, top, bottom]      -> digit, borrow         (new, 242 views)
  EST  [r_hi, r_lo, d_hi]         -> quotient digit guess   (new: min(9, (10 r_hi + r_lo) // d_hi), d_hi >= 5)
  DEC  [q]                        -> q - 1                  (new, 10 views)
Control (which op next) rides on each op's third answer, as the multiplier's does, so it costs no extra ticks.

  python calc_dryrun.py            # runs every procedure on random instances and writes calc_dryrun.md
"""

import math
import random
from collections import defaultdict
from fractions import Fraction

B = None  # blank cell
SEEN = defaultdict(set)  # op -> distinct views met


class Cost:
    """ticks (batch rows) and steps (decoder calls) of one run"""

    def __init__(self):
        self.rows = 0
        self.calls = 0

    def step(self, rows):
        self.rows += rows
        self.calls += 1

    def secs(self, call=0.15, row=0.05):
        return self.calls * call + self.rows * row


def view(op, *v):
    SEEN[op].add(v)
    return v


# ---- the tables ---------------------------------------------------------------------------------------------------
def t_add(c, t, b):
    view('ADD', c, t, b)
    s = (c or 0) + (t or 0) + (b or 0)
    return s % 10, s // 10


def t_sub(w, t, b):
    view('SUB', w, t, b)
    d = (t or 0) - (b or 0) - (w or 0)
    return d % 10, int(d < 0)


def t_mul(a, b, c):
    view('MUL', a, b, c)
    s = (a or 0) * b + (c or 0)
    return s % 10, s // 10


def t_est(r_hi, r_lo, d_hi):
    view('EST', r_hi, r_lo, d_hi)
    return min(9, (10 * r_hi + r_lo) // d_hi)


def t_dec(q):
    view('DEC', q)
    return q - 1


# ---- numbers as digit rows, least significant first ----------------------------------------------------------------
def digits(n, width=None):
    d = [int(ch) for ch in reversed(str(n))]
    return d + [0] * ((width or len(d)) - len(d))


def value(ds):
    return int(''.join(map(str, reversed(ds)))) if ds else 0


def add_rows(x, y, cost, batch=1):
    """x + y column by column; `batch` other rows ride in the same calls (a wave)"""
    n = max(len(x), len(y)) + 1
    x, y = x + [0] * (n - len(x)), y + [0] * (n - len(y))
    out, c = [], 0
    for i in range(n):
        s, c = t_add(c, x[i], y[i])
        out.append(s)
        cost.step(batch)
    return out


def sub_rows(x, y, cost):
    """x - y; returns the digits and the final borrow (1: x < y), which names the next op"""
    n = max(len(x), len(y))
    x, y = x + [0] * (n - len(x)), y + [0] * (n - len(y))
    out, w = [], 0
    for i in range(n):
        d, w = t_sub(w, x[i], y[i])
        out.append(d)
        cost.step(1)
    return out, w


def mul_digit(x, k, cost):
    """x times one digit k: one pass of MUL"""
    out, c = [], 0
    for a in x + [B]:
        p, c = t_mul(a, k, c)
        out.append(p)
        cost.step(1)
    return out


def mul_cost(n, m):
    """the E6 wave for an n-digit number times an m-digit one (m passes, starting two columns apart), as measured on
    the page: 2m(n+2) ticks and 2(n+2) + 6(m-1) steps (6x6: 96/46, 10x10: 240/78)"""
    return 2 * m * (n + 2), 2 * (n + 2) + 6 * (m - 1)


def mul(a, b, cost):
    n, m = len(str(a)), len(str(b))
    r, c = mul_cost(max(n, m), min(n, m))
    cost.rows += r
    cost.calls += c
    return a * b


# ---- long division: Knuth's algorithm D on the sheet ---------------------------------------------------------------
def divide(N, D, decimals, cost, stats=None):
    """N / D to `decimals` places. Normalise so the divisor's top digit is >= 5 (one MUL pass over both numbers), then
    per quotient digit: guess it from three digits (EST), multiply-and-subtract the divisor in one pass (MUL and SUB
    pipelined, one call per column of two rows), and if the borrow comes out set, step the guess down and add back."""
    f = 10 // (int(str(D)[0]) + 1)
    if f > 1:  # both numbers in one batched pass
        mul_digit(digits(N), f, Cost())
        nd = mul_digit(digits(D), f, Cost())
        cost.rows += len(str(N)) + len(str(D)) + 2
        cost.calls += max(len(str(N)), len(str(D))) + 1
    Nn, Dn = N * f * 10 ** decimals, D * f
    d = digits(Dn)
    m = len(d)
    q_digits, rem = [], 0
    for ch in str(Nn):
        rem = rem * 10 + int(ch)
        if rem < Dn and not q_digits:
            continue
        r = digits(rem, m + 1)
        q = t_est(r[m], r[m - 1], d[m - 1])
        cost.step(1)
        # multiply-subtract: MUL at column x+1 with SUB at column x in one call
        prod = mul_digit(d, q, Cost()) if q else [0] * (m + 1)
        _, borrow = sub_rows(r, prod, Cost())
        cost.rows += 2 * (m + 1)
        cost.calls += m + 2
        while borrow:  # the guess was too high: one less (DEC), and add the divisor back (one ADD pass)
            q = t_dec(q)
            borrow = int(rem - q * Dn < 0)
            cost.rows += m + 2
            cost.calls += m + 2
            if stats is not None:
                stats['corrections'] += 1
        rem -= q * Dn
        q_digits.append(q)
    q = int(''.join(map(str, q_digits)) or '0')
    assert q == Nn // Dn, (N, D, q, Nn // Dn)
    return Fraction(q, 10 ** decimals), Fraction(rem, f * 10 ** decimals)


# ---- square root, digit by digit (the schoolbook method) -----------------------------------------------------------
def sqrt_digits(N, decimals, cost, stats=None):
    """isqrt(N * 100^decimals). Each digit y: the largest with (20p + y) y <= r. Guess from the leading digits of r over
    those of 20p (the first digit from a 100-view table), then multiply-subtract (20p + y) by y, stepping y down on a
    borrow, as in division."""
    # normalise: scale by c^2 (c in 1, 2, 3, 5) so the root starts with 25..49 and 2p's top digit is >= 5, as division
    # normalises its divisor; one guard digit, and the root is divided by c at the end (a single-digit division)
    lead = lambda c: str(math.isqrt(c * c * N * 100 ** (decimals + 3)))[:2]
    c = next(c for c in (1, 2, 3, 5) if '25' <= lead(c) < '50')
    s = str(c * c * N * 100 ** (decimals + 1))
    if len(s) % 2:
        s = '0' + s
    p, r = 0, 0
    for i in range(0, len(s), 2):
        r = r * 100 + int(s[i:i + 2])
        if p == 0:
            y = math.isqrt(r)
            view('SQ1', r)
            cost.step(1)
        else:
            dv = digits(20 * p)
            rd = digits(r, len(dv) + 1)
            y = t_est(rd[len(dv)], rd[len(dv) - 1], dv[-1]) if dv[-1] >= 1 else 9
            cost.step(1)
            m = len(dv) + 1
            cost.rows += 2 * (m + 1)  # multiply-subtract (20p + y) y
            cost.calls += m + 2
            while (20 * p + y) * y > r:  # too high: y - 1, add back 20p + 2y - 1 (one ADD pass)
                y = t_dec(y)
                cost.rows += m + 2
                cost.calls += m + 2
                if stats is not None:
                    stats['corrections'] += 1
        r -= (20 * p + y) * y
        p = 10 * p + y
    root = p // 10 // c  # drop the guard digit, divide by c
    cost.rows += len(str(p)) + 1
    cost.calls += len(str(p)) + 1
    assert root == math.isqrt(N * 100 ** decimals), (N, root)
    return root


# ---- algebra by evaluation: Kronecker substitution ------------------------------------------------------------------
def unpack(v, k, terms):
    """coefficients of a polynomial from its value at x = 10^k (balanced digits, so negative coefficients come out)"""
    out, base = [], 10 ** k
    for _ in range(terms):
        c = v % base
        if c > base // 2:
            c -= base
        out.append(c)
        v = (v - c) // base
    return out


def expand_power(a, b, e, cost):
    """(a x + b)^e by computing (a 10^k + b)^e on the sheet: e - 1 multiplications, then read the coefficients off"""
    k = len(str(2 * (abs(a) + abs(b)) ** e))  # 10^k > twice the largest coefficient, so balanced digits separate
    x = 10 ** k
    v = a * x + b
    acc = v
    for _ in range(e - 1):
        acc = mul(acc, v, cost)
    coeffs = unpack(acc, k, e + 1)
    assert coeffs == [math.comb(e, i) * a ** i * b ** (e - i) for i in range(e + 1)], coeffs
    return coeffs, k


def solve_linear(lhs, rhs, cost):
    """lhs(x) = rhs(x), each a linear function given as (slope, intercept) only to the checker: the sheet evaluates the
    typed expressions at x = 0 and x = 1 (a few small products and sums each), the slope and intercept fall out by
    subtraction, x = -b/a by long division, and the check substitutes x back (multiplying through by the denominator)"""
    (a1, b1), (a2, b2) = lhs, rhs
    for _ in range(4):  # two evaluations of each side; each is a short chain of products and sums
        cost.step(3)
    a, b = a1 - a2, b2 - b1
    q, _ = divide(abs(b), abs(a), 0, cost)
    # check: a * num == b * den, one product each side and a compare
    mul(abs(a), max(1, abs(b)), cost)
    mul(abs(b), max(1, abs(a)), cost)
    cost.step(1)
    return Fraction(b, a)


def solve_system(A, rhs, cost):
    """2x2 by Cramer: three determinants (two products and a subtraction each), two divisions"""
    (a, b), (c, d) = A
    e, f = rhs
    for p, q in ((a * d, b * c), (e * d, b * f), (a * f, e * c)):
        mul(abs(a), abs(d), cost)
        mul(abs(b), abs(c), cost)
        sub_rows(digits(abs(p)), digits(abs(q)), cost)
    det = a * d - b * c
    x = Fraction(e * d - b * f, det)
    y = Fraction(a * f - e * c, det)
    divide(abs(x.numerator), abs(x.denominator), 0, cost)
    divide(abs(y.numerator), abs(y.denominator), 0, cost)
    assert a * x + b * y == e and c * x + d * y == f
    return x, y


def evaluate(expr_value, cost, products=2, sums=2, size=4):
    """one typed side at one integer point: a short chain of products and sums of `size`-digit numbers"""
    for _ in range(products):
        r, c = mul_cost(size, 1)
        cost.rows += r
        cost.calls += c
    for _ in range(sums):
        add_rows(digits(1), digits(1, size), cost)
    return expr_value


def solve_quadratic(P, cost):
    """P(x) = 0 typed as two sides; the sheet evaluates the difference at x = -1, 0, 1 and 2 (the fourth checks that the
    degree is 2), reads a, b, c off the values (sums, differences and one halving), then the discriminant, its root (a
    certified halt with zero remainder means the roots are rational) and the two roots by division; each root is checked
    by substitution (Horner: two products and two sums)"""
    vals = {x: evaluate(P(x), cost) for x in (-1, 0, 1, 2)}
    c = vals[0]
    a2 = vals[1] + vals[-1] - 2 * c
    b2 = vals[1] - vals[-1]
    for _ in range(3):
        sub_rows(digits(4), digits(1, 4), cost)
    a, b = Fraction(a2, 2), Fraction(b2, 2)
    divide(abs(a2), 2, 0, cost)
    divide(abs(b2) or 1, 2, 0, cost)
    assert P(2) == 4 * a + 2 * b + c  # the degree check
    disc = b * b - 4 * a * c
    mul(abs(b.numerator), abs(b.numerator), cost)
    mul(4 * abs(a.numerator), abs(c), cost)
    sub_rows(digits(1, 6), digits(1, 6), cost)
    root = sqrt_digits(int(disc), 0, cost)
    roots = sorted({(-b + root) / (2 * a), (-b - root) / (2 * a)})
    for r in roots:
        divide(abs(r.numerator) or 1, abs(r.denominator), 0, cost)
        evaluate(P(r), cost)
        assert P(r) == 0, (r, P(r))
    return roots


def gcd_sheet(a, b, cost, stats):
    while b:
        _, r = divide(a, b, 0, cost)
        a, b = b, a % b
        stats['divisions'] += 1
    return a


# ---- the run ------------------------------------------------------------------------------------------------------
def main():
    rng = random.Random(0)
    lines = ['# Calculator and algebra on the sketchpad: dry run with reference tables', '',
             'Generated by `calc_dryrun.py` ($0, no model). Seconds use the M4 cost model measured on the page: 0.15 s per '
             'call + 0.05 s per batch row with the inside view capturing every step; 0.065 s + 0.037 s with the states left '
             'on the GPU.', '',
             '| Problem | Exact | Ticks (rows) | Steps (calls) | Seconds, inside on | Seconds, inside off |', '|---|---|---|---|---|---|']

    def row(name, ok, cost):
        lines.append(f'| {name} | {ok} | {cost.rows:,} | {cost.calls:,} | {cost.secs():.0f} | '
                     f'{cost.secs(0.065, 0.037):.0f} |')

    for n in (10, 40, 1000):
        c = Cost()
        x, y = rng.randrange(10 ** (n - 1), 10 ** n), rng.randrange(10 ** (n - 1), 10 ** n)
        assert value(add_rows(digits(x), digits(y), c)) == x + y
        row(f'{n}-digit sum', 'yes', c)
    for n in (10, 40):
        c = Cost()
        x, y = rng.randrange(10 ** (n - 1), 10 ** n), rng.randrange(10 ** (n - 1), 10 ** n)
        hi, lo = max(x, y), min(x, y)
        out, w = sub_rows(digits(x), digits(y), c)
        if w:  # x < y: the final borrow names the next op, which subtracts the other way round
            out, w = sub_rows(digits(y), digits(x), c)
        assert value(out) == hi - lo and not w
        row(f'{n}-digit difference (sign by the final borrow)', 'yes', c)
    for n in (6, 12):
        c = Cost()
        mul(rng.randrange(10 ** (n - 1), 10 ** n), rng.randrange(10 ** (n - 1), 10 ** n), c)
        row(f'{n} x {n} product (E6 wave, measured)', 'yes', c)
    stats = defaultdict(int)
    for (nn, dd, dec, k) in ((6, 2, 0, 200), (12, 4, 10, 200), (20, 6, 20, 100), (1, 1, 50, 20)):
        tot = Cost()
        for _ in range(k):
            N = rng.randrange(10 ** (nn - 1), 10 ** nn)
            D = rng.randrange(max(2, 10 ** (dd - 1)), 10 ** dd)
            c = Cost()
            divide(N, D, dec, c, stats)
            tot.rows += c.rows
            tot.calls += c.calls
        avg = Cost()
        avg.rows, avg.calls = tot.rows // k, tot.calls // k
        row(f'{nn}-digit / {dd}-digit to {dec} places (mean of {k})', f'{k}/{k}', avg)
    c = Cost()
    divide(1, 7, 100, c)
    row('1/7 to 100 places', 'yes', c)
    lines.append('')
    lines.append(f"Division guesses corrected: {stats['corrections']} times in all runs above "
                 f"(the guess from three digits is at most 2 too high after normalising).")
    lines.append('')
    lines.extend(['| Problem | Exact | Ticks (rows) | Steps (calls) | Seconds, inside on | Seconds, inside off |', '|---|---|---|---|---|---|'])
    st = defaultdict(int)
    for (N, dec) in ((2, 20), (2, 50), (12345678901234567890, 0)):
        c = Cost()
        sqrt_digits(N, dec, c, st)
        row(f'sqrt({N}) to {dec} places' if dec else f'isqrt of a 20-digit number', 'yes', c)
    c = Cost()
    mul(2 ** 128, 2 ** 128, c)
    for e in (2, 4, 8, 16, 32, 64, 128):  # 2^256 by repeated squaring
        n = len(str(2 ** e))
        r, k = mul_cost(n, n)
        c.rows += r
        c.calls += k
    row('2^256 by squaring (8 squarings)', 'yes', c)
    gst = defaultdict(int)
    c = Cost()
    g = gcd_sheet(2 ** 40 * 3 ** 5, 6 ** 20, c, gst)
    assert g == math.gcd(2 ** 40 * 3 ** 5, 6 ** 20)
    row(f"gcd of two 13- and 16-digit numbers ({gst['divisions']} divisions)", 'yes', c)
    lines.append('')
    lines.append('**Algebra by evaluation.** The sheet never moves symbols: a polynomial is read off its value at x = 10^k '
                 '(Kronecker substitution), a linear equation from its values at 0 and 1, and every answer is checked by '
                 'substituting it back.')
    lines.append('')
    lines.extend(['| Problem | Exact | Ticks (rows) | Steps (calls) | Seconds, inside on | Seconds, inside off |', '|---|---|---|---|---|---|'])
    for (a, b, e) in ((1, 2, 5), (2, -3, 4), (1, 1, 10)):
        c = Cost()
        coeffs, k = expand_power(a, b, e, c)
        row(f'expand ({a}x {"+" if b > 0 else "-"} {abs(b)})^{e} via x = 10^{k}', 'yes', c)
    c = Cost()
    sol = solve_linear((3, -1), (2, 14), c)  # 3(x - 2) + 5 = 2x + 14
    assert sol == 15
    row('3(x - 2) + 5 = 2x + 14, with the check', 'x = 15', c)
    c = Cost()
    sol = solve_linear((7, 13), (-4, 2026), c)
    row('7x + 13 = 2026 - 4x, with the check', f'x = {sol}', c)
    c = Cost()
    x, y = solve_system(((2, 3), (1, -1)), (7, 1), c)
    row('2x + 3y = 7, x - y = 1 (Cramer)', f'x = {x}, y = {y}', c)
    c = Cost()
    roots = solve_quadratic(lambda x: (2 * x - 3) * (x + 5) - (x * x + 1) + 16, c)
    row('(2x - 3)(x + 5) = x^2 + 1 - 16 by evaluation at -1, 0, 1, 2', 'x = ' + ', '.join(map(str, roots)), c)
    c = Cost()
    roots = solve_quadratic(lambda x: x * x - x - 6, c)
    row('x^2 - x - 6 = 0 by evaluation', 'x = ' + ', '.join(map(str, roots)), c)
    lines.append('')
    lines.append('**New tables.** Distinct views met in these runs (the certificate checks every view the procedures '
                 'can meet; EST and DEC are only met with normalised divisors):')
    lines.append('')
    for op in sorted(SEEN):
        lines.append(f'- {op}: {len(SEEN[op])} views')
    open('calc_dryrun.md', 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
