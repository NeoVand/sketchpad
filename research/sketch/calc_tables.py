"""The calculator's three new digit tables (SKETCHPAD3 seam 1), as the model reads and answers them.

Each row is a view of three cells (glyphs from " 0123456789", drawn as e2_column.crop draws them) under an op word, and
three answers read in one forward pass (the prompt ends `=??`, as E6's multiplier steps): two glyphs and the next step.
The arithmetic is exactly calc_dryrun's t_sub, t_est and t_dec; the next-step letters are where a procedure branches.

  SUB  [borrow, top, bottom]  -> digit, borrow (0/1), S        top or bottom a digit: subtract the column, go on
                              -> -, -, H | B                  both blank: halt; H no borrow out, B borrow out (top < bottom)
  EST  [r_hi, r_lo, d_hi]     -> min(9, (10 r_hi + r_lo) // d_hi), -, M | N
                                 d_hi 5-9 (a normalised divisor), r_hi 0..d_hi (the remainder is below 10 x divisor);
                                 M: multiply-subtract the guess; N: the guess is 0, nothing to subtract
  DEC  [q, _, _]              -> q - 1, -, C                  q 1-9; C: correct the remainder (add back, or try again)

The runtime (src/lib/sketchpad/calc-tables.ts) builds the same 651 rows in the same order; `python calc_tables.py
<out.json>` writes them for its cross-check (runtime.spec.ts).
"""

import json
import sys

from calc_dryrun import t_dec, t_est, t_sub

B = " "
DIG = "0123456789"


def sub_answer(v):
    w, t, b = v
    if t == B and b == B:
        return ["-", "-", "H" if w == B else "B"]
    d, borrow = t_sub(1 if w == "1" else None, None if t == B else int(t), None if b == B else int(b))
    return [str(d), str(borrow), "S"]


def est_answer(v):
    q = t_est(*map(int, v))
    return [str(q), "-", "M" if q else "N"]


def dec_answer(v):
    return [str(t_dec(int(v[0]))), "-", "C"]


ANSWER = {"SUB": sub_answer, "EST": est_answer, "DEC": dec_answer}

ROWS = [("SUB", (w, t, b)) for w in (B, "1") for t in B + DIG for b in B + DIG]
ROWS += [("EST", (str(rh), str(rl), str(d))) for d in range(5, 10) for rh in range(d + 1) for rl in range(10)]
ROWS += [("DEC", (str(q), B, B)) for q in range(1, 10)]
assert len(ROWS) == 242 + 400 + 9


def answer(op, v):
    return ANSWER[op](v)


if __name__ == "__main__":
    rows = [{"op": op, "cells": list(v), "out": answer(op, v)} for op, v in ROWS]
    json.dump(rows, open(sys.argv[1], "w"), indent=0)
    print(len(rows), "rows ->", sys.argv[1])
