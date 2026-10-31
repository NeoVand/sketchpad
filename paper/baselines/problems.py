"""The fixed problem set of BASELINES.md (registered 31 Oct 2026): 220 problems, the same for every system.

Addition a + b at operand lengths 10, 30, 100, 300, 1,000 digits and multiplication a x b at 2, 4, 6, 10, 15, 20
digits, 20 problems per length. Operands are uniform n-digit positive integers (leading digit 1-9), drawn from
Python's random.Random(20261031) in the table's order (family, then n, then problem; a before b), as plain digit
strings.

  python problems.py            # writes problems.json next to this file
"""

import json
import pathlib
import random

SEED = 20261031
FAMILIES = (("add", (10, 30, 100, 300, 1000)), ("mul", (2, 4, 6, 10, 15, 20)))
PER_N = 20
PROMPT = "What is {a} {op} {b}? Give the exact integer. Put the final answer in \\boxed{{}}."
OP = {"add": "+", "mul": "×"}


def problems():
    rng = random.Random(SEED)
    out = []
    for family, lengths in FAMILIES:
        for n in lengths:
            for k in range(PER_N):
                a = rng.randint(10 ** (n - 1), 10**n - 1)
                b = rng.randint(10 ** (n - 1), 10**n - 1)
                truth = a + b if family == "add" else a * b
                out.append({"id": len(out), "family": family, "n": n, "k": k, "a": str(a), "b": str(b),
                            "truth": str(truth), "prompt": PROMPT.format(a=a, op=OP[family], b=b)})
    return out


if __name__ == "__main__":
    ps = problems()
    assert len(ps) == 220
    assert all(len(p["a"]) == len(p["b"]) == p["n"] and p["a"][0] != "0" and p["b"][0] != "0" for p in ps)
    path = pathlib.Path(__file__).with_name("problems.json")
    path.write_text(json.dumps({"seed": SEED, "prompt": PROMPT, "problems": ps}, indent=1) + "\n")
    print(f"wrote {len(ps)} problems to {path}")
