"""
Compile the arXiv tarball with pdfLaTeX from TeX Live on Modal, as arXiv would, and report the log.

    node paper/build-tex.ts --arxiv
    uvx --with modal modal run paper/arxiv/check_pdflatex.py

Runs pdflatex three times on the unpacked paper/arxiv/sketchpad-arxiv.tar.gz in a Debian trixie image (TeX Live 2024),
writes paper/arxiv/verify/main.pdf and main.log, and prints errors, undefined references or citations and overfull
boxes. A CPU-only job of well under a minute once the image is built.
"""

import re
from pathlib import Path

import modal

app = modal.App("sketchpad-arxiv")

# without recommends: texlive-latex-extra otherwise pulls Java, Ruby and X11 (358 packages)
image = modal.Image.from_registry("debian:trixie-slim", add_python="3.12").run_commands(
    "apt-get update"
    " && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends"
    " texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended lmodern"
    " && rm -rf /var/lib/apt/lists/*"
)

HERE = Path(__file__).resolve().parent


@app.function(image=image, cpu=1.0, memory=2048, timeout=600)
def compile_tarball(tgz: bytes) -> dict:
    import io
    import subprocess
    import tarfile
    import tempfile

    work = Path(tempfile.mkdtemp())
    with tarfile.open(fileobj=io.BytesIO(tgz)) as t:
        names = t.getnames()
        t.extractall(work, filter="data")
    codes = []
    for _ in range(3):  # arXiv reruns while labels change
        p = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex"],
            cwd=work,
            capture_output=True,
            text=True,
        )
        codes.append(p.returncode)
    version = subprocess.run(["pdflatex", "--version"], capture_output=True, text=True).stdout.splitlines()[0]
    pdf = work / "main.pdf"
    return {
        "names": names,
        "codes": codes,
        "version": version,
        "pdf": pdf.read_bytes() if pdf.exists() else b"",
        "log": (work / "main.log").read_text(encoding="latin-1"),
    }


@app.local_entrypoint()
def main():
    tgz = HERE / "sketchpad-arxiv.tar.gz"
    r = compile_tarball.remote(tgz.read_bytes())
    out = HERE / "verify"
    out.mkdir(exist_ok=True)
    (out / "main.log").write_text(r["log"], encoding="latin-1")
    if r["pdf"]:
        (out / "main.pdf").write_bytes(r["pdf"])
    log = r["log"]
    errors = [l for l in log.splitlines() if l.startswith("!")]
    undefined = [l for l in log.splitlines() if re.search(r"undefined|Rerun to get", l)]
    overfull = re.findall(r"Overfull \\[hv]box \(([\d.]+)pt too (?:wide|high)\)[^\n]*", log)
    big = [float(x) for x in overfull if float(x) > 10]
    pages = re.search(r"Output written on main\.pdf \((\d+) pages?, (\d+) bytes\)", log)
    print(f"engine: {r['version']}")
    print(f"tarball: {', '.join(r['names'])}")
    print(f"pdflatex exit codes: {r['codes']}")
    print(f"output: {pages.group(1)} pages, {int(pages.group(2)) // 1024} KiB" if pages else "output: none")
    print(f"errors: {len(errors)}")
    for l in errors[:20]:
        print("  ", l)
    print(f"undefined references or citations: {len(undefined)}")
    for l in undefined[:20]:
        print("  ", l)
    print(f"overfull boxes: {len(overfull)} ({', '.join(overfull) or 'none'} pt); over 10 pt: {len(big)}")
    warnings = sorted(set(re.findall(r"(?:LaTeX|LaTeX Font|Package \w+|Class \w+) Warning: [^\n]*|pdfTeX warning[^\n]*", log)))
    missing = re.findall(r"Missing character: [^\n]*", log)
    print(f"missing characters: {len(missing)}")
    print(f"distinct warnings: {len(warnings)}")
    for w in warnings[:30]:
        print("  ", w)
    print(f"wrote {out / 'main.pdf'} and {out / 'main.log'}")
