"""The film's score, synthesised from nothing but numpy: pads, bells, plucks and a reverb, following the film's timeline.

    python video/music/score.py          -> video/out/score.wav (48 kHz, stereo, the film's length)

Nothing is downloaded or sampled. The idea scene's machine is sonified from its data: each of the 48 recorded steps
of 4,821 x 3,967 sounds one soft note, its pitch taken from the digit the model wrote (video/film/data/film.json), at the
times the film shows the step. Chords follow the scenes in video/timeline.json.
"""

import json
from pathlib import Path

import numpy as np
from scipy.signal import fftconvolve

HERE = Path(__file__).parent
ROOT = HERE.parent
SR = 48000
TL = json.loads((ROOT / "timeline.json").read_text())
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

# ---- 1. silent errors: a low open fifth, glassy notes far apart ----------------------------------------------------
pad(["D2", "A2", "E3"], 0.0, 14.6, amp=0.05, bright=0.25, a=3.0, r=2.0)
for t, n in ((2.4, "A5"), (6.1, "E5"), (9.0, "F#5"), (12.2, "B4")):
    bell(n, t, 0.018, 2.6, pan=0.3)
# ---- 2. title: the chord opens ------------------------------------------------------------------------------------
pad(["D3", "A3", "C#4", "E4", "F#4"], 14.4, 21.6, amp=0.07, bright=0.4, a=1.2, r=3.0)
sub("D2", 14.4, 21.0, 0.05)
for i, n in enumerate(["D5", "F#5", "A5", "C#6", "E6"]):
    bell(n, 14.9 + i * 0.22, 0.03 * (1 - i * 0.1), 3.6, pan=-0.4 + i * 0.2)
# ---- 3. the idea: chords, a soft pulse, then the machine's own steps -----------------------------------------------
T = S["idea"]["start"]
pad(["B2", "F#3", "A3", "C#4", "D4"], T, T + 6.0, amp=0.05)
pad(["G2", "D3", "F#3", "B3"], T + 6.0, T + 11.0, amp=0.05)
pad(["D3", "F#3", "A3", "E4"], T + 11.0, T + 16.0, amp=0.05)
pad(["A2", "E3", "A3", "C#4", "E4"], T + 16.0, T + 20.6, amp=0.05)
arp(["F#4", "A4", "C#5", "D5", "E5"], T + 2.0, T + 11.0, amp=0.016)
# the steps: the schedule of video/film/scenes/idea.js (tick 0 stamps at 10.9 s; tick k ends at starts[k])
ticks = DATA["mul"]["ticks"]
starts = [11.2]
for k in range(1, len(ticks)):
    starts.append(starts[-1] + max(0.1, 1.0 * 0.72 ** (k - 1)))
SCALE = ["D4", "E4", "F#4", "A4", "B4", "D5", "E5", "F#5", "A5", "B5"]


def digit_note(tk) -> float:
    g = tk["out"][0]
    return hz(SCALE[int(g)]) if g.isdigit() else hz("A3")


pluck(digit_note(ticks[0]), T + 10.0, 0.05, 0.8)
for k in range(1, len(ticks)):
    d = starts[k] - starts[k - 1]
    at = T + starts[k - 1] + 0.62 * d  # when the outputs appear
    pluck(digit_note(ticks[k]), at, 0.045 * (0.75 + 0.25 * min(1, d / 0.4)), 0.5, pan=0.4 * np.sin(k))
end = T + starts[-1]
for i, n in enumerate(["D5", "A5", "D6"]):
    bell(n, end + 0.1 + i * 0.12, 0.03, 3.0, pan=-0.3 + 0.3 * i)
# ---- 4. the demo: a steady pulse ----------------------------------------------------------------------------------
T = S["demo"]["start"]
pad(["G2", "D3", "F#3", "B3", "E4"], T, T + 5.8, amp=0.05)
pad(["A2", "E3", "F#3", "C#4"], T + 5.8, T + 11.6, amp=0.05)
arp(["B4", "D5", "F#5", "A5", "E5"], T + 0.5, T + 11.4, amp=0.02)
sub("G1", T, T + 5.8, 0.04)
sub("A1", T + 5.8, T + 11.6, 0.04)
# ---- 5. the proof: thinner, a turn to the minor at Theorem 2 -------------------------------------------------------
T = S["proof"]["start"]
pad(["E3", "B3", "D4", "F#4", "G4"], T, T + 7.2, amp=0.05, bright=0.3)
pad(["C3", "G3", "B3", "E4", "F#4"], T + 7.2, T + 13.8, amp=0.045, bright=0.3)
pad(["B2", "F#3", "A3", "D4"], T + 13.8, T + 17.4, amp=0.05, bright=0.3)
pad(["A2", "E3", "G3", "C#4"], T + 17.4, T + 20.6, amp=0.05, bright=0.3)
for t, n in ((T + 1.0, "B5"), (T + 3.4, "F#5"), (T + 7.8, "E5"), (T + 10.2, "B5"), (T + 14.4, "D5"), (T + 16.6, "A5")):
    bell(n, t, 0.016, 3.0, pan=-0.3)
# the views fly in: a soft rising scatter of very quiet plucks
for i in range(28):
    pluck(hz(["D5", "E5", "F#5", "A5", "B5", "D6"][i % 6]), T + 0.4 + i * 0.09 + rng.uniform(0, 0.04), 0.008, 0.3, pan=rng.uniform(-0.8, 0.8))
# ---- 6. the certificate: the sweep rises, the comparison lands -----------------------------------------------------
T = S["cert"]["start"]
pad(["G2", "D3", "G3", "B3", "D4"], T, T + 5.0, amp=0.05)
pad(["A2", "E3", "A3", "C#4", "E4"], T + 5.0, T + 9.6, amp=0.05)
sweep = ["D4", "E4", "F#4", "A4", "B4", "D5", "E5", "F#5", "A5", "B5", "D6", "E6"]
for i, n in enumerate(sweep * 2):
    pluck(hz(n), T + 0.8 + i * (4.6 / 24), 0.014 + 0.006 * (i / 24), 0.35, pan=-0.7 + 1.4 * i / 24)
pad(["D3", "A3", "C#4", "E4", "F#4", "A4"], T + 9.6, T + 15.0, amp=0.07, bright=0.42, a=0.6)
sub("D2", T + 9.6, T + 15.0, 0.05)
hit = T + 12.9  # "it answered all 220"
for i, n in enumerate(["D4", "A4", "D5", "F#5", "A5", "D6"]):
    bell(n, hit + i * 0.04, 0.03, 4.0, pan=-0.5 + 0.2 * i)
pad(["B2", "F#3", "A3", "D4"], T + 15.0, T + 20.6, amp=0.05)
# ---- 7. algebra, chat, gate ---------------------------------------------------------------------------------------
T = S["apps"]["start"]
pad(["D3", "A3", "D4", "F#4"], T, T + 6.0, amp=0.05)
pad(["C#3", "A3", "E4"], T + 6.0, T + 10.0, amp=0.05)
pad(["B2", "F#3", "D4", "A4"], T + 10.0, T + 15.6, amp=0.05)
arp(["D5", "F#5", "A5", "B5", "E5"], T + 0.4, T + 15.2, amp=0.018)
# the gate: the pad thins for a breath at "gate zero", then the base chord, plainly
pad(["G2", "D3", "B3"], T + 15.6, T + 17.0, amp=0.04)
pad(["G2", "D3", "G3", "B3", "D4"], T + 17.2, T + 24.0, amp=0.05, a=1.0)
bell("G5", T + 16.4, 0.022, 3.0, pan=0.2)
bell("D5", T + 16.9, 0.018, 3.0, pan=-0.2)
# ---- 8. inside: lower, slower ---------------------------------------------------------------------------------------
T = S["inside"]["start"]
pad(["E2", "B2", "D3", "F#3", "G3"], T, T + 7.0, amp=0.05, bright=0.28)
pad(["G2", "D3", "F#3", "A3", "C#4"], T + 7.0, T + 12.4, amp=0.05, bright=0.3)
pad(["A2", "E3", "A3", "C#4", "E4"], T + 12.4, T + 17.6, amp=0.05, bright=0.32)
sub("E1", T, T + 7.0, 0.035)
# the push at depth 20: one low bell where the curve steps up
bell("A3", T + 10.4, 0.03, 4.0)
bell("E5", T + 10.45, 0.016, 3.5, pan=0.3)
# ---- 9. the close: home -------------------------------------------------------------------------------------------
T = S["close"]["start"]
pad(["D3", "A3", "C#4", "E4", "F#4"], T, DUR - 3.0, amp=0.065, bright=0.38, a=1.6, r=3.0)
sub("D2", T, DUR - 3.0, 0.05)
for i, n in enumerate(["A4", "D5", "F#5", "A5", "E6"]):
    bell(n, T + 0.6 + i * 0.3, 0.026, 4.2, pan=-0.4 + 0.2 * i)
bell("D5", T + 9.0, 0.02, 5.0)

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
(ROOT / "out").mkdir(exist_ok=True)
import wave  # noqa: E402

with wave.open(str(ROOT / "out/score.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote video/out/score.wav: {DUR} s, peak normalised to 0.7")
