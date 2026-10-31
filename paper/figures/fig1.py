"""Figure 1: the mechanism, the guarantee, the result (Neo's choice, 31 Oct: v2b's mechanism row, v2a's guarantee
row, the benchmark bars). The drawing lives in fig1_v2.py, which also keeps the two candidate layouts:

    python fig1.py              ->  static/figures/fig1.svg, paper/figures/out/fig1.pdf
    python fig1_v2.py a | b     ->  the candidates fig1_v2a, fig1_v2b (not part of the default build)

a  the mechanism: 74,829 x 6,153 before step 33, one forward pass at token level, the sheet after; the run's 56 steps
b  the guarantee: all 2,446 views by table, the weakest view's pixels and margin, Theorem 1, the device re-check
c  the result: % exact on the registered benchmark's 220 problems, and the longest sums and products
"""
import pathlib
import runpy
import sys

sys.argv = ["fig1_v2.py", "final"]
runpy.run_path(str(pathlib.Path(__file__).resolve().parent / "fig1_v2.py"), run_name="__main__")
