# Venue assessment (Opus, written before reading Fable's)

## Verdict
- **Nature Machine Intelligence, as is: a reach.** The editor's first read will probably be:
  - the central equivalence is classical, and the paper says so (Moore; Cai et al. 2017; Lewandowski et al. 2026);
  - the task is arithmetic, which frontier models already get 217/220 right;
  - the "network" is a 2,446-entry lookup table, while a runtime runs the algorithm.

  The novelty is the system: a pretrained model satisfying the condition by construction, certified on the deployment
  device with floating point accounted for, and composed into algebra behind an exact gate. That reads as careful
  engineering of a known principle. My guess: desk rejection is more likely than review. If it is reviewed,
  acceptance needs a reviewer who values the guarantee over the accuracy.
- **Nature Communications, as is: plausible.** Its bar is "an important advance for specialists", and it is
  sympathetic to technically sound, well-documented systems. The Lean proofs, the device certificate, the controls and
  the open code fit that. Risk: a reviewer who says "NPI, Cai 2017 and Lewandowski 2026 already did this, and the
  application is narrow".

## The weak point either way
The guarantee covers a narrow capability (digit-level steps), and no application shows it mattering:
- GSM8K did not improve (−1.6);
- at 0.1 s per step it is slow;
- frontier models are already 98.6% right on the benchmark.

The paper proves something true and careful, but does not show that anyone needs it.

## What would lift it (ranked)
1. **Breadth: a second, non-arithmetic family of procedures under the same certificate.** Strongest candidate:
   algorithms on data, in the style of neural algorithmic reasoning (CLRS), e.g. sorting, BFS/shortest paths and
   string matching. Its known failure is out-of-distribution size generalisation, and our claim would be "certified at
   every size". Alternative: program execution (the code-slot work), stated as certified execution of a small
   instruction set.

   Abstract sentence: "the same certificate covers arithmetic, algebra and graph algorithms at every input size".
   This turns "a careful arithmetic system" into "a method".
2. **An application where the guarantee matters and accuracy alone fails.** E.g. GSM-Hard or financial and
   scientific calculations with long numbers, where the 4B chat model with the sheet beats much larger models and the
   arithmetic share of the errors is provably zero. This needs the 4B translation to be good. Kill: if translation
   errors dominate, there is no gain.
3. **Device generality.** Certify on several GPUs (Apple, NVIDIA, AMD, Intel via WebGPU) and give a measured or
   analysed bound on the cross-device logit drift. This closes the reviewer's hardware gap. It adds robustness, not
   novelty.
4. **Theory with consequences.** For example, a lower bound showing that unpinned (chain-of-thought) models need test
   sets that grow with input length, made empirical on real models. The current Theorem 2 is an existence
   construction; an editor sees it as Moore restated.

## Single recommended path
Add (1), with a modest version of (2) if the 4B chat model allows. Submit to NMI, with Nature Communications as the
transfer fallback. If time is short, submit the current paper to Nature Communications directly rather than NMI.
