"""Trim fresh cedar takes without changing pace; allocate the 285-second edit from measured speech."""
import json, subprocess, wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'out/v2'
spec=json.loads((ROOT/'lines.json').read_text())
durations={}
for line in spec['lines']:
    lid=line['id']; src=OUT/'narration/wav'/f'{lid}.wav'
    with wave.open(str(src)) as w:
        sr=w.getframerate(); ch=w.getnchannels()
        x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).reshape(-1,ch).mean(1)/32768
    e=np.sqrt(np.convolve(x*x,np.ones(480)/480,'same'))
    idx=np.where(e>.008)[0]
    a=max(0,idx[0]-int(.06*sr)); b=min(len(x),idx[-1]+int(.10*sr))
    target=OUT/'narration/clean'/f'{lid}.wav'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-af',f'atrim=start={a/sr:.6f}:end={b/sr:.6f},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,aresample=48000','-ac','1',str(target)],check=True)
    with wave.open(str(target)) as w: durations[lid]=w.getnframes()/w.getframerate()
# The entire narration is kept at its generated pace. Fail instead of silently speeding it up.
DUR=285; title=8
speech=sum(durations.values())
assert speech < DUR-title-5, f'{speech:.2f}s speech needs a deliberate pacing revision'
groups=[('silent',['N01','N02']),('title',[]),('idea',[f'N{i:02}' for i in range(3,8)]),('demo',['N08','N09']),('proof',['N10','N11','N12']),('cert',['N13','N14','N15','N16']),('algebra',['N17','N18']),('chat',['N19','N20','N21','N22']),('inside',['N23','N24']),('close',['N25'])]
# Equal sentence breath; spare time is apportioned to visual holds, with the title untouched.
breath=.22
spare=DUR-title-speech-breath*25
assert spare>=0
weights={'silent':1,'idea':1,'demo':1,'proof':2,'cert':2,'algebra':1,'chat':1,'inside':2,'close':2}
unit=spare/sum(weights.values()); t=0; scenes=[]; narration=[]
for name,ids in groups:
    start=t
    if name=='title': t+=title
    else:
        for lid in ids:
            t+=breath
            narration.append({'id':lid,'at':round(t,6),'duration':round(durations[lid],6)})
            t+=durations[lid]
        t+=unit*weights[name]
    scenes.append({'id':name,'start':round(start,6),'end':round(t,6)})
assert abs(t-DUR)<.001
(ROOT/'durations.json').write_text(json.dumps(durations,indent=2)+'\n')
(ROOT/'timeline.json').write_text(json.dumps({'fps':60,'width':1920,'height':1080,'duration':DUR,'scenes':scenes,'narration':narration},indent=2)+'\n')
print(f'{speech:.3f}s natural speech, {DUR-speech:.3f}s breaths and holds')
print(json.dumps(scenes,indent=2))
