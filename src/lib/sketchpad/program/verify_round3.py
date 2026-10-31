"""Independently audit the frozen round-three counts and decimal cost arithmetic. Writes nothing."""
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).parent

def read(name):
    return json.loads((ROOT / name).read_text())

def seconds(d):
    return Decimal(d['rows']) * Decimal('0.037') + Decimal(d['calls']) * Decimal('0.065')

reports = {}
for path in ['textbook', 'evaluation']:
    for mode in ['light', 'strong']:
        report = read(f'round3-{path}-{mode}.json')
        reports[path, mode] = report
        assert sum(c['count'] for c in report['costs'].values()) == 2200
        assert len(report['demos']) == 11
        for demo in report['demos']:
            exact = seconds(demo)
            assert abs(exact - Decimal(str(demo['seconds']))) < Decimal('0.000000001')
            assert demo['under12'] == (exact < 12)
            assert abs(Decimal(demo['rows']) * Decimal('0.037') - Decimal(str(demo['rowFloorSeconds']))) < Decimal('0.000000001')
        wrong = report['refusal']['wrongRoots']
        fault = report['refusal']['evaluationFaults']
        assert wrong == {'attempts': 200, 'caught': 200}
        assert fault['attempts'] == fault['caught'] + fault['missed'] == 200
        assert len(fault['details']) == fault['missed']
        assert sum(d['changed'] for d in fault['details']) == fault['missesWithWrongAnswer']
        assert all(d['status'] == 'ok' for d in fault['details'])
        print(path, mode, 'wrong roots', wrong['caught'], '/', wrong['attempts'], 'faults', fault['caught'], '/', fault['attempts'], f"({Decimal(fault['caught']) / 2}%)", 'changed misses', fault['missesWithWrongAnswer'], 'under12', sum(d['under12'] for d in report['demos']))
        if path == 'evaluation':
            old = read(f'round2-{mode}.json')
            assert old['refusal'] == report['refusal']
            assert [(d['source'], d['rows'], d['calls']) for d in old['demos']] == [(d['source'], d['rows'], d['calls']) for d in report['demos']]

measurements = read('binomial-costs.json')
assert [m['n'] for m in measurements] == list(range(13))
for m in measurements:
    assert m['selected'] == 'pascal'
    assert m['pascal']['rows'] <= m['recurrence']['rows']
    for method in ['pascal', 'recurrence']:
        assert abs(seconds(m[method]) - Decimal(str(m[method]['seconds']))) < Decimal('0.000000001')

print('\n| Work order | Textbook light r/c/s | Textbook strong r/c/s | Evaluation light r/c/s | Evaluation strong r/c/s |')
print('| --- | ---: | ---: | ---: | ---: |')
for i, demo in enumerate(reports['textbook','light']['demos']):
    columns = []
    for key in [('textbook','light'),('textbook','strong'),('evaluation','light'),('evaluation','strong')]:
        d = reports[key]['demos'][i]
        assert d['source'] == demo['source']
        columns.append(f"{d['rows']}/{d['calls']}/{seconds(d):.3f}" + (' ✓' if d['under12'] else ''))
    print('| `' + demo['source'] + '` | ' + ' | '.join(columns) + ' |')

notes = (ROOT / 'NOTES.md').read_text().split('## Round 3 full cost table', 1)[1].split('## Round 3 API', 1)[0]
rows = [line for line in notes.splitlines() if line.startswith('| `')]
assert len(rows) == 11
for i, line in enumerate(rows):
    cells = [c.strip() for c in line.split('|')[1:-1]]
    assert cells[0] == '`' + reports['textbook', 'light']['demos'][i]['source'] + '`'
    for cell, key in zip(cells[1:], [('textbook', 'light'), ('textbook', 'strong'), ('evaluation', 'light'), ('evaluation', 'strong')]):
        d = reports[key]['demos'][i]
        expected = f"{d['rows']}/{d['calls']}/{seconds(d):.3f}" + (' ✓' if d['under12'] else '')
        assert cell == expected
print('NOTES full cost table matches every audited report value.')
