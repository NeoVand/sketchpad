"""Trim only silence; preserve the approved sentence and chapter pauses at the voice's natural pace."""
import json, subprocess, wave
from pathlib import Path
import numpy as np
HERE=Path(__file__).resolve().parent
OUT=HERE.parent/'out/v3'
spec=json.loads((HERE/'lines.json').read_text())
lines=[]
for q in spec['lines']:
 if q['id']=='N24':
  a,b=q['spoken'].split('. ',1)
  lines.extend([dict(q,id='N24a',spoken=a+'.',text=a+'.'),dict(q,id='N24b',spoken=b,text=b)])
 else:lines.append(q)
durations={}
for q in lines:
 src=OUT/'narration/wav'/f'{q["id"]}.wav'
 with wave.open(str(src)) as w:
  sr=w.getframerate();ch=w.getnchannels();x=np.frombuffer(w.readframes(w.getnframes()),np.int16).reshape(-1,ch).mean(1)/32768
 e=np.sqrt(np.convolve(x*x,np.ones(int(.02*sr))/int(.02*sr),'same'))
 idx=np.where(e>.006)[0];a=max(0,idx[0]-int(.045*sr))/sr;b=min(len(x),idx[-1]+int(.075*sr))/sr
 target=OUT/'narration/clean'/f'{q["id"]}.wav'
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-af',f'atrim=start={a}:end={b},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,aresample=48000','-ac','1',str(target)],check=True)
 with wave.open(str(target)) as w:durations[q['id']]=w.getnframes()/w.getframerate()
t=1.;narration=[]
for q in lines:
 if q['id']=='N05':t=max(t,23.6)
 if q['id']=='N07':t=max(t,46.6)
 narration.append(dict(id=q['id'],at=round(t,6),duration=round(durations[q['id']],6),text=q['text'],pauseAfter=q['pause']))
 t+=durations[q['id']]+q['pause']
N={q['id']:q for q in narration}
def at(i):return N[f'N{i:02}']['at']
# Scene changes happen in the preceding breath, 0.7 s before the new spoken topic.
starts=[('silent',0),('title',at(5)-2.8),('montage',at(5)-.7),('idea',at(7)-.7),('grid',at(13)-.7),('proof',at(17)-.7),('history',at(20)-.7),('margin',at(21)-.7),('record',N['N24a']['at']-.7),('comparison',at(26)-.7),('algebra',at(28)-.7),('chat',at(31)-.7),('gate',at(34)-.7),('inside',at(36)-.7),('close',at(39)-.7)]
duration=np.ceil((t+6)*60)/60
scenes=[dict(id=n,start=round(a,6),end=round(starts[i+1][1] if i+1<len(starts) else duration,6)) for i,(n,a) in enumerate(starts)]
TL=dict(fps=60,width=1920,height=1080,duration=float(duration),scenes=scenes,narration=narration)
(HERE/'timeline.json').write_text(json.dumps(TL,indent=2)+'\n');(HERE/'durations.json').write_text(json.dumps(durations,indent=2)+'\n');(HERE/'spoken.json').write_text(json.dumps(dict(spec,lines=lines),indent=2)+'\n')
print('Speech',round(sum(durations.values()),2),'Film',duration);print(json.dumps(scenes,indent=2))
