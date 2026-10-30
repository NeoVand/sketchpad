# The paper: writing plan

Skeleton of 30 Oct 2026. The site's paper page (`src/lib/paper/outline.ts`) shows the same sections; this file holds
what each needs and where the material lives. The paper is about the sketchpad and the theorems that survived the
audits; the exploration stays in polyformer.

**Voice.** First person plural, active verbs for every contribution (we certify, we prove, we show); the method has a
name and we use it; findings stated, never narrated; limits stated once. Abstract in Nature's shape: the problem,
"Here we …", results with numbers, what follows. **Novelty:** every "first" or "not found" is labelled verified (with
its source) or unverified, and only the sentences the prior-art gate allowed are used, each once its piece has passed
(polyformer `research/meta/SKETCHPAD3.md` §6 item 7).

**Figures.** Cobalt and Rose (rose for ours, cobalt for the strongest alternative), white backgrounds, only figures
that reveal structure. The opening figure shows the contribution at once: the sheet, one tick, the certificate.

## Sections

1. **Introduction.** The problem, the idea (the sheet is the only state; one step per forward pass; a fixed runtime
   paints and moves), the contributions with numbers, the opening figure.
2. **The sheet machine.** Views, ticks, the runtime; placeholder slots (one forward pass per multiply step); waves.
   Source: polyformer `research/sketch/REPORT.md`, `src/lib/sketchpad/`.
3. **Certification.** Theorem P in sheet form (exact on every run of every length ⇔ exact on the finite set of views
   under the pinned-sheet policy) and the no-finite-test theorem (necessity); the certificate (1,795 views, margins),
   the on-device re-check, fp16 against q4. Prior art to cite: Moore 1956 (experiments on sequential machines), Cai et
   al. 2017 (proving learned programs on finite inputs). Polyformer `research/meta/SKETCHPAD.md` calls the sheet form
   a routine lift: state it, do not sell it.
4. **A calculator on the sheet.** The five tables; Knuth's Algorithm D; square root with c² normalisation; gcd; signed
   numbers. Waits on: E7 (CALC stream) and the on-device runs.
5. **Algebra by evaluation.** Interpolation from values, Kronecker substitution, Cramer and Bareiss, guess then prove;
   the light and strong checks and their refusal rates. Waits on: the work-order runtime round 2 (PROGRAM stream).
6. **One model that decides.** The gate (`lora_gate`: 0 is stock bit for bit, 1 the program); the work order;
   self-distillation for retention; precision and recall of opening the sheet; instruction-following against stock.
   Waits on: the chat fine-tune (CHAT stream).
7. **Inside the model.** Logit lens, the answer-writing state, the push at layer 20.
8. **Related work.** The list in polyformer `research/audit/sketchpad3_gate/out.md`, plus the full literature review.
9. **Limits.** What is not certified; speed; scope.

**Appendix.** The Lean package (the theorems the paper states, 0 sorry), the certificate format, and how to reproduce
every number (the scripts in `research/`, the Modal app, the Hugging Face runs).

## Theorems: candidates, for Neo to choose

From polyformer's post-audit record (`research/meta/META_REPORT.md`, "What survives"): the Lean package holds, with no
`sorry`, Theorem P (iff), the no-finite-test theorem, composition, pointer, cache policy, adder correctness and the
decoder's discrete core. For this paper the natural set is Theorem P in sheet form, no-finite-test, composition (a
procedure built from certified steps stays exact) and cache policy (when a certificate measured on one device carries
to another). The decoder class theorem is the one item the audits still rated new; whether it belongs in this paper
is open.

## Open questions

- The paper's light or dark page: the site is dark like the demo; the figures are white.
- Author line and affiliation.
- arXiv source: LaTeX written alongside the web text, or generated from it.
