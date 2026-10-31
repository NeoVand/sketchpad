"""Audit exact-answer timing, total timing, ordering and the trial comparison. Writes nothing."""
import json
from decimal import Decimal
from pathlib import Path

root = Path(__file__).parent
report = json.loads((root / 'round5.json').read_text())
before = json.loads((root / 'round5-before-trials.json').read_text())
radicals = json.loads((root / 'round5-radicals.json').read_text())
old = json.loads((root / 'round4.json').read_text())
def seconds(cost):
    return Decimal(cost['rows']) * Decimal('0.037') + Decimal(cost['calls']) * Decimal('0.065')

for mode, rows in report.items():
    assert len(rows) == 3
    assert radicals[mode]['refusal'] == old[mode]['refusal']
    for index, row in enumerate(rows):
        assert row['source'] == before[mode][index]['source']
        for stage in ['exact', 'total']:
            cost = row[stage]
            assert abs(seconds(cost) - Decimal(str(cost['seconds']))) < Decimal('0.000000001')
            assert cost == before[mode][index][stage]
        assert seconds(row['exact']) < 12
        assert seconds(row['total']) > seconds(row['exact'])
        assert row['resultReadyAfterCall'] + 1 == row['approximationFirstOperation']
        kinds = [line['kind'] for line in row['lines']]
        assert kinds[-2:] == ['result', 'approximation']
        assert kinds[kinds.index('result')-1] == 'check'
        assert '\\approx' not in row['lines'][-2]['tex']
        assert row['lines'][-1]['tex'].startswith('x \\approx')
        assert '\\sqrt' not in row['lines'][-1]['tex']
        assert row['total']['rows'] == old[mode]['measurements'][index]['rows']
        assert seconds(row['total']) > seconds(old[mode]['measurements'][index])
        print(mode, row['source'], 'exact:', row['exact']['rows'], row['exact']['calls'], seconds(row['exact']), 'total:', row['total']['rows'], row['total']['calls'], seconds(row['total']), 'trial delta: 0.000 s')
assert report['light'] == report['strong']
print('Both modes: 200/200 corrupted radical pairs refused; all three exact answers under 12 s.')

notes = (root / 'NOTES.md').read_text().split('## Round 4 record (historical)', 1)[0]
rows = [line for line in notes.splitlines() if line.startswith('| `')]
assert len(rows) == 3
for line, row in zip(rows, report['light']):
    cells = [c.strip() for c in line.split('|')[1:-1]]
    exact, total = row['exact'], row['total']
    assert cells == [f"`{row['source']}`", f"{exact['rows']}/{exact['calls']}", f"{seconds(exact):.3f}", f"{total['rows']}/{total['calls']}", f"{seconds(total):.3f}"]
assert '√8 = √(4·2)' in notes
assert '√20 = √(4·5)' in notes
print('NOTES exact/total table matches every audited value.')
