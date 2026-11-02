"""Verify the production's paper claims, capture endpoints, pause contract, and delivered codecs."""
import json, subprocess, hashlib, re
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];OUT=ROOT/'video/out/v3'
def read(p):return json.loads((ROOT/p).read_text())
D=read('video/film/data/film.json');TL=read('video/v3/timeline.json');U=read('video/v3/usage.json');SP=read('video/v3/spoken.json')
checks={}
def check(name,v):
 assert v,name
 checks[name]=True
check('opening true sum',int(D['silent']['a'])+int(D['silent']['b'])==int(D['silent']['truth']))
check('one wrong digit',sum(a!=b for a,b in zip(D['silent']['answer'],D['silent']['truth']))==1)
m=[x for rows in D['cert']['blocks'].values() for row in rows for x in row]
check('2446 views',len(m)==2446);check('minimum margin',min(m)==3.016)
check('rounded half-margin',round(min(m)/2,2)==1.51)
batch=read('paper/figures/data/batch_check_m4.json')['arithmetic']
check('observed score movement',max(x['maxLogit'] for x in batch.values())==1.09375)
check('tested batches below half margin',all(x['maxLogit']<x['minAlone']/2 and x['fails']==0 for x in batch.values()))
results=read('paper/baselines/results.json');totals={}
for r in results:totals[r['system']]=totals.get(r['system'],0)+int(r['exact'])
check('220 and 217',max(totals.values())==220 and sorted(set(totals.values()),reverse=True)[1]==217)
steer=read('paper/figures/data/steer_e7_sweep.json')
check('multiplication intervention',all(steer[f'MUL@{i}']==0 for i in range(1,20)) and steer['MUL@20']==1)
check('product',int(D['mul']['a'])*int(D['mul']['b'])==19124907)
for i,n in enumerate(TL['narration']):
 if i<len(TL['narration'])-1:
  gap=TL['narration'][i+1]['at']-n['at']-n['duration'];check('pause '+n['id'],gap>=n['pauseAfter']-2e-6)
 check('audio '+n['id'],(OUT/'narration/clean'/f'{n["id"]}.wav').exists())
 good=[c for c in U['calls'] if c['id']==n['id'] and c['match']];check('transcript '+n['id'],bool(good))
check('API accounted',abs(sum(c['usd'] for c in U['calls'])-U['total_usd'])<1e-6)
cap=read('video/out/v3/capture/manifest.json')
for name,expected in [('machine','19124907'),('calc','3.1428571428'),('algebra','220 views'),('chat','15880')]:
 c=cap[name];check('capture '+name,expected in c['finalText'] and c['modelDownloads']==0 and not c['errors'])
 check('frames '+name,len(list((OUT/'capture'/name).glob('[0-9][0-9][0-9][0-9][0-9].jpg')))==c['frames'])
check('four demos by 40 seconds',next(s['start'] for s in TL['scenes'] if s['id']=='montage')+16<40)
check('six-second link hold',TL['duration']-TL['narration'][-1]['at']-2.1>=6)
master=OUT/'sketchpad_film_v3.mp4'
if master.exists():
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(master)]));v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
 check('1080p60 H264',v['width']==1920 and v['height']==1080 and v['codec_name']=='h264' and v['r_frame_rate']=='60/1')
 check('all video frames',int(v['nb_frames'])==round(TL['duration']*60));check('full audio',a['codec_name']=='aac' and abs(float(a['duration'])-TL['duration'])<.1)
 check('under 30 MB delivery',master.stat().st_size<=30_000_000 or (OUT/'sketchpad_film_v3_720p.mp4').stat().st_size<30_000_000)
 check('caption file',(OUT/'sketchpad_film_v3.srt').stat().st_size>0)
 files={p.name:dict(bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in OUT.glob('sketchpad_film_v3*')}
else:probe=None;files={}
report=dict(checks=checks,duration=TL['duration'],api_usd=U['total_usd'],rates_source='https://developers.openai.com/api/docs/models/gpt-audio-1.5',files=files,probe=probe)
(OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(len(checks),'checks passed; API $'+str(U['total_usd']))
