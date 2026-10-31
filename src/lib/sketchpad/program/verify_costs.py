"""Recheck frozen TS test vectors against the actual supplied Python cost procedures.
Run from the worktree root. Reads the reference; writes nothing, including bytecode.
"""
import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("reference", "research/sketch/calc_dryrun.py")
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)
vectors = json.loads(Path(__file__).with_name("cost-fixtures.json").read_text())
for vector in vectors:
    a, b = int(vector["a"]), int(vector["b"])
    op, cost = vector["op"], reference.Cost()
    if op == "add":
        value = reference.value(reference.add_rows(reference.digits(a), reference.digits(b), cost))
    elif op == "sub":
        value, borrow = reference.sub_rows(reference.digits(a), reference.digits(b), cost)
        if borrow:
            value, borrow = reference.sub_rows(reference.digits(b), reference.digits(a), cost)
        value = reference.value(value) * (-1 if a < b else 1)
    elif op == "mul":
        value = reference.mul(a, b, cost)
    elif op == "divmod":
        value, remainder = reference.divide(a, b, 0, cost)
        value = int(value)
        assert int(remainder) == a % b
    else:
        value = reference.sqrt_digits(a, 0, cost)
    assert str(value) == vector["value"], vector
    assert (cost.rows, cost.calls) == (vector["rows"], vector["calls"]), vector
print(f"Rechecked {len(vectors)} value/row/call vectors against calc_dryrun.py")
