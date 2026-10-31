"""Independently audit Round 4's reported costs and the square-root bottleneck. Writes nothing."""
import importlib.util
import json
import sys
from decimal import Decimal
from pathlib import Path

sys.dont_write_bytecode = True
root = Path(__file__).parent
report = json.loads((root / 'round4.json').read_text())
def seconds(rows, calls):
    return Decimal(rows) * Decimal('0.037') + Decimal(calls) * Decimal('0.065')

for mode, data in report.items():
    assert data['refusal']['attempts'] == 200
    assert data['refusal']['caught'] + data['refusal']['missed'] == 200
    assert data['refusal']['caught'] == 200
    assert data['refusal']['details'] == []
    assert len(data['measurements']) == 3
    for item in data['measurements']:
        s = seconds(item['rows'], item['calls'])
        assert abs(s - Decimal(str(item['seconds']))) < Decimal('0.000000001')
        assert item['under12'] == (s < 12)
        old = item['brackets']
        assert abs(seconds(old['rows'], old['calls']) - Decimal(str(old['seconds']))) < Decimal('0.000000001')
        assert s < seconds(old['rows'], old['calls'])
        print(mode, item['source'], item['rows'], item['calls'], s, 'under12:', item['under12'])
assert [(r['rows'], r['calls']) for r in report['light']['measurements']] == [(r['rows'], r['calls']) for r in report['strong']['measurements']]

spec = importlib.util.spec_from_file_location('reference', 'research/sketch/calc_dryrun.py')
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)
parts = []
for op, operands in [('sqrt', [8]), ('divide', [8, 4]), ('sqrt', [20000000000])]:
    cost = reference.Cost()
    if op == 'sqrt':
        reference.sqrt_digits(operands[0], 0, cost)
    else:
        reference.divide(*operands, 0, cost)
    parts.append((cost.rows, cost.calls))
assert parts == [(18, 15), (9, 6), (130, 97)]
rows = sum(p[0] for p in parts)
calls = sum(p[1] for p in parts)
assert (rows, calls, seconds(rows, calls)) == (157, 118, Decimal('13.479'))
print('Dependent operations isqrt(8), divmod(8,4), isqrt(2·10^10):', rows, calls, seconds(rows, calls))
print('Scaled square root alone:', seconds(*parts[-1]))
print('Both modes: 200/200 corrupted pairs refused (100%).')

notes = (root / 'NOTES.md').read_text().split('## Earlier rounds (historical)', 1)[0]
rows = [line for line in notes.splitlines() if line.startswith('| `')]
assert len(rows) == 6
for i, measurement in enumerate(report['light']['measurements']):
    first = [c.strip() for c in rows[i].split('|')[1:-1]]
    assert first == [f"`{measurement['source']}`", str(measurement['rows']), str(measurement['calls']), f"{seconds(measurement['rows'],measurement['calls']):.3f}", 'No']
    comparison = [c.strip() for c in rows[i+3].split('|')[1:-1]]
    old_light, old_strong = measurement['brackets'], report['strong']['measurements'][i]['brackets']
    assert comparison == [first[0], first[3], f"{seconds(old_light['rows'],old_light['calls']):.3f}", f"{seconds(old_strong['rows'],old_strong['calls']):.3f}"]
assert '√8 = √(4·2) = 2√2' in notes
assert '√20 = √(4·5) = 2√5' in notes
print('Both NOTES cost tables match the audited report.')
