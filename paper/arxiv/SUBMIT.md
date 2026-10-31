# arXiv submission: Sketchpad

Everything here is ready except the upload, which Neo does from his own arXiv account. Neo's decisions (31 Oct 2026):
the author is listed as **Mostafa 'Neo' Mohsenvand**, and the licence is **CC BY 4.0**.

## The package

**Upload this one file:** `paper/arxiv/sketchpad-arxiv.tar.gz` (476,558 bytes, 465 KiB).
- It holds `main.tex` and the seven figure PDFs in `figures/`, nothing else.
- There is no `.bbl` and no style file. The references are written inline in `main.tex` (`thebibliography`), so arXiv
  needs no BibTeX run, and every package used is in TeX Live.

**Built from** `paper/paper.md` and `paper/refs.bib` as committed together with this file, with
`node paper/build-tex.ts --arxiv`. That target writes a pdfLaTeX `main.tex`:
- `\pdfoutput=1` on line 2;
- T1 Latin Modern through `fontenc`, `inputenc` and `lmodern`, and no `fontspec`;
- every non-ASCII character replaced by a LaTeX command, so the file is plain ASCII. The build stops if a character
  has no mapping.

**Checked with** `uvx --with modal modal run paper/arxiv/check_pdflatex.py`, run on the tarball committed here:
- Modal app `sketchpad-arxiv`, CPU only, a few cents;
- pdfTeX 1.40.26 from TeX Live 2025/dev on Debian trixie, run twice;
- both passes exited 0;
- 0 errors, 0 undefined references or citations, 0 overfull boxes, 0 missing characters, 0 warnings (pdfTeX's
  included);
- 22 A4 pages. `paper/arxiv/verify/main.pdf` is the PDF arXiv should produce, and `verify/main.log` is its log.

**Compared with the tectonic PDF** (`paper/tex/main.pdf`, also 22 pages, served as `static/sketchpad.pdf`):
- same text, equations (1)–(15), figures 1–6 and Extended Data Fig. 1, six Extended Data tables, and references 1–102;
- line breaks differ slightly, because pdfLaTeX's microtype also stretches fonts.

Both builds give each numbered equation its own link anchor. Before, amsmath's `\tag` made equation links land on
the first equation of their section.

**To rebuild after any edit to `paper.md`:**
1. Run `node paper/build-tex.ts --arxiv`.
2. Run the Modal check.
3. Confirm 0 errors, 0 undefined references and 0 overfull boxes before uploading.

## What Neo types into the arXiv form

**Title**

```
Sketchpad: certified exact arithmetic with a small vision-language model
```

**Authors**

```
Mostafa 'Neo' Mohsenvand
```

**Abstract** (plain text, 1,510 characters of the 1,920 allowed, 241 words, ASCII only)

```
Language models remain unreliable on long arithmetic, and tool use moves the computation outside the network. We present Sketchpad, a method in which a 0.8-billion-parameter vision-language model, Qwen3.5-0.8B with a low-rank adapter, executes arithmetic procedures on a rendered sheet that serves as its only working memory. Each forward pass reads a three-cell view of the sheet and emits one step: a digit, a carry or borrow, and the next operation; a fixed runtime writes the outputs and moves the view. Because each step depends only on its view, correctness on the finite set of views is equivalent to correctness on all inputs of any length. We prove this, together with its necessity, composition and robustness to numerical perturbation, with the core statements checked in Lean, and certify all 2,446 views on the deployment device, a laptop GPU running the model in a web browser. The certified model performs signed addition and subtraction, long multiplication and division, square roots and greatest common divisors at arbitrary length. It solved 200 of 200 pre-registered problems in the browser, and 220 of 220 sums of up to 1,000 digits and products of up to 20 digits, on which the strongest of ten other models, GPT-6.1 Sol, solved 217 and the strongest open-weight model, DeepSeek-V4-Pro, 199. Built on these procedures, a symbolic runtime solves, expands and factors polynomials with every number computed by the model. A multiplicative gate on the adapter recovers the base model exactly.
```

**Comments**

```
22 pages, 7 figures (6 + 1 Extended Data), 6 Extended Data tables. Demo: https://neovand.github.io/sketchpad/demo ; code (Apache 2.0): https://github.com/NeoVand/sketchpad ; model: https://huggingface.co/mohsenvand/sketchpad-0.8b-preview
```

All three links returned HTTP 200 on 31 Oct 2026, and the GitHub repository is public.

**Licence:** Creative Commons Attribution 4.0 (CC BY 4.0).

**Primary category:** Computer Science → Machine Learning (cs.LG).

**Cross-lists:** cs.CL, cs.LO.

**Leave empty:** Report number, Journal reference, DOI, MSC classes and ACM classes.

## Why these categories

- **cs.LG** is the primary category because the contribution is a way to train a learned model and certify it, and
  the results are about that model.
- **cs.CL**, because the model is a language model, and most of the compared work (LLM arithmetic, chain of thought,
  tool use) sits there.
- **cs.LO**, because the exactness theorems are checked in Lean and the certificate is a verification method. Of the
  three, a moderator is most likely to question this one, but formal verification is a fair fit.
- **Not used:**
  - cs.CV: the input is rendered images, but the paper proposes no vision method.
  - cs.SC: only the algebra section fits.
  - cs.AI: broad, and adds little reach.
- arXiv moderators may drop a cross-list they judge off-topic.

## About the licence

CC BY 4.0 lets anyone copy and redistribute the paper with attribution. It matches the Apache-2.0 code and the open
model. arXiv does not allow a licence to be made more restrictive later, so check the target journal's preprint policy
before submitting.

## Upload checklist for Neo

1. **Log in** at <https://arxiv.org/login> with your own account and choose **Start New Submission**.
2. **Licence and policies.**
   - Confirm your contact details.
   - Select **Creative Commons Attribution 4.0 (CC BY 4.0)**.
   - Accept the submission terms; only you can do this.
   - Under *Archive and subject class* choose **Computer Science → Machine Learning (cs.LG)**.
3. **Add files.**
   - Upload `paper/arxiv/sketchpad-arxiv.tar.gz`.
   - The file list must show exactly 8 files: `main.tex`, `figures/fig1.pdf` … `figures/fig6.pdf` and
     `figures/ed1.pdf`.
   - Delete anything else, such as a stray `._*` file. The tarball has none.
4. **Process.**
   - arXiv compiles with pdfLaTeX; expect no errors or warnings.
   - Open the generated PDF and compare it with `paper/arxiv/verify/main.pdf`: 22 pages, Fig. 1 on page 2,
     references ending at 102 on page 22.
5. **Metadata.**
   - Paste the title, the author (`Mostafa 'Neo' Mohsenvand`), the abstract and the comments exactly as above.
   - Leave the other fields empty.
6. **Cross-lists:** add **cs.CL** and **cs.LO**.
7. **Preview and Submit.** Note the submission ID (`submit/…`).
8. **Endorsement.** If arXiv asks for one (a first cs.LG submission from this account), it shows a code. Send the code
   to someone who has posted in cs.LG; the submission waits until they endorse it.
9. **Timing.**
   - 31 October 2026 is a Saturday.
   - Anything submitted before Monday 2 November, 14:00 ET, is announced that Monday at 20:00 ET, unless moderation
     holds it.
   - The PDF's date line reads 31 October 2026. To change it, edit `date:` in `paper.md` and rebuild first.
10. **After it appears.**
    - Add the arXiv link to the site, the GitHub README and the Hugging Face model card.
    - Later versions go through **Replace** on the same ID (v2, v3, …).

Never share the arXiv password or session with an agent. Steps 1–10 are Neo's.

## What is in this folder

| Path | Purpose | In the tarball |
|---|---|---|
| `main.tex`, `figures/*.pdf` | the arXiv source, generated; do not edit by hand | yes |
| `sketchpad-arxiv.tar.gz` | the file to upload | — |
| `check_pdflatex.py` | the Modal pdfLaTeX check | no |
| `verify/main.pdf`, `verify/main.log` | the check's output, i.e. the PDF arXiv should produce | no |
| `PRIOR_ART_2026-10-31.md` | the prior-art check before posting, and what was applied | no |
| `SUBMIT.md` | this file | no |
