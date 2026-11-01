# Sketchpad film production

The finished film describes only Qwen3.5-0.8B. `SCRIPT.md` is the storyboard and claim map; `timeline.json` is the authoritative edit. It runs 149 seconds at 1920 × 1080, 60 frames per second, with 89.573 seconds of speech. The silent loop is 23.8 seconds. The source animations reuse the paper’s figures, exact glyph sprites, measurements and recorded model outputs.

The continuation retained the existing narration, score, mix, five demo captures and animation. The certificate and intervention scenes explicitly identify the arithmetic adapter. The published demo captures use the dialogue adapter, and are labelled as recorded runs. No 4B model is described or implied. No new model run was needed.

## Reproduce

Use the repository’s installed Node and pnpm, ffmpeg/ffprobe, and Python with numpy, scipy and Pillow. The only added npm dependency for film production is `playwright@1.64.1`, isolated in `video/` with its own lockfile; it was already installed before the continuation. No packages or media were downloaded during the continuation. The existing Python environment used was `/Users/neo/.claude-science/conda/envs/python/bin/python`.

Run from the repository root:

```sh
node video/film/build-data.ts
# Existing captures are retained in video/out/capture/.
# To recapture the public page, which may have changed since the original capture:
node video/capture/capture.mjs
# Only if audio must be regenerated; this calls the paid API:
python video/narration/list_models.py
python video/narration/synth.py
python video/narration/prepare.py
python video/music/score.py
python video/render/mix.py
nice -n 19 node video/render/render.mjs film 2
nice -n 19 python video/render/finish.py
```

`film/build-data.ts` checks the wrong-digit example, all comparison totals, every recorded multiplication view and all 2,446 margins against repository records. The compositor fails on missing capture images. `render/finish.py` produces the master, silent loop, first-frame poster, website encodes, standalone captions and a 24-frame contact sheet. It retains the entire 149-second ending after the last caption.

The narrator is OpenAI `gpt-audio-1.5`, voice `cedar`. `narration/usage.json` records $0.1994 from response usage and the rates recorded by the original synthesis script, including superseded takes. This is token-accounted cost, not an invoice. Additional API spend during continuation: $0. The script reads the authorized key inside Python; no secret is stored in the repository.

## Files and publication

`FILES.txt` lists the exact source and final output paths. `video/out/` and both narration audio directories are ignored by Git. Website copies under `static/media/` are committed. Captions are available as SRT beside the master and as WebVTT in the browser player.

The Sketchpad demo has a compact preview, links to paper/code/model, and a film page at `/film`; its four original interactive tabs remain available. The homepage card lives in `/Users/neo/repos/NeoVand.github.io` on `sketchpad-card`, and must not be pushed without Neo’s approval. The paper link points to the existing project paper page until an arXiv identifier is supplied; this film task does not submit a manuscript.

## Verification

- `pnpm check`, `pnpm lint`, all 331 tests (`nice -n 19 pnpm test --maxWorkers=2`), and the production build with `BASE_PATH=/sketchpad` passed.
- The homepage branch passed its check, lint and build.
- `render/verify-pages.mjs` checked both built sites at 1440 and 390 pixels, all four demo tabs, preview playback, reduced motion, card links and film metadata, with no browser exceptions or horizontal overflow. Review screenshots are in `out/review/`.
- The final 24-frame `out/contact.jpg` was inspected, along with full-resolution proof, certificate and depth frames. A clipped figure-panel letter was removed.
- The master has 8,940 video frames; the silent loop has 1,428, both at 60 frames per second. The homepage clip is 260,172 bytes. The loop’s first/last-frame average absolute pixel difference is 0.636 on a 0–255 scale.
- The preserved mix measures −16.09 integrated loudness and −1.49 peak on the final audio check. All nine latest successful narration transcripts match the final spoken script.
