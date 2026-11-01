"""Check the narration, edit, caption text, and source claims without calling an API."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
VIDEO=ROOT.parent
load=lambda name: json.loads((ROOT/name).read_text())
lines=load('lines.json')['lines'];usage=load('usage.json');tl=load('timeline.json')
normal=lambda s:re.sub(r'[^a-z0-9 ]+',' ',s.lower().replace('-',' ')).split()
assert len(lines)==25
assert sum(len(x['text'].split()) for x in lines)==642
assert len(usage['calls'])==25 and all(c['match'] for c in usage['calls'])
for l in lines:
    call=next(c for c in usage['calls'] if c['id']==l['id'])
    assert normal(call['transcript'])==normal(l['spoken']),l['id']
assert abs(usage['total_usd']-sum(c['usd'] for c in usage['calls']))<.000001
for a,b in zip(tl['narration'],tl['narration'][1:]):assert a['at']+a['duration']<=b['at']
assert tl['narration'][-1]['at']+tl['narration'][-1]['duration']<285
srt=(VIDEO/'out/v2/sketchpad_film_v2.srt').read_text()
blocks=srt.strip().split('\n\n');spoken=[];last=0
for block in blocks:
    row=block.splitlines();assert len(row)<=4,row
    def seconds(s):
        h,m,s=s.replace(',','.').split(':');return float(h)*3600+float(m)*60+float(s)
    a,b=[seconds(x) for x in row[1].split(' --> ')]
    assert a>=last and b>a and b<=285
    last=b
    assert all(len(s)<=45 for s in row[2:]),row
    spoken+=row[2:]
assert normal(' '.join(spoken))==normal(' '.join(x['text'] for x in lines))
# The record that feeds the pictures is independently rebuilt by film/build-data.ts.
data=json.loads((VIDEO/'film/data/film.json').read_text())
assert sum(len(row) for b in data['cert']['blocks'].values() for row in b)==2446
assert round(data['cert']['weakest']['margin'],2)==3.02
assert data['bars'][0]['exact']==220 and data['bars'][1]['exact']==217
paper=(VIDEO.parent/'paper/paper.md').read_text();numbers=(VIDEO.parent/'paper/numbers.md').read_text()
assert '10.2 million parameters (1.2%' in paper
assert '10,223,616; 1.2% of 873,438,784' in numbers
assert 'no logit moved by more than 1.09' in paper
assert 'lowest-margin tenth of each table' in paper
script=(VIDEO/'SCRIPT_V2.md').read_text()
for l in lines:assert l['text'] in script,l['id']
print(f'25 exact narration transcripts; {len(blocks)} complete, non-overlapping captions; 642 words; timing and source claims pass.')
