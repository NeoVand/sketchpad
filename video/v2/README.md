# Sketchpad film v2 — private review

The finished edit is **4:45**, with **642 narration words** and 249.926 seconds of speech at its generated pace. All 25 lines were regenerated with `gpt-audio-1.5`, voice `cedar`; every returned transcript matches the requested words. The score is generated procedurally and extends across the whole edit. No model training or new inference was run.

| Deliverable in `video/out/v2/` | Properties                                                        |             Size |
| ------------------------------ | ----------------------------------------------------------------- | ---------------: |
| `sketchpad_film_v2.mp4`        | 1920 × 1080, 60 fps, 17,100 frames; audio and selectable captions | 19,004,074 bytes |
| `sketchpad_film_v2_720p.mp4`   | 1280 × 720, 30 fps, 8,550 frames; audio and selectable captions   | 23,772,759 bytes |
| `contact_v2.jpg`               | 24 deliberately selected frames, including the title              |    844,104 bytes |
| `sketchpad_film_v2.srt`        | 70 caption cues                                                   |      6,228 bytes |

`verification.json` beside the outputs records stream properties, file hashes and final audio measurements. The encoded master measures −16.04 integrated loudness, with a peak of −1.30 dB after audio compression. `review/` contains full-resolution frames extracted from the encoded master.

## Source verification and the one wording correction

The approved edits were checked against `paper/paper.md` and `paper/numbers.md` and incorporated into `video/SCRIPT_V2.md`, including its narration sources and measured speech windows.

- N03: Qwen3.5-0.8B is the paper's model.
- N07: 10,223,616 added weights, 1.2% of the 873,438,784-parameter model including vision. “About ten million” and “a little over one percent” are supported.
- N08: the arithmetic adapter is trained on all table rows, replays weak rows, and uses a penalty toward the original model on ordinary text. The later dialogue-accuracy loss remains spoken and shown.
- N11–N12: the finite-view exactness theorem and the no-finite-test counterexample are in the paper and Lean sources. The runtime conditions and the ordinary-code limitation remain explicit.
- N15: 1.09 is the largest measured score change in the tested random batches. The picture identifies batches of 2, 4 and 32 and retains the conditional less-than-1.51 bound.
- **N16 correction:** the thousand-digit limit applies to **sums**, not multiplication inputs. The spoken line says “with sums up to a thousand digits”; the picture specifies product inputs of 2–20 digits. The totals remain 220 and 217.
- N25: the default rechecks the lowest-margin tenth of **each table**. The ending also says a full new-device check covers all 2,446 views.

## Picture changes and review

The title surrounds the name with the factored cubic, the sheet and its three-cell view, the measured state cloud, the actual certificate margins, and the measured depth curve. These are rendered from the film's and paper's own data. No free-floating title rectangle remains.

The idea scene reveals the sheet's digits and cells first, then the rendered image, then the model, and only then its three outgoing lines and answers. First-use captions explain the method, training, proof, score gap, comparison, gate, dialogue training, and internal-state inspection.

The recorded multiplication, division, algebra and chat are deliberately cropped around complete expressions. The brief whole-window establishing shot fits above its captions. Division was recaptured in Recorded mode through the completed ten-place answer; the new capture remains private in `out/v2/capture/`. The inside-model picture isolates the first-output column and enlarges the layer-axis labels, followed by the arithmetic adapter's measured state cloud and intervention curve.

The contact sheet was inspected, along with encoded-master close-ups of the title, the idea sequence, multiplication, division, algebra, chat, the layer panel and the depth curve. Review caught and corrected a clipped chat line, a cut algebra row, an overlapping inside-scene heading, and overlap between the whole-window establishing view and its captions.

## Reproduce

Use the existing `video/` Playwright installation, ffmpeg/ffprobe, and Python with numpy, scipy and Pillow. The Python used here was `/Users/neo/.claude-science/conda/envs/python/bin/python`. Run from the repository root:

```sh
node video/film/build-data.ts
# Existing v1 captures are retained; only division needs this v2 capture.
node video/v2/capture.mjs calc
# Paid call, only if the fresh v2 WAV files are absent:
python video/v2/synth.py
python video/v2/prepare.py
python video/v2/score.py
python video/v2/mix.py
node video/v2/render.mjs audit
node video/v2/render.mjs film 4
python video/v2/finish.py
python video/v2/verify.py
```

`render.mjs stills <seconds...>` makes additional local review frames. Its audit checks all text against the horizontal safe frame at half-second intervals. `finish.py` checks dimensions, frame counts, duration, subtitle/audio presence, the strict 30,000,000-byte phone limit, and a complete decode of the master. `verify.py` checks all narration transcripts, word count, caption completeness and timing, and the key source numbers. JavaScript lint, formatting checks, Python compilation, source-data rebuild, and these production checks passed. App checks were unnecessary because the application and published assets were untouched.

`input-manifest.json` records the source data and fresh audio hashes used for this cut. Generated pictures, recordings and audio remain under the ignored `video/out/v2/`; source scripts, narration text, usage, measured timing and this report are committed.

## Cost and publication

**New API cost: $0.347612**, estimated from the usage returned by 25 successful calls, with no retries. `usage.json` contains the per-call accounting. Rates are $2.50/$10 per million input/output text tokens and $32/$64 per million input/output audio tokens, checked against [official OpenAI documentation](https://developers.openai.com/api/docs/models/gpt-audio-1.5). This is usage accounting, not an invoice. Music, rendering and captures added no API cost. Keys were neither printed nor stored in these sources.

The live site, film page, `static/media`, and all v1 production files remain unchanged. The production sources are committed on local `main`; nothing was pushed or published.
