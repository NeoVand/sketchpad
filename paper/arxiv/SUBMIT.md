# arXiv submission: Sketchpad

Everything here is ready except the upload, which Neo does from his own arXiv account.

## The package

- **Upload this one file:** `paper/arxiv/sketchpad-arxiv.tar.gz` (475,366 bytes, 464 KiB). It holds `main.tex` and the
  seven figure PDFs in `figures/`, and nothing else. There is no `.bbl` and no style file. The references are written
  inline in `main.tex` (`thebibliography`), so arXiv needs no BibTeX run. Every package used is in TeX Live.
- **Built from:** `paper/paper.md` and `paper/refs.bib` at commit `22c0d01`, with `node paper/build-tex.ts --arxiv`.
  That target writes a pdfLaTeX `main.tex`: `\pdfoutput=1`, T1 Latin Modern through `fontenc`, `inputenc` and
  `lmodern`, and no `fontspec`. Every non-ASCII character is replaced by a LaTeX command, so the file is plain ASCII, and
  the build stops if a character has no mapping. The web page and the tectonic PDF (`--pdf`) are unchanged.
- **Checked with:** `uvx --with modal modal run paper/arxiv/check_pdflatex.py`, on Modal app `sketchpad-arxiv`, CPU only,
  for a few cents. The check unpacks the tarball and runs `pdflatex` twice. The engine was pdfTeX 1.40.26, from TeX Live
  2025/dev on Debian trixie.
  - Both passes exited 0.
  - 0 errors.
  - 0 undefined references or citations.
  - 0 overfull boxes.
  - 0 missing characters.
  - 0 warnings, pdfTeX's included.
  - Output: 21 A4 pages. `paper/arxiv/verify/main.pdf` is the PDF arXiv should produce, and `verify/main.log` is its log.
- **Compared with the tectonic PDF** (`paper/tex/main.pdf`, also 21 pages), page by page:
  - same text (word-level diff of the extracted text: 99.4% identical; the rest is hyphenation, float order and URL line
    breaks in the extraction), same equations (1)–(15), figures 1–6 and Extended Data Fig. 1, six Extended Data tables
    and references 1–94;
  - line breaks differ slightly, because pdfLaTeX's microtype also stretches fonts.
- **One fix applies only to the arXiv build.** Each numbered equation now has its own link anchor. In the tectonic PDF,
  amsmath's `\tag` makes hyperref reuse one anchor per section (`equation.3.1` ×3, `equation.4.1` ×3, `equation.7.1`
  ×2, `equation.9.1` ×2), so clicking "(4)" can land on (3). The fix is one line in `src/lib/paper/tex.ts`: drop the
  `pdf &&` guard on `anchor`. It was left out of the tectonic path because the brief said to keep that path unchanged.

To rebuild after any edit to `paper.md`: run `node paper/build-tex.ts --arxiv`, run the Modal check, and confirm the
0/0/0 line before uploading.

## Metadata to paste

**Title**

```
Sketchpad: certified exact arithmetic with a small vision-language model
```

**Authors.** Neo decides between two forms:
- `Mostafa Mohsenvand`. This is recommended, because arXiv's author parser and Google Scholar handle a plain name best.
- `Mostafa 'Neo' Mohsenvand`, as the PDF shows it.

To show the affiliation, write `Mostafa Mohsenvand (MIT Media Lab)`.

**Abstract** (plain text, 1,510 characters of the 1,920 allowed, 241 words, ASCII only)

```
Language models remain unreliable on long arithmetic, and tool use moves the computation outside the network. We present Sketchpad, a method in which a 0.8-billion-parameter vision-language model, Qwen3.5-0.8B with a low-rank adapter, executes arithmetic procedures on a rendered sheet that serves as its only working memory. Each forward pass reads a three-cell view of the sheet and emits one step: a digit, a carry or borrow, and the next operation; a fixed runtime writes the outputs and moves the view. Because each step depends only on its view, correctness on the finite set of views is equivalent to correctness on all inputs of any length. We prove this, together with its necessity, composition and robustness to numerical perturbation, with the core statements checked in Lean, and certify all 2,446 views on the deployment device, a laptop GPU running the model in a web browser. The certified model performs signed addition and subtraction, long multiplication and division, square roots and greatest common divisors at arbitrary length. It solved 200 of 200 pre-registered problems in the browser, and 220 of 220 sums of up to 1,000 digits and products of up to 20 digits, on which the strongest of ten other models, GPT-6.1 Sol, solved 217 and the strongest open-weight model, DeepSeek-V4-Pro, 199. Built on these procedures, a symbolic runtime solves, expands and factors polynomials with every number computed by the model. A multiplicative gate on the adapter recovers the base model exactly.
```

**Comments**

```
21 pages, 7 figures (6 + 1 Extended Data), 6 Extended Data tables. Demo: https://neovand.github.io/sketchpad/demo ; code (Apache 2.0): https://github.com/NeoVand/sketchpad ; model: https://huggingface.co/mohsenvand/sketchpad-0.8b-preview
```

All three links returned HTTP 200 on 31 Oct 2026, and the GitHub repository is public.

**Leave empty:** Report number, Journal reference and DOI, since the paper is not yet published. MSC classes are also
not needed. ACM class is optional; if wanted, use `I.2.6; F.3.1` (learning; verifying programs).

## Categories

- **Primary: cs.LG (Machine Learning).** The contribution is a way to train a learned model and certify it, and the
  results are about that model.
- **Cross-list: cs.CL (Computation and Language).** The model is a language model, and most of the work the paper
  compares with sits there: LLM arithmetic, chain of thought and tool use.
- **Cross-list: cs.LO (Logic in Computer Science).** The exactness theorems are checked in Lean, and the certificate is
  a verification method. Of the three, a moderator is most likely to question this one; it is still a fair fit for
  formal verification.
- **Alternatives, not recommended:**
  - cs.CV: the input is rendered images, but the paper proposes no vision method.
  - cs.SC (Symbolic Computation): only the algebra section fits.
  - cs.AI: broad and adds little reach.

Keep the total to three; arXiv moderators may drop cross-lists they judge off-topic.

## Licence (Neo chooses; it cannot later be made more restrictive)

- **Recommended: CC BY 4.0.** Anyone may copy and redistribute the paper with attribution. This matches the Apache-2.0
  code and the open model, and it is the licence most funders and open-access venues prefer.
- **Alternative: the arXiv non-exclusive distribution licence** (arXiv's default). Only arXiv may distribute the paper.
  Choose it if the target journal's preprint policy asks for it.
- Check the policy of the journal you intend to submit to before choosing.

## Upload checklist for Neo

1. **Decide first:**
   - the author-name form;
   - the licence;
   - whether to fold the prior-art citations (`PRIOR_ART_2026-10-31.md`, changes C1–C5) into this version or into v2.

   If `paper.md` changes, rebuild and re-check as above.
2. **Log in** at <https://arxiv.org/login> with your own account, then choose **Start New Submission**.
3. **Licence and policies.**
   - Confirm your contact details.
   - Pick the licence.
   - Accept the submission terms; only you can do this.
   - Under *Archive and subject class* choose **Computer Science → Machine Learning (cs.LG)**.
4. **Add files.**
   - Upload `paper/arxiv/sketchpad-arxiv.tar.gz`.
   - The file list must show exactly `main.tex` and `figures/fig1.pdf` to `fig6.pdf` plus `figures/ed1.pdf`: 8 files.
   - Delete anything else, such as a stray `._*` file. The tarball has none.
5. **Process.**
   - arXiv compiles with pdfLaTeX; `\pdfoutput=1` is on line 2.
   - Expect no errors or warnings.
   - Open the generated PDF and check it against `paper/arxiv/verify/main.pdf`: 21 pages, Fig. 1 on page 2,
     references ending at 94 on page 21.
6. **Metadata.**
   - Paste the title, authors, abstract and comments from this file.
   - Add the cross-lists **cs.CL** and **cs.LO**.
7. **Preview and Submit.** Note the submission ID (`submit/…`).
8. **Endorsement.** If arXiv asks for one (first cs.LG submission from this account), it shows a code. Send it to
   someone who has posted in cs.LG; the submission waits until they endorse.
9. **Timing.**
   - Today is Saturday 31 October 2026.
   - Submissions made before Monday 2 November, 14:00 ET, are announced that Monday at 20:00 ET.
   - Moderation can hold a paper for a day or more.
   - The PDF's date line says 31 October 2026; change `date:` in `paper.md` first if you want the posting date there.
10. **After it appears.**
    - Add the arXiv link to the site, the GitHub README and the Hugging Face model card.
    - Later versions go through **Replace** on the same ID, giving v2, v3 and so on.

Never share the arXiv password or session with an agent. Everything up to step 1 is done; steps 2–10 are yours.

## What is in this folder

| Path | Purpose | In the tarball |
|---|---|---|
| `main.tex`, `figures/*.pdf` | the arXiv source, generated; do not edit by hand | yes |
| `sketchpad-arxiv.tar.gz` | the file to upload | — |
| `check_pdflatex.py` | the Modal pdfLaTeX check | no |
| `verify/main.pdf`, `verify/main.log` | the check's output, i.e. the PDF arXiv should produce | no |
| `PRIOR_ART_2026-10-31.md` | the prior-art check before posting | no |
| `SUBMIT.md` | this file | no |
