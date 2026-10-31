#!/bin/sh
# Builds every figure: static/figures/figN.svg (web, light, scales to its column) and paper/figures/out/figN.pdf
# (vector, 180 mm). One job at a time, at low priority. The Figure 1 candidates fig1_v2a and fig1_v2b are built only on
# request: python paper/figures/fig1_v2.py a|b.
#
#   sh paper/figures/build.sh            (from the repository root)
#
# Data (paper/figures/data/), each copied unchanged from its record (sha256 prefix):
#   certificate_e7.json          73fbcf44  HF mohsenvand/sketchpad-0.8b-preview 2df87172 arithmetic/certificate.json
#                                          (the M4 certificate, 2,446 views; the staged upload of CALC3.md)
#   certificate_e7_ungated.json  73aa92dc  the ungated E7's M4 certificate (CALC3.md: every margin equal)
#   certificate_e6.json          44e5dea6  polyformer static/sketchpad/models/arithmetic/certificate.json (E6)
#   eval_e7_server.json          2dd674ef  polyformer research/sketch/modal/out/e7_s3_4000_h4.0_stop3.0_fast/.../eval.json
#   eval_e6_server.json          c7fe9310  polyformer research/sketch/modal/out/e6_s3_3000_h4.0_stop3.0_fast/.../eval.json
#   eval_e2_server.json          d0bcefa4  polyformer research/sketch/e2_adapter_s1_kl1/eval.json
#   eval_e2b_server.json         ba33f6d2  polyformer research/sketch/e2b_adapter_s1/eval.json
#   calc3_t3.json                3cd5c789  polyformer research/sketch/calc3_t3.json
#   calc3_t3_gated.json          91275b47  polyformer research/sketch/calc3_t3_gated.json
#   atlas_arithmetic-e7.json     be6dd819  polyformer research/sketch/atlas_arithmetic-e7.json
#   inside_e7.json               e72030c2  HF 2df87172 arithmetic/inside.json
#   steer.json                   da0d4bb2  polyformer research/sketch/steer.json (E5 union adapter, layer sweep)
#   steer_digit.json             6ea57f76  polyformer research/sketch/steer_digit.json (E7, layer 20)
#   steer_e7_sweep.json          E7 pushed after every depth 1-23 (paper/review/CONTROLS.md; polyformer
#                                research/sketch/steer_sweep.py on Modal, 31 Oct)
#   base_control.json            the base model on the 2,446 views, zero- and 8-shot (CONTROLS.md; base_control.py)
#   batch_check_m4.json          every view alone and in random batches of 32 and 4 on the M4 (worker.ts batchCheck)
#   e7_gate_identity_summary.json cdc202a3 polyformer research/sketch/e7_gate_identity_summary.json
#   chat_runs.json               transcribed from polyformer-wt/chat research/sketch/chat/CHAT3.md at b392d24d
#                                (lines named in the file)
#   algebra_m4.json              the algebra presets timed on the M4 on 31 Oct by the demo agent (sketchpad 7f82207),
#                                relayed by the orchestrator
#   baselines.json               written by baselines.py from paper/baselines/results.json (the registered run)
#   sheets.json, algebra.json    written by sheets.ts and algebra.ts from the runtime in src/lib/sketchpad
# Algebra costs and refusals are read in place from src/lib/sketchpad/program/round3-*.json.
set -e
cd "$(dirname "$0")/../.."
PY=${PY:-/Users/neo/.claude-science/conda/envs/python/bin/python}
nice -n 19 "$PY" paper/figures/baselines.py
nice -n 19 node paper/figures/sheets.ts
nice -n 19 node --import ./paper/figures/ts-resolve.mjs paper/figures/algebra.ts
for n in 1 2 3 4 5 6; do
	(cd paper/figures && nice -n 19 "$PY" "fig$n.py" 2>&1 | grep -E "^wrote|Error|error" || true)
done
(cd paper/figures && nice -n 19 "$PY" ed1.py 2>&1 | grep -E "^wrote|Error|error" || true)
