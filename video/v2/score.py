"""The 285-second v2 score, generated from numpy oscillators, plucks and procedural reverb.

Chords follow v2/timeline.json. The three first-view outputs receive soft notes; no samples,
external music, or paid music API is used. Writes video/out/v2/score.wav at 48 kHz stereo.
"""

import json
from pathlib import Path

import numpy as np
from scipy.signal import fftconvolve

HERE = Path(__file__).parent
ROOT = HERE.parent
SR = 48000
TL = json.loads((HERE / "timeline.json").read_text())
DATA = json.loads((ROOT / "film/data/film.json").read_text())
DUR = TL["duration"]
N = int(DUR * SR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(11)

A4 = 440.0
NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def hz(name: str) -> float:
    """'F#3' -> frequency"""
    pitch, octave = name[:-1], int(name[-1])
    m = NOTE[pitch] + 12 * (octave + 1)
    return A4 * 2 ** ((m - 69) / 12)


def put(sig: np.ndarray, t0: float, pan: float = 0.0) -> None:
    i0 = int(t0 * SR)
    if i0 >= N:
        return
    sig = sig[: N - i0]
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L[i0 : i0 + len(sig)] += sig * gl
    R[i0 : i0 + len(sig)] += sig * gr


def env_adsr(n: int, a: float, r: float) -> np.ndarray:
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-3))
    tail = (n / SR) - t
    e *= np.minimum(1.0, tail / max(r, 1e-3))
    return np.clip(e, 0, 1) ** 1.6


def pad(notes: list[str], t0: float, t1: float, amp: float = 0.05, bright: float = 0.35, a: float = 2.2, r: float = 2.6) -> None:
    """a soft pad: each note a few detuned voices of a band-limited saw, harmonics rolled off by `bright`"""
    n = int((t1 - t0 + r) * SR)
    t = np.arange(n) / SR
    e = env_adsr(n, a, r)
    for k, name in enumerate(notes):
        f = hz(name)
        for det, pan in ((-0.0035, -0.6), (0.0, 0.0), (0.0041, 0.6)):
            ff = f * (1 + det)
            s = np.zeros(n)
            for h in range(1, 9):
                if ff * h > 9000:
                    break
                s += (bright**(h - 1)) / h * np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28))
            # a slow swell so the chord breathes
            lfo = 1 + 0.12 * np.sin(2 * np.pi * (0.07 + 0.013 * k) * t + k)
            put(amp / len(notes) * s * e * lfo, t0, pan * 0.8)


def bell(name: str, t0: float, amp: float = 0.05, decay: float = 3.0, pan: float = 0.0) -> None:
    """an FM bell: carrier f, modulator 3.5 f, index falling with the note"""
    f = hz(name) if isinstance(name, str) else name
    n = int(decay * 2.2 * SR)
    t = np.arange(n) / SR
    idx = 2.2 * np.exp(-t / (decay * 0.25))
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 3.5 * f * t))
    s += 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (decay * 0.3))
    e = np.exp(-t / decay) * np.minimum(1, t / 0.004)
    put(amp * s * e, t0, pan)


def pluck(f: float, t0: float, amp: float = 0.04, decay: float = 0.55, pan: float = 0.0) -> None:
    """a soft marimba-like note: a sine, its fourth harmonic briefly, a quick decay"""
    n = int(decay * 5 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.05) + 0.15 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.12)
    e = np.exp(-t / decay) * np.minimum(1, t / 0.003)
    put(amp * s * e, t0, pan)


def sub(name: str, t0: float, t1: float, amp: float = 0.06) -> None:
    n = int((t1 - t0 + 2.5) * SR)
    t = np.arange(n) / SR
    put(amp * np.sin(2 * np.pi * hz(name) * t) * env_adsr(n, 2.5, 2.5), t0, 0)


def arp(notes: list[str], t0: float, t1: float, step: float = 0.3125, amp: float = 0.022, pattern=(0, 2, 1, 3, 2, 4, 3, 1)) -> None:
    k = 0
    t = t0
    while t < t1 - 0.05:
        name = notes[pattern[k % len(pattern)] % len(notes)]
        # a gentle accent on the beat, and a slow fade in and out across the span
        w = min(1, (t - t0) / 1.6, (t1 - t) / 1.6)
        pluck(hz(name), t, amp * (1.0 if k % 2 == 0 else 0.7) * max(0.0, w), 0.45, pan=0.35 * np.sin(k * 0.9))
        t += step
        k += 1


S = {s["id"]: s for s in TL["scenes"]}
chords = [
 ["D3","A3","C#4","E4","F#4"], ["B2","F#3","A3","C#4","D4"],
 ["G2","D3","F#3","B3","E4"], ["A2","E3","A3","C#4","E4"]]
for si, scene in enumerate(TL["scenes"]):
    a,b=scene["start"],scene["end"]
    if scene["id"]=="silent":
        pad(["D2","A2","E3"],a,b,amp=.045,bright=.24,a=3)
        for k in range(3): bell(["A5","E5","B4"][k],a+2+k*4,.018,2.5,.3)
        continue
    changes=max(1,round((b-a)/10))
    for j in range(changes):
        t0=a+(b-a)*j/changes;t1=a+(b-a)*(j+1)/changes
        chord=chords[(si+j)%4] if scene["id"]!="close" else chords[0]
        pad(chord,t0,t1,amp=.045 if scene["id"] in ("proof","inside") else .055,bright=.30)
        if scene["id"] in ("title","demo","algebra","chat"):
            arp(["D5","F#5","A5","B5","E6"],t0+.3,t1,step=.625,amp=.012)
    bell("D5",a+.7,.023,3,-.2)
    if scene["id"] in ("title","cert","close"):
        sub("D2",a,b-1,.035)
        for i,note in enumerate(["D5","F#5","A5","C#6","E6"]): bell(note,a+.8+i*.24,.021,3.6,-.4+i*.2)
# First displayed outputs of the actual recorded view: 7, 0, A.
T=next(n["at"] for n in TL["narration"] if n["id"]=="N05")
for j,note in enumerate(["F#5","D4","A4"]): pluck(hz(note),T+.6+j*.3,.035,.8)
# The intervention result and the closing invitation each settle onto the same tonic.
T=next(n["at"] for n in TL["narration"] if n["id"]=="N24")
bell("A3",T+4,.025,4)

# ---- reverb: a decorrelated stereo tail of exponentially decaying noise, darkened ----------------------------------
ir_n = int(3.2 * SR)
tt = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-tt / 0.75)
irR = rng.standard_normal(ir_n) * np.exp(-tt / 0.75)
k = np.exp(-np.arange(64) / 9.0)
irL = np.convolve(irL, k / k.sum(), "same")
irR = np.convolve(irR, k / k.sum(), "same")
irL[: int(0.012 * SR)] = 0
irR[: int(0.017 * SR)] = 0
irL /= np.sqrt((irL**2).sum())
irR /= np.sqrt((irR**2).sum())
wetL = fftconvolve(L, irL)[:N]
wetR = fftconvolve(R, irR)[:N]
outL = 0.72 * L + 0.42 * wetL
outR = 0.72 * R + 0.42 * wetR
# the end fades to silence
fade = np.ones(N)
f0 = int((DUR - 4.0) * SR)
fade[f0:] = np.linspace(1, 0, N - f0) ** 2
fade[: int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
outL *= fade
outR *= fade
peak = max(np.abs(outL).max(), np.abs(outR).max())
outL, outR = outL / peak * 0.7, outR / peak * 0.7
pcm = (np.stack([outL, outR], 1) * 32767).astype(np.int16)
(ROOT / "out/v2").mkdir(exist_ok=True)
import wave  # noqa: E402

with wave.open(str(ROOT / "out/v2/score.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote video/out/v2/score.wav: {DUR} s, peak normalised to 0.7")
