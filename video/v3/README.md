# Sketchpad film v3

Stage 2 production of the approved `../SCRIPT_V3.md`. Private review only; no site assets,
publication settings or remote branches are changed. The source starts from v1 at `b796bf3`:
`silent.js` and `idea.js` extend those scenes; `../film/lib.js`, `../film/grid.js`, the fonts,
glyph sprites and measured `../film/data/film.json` are reused directly. No v2 slide scene
is used. Audio utilities retain the existing production API and mixing conventions.

The measured edit runs **4:42.933 at 1920 × 1080, 60 fps**. Speech takes 223.36 seconds.
This is 14.9 seconds beyond the script's provisional 4:28 budget: the approved expanded N24,
natural Cedar delivery, prescribed pauses, early four-performance montage and six-second
links hold are preserved. The brief permits the length the story needs; no sentence was
removed or sped up. The first multiplication starts at 22.9 seconds, followed by division
at 27.9, algebra at 32.9 and chat at 38.9.

The finished files are in `../out/v3/`:

- `sketchpad_film_v3.mp4`: H.264 1080p60 master, AAC narration and original synthesized score.
- `sketchpad_film_v3.srt`: captions for the final measured narration.
- `contact_v3.jpg`: overview of every chapter and all opening performances.
- `capture/{machine,calc,algebra,chat}.mp4`: new 60 fps captures of the actual demo interface.
- `review/`: an extracted frame every two seconds and four samples around each reviewed transition.
- `verification.json`: claim, pause, capture, codec, duration, size and hash checks.

## Reproduce

From the repository root, use pnpm, Node, ffmpeg/ffprobe and Python with numpy, scipy and
Pillow. This production used `/Users/neo/.claude-science/conda/envs/python/bin/python`.
The existing Playwright installation is isolated in `video/`; no dependencies were added.

```sh
pnpm build
# In another terminal, serve the current production build:
python3 -m http.server 4173 --bind 127.0.0.1 --directory build
node video/v3/capture.mjs
# Paid; skips existing successful takes. Uses the already authorized narration key helper.
python video/v3/synth.py
python video/v3/prepare.py
python video/v3/score.py
python video/v3/mix.py
nice -n 19 node video/v3/render.mjs film 4
python video/v3/finish.py
python video/v3/verify.py
```

`capture.mjs` uses the production build's Recorded mode and original JSON recordings,
with deterministic clocks for both page and background worker. It blocks all model-file
requests. The page's model-size checks attempt six file requests, which are blocked too;
no model downloads or inference occur. Capture-only CSS removes surrounding site chrome,
explanation panels and chat examples, and expands the algebra derivation. It does not alter
recorded inputs, arithmetic events, their order, outputs or runtime logic. The full sheet,
working area and answers remain visible. Acceleration is labelled in the final edit.
The 34-second algebra capture includes all 178 steps and its final factorization.

`prepare.py` trims silence only, then places 0.8 seconds after each sentence and 2.0 seconds
at chapter boundaries. N24's two approved sentences are separate audio takes with the same
0.8-second breath between them. Questions that were initially answered instead of read were
rejected by transcript matching and regenerated with a stronger verbatim-reading prompt.
All attempts, including rejected takes, remain in `usage.json` for cost accounting.

`score.py` extends v1's original synthesized instruments, with chord changes at chapter
boundaries. `mix.py` lowers the music during speech and normalizes the mix. `finish.py`
creates a 720p version below 30 MB if the 1080p master exceeds that limit.

## Sources, scope and cost

The narration and claim ledger remain in `../SCRIPT_V3.md`. `verify.py` checks the original
paper data, including 2,446 margins, 3.016 / 2 → 1.51 rounded, the observed score displacement
1.09375, the 220/217 comparison, and multiplication's 0/80 versus 80/80 intervention.
N24's “more than half” describes strict winner reversal; a tie is possible at exactly half.
The picture retains “rounded” and “tested batches.” The arithmetic-adapter measurements and
dialogue-adapter captures remain explicitly distinguished. Ordinary code stays outside the
proof. Gate zero is followed by gate one before the fresh-word-problem cost is shown.

The production API cost is **$0.571690**, including all discarded takes, calculated from
response usage at the [official gpt-audio-1.5 rates](https://developers.openai.com/api/docs/models/gpt-audio-1.5)
checked on 1 November 2026: $2.50/$10 per million input/output text tokens and $32/$64 per
million input/output audio tokens. This is token-accounted cost, not an invoice. No paid
music, image-generation or model-inference service was used.

The final edit keeps the two key object journeys continuous: the actual second recorded
view, ADD(blank, 7, blank), enters ADD row 0 / column 7 in the complete grid; a single 3.02
moves from the measured score gap into the certificate. New strokes reveal from their
source, followed by arrowheads. The remaining changes use eased movement and short blends.
