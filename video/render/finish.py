"""The deliverables, from the rendered picture (video/out/film_picture.mp4) and the mix (video/out/mix.wav).

    python video/render/finish.py

- out/sketchpad_film.mp4    H.264 1080p60 with AAC audio and the captions as a soft subtitle track (also .srt beside it)
- out/sketchpad_loop.mp4    the silent loop: the segments of timeline.json "loop", dissolved into one another and, at
                            the end, into the loop's own first frame, so it repeats without a seam
- out/sketchpad_poster.jpg  the loop's first frame
- out/web/                  the copies for the websites: the homepage card's clip and poster (640 x 360 and 720 x 405),
                            the demo page's hero loop (1280 x 720) and the film for the web
- out/contact.jpg           24 frames across the film, tiled
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
TL = json.loads((ROOT / "timeline.json").read_text())
PY = sys.executable


def ff(*args: str) -> None:
    subprocess.run(["nice", "-n", "10", "ffmpeg", "-v", "error", "-y", *args], check=True)


def dur(p: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout)


pic, mix, srt = OUT / "film_picture.mp4", OUT / "mix.wav", OUT / "sketchpad_film.srt"
film = OUT / "sketchpad_film.mp4"
ff("-i", str(pic), "-i", str(mix), "-i", str(srt), "-map", "0:v", "-map", "1:a", "-map", "2:s", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
   "-movflags", "+faststart", str(film))

# ---- the loop ----------------------------------------------------------------------------------------------------
lp = TL["loop"]
segs = lp["segments"]
d = lp["dissolve"]
inputs: list[str] = []
for a, b in segs:
    inputs += ["-ss", f"{a}", "-t", f"{b - a}", "-i", str(pic)]
# the first frame, held, to dissolve into at the end
inputs += ["-ss", f"{segs[0][0]}", "-t", f"{lp['close'] + 0.5}", "-i", str(pic)]
chain, last, length = [], "[0:v]", segs[0][1] - segs[0][0]
for k in range(1, len(segs)):
    off = length - d
    chain.append(f"{last}[{k}:v]xfade=transition=fade:duration={d}:offset={off:.4f}[x{k}]")
    last = f"[x{k}]"
    length = length + (segs[k][1] - segs[k][0]) - d
n = len(segs)
chain.append(f"[{n}:v]trim=end_frame=1,loop=loop={int((lp['close'] + 0.5) * 60)}:size=1:start=0,setpts=N/60/TB[hold]")
chain.append(f"{last}[hold]xfade=transition=fade:duration={lp['close']}:offset={length - lp['close']:.4f},trim=duration={length:.4f}[loop]")
loop = OUT / "sketchpad_loop.mp4"
ff(*inputs, "-filter_complex", ";".join(chain), "-map", "[loop]", "-an", "-r", "60", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
   "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(loop))
ff("-i", str(loop), "-frames:v", "1", "-q:v", "2", str(OUT / "sketchpad_poster.jpg"))

# ---- the web copies ------------------------------------------------------------------------------------------------
web = OUT / "web"
web.mkdir(exist_ok=True)
# the homepage card: 60 fps like the other clips, small (the others are 0.2 to 1 MB)
ff("-i", str(loop), "-vf", "scale=640:360:flags=lanczos", "-r", "60", "-c:v", "libx264", "-preset", "veryslow", "-crf", "30", "-tune", "animation",
   "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-an", str(web / "sketchpad-card.mp4"))
ff("-i", str(OUT / "sketchpad_poster.jpg"), "-vf", "scale=720:405:flags=lanczos", "-q:v", "3", str(web / "sketchpad-card.jpg"))
# the demo page's hero: the loop at 1280 x 720, and its poster
ff("-i", str(loop), "-vf", "scale=1280:720:flags=lanczos", "-r", "60", "-c:v", "libx264", "-preset", "veryslow", "-crf", "26", "-tune", "animation",
   "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-an", str(web / "sketchpad-loop-720.mp4"))
ff("-i", str(OUT / "sketchpad_poster.jpg"), "-vf", "scale=1280:720:flags=lanczos", "-q:v", "3", str(web / "sketchpad-loop-720.jpg"))
# the film for the web: 1080p, smaller than the master
ff("-i", str(film), "-map", "0:v", "-map", "0:a", "-map", "0:s", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-tune", "animation",
   "-pix_fmt", "yuv420p", "-profile:v", "high", "-c:a", "aac", "-b:a", "160k", "-c:s", "mov_text", "-movflags", "+faststart", str(web / "sketchpad-film.mp4"))
subprocess.run(["/bin/cp", "-f", str(srt), str(web / "sketchpad-film.srt")], check=True)

# Browser players use WebVTT captions; keep the standalone SRT too.
import re
vtt = re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})", r"\1.\2", srt.read_text())
(web / "sketchpad-film.vtt").write_text("WEBVTT\n\n" + vtt)

# ---- the contact sheet: 24 frames of the finished film ------------------------------------------------------------
frames = []
total = dur(film)
(OUT / "contact").mkdir(exist_ok=True)
for i in range(24):
    t = 0.6 + (total - 2.0) * i / 23
    f = OUT / "contact" / f"c{i:02d}_{t:06.2f}s.png"
    ff("-ss", f"{t:.3f}", "-i", str(film), "-frames:v", "1", str(f))
    frames.append(str(f))
subprocess.run([PY, str(ROOT / "render/contact.py"), str(OUT / "contact.jpg"), "4", *frames], check=True)

for p in [film, loop, OUT / "sketchpad_poster.jpg", *sorted(web.iterdir()), OUT / "contact.jpg"]:
    extra = f", {dur(p):.2f} s" if p.suffix == ".mp4" else ""
    print(f"{p.relative_to(ROOT.parent)}: {p.stat().st_size / 1e6:.2f} MB{extra}")
