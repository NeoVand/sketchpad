Dear Editor,

We submit "Sketchpad: certified exact arithmetic with a small vision-language model" for consideration as an Article in
Nature Machine Intelligence.

Language models now answer most long-arithmetic problems correctly. That accuracy, however, is estimated on samples
and gives no guarantee for an input that was not tested. Their remaining errors are silent: in our pre-registered
comparison, the three wrong answers of the strongest model were completed replies, indistinguishable in form from its
correct ones. Tool use avoids such errors by moving the computation outside the network.

We show that a network's exactness at all input lengths becomes a finite, checkable property when each step of a
computation reads only a bounded view of an external working memory. We prove, with proofs checked in Lean, that
exactness on the finite set of views is then equivalent to exactness on every input. We also prove that the
restriction is necessary: when steps read earlier steps, as in chain of thought, no finite test suffices. We then
make the condition hold for a pretrained model. Qwen3.5-0.8B with a low-rank adapter executes arithmetic procedures
on a rendered sheet. We certify all 2,446 of its views on the deployment device, a laptop GPU running the model in a
web browser, and measure how far numerical effects such as batching move the certified margins.

The certified model performs signed addition and subtraction, long multiplication and division, square roots and
greatest common divisors at arbitrary length. It answered 220 of 220 pre-registered problems. On the same problems,
the strongest of ten other models answered 217. A symbolic runtime built on the certified procedures solves, expands
and factors polynomials, and the paper shows how its correctness decomposes into the certified and uncertified
parts. Finally, a multiplicative gate on the adapter recovers the base model bit for bit. A dialogue adapter learns
when to call the sheet. It stays within 2 points of the base model on IFEval and MMLU, but loses 5.8 points on
GSM8K problems not used during development, which the paper reports as a limitation.

We believe the work suits the journal's readership in trustworthy and verifiable machine learning and in on-device
deployment. It joins formal verification, a deployed system and a mechanistic analysis of where the network makes
each decision.

The manuscript is available as a preprint on arXiv [arXiv identifier]. The model, adapter, device certificate, Lean
proofs, runtime and analysis code are public: the model on Hugging Face (mohsenvand/sketchpad-0.8b-preview), and the
code under the Apache 2.0 licence at https://github.com/NeoVand/sketchpad. A demonstration runs in the browser at
https://neovand.github.io/sketchpad/demo. The manuscript is not under consideration elsewhere.
[Competing interests: none / to be stated by the author.]

Sincerely,

Mostafa 'Neo' Mohsenvand
MIT Media Lab
