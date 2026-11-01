"""Make the private review deliverables and inspect their encoded media properties."""
import hashlib, json, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'out/v2'

def ff(*args):
    subprocess.run(['ffmpeg','-v','error','-y',*map(str,args)],check=True)

master=OUT/'sketchpad_film_v2.mp4'
phone=OUT/'sketchpad_film_v2_720p.mp4'
ff('-i',OUT/'film_picture.mp4','-i',OUT/'mix.wav','-i',OUT/'sketchpad_film_v2.srt',
   '-map','0:v','-map','1:a','-map','2:s','-c:v','copy','-c:a','aac','-b:a','192k',
   '-c:s','mov_text','-metadata:s:s:0','language=eng','-movflags','+faststart',master)
# 680 kb/s picture plus 96 kb/s audio leaves more than 2 MB below the strict 30 MB cap.
common=['-i',master,'-vf','scale=1280:720:flags=lanczos,fps=30','-c:v','libx264','-preset','slow',
        '-b:v','680k','-pix_fmt','yuv420p','-passlogfile',OUT/'phone_pass']
ff(*common,'-pass','1','-an','-sn','-f','null','/dev/null')
ff(*common,'-pass','2','-map','0:v','-map','0:a','-map','0:s','-c:a','aac','-b:a','96k',
   '-c:s','mov_text','-movflags','+faststart',phone)
assert phone.stat().st_size<30_000_000,phone.stat().st_size
# Deliberately include the short title and each important visual state, not only uniform time samples.
times=[4,12,20,33,42,49,66,76,84,87,93,103,120,133,142,157,173,182,194,204,214,231,258,277]
(OUT/'review').mkdir(exist_ok=True)
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',18)
sheet=Image.new('RGB',(2600,2348),'#e8ebf2');d=ImageDraw.Draw(sheet)
for i,t in enumerate(times):
    f=OUT/'review'/f'{t:06.2f}.png'
    ff('-ss',t,'-i',master,'-frames:v','1',f)
    im=Image.open(f).convert('RGB').resize((640,360),Image.Resampling.LANCZOS)
    x=8+(i%4)*648;y=8+(i//4)*390
    sheet.paste(im,(x,y));d.text((x+8,y+364),f'{int(t)//60}:{int(t)%60:02}',font=font,fill='#1f2a44')
sheet.save(OUT/'contact_v2.jpg',quality=93)
# Additional full-resolution QA frames for the inside panel, cloud, and complete comparison.
for t in [39,46,81,186,237,246,251,284]:
    ff('-ss',t,'-i',master,'-frames:v','1',OUT/'review'/f'{t:06.2f}.png')

def probe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
a,b=probe(master),probe(phone)
for info,w,h,fps,nframes in [(a,1920,1080,'60/1',17100),(b,1280,720,'30/1',8550)]:
    v=next(s for s in info['streams'] if s['codec_type']=='video')
    assert (v['width'],v['height'],v['r_frame_rate'],int(v['nb_frames']))==(w,h,fps,nframes)
    assert abs(float(info['format']['duration'])-285)<.1
    assert {s['codec_type'] for s in info['streams']}=={'video','audio','subtitle'}
# Decode every frame and audio packet, not just the contact sheet.
ff('-i',master,'-f','null','/dev/null')
measure=subprocess.run(['ffmpeg','-hide_banner','-i',str(master),'-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
loud=json.loads(measure[measure.rindex('{'):measure.rindex('}')+1])
files=[master,phone,OUT/'contact_v2.jpg',OUT/'sketchpad_film_v2.srt']
report={'duration_seconds':285,'master':a,'phone':b,'loudness':loud,'contact_seconds':times,
        'files':{f.name:{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in files}}
(OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'files':report['files'],'loudness':loud},indent=2))
