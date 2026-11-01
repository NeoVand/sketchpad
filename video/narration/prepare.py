"""Trims each synthesised line to its speech (plus 60 ms either side), speeds it by TEMPO with ffmpeg's pitch-keeping
atempo, resamples to 48 kHz and writes clean/<id>.wav and durations.json. The synthesised pace ran 98 s for the nine
lines; the brief allows 90 s of narration at most, and 1.07 brings it under without a change of voice."""

import json
import subprocess
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
TEMPO = 1.07
(HERE / "clean").mkdir(exist_ok=True)
spec = json.loads((HERE / "lines.json").read_text())
durations = {}
for line in spec["lines"]:
    src = HERE / "wav" / f"{line['id']}.wav"
    with wave.open(str(src)) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    e = np.sqrt(np.convolve(x**2, np.ones(480) / 480, "same"))
    idx = np.where(e > 0.01)[0]
    a, b = max(0, idx[0] - int(0.06 * sr)), min(len(x), idx[-1] + int(0.06 * sr))
    y = x[a:b]
    # 10 ms fades so the cut never clicks
    f = int(0.01 * sr)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    tmp = HERE / "clean" / f"{line['id']}.trim.wav"
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((y * 32767).astype(np.int16).tobytes())
    out = HERE / "clean" / f"{line['id']}.wav"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af", f"atempo={TEMPO},aresample=48000:filter_size=64", "-ac", "1", str(out)],
        check=True,
    )
    tmp.unlink()
    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)], capture_output=True, text=True).stdout)
    durations[line["id"]] = round(d, 3)
(HERE / "durations.json").write_text(json.dumps(durations, indent=1))
print(durations, "total", round(sum(durations.values()), 2))
