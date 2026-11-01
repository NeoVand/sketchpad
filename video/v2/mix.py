"""Mixes the narration over the score and writes the captions.

    python video/v2/mix.py      -> video/out/v2/mix.wav (48 kHz stereo, loudness-normalised) and
                                       video/out/v2/sketchpad_film_v2.srt

Each narration line (video/out/v2/narration/clean/<id>.wav) is placed at its time in video/v2/timeline.json. The score
(video/out/v2/score.wav) is lowered by about 8 dB under the voice, with 0.35 s ramps, then the whole is normalised
to -16 LUFS with a true peak of -1.5 dBTP (ffmpeg loudnorm, two passes). Captions split each line at its punctuation
into pieces of at most two 42-character lines, timed by their share of the line's characters.
"""

import json
import re
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "out/v2"
SR = 48000
TL = json.loads((HERE / "timeline.json").read_text())
LINES = {l["id"]: l for l in json.loads((HERE / "lines.json").read_text())["lines"]}
N = int(TL["duration"] * SR)


def read(path: Path) -> np.ndarray:
    with wave.open(str(path)) as w:
        assert w.getframerate() == SR, path
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        return x.reshape(-1, w.getnchannels())


music = read(OUT / "score.wav")[:N]
music = np.pad(music, ((0, N - len(music)), (0, 0)))
voice = np.zeros(N)
active = np.zeros(N)
spans = []
for item in TL["narration"]:
    x = read(OUT / "narration/clean" / f"{item['id']}.wav")[:, 0]
    x = x / np.sqrt((x**2).mean()) * 0.075  # every line at the same speech level
    i0 = int(item["at"] * SR)
    voice[i0 : i0 + len(x)] += x[: N - i0]
    active[i0 : i0 + len(x)] = 1
    spans.append((item["id"], item["at"], item["at"] + len(x) / SR))
# the ducking envelope: a moving average of "speech is on", 0.35 s wide on each side
w = int(0.35 * SR)
c = np.concatenate([[0.0], np.cumsum(np.pad(active, w, mode="edge"))])
duck = (c[2 * w + 1 :] - c[: -(2 * w + 1)]) / (2 * w + 1)
gain = 1 - 0.6 * duck
mix = music * (0.45 * gain)[:, None] + voice[:, None]
pk = np.abs(mix).max()
if pk > 0.98:
    mix *= 0.98 / pk
raw = OUT / "mix_raw.wav"
with wave.open(str(raw), "wb") as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((mix * 32767).astype(np.int16).tobytes())

# loudness: measure, then normalise linearly to the measured values
probe = subprocess.run(
    ["ffmpeg", "-hide_banner", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
    capture_output=True,
    text=True,
).stderr
m = json.loads(probe[probe.rindex("{") : probe.rindex("}") + 1])
af = (
    f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
    f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,"
    "aresample=48000"
)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", af, "-ar", "48000", str(OUT / "mix.wav")], check=True)
raw.unlink()


# captions
def ts(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms % 3600000 // 60000:02d}:{ms % 60000 // 1000:02d},{ms % 1000:03d}"


def pieces(text: str, limit: int = 78) -> list[str]:
    import textwrap
    parts = re.split(r"(?<=[,;:.])\s+", text)
    out = []
    for part in parts:
        for p in textwrap.wrap(part, width=limit, break_long_words=False, break_on_hyphens=False):
            if out and len(out[-1])+1+len(p)<=limit:
                out[-1]+=" "+p
            else:
                out.append(p)
    return out


def wrap(s: str, width: int = 42) -> str:
    if len(s) <= width:
        return s
    words, best = s.split(), None
    for k in range(1, len(words)):
        a, b = " ".join(words[:k]), " ".join(words[k:])
        cost = max(len(a), len(b))
        if best is None or cost < best[0]:
            best = (cost, a + "\n" + b)
    return best[1]


srt, n = [], 1
for lid, t0, t1 in spans:
    ps = pieces(LINES[lid]["text"])
    total = sum(len(p) for p in ps)
    t = t0
    for p in ps:
        d = (t1 - t0) * len(p) / total
        srt.append(f"{n}\n{ts(t)} --> {ts(min(t + d, t1) - 0.04)}\n{wrap(p)}\n")
        n += 1
        t += d
(OUT / "sketchpad_film_v2.srt").write_text("\n".join(srt))
speech = sum(b - a for _, a, b in spans)
print(f"mix.wav at -16 LUFS; {len(spans)} lines, {speech:.1f} s of narration; {n - 1} captions")
