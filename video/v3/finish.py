"""Encode delivery files, captured movies, every-two-second frames, and transition review sheets."""
import json, subprocess, math
from pathlib import Path
from PIL import Image, ImageDraw
HERE=Path(__file__).resolve().parent;OUT=HERE.parent/'out/v3';TL=json.loads((HERE/'timeline.json').read_text())
DUR=TL['duration']
def run(args):subprocess.run(args,check=True)
master=OUT/'sketchpad_film_v3.mp4'
run(['ffmpeg','-v','error','-y','-i',str(OUT/'film_picture.mp4'),'-i',str(OUT/'mix.wav'),'-map','0:v','-map','1:a','-t',str(DUR),'-c:v','libx264','-preset','slow','-crf','21','-pix_fmt','yuv420p','-r','60','-c:a','aac','-b:a','128k','-movflags','+faststart','-metadata','title=Sketchpad — three cells at a time','-metadata','comment=Recorded demo playback. Narration generated with gpt-audio-1.5, Cedar.',str(master)])
if master.stat().st_size>30_000_000:
 target=OUT/'sketchpad_film_v3_720p.mp4';rate=int((29_000_000*8/DUR-96_000)*.97)
 for p in [1,2]:
  run(['ffmpeg','-v','error','-y','-i',str(master),'-vf','scale=1280:720','-c:v','libx264','-preset','slow','-b:v',str(rate),'-pass',str(p),'-passlogfile',str(OUT/'delivery-pass'),'-r','60']+(['-an','-f','null','/dev/null'] if p==1 else ['-c:a','aac','-b:a','96k','-movflags','+faststart',str(target)]))
 assert target.stat().st_size<30_000_000
# Preserve each capture as a 60 fps movie in addition to the compositor's original frames.
manifest=json.loads((OUT/'capture/manifest.json').read_text())
for name,m in manifest.items():
 run(['ffmpeg','-v','error','-y','-framerate','60','-i',str(OUT/'capture'/name/'%05d.jpg'),'-frames:v',str(m['frames']),'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'capture'/f'{name}.mp4')])
review=OUT/'review';review.mkdir(exist_ok=True);frames=review/'every2s';frames.mkdir(exist_ok=True)
run(['ffmpeg','-v','error','-y','-i',str(master),'-vf','fps=1/2','-fps_mode','passthrough',str(frames/'%04d.png')])
def tile(files,out,cols=4,width=480):
 rows=math.ceil(len(files)/cols);o=Image.new('RGB',(cols*width,rows*(int(width*9/16)+26)),'#edf0f6');d=ImageDraw.Draw(o)
 for i,(f,label) in enumerate(files):
  im=Image.open(f).convert('RGB');im.thumbnail((width,int(width*9/16)));x=i%cols*width;y=i//cols*(int(width*9/16)+26);o.paste(im,(x,y));d.text((x+10,y+int(width*9/16)+6),label,fill='#1f2a44')
 o.save(out,quality=92)
fs=sorted(frames.glob('*.png'))
for a in range(0,len(fs),20):tile([(f,f'{(int(f.stem)-1)*2:06.2f}s') for f in fs[a:a+20]],review/f'every2s-{a//20:02}.jpg')
# Contact sheet: every scene, plus all four opening performances.
times=[(s['start']+(s['end']-s['start'])*.65,s['id']) for s in TL['scenes']]
m=next(s for s in TL['scenes'] if s['id']=='montage');times.extend([(m['start']+2,'multiply'),(m['start']+7,'divide'),(m['start']+13,'factor'),(m['start']+20,'chat')]);times.sort()
contacts=[]
for i,(t,label) in enumerate(times):
 f=review/f'contact-{i:02}.png';run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(master),'-frames:v','1',str(f)]);contacts.append((f,f'{t:06.2f}s · {label}'))
tile(contacts,OUT/'contact_v3.jpg')
# All chapter cuts, montage cuts, and the within-scene changes named in the approved shot list.
narr={n['id']:n['at'] for n in TL['narration']}
transitions=[(s['start'],s['id']) for s in TL['scenes'][1:]]+[(m['start']+x,label) for x,label in [(5,'division'),(10,'cubic'),(16,'chat-montage')]]+[(narr[n]-.7,n) for n in ['N09','N10','N12','N24b','N33','N35','N38','N41']]
transitions.sort();shots=[];tr=review/'transitions';tr.mkdir(exist_ok=True)
for i,(t,label) in enumerate(transitions):
 for j,offset in enumerate([-.2,0,.2,.6]):
  f=tr/f'{i:02}-{j}.png';run(['ffmpeg','-v','error','-y','-ss',str(max(0,t+offset)),'-i',str(master),'-frames:v','1',str(f)]);shots.append((f,f'{t+offset:06.2f}s · {label}'))
for a in range(0,len(shots),16):tile(shots[a:a+16],review/f'transitions-{a//16:02}.jpg')
(review/'index.json').write_text(json.dumps(dict(every2s=len(fs),transitions=transitions,contact=times),indent=2)+'\n')
print('Finished',master.stat().st_size,'bytes;',len(fs),'review frames;',len(transitions),'transitions')
