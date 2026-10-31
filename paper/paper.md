---
title: Sketchpad: certified exact arithmetic with a small vision-language model
authors: Mostafa 'Neo' Mohsenvand
affiliation: MIT Media Lab
date: 31 October 2026
---

::: abstract
Language models remain unreliable on long arithmetic, and tool use moves the computation outside the network. We present Sketchpad, a method in which a 0.8-billion-parameter vision-language model, Qwen3.5-0.8B with a low-rank adapter, executes arithmetic procedures on a rendered sheet that serves as its only working memory. Each forward pass reads a three-cell view of the sheet and emits one step: a digit, a carry or borrow, and the next operation. A fixed runtime lays out the operands, writes the outputs, moves the view and runs the outer loops of the procedures; it writes no digit of a result. Because each step depends only on its view, the model is exact on all inputs of any length if and only if it is exact on the finite set of views the runtime presents. We prove this, together with its necessity, composition and robustness to numerical perturbation, checked in Lean, and certify all 2,446 views on the deployment device, a laptop GPU running the model in a web browser. With this runtime, the certified model performs signed addition and subtraction, long multiplication and division, square roots and greatest common divisors at arbitrary length. It solved 200 of 200 pre-registered problems in the browser, and 220 of 220 sums of up to 1,000 digits and products of up to 20 digits, on which the strongest of ten other models, GPT-6.1 Sol, solved 217 and the strongest open-weight model, DeepSeek-V4-Pro, 199. Built on these procedures, a symbolic runtime solves, expands and factors polynomials with every number computed by the model. A multiplicative gate on the adapter recovers the base model exactly.
:::

## Introduction {#sec-intro}

Multi-step exact computation remains a weakness of language models. Chain-of-thought prompting [@wei2022cot; @nye2021scratchpad] and changes to positional encoding and data format [@nogueira2021limitations; @anil2022length; @lee2024teaching; @zhou2024raspl; @zhou2024robust; @mcleish2024abacus; @cho2024coupling] extend the lengths at which transformers add and multiply correctly, but in each case accuracy is estimated on samples and carries no guarantee for unseen inputs. Frontier models are now accurate on most long-arithmetic problems: in our pre-registered comparison, GPT-6.1 Sol answered 217 of 220 correctly (Fig. {@fig-sheet}c). Its three errors, on sums of 300 and 1,000 digits, are not distinguishable from correct answers. The common alternative, tool use [@schick2023toolformer; @gao2023pal; @chen2023pot; @gou2024tora; @feng2025retool], is accurate but places the computation outside the network.

We take a third route: the network performs every elementary step of the computation, and its correctness on the steps is verified exhaustively. In Sketchpad, a runtime lays out a problem on a rendered sheet and presents the model with one view, three cells, at a time. The model reads the view through its vision encoder and, in a single forward pass, outputs the step's results and the next operation. The runtime writes the outputs to the sheet, moves the view and sequences the steps of the procedure; every digit of a result is written by the model, and the branches within a procedure follow the model's outputs. No state passes between steps except the sheet (Fig. {@fig-sheet}a).

Because every step is a function of its view and the views form a finite set, the model can be verified by enumeration. If the runtime presents only the 2,446 views of the tables, exactness on them is equivalent to exactness on every run of every length (Theorem {@thm-p}); the runtime, its layouts and the reference procedures are conventional code, and the guarantee is relative to them. The equivalence is classical: it underlies Moore's analysis of experiments on finite automata [@moore1956gedanken], the verification of learned recursive programs by Cai et al. [@cai2017recursion] and the certificate for universal computation by language-model decoding of Lewandowski et al. [@lewandowski2026universal]. Our contribution is a system in which the hypothesis holds by construction for a pretrained model, together with a certificate measured on the deployment device. Specifically:

1. a vision-language model of 0.8 billion parameters with a LoRA adapter [@hu2022lora] that executes one procedural step per forward pass (Section {@sec-machine});
2. proofs of exactness on views, its necessity, composition of certified procedures and robustness to numerical perturbation, checked in Lean for the sheet machine (Appendix A), and a certificate of all 2,446 views on the target device (Section {@sec-cert});
3. a calculator for signed integer arithmetic, long division, square roots and greatest common divisors at arbitrary length (Section {@sec-calc});
4. polynomial algebra in which every number is produced by the certified procedures (Section {@sec-algebra});
5. a gate under which the adapted model is identical to the base model (Section {@sec-gate}).

::: figure {#fig-sheet src=fig1.svg pdf=fig1.pdf alt="One step of the sheet machine, the certificate over all 2,446 views, and the comparison"}
**Overview.** **a**, One step of the long multiplication 74,829 × 6,153 (step 33 of 56). The view (three cells, 32 × 96 pixels) enters Qwen3.5-0.8B as three image tokens after the operation token `MUL`; the outputs, read at `=` and two placeholder positions, are the digit, the carry and the next operation. Below: the operation sequence of the full product. **b**, Margins of all 2,446 views on the deployment device (Apple M4, WebGPU, 16-bit), grouped by table. The smallest margin, 3.02 logits, belongs to the addition view 5 + 6 with no incoming carry. **c**, Exact answers on the pre-registered comparison of 220 problems (sums of 10–1,000 digits and products of 2–20-digit numbers, 20 per length; Methods), overall and on the longest sums and products. Sketchpad in rose, the strongest alternative in cobalt; Qwen3.5-0.8B is shown without chain of thought, its better setting. Per-length results: Extended Data Fig. {@fig-ed1}.
:::

## The sheet machine {#sec-machine}

**Model.** Qwen3.5-0.8B [@qwen35] combines a vision encoder with a 24-layer language model in which six layers use full attention and eighteen use Gated DeltaNet [@yang2025gateddeltanet]. We train a rank-16 LoRA adapter on 150 projection matrices of the language model (10.2 million parameters, 1.2% of the model); all base weights are frozen.

**Views and prompts.** The sheet is a grid of 32-pixel cells, each blank or a digit, rendered from a fixed glyph set. A view is three cells of the sheet, rendered as a vertical strip of 32 × 96 pixels, which the vision encoder maps to three image tokens; for all operations except quotient estimation the three cells are one column of the sheet (Extended Data Table {@tbl-tables}). A step prompt consists of an operation token, the view, `=` and two placeholder tokens; the step's outputs are decoded at these three positions in a single forward pass. Since the model is causal, padding after `=` does not affect the outputs (Lemma {@lem-cache}), and steps of different operations can be batched (Methods).

**Tables.** For each operation, a table enumerates every view the operation can encounter, with its correct outputs: column addition (`SUM`, 242 views); the five operations of long multiplication (1,553); subtraction (`SUB`, 242); estimation of a quotient digit (`EST`, 400); and decrement of an estimate (`DEC`, 9). With $\mathcal O$ the nine operations and $G$ the eleven glyphs, the table rows form the set
$$ V = \bigsqcup_{o \in \mathcal O} V_o, \qquad V_o \subseteq \{o\} \times G^3, \qquad |V| = 242 + 1{,}553 + 651 = 2{,}446, $$ {#eq-views}
whose terms count addition, multiplication and the calculator tables `SUB`, `EST` and `DEC` (Extended Data Table {@tbl-tables}).

**Runtime.** For each procedure, a runtime of a few hundred lines lays out the operands, extracts views, invokes the model and writes its outputs; it copies digits, as when a digit is brought down in division, but writes no digit of a result. In multiplication, control flow is determined entirely by the model's next-operation output. In division and square roots, the runtime fixes the outer loop and checks the model's next-operation outputs against it, and the branches within the loop are the model's outputs: a quotient guess of zero, and the borrow out of a multiply-subtract pass (Methods). The runtime checks that every extracted view is a row of a table; no view outside the tables occurred in any experiment. Independent procedures are executed in lockstep, with one view from each in a shared batch. On the M4, a computation of $n_{\text{pass}}$ forward passes over $n_{\text{view}}$ views takes
$$ t \approx \alpha\, n_{\text{pass}} + \beta\, n_{\text{view}}, \qquad \alpha = 0.065\ \text{s}, \quad \beta = 0.037\ \text{s} $$ {#eq-cost}
(Fig. {@fig-machine}c); batching reduces $n_{\text{pass}}$ and leaves $n_{\text{view}}$ unchanged.

**Training.** The adapter is trained directly on the tables with cross-entropy, a hinge loss on the logit margin and a distillation penalty toward the base model's distribution on plain text [@li2017lwf] (objective ({@eq-loss}) in Methods). Rows whose margin falls below 2 are replayed, and training stops when every row has a margin of at least 3. Without the adapter, the base model passes 12 of the 2,446 views under the same prompt, all of them `SUM` views; with eight solved views of the same table in the prompt and its earlier outputs supplied, it passes 158 of the 2,380 other views, and no table completely (Methods).

::: figure {#fig-machine src=fig2.svg pdf=fig2.pdf alt="The five calculator tables, long division as a sequence of table lookups, batching and timing"}
**The sheet machine.** **a**, One view and its outputs for each calculator table. **b**, Left: the division 4,100 ÷ 59; the borrow out of the leading column indicates that the estimate 8 is too high. Right: the operation sequence of the same division (Knuth's Algorithm D) and of the square root of 2,000,000 (56 forward passes). **c**, Batching four independent procedures: 32 forward passes instead of 73. Measured time against the cost model for the 200 problems of the browser test (median ratio 1.01). **d**, Time per problem in the browser test, all 200 exact.
:::

## Certification {#sec-cert}

At output position $k$ of a view $v$, let $z_k(v) \in \mathbb R^{\Sigma}$ be the model's logits over the vocabulary $\Sigma$ and $T_k(v)$ the correct token. The margin of $v$ is the smallest lead of a correct token over any other token,
$$ m(v) = \min_{k} \Big( z_k(v)_{T_k(v)} - \max_{a \neq T_k(v)} z_k(v)_a \Big), $$ {#eq-margin}
and $v$ passes if $m(v) > 0$; the model's output $f(v)$, the argmax at each position, then equals $T(v)$ under any tie rule. A certificate records $m(v)$ for every $v \in V$.

Let $C$ be the configurations of a procedure (sheet contents, view position and control state), $\mathcal V \supseteq V$ all views and $A$ the outputs. At configuration $c_t$, the runtime either halts, $\mathrm{view}(c_t) = \bot$, or presents the view $\mathrm{view}(c_t) \in \mathcal V$ and writes the outputs:
$$ c_{t+1} = \mathrm{paint}\big(c_t,\, f(\mathrm{view}(c_t))\big), $$ {#eq-step}
where $f\colon \mathcal V \to A$ is the model's output map; the reference run uses the table $T\colon \mathcal V \to A$ instead. That $f$ is a function of the view alone holds because each step's prompt contains only the operation token and the view (the pinned-sheet policy).

::: theorem {#thm-p title="Exactness on views"}
Let $R_T(I)$ be the set of views presented on reference runs from a set $I$ of initial configurations, and assume that $\mathrm{paint}(c, \cdot)$ is injective whenever $\mathrm{view}(c) \neq \bot$. The model's run from every $c_0 \in I$ equals the reference run at every step if and only if $f(v) = T(v)$ for all $v \in R_T(I)$. In particular, if $R_T(I) \subseteq V$ and $m(v) > 0$ for all $v \in V$, every run of every length is exact; this direction does not need injectivity.
:::

Theorem {@thm-p} takes the runtime as given: exact means equal to the reference run $\sigma_T$. Two hypotheses concern the runtime and are not proved in Lean. That reference runs present only table views, $R_T(I) \subseteq V$, follows from the layouts and from the normalisations of Section {@sec-calc}, and the runtime checks it at every step (Methods). That the reference runs compute the intended functions is the correctness of the classical procedures, which a reference implementation with exact tables was tested against.

::: proof
If $f = T$ on $R_T(I)$ and the runs agree at $c_t$, then $\mathrm{view}(c_t) \in R_T(I) \cup \{\bot\}$ and ({@eq-step}) gives the same $c_{t+1}$; induction on $t$ completes sufficiency. Conversely, if the runs agree and $v = \mathrm{view}(c)$ for a configuration $c$ of a reference run, then $\mathrm{paint}(c, f(v)) = \mathrm{paint}(c, T(v))$, and injectivity gives $f(v) = T(v)$.
:::

The hypothesis that $f$ depends only on the view is essential. If a step's context includes earlier steps, as in chain of thought, no finite test suffices.

::: theorem {#thm-nofinite title="Necessity of the pinned policy"}
Suppose instead that each step's context retains the earlier steps. There is a two-state table and a family of decoders, each a correct lookup plus one attention head, such that for every finite set of test contexts some member passes every row of the table, and every test context that begins with the prompt and ends in a row, with positive margins, yet errs on a longer run. Under the pinned policy the same member is exact at every length.
:::

::: proof
On a context with $n$ tokens after a sink token, $k$ of them events, the head writes $4Rk/(e^{c} + n)$ to the logit of the wrong state, where $R$ is the lookup's margin and $c$ the head's score on the sink. With $e^{c} = 3M + 5$, for $M$ the length of the longest test context, the write exceeds $R$ only on longer contexts (Appendix {@app-proofs}). This is an instance of Moore's result that no finite experiment identifies a machine with an unbounded number of states [@moore1956gedanken].
:::

::: theorem {#thm-compose title="Composition"}
Consider $K$ calls with results $r = (r_1, \dots, r_K)$, in which the input $x_i = q_i(r_{<i})$ of call $i$ depends only on the results $r_{<i} = (r_1, \dots, r_{i-1})$ of earlier calls and the answer $g(r)$ only on $r$; let $q^*_i$, $T^*_i$ and $g^*$ be the intended inputs, functions and combining program, with results $r^*_i = T^*_i(q^*_i(r^*_{<i}))$. If every call returns its table's output on the input it received, $r_i = T_i(x_i)$, as Theorem {@thm-p} guarantees for a certified procedure, then a wrong answer requires, for some $i \le K$, a wrong table, $T_i(q^*_i(r^*_{<i})) \neq T^*_i(q^*_i(r^*_{<i}))$, or a wrong transcription, $q_i(r^*_{<i}) \neq q^*_i(r^*_{<i})$, or else a wrong combining program, $g(r^*) \neq g^*(r^*)$, and for any distribution of transcripts
$$ \Pr\big[g(r) \neq g^*(r^*)\big] \le \Pr[\textup{some table wrong}] + \Pr[\textup{some transcription wrong}] + \Pr\big[g(r^*) \neq g^*(r^*)\big]. $$ {#eq-compose}
:::

::: theorem {#thm-transfer title="Robustness to perturbation"}
Let $z, \tilde z \in \mathbb R^{O}$ over a finite set $O$, and $y \in O$. If $\lVert z - \tilde z \rVert_\infty \le \tau$ and $z_y - \max_{a \neq y} z_a > 2\tau$, then $y$ is the unique maximiser of $\tilde z$. Hence, if $R_T(I) \subseteq V$, $m(v) > 2\tau$ for all $v \in V$, and at every step the logits on the execution path for each view $v \in V$ are within $\tau$ of $z_k(v)$ at every output position, every run from $I$ is exact.
:::

::: proof
If $a \neq y$ maximised $\tilde z$, then $\tilde z_a \le z_a + \tau < z_y - \tau \le \tilde z_y$. In a run, induction on $t$ as for Theorem {@thm-p}: while the run agrees with the reference run, its view lies in $V$ and each output is the certified one. A cached-prefix implementation of the pinned step computes the logits of the full prompt exactly (Lemma {@lem-cache}), so it is a path with $\tau = 0$ in exact arithmetic.
:::

Appendix {@app-proofs} gives complete proofs and the corresponding Lean 4 theorems. Theorem {@thm-transfer} motivates certifying on the deployment path. A 4-bit quantised decoder moved some margins of an earlier adapter from +9.4 to −8.9, whereas the 16-bit decoder reproduced the server certificate; we therefore deploy the 16-bit decoder.

We certify twice. In 32-bit PyTorch, the smallest margin over all 2,446 views is 3.96. On the deployment path (ONNX Runtime Web on WebGPU [@onnxruntime; @transformersjs; @webgpu], 16-bit, in the padded prompt form used at inference), all views pass with smallest margins of 3.02 for addition, 6.52 for multiplication and 4.61 for the calculator tables (Fig. {@fig-cert}c); the full check takes 3.5 minutes on the M4. The certificate scores one view per forward pass, whereas inference batches up to 32 views, and batching changes the 16-bit logits. Placing every view of the final adapter in random batches of 32 and of 4 on the M4 moved no logit by more than 1.05 and no margin by more than 0.63, against a smallest margin of 4.56, so these execution paths satisfy Theorem {@thm-transfer} with $\tau = 1.05$. The certificate is bound to the model files by their hashes. On a different GPU the hypothesis of Theorem {@thm-transfer} is established by recomputing the certificate, which the client offers; by default it recomputes only the lowest-margin tenth of each table.

::: figure {#fig-cert src=fig3.svg pdf=fig3.pdf alt="Exactness on views, the counterexample, margins and agreement across devices"}
**Certification.** **a**, Sums of increasing length read only views from the 242-view addition table; nine sums of 4 to 1,024 digits reach 202 of them. **b**, The counterexample of Theorem {@thm-nofinite}: with state in the context, a decoder passes all tests up to $N$ steps and fails at step $N+1$ ($N$ = 4, 8, 16); under the pinned policy the margin is constant. **c**, Margins of all 2,446 views on the M4, by operation; dark points mark the lowest tenth, which is rechecked on each new device. **d**, Smallest margin per operation on the server (PyTorch, 32-bit) against the browser (WebGPU): 16-bit decoders lie on the identity line; 4-bit decoders of earlier adapters deviate by up to 3 logits.
:::

## Arithmetic {#sec-calc}

Signed addition and subtraction proceed column by column; the borrow out of the final column determines the sign. Multiplication is the schoolbook algorithm. Division follows Knuth's Algorithm D [@knuth1997taocp2]. Both operands are multiplied on the sheet by $f = \lfloor 10/(d_0 + 1) \rfloor$, where $d_0$ is the divisor's leading digit; this leaves the quotient unchanged and makes the divisor's leading digit $d$ at least 5, and the remainder is divided by $f$ on the sheet at the end. Let $r < 10b$ be the current partial remainder for the scaled divisor $b$, with leading digits $r_1 r_2$ when written with one digit more than $b$, so that $r_1 \le d$. The quotient digit is $q = \lfloor r/b \rfloor$, and `EST` returns
$$ \hat q = \min\Big(9, \Big\lfloor \frac{10 r_1 + r_2}{d} \Big\rfloor\Big), \qquad q \le \hat q \le q + 2, $$ {#eq-est}
where the bounds are Knuth's Theorems A and B [@knuth1997taocp2] for base 10 and $d \ge 5$. A borrow out of the multiply-subtract pass $r - \hat q\, b$ signals $\hat q > q$ and triggers a decrement (`DEC`) and an add-back of the divisor with `SUM`, at most twice.

Square roots use the digit-by-digit method on $c^2 a$, with $c \in \{1, 2, 4, 5\}$ chosen from the leading digits of $a$ so that the root of $c^2 a$ begins with 25 to 49 (Methods). The first root digit is then at most 4, and if it is 2 the second is at least 5; the runtime starts the first digit at 4 and, when the first digit is 2, the second at 9, and every other digit at the estimate of `EST`, which applies because twice the partial root then begins with a digit of at least 5. Each guess is tested by a multiply-subtract pass and lowered only by `DEC`, so every root digit is decided by the model. The scaling by $c^2$ and the final division by $c$ run on the sheet, and $\lfloor \sqrt a \rfloor = \lfloor \lfloor \sqrt{c^2 a} \rfloor / c \rfloor$. Greatest common divisors use Euclid's algorithm, with the runtime repeating division with remainder until the remainder the model writes is zero.

**Browser test.** We pre-registered 200 problems: 50 each of division to 10 decimal places, square roots to 6 places, greatest common divisors of integers up to 999, and signed sums and differences of up to 20 digits. Run one problem at a time in the browser on the M4, with independent views of the same problem sharing a forward pass, all 200 answers were exact and every view was a table row. Median times were 7.0 s (division), 9.8 s (square root), 7.0 s (gcd) and 2.0 s (sums); 184 problems finished within 12 s, the slowest in 16.5 s (Extended Data Table {@tbl-t3}).

**Comparison.** We compared Sketchpad with frontier and open models on a pre-registered set of 220 problems: sums of 10 to 1,000 digits and products of 2- to 20-digit numbers, 20 per length, with the same prompt and a budget of 32,768 output tokens including reasoning (Methods). Sketchpad answered all 220 (64,700 views in 1,001 batched forward passes). GPT-6.1 Sol answered 217, Claude Opus 5.5 216 and Gemini 4 Argon 207, all at high reasoning effort; all three were exact on every product, and every error occurred on sums of 300 or 1,000 digits. The errors of GPT-6.1 Sol and Claude Opus 5.5 occurred well within the token budget and differed from the correct sum in 1 to 637 digits; 9 of the 13 errors of Gemini 4 Argon exhausted the budget. Five open-weight models with reasoning enabled answered between 149 (gpt-oss-120b) and 199 (DeepSeek-V4-Pro); most of their errors exhausted the budget on long sums and on products of 15 and 20 digits, except those of Gemma 4 31B, 46 of whose 64 errors were incorrect answers in completed replies. Qwen3.5-27B with chain of thought answered 121, with 93 of its 99 failures exhausting the budget, and Qwen3.5-0.8B answered 23 without chain of thought and 3 with it, every failure with chain of thought exhausting the budget (Fig. {@fig-sheet}c; Extended Data Fig. {@fig-ed1} and Table {@tbl-baselines}). Each model was run once per problem, so a difference of a few problems between two models, such as that between GPT-6.1 Sol and Claude Opus 5.5, is within sampling variation.

## Algebra {#sec-algebra}

A symbolic runtime solves, expands and factors polynomials by the standard textbook procedures, obtaining every number from the certified procedures. It expands products and collects terms, solves linear equations by rearrangement and quadratics by the quadratic formula, expands powers by the binomial theorem with coefficients from Pascal's rule, factors by the rational root theorem and synthetic division, and solves linear systems by elimination (Fig. {@fig-algebra}a). Irrational roots are returned as radicals with square factors removed, for example $3 \pm \sqrt 5$ (Methods).

Every answer is checked before it is returned. Rational roots are substituted into the equation, and irrational root pairs are verified through Vieta's relations in integer arithmetic; both checks are exact. Expansions are evaluated at $x = 1$, a spot check that detects any error confined to one coefficient but not errors that cancel there. The checks protect the parts the certificate does not cover: the symbolic program and the transcription of the problem. Under fault injection, they rejected 200 of 200 incorrect roots and 185 of 200 runs with one corrupted arithmetic result; in the remaining 15 runs the corruption did not affect the answer (Fig. {@fig-algebra}b).

We compare this route with evaluation-based methods from computer algebra, interpolation [@kaltofen1990blackbox] and Kronecker substitution [@kronecker1882], which also reduce algebra to arithmetic. Under the cost model, the textbook route is faster on ten of the eleven benchmark problems and equal on the eleventh, a plain multiplication: 2.8 s against 4.5 s for a linear equation, 12.1 s against 33.1 s for $(x+2)^5$ and 16.9 s against 31.5 s for factoring $x^3 - 6x^2 + 11x - 6$. Measured on the M4, eight of the eleven finish within 12 s; the remaining three, $(x+1)^{10}$, a cubic factorisation and a 3 × 3 system, take 16 to 22 s (Fig. {@fig-algebra}c; Extended Data Table {@tbl-algebra}). Extended Data Table {@tbl-algebra} adds three quadratics with irrational roots, which only the textbook route returns as radicals; the evaluation route returns decimal bounds for them, so they are not compared.

::: figure {#fig-algebra src=fig4.svg pdf=fig4.pdf alt="A derivation linked to its arithmetic, fault injection and cost"}
**Algebra.** **a**, Factorisation of $x^3-6x^2+11x-6$. Numbers in rose were computed by the model; each is linked to the column operation that produced it. **b**, Rejection rates under fault injection: incorrect roots (200 of 200 for both routes) and one corrupted arithmetic result (185 of 200 for the textbook route, 173 of 200 for evaluation). **c**, Time per benchmark problem: textbook route measured on the M4 (rose) and under the cost model (open rose); evaluation route under the cost model (cobalt).
:::

## Gating {#sec-gate}

An earlier arithmetic adapter changed perplexity on plain text by a factor of only 1.0065, yet reduced strict instruction-following accuracy on IFEval [@zhou2023ifeval] by 16.4 points, an instance of catastrophic forgetting [@mccloskey1989catastrophic; @kirkpatrick2017ewc]. We therefore multiply every adapter branch by a scalar graph input $g$:
$$ y = xW + g\, s\, (xA^{\top})B^{\top}, \qquad y\big|_{g=0} = xW, $$ {#eq-gate}
where $W$ is the frozen weight, $A$ and $B$ are the adapter matrices and $s$ is the LoRA scale (Fig. {@fig-gate}a). At $g = 0$ each branch contributes an exact floating-point zero; the branches are still evaluated, which adds the adapter's 1.2% of parameters to each forward pass. On ONNX Runtime, every logit, hidden state and cached state of the gated graph equals that of the base model at $g = 0$ and that of the ungated adapter at $g = 1$, over 2,500 chat forward passes and 2,688 table views; greedy completions of 100 chat prompts are identical. On the M4, the certificate at $g = 1$ reproduces all 2,446 margins.

The gate does not decide when to compute. We therefore trained the adapter to invoke the sheet from within dialogue: on synthetic dialogues and grade-school problems, it learns to emit a short program for the sheet, a block of calculator expressions and equations, when a reply requires exact computation. Generation pauses at the end of the block, the runtime executes it, and its results are appended to the reply before generation continues (Methods). Training combines supervised data with self-distillation [@li2017lwf] and on-policy distillation [@agarwal2024gkd; @lu2025onpolicy] toward the gated-off model, which limits forgetting [@shenfeld2025razor], followed by reinforcement learning with GRPO [@shao2024grpo] against an execution-based reward, with a KL penalty toward the supervised checkpoint. Every stage keeps the table objective ({@eq-loss}) on table rows at each step. Success criteria were fixed before training. The final adapter meets all of them: on held-out phrasings it invokes the sheet with precision 0.994 and recall 0.989 (the base model prompted with four examples: 0.971 and 0.809), writes the correct computation for 92.8% of word problems, 96.7% of equations and 98.3% of expressions embedded in prose, and stays within 1.6 points of the base model on IFEval (−1.5 ± 2.0), GSM8K [@cobbe2021gsm8k] (−1.6 ± 3.4) and MMLU [@hendrycks2021mmlu] (−1.4 ± 1.6), with all 2,446 views still certified. The benchmark differences are paired, with standard errors, and are within one standard error of the −2 criterion; the final adapter was the fifth candidate scored on the same items; on the M4 the final adapter passes every view with smallest margins of 6.67 (addition), 6.53 (multiplication) and 4.56 (calculator tables), and the same weights at $g=1$ serve both the arithmetic procedures and dialogue. Intermediate recipes traded instruction following against multi-step reasoning; on-policy distillation removed most of that trade-off, and an unanchored reinforcement-learning stage reintroduced it (Fig. {@fig-gate}b,c; Extended Data Table {@tbl-chat}).

::: figure {#fig-gate src=fig5.svg pdf=fig5.pdf alt="The gate, the trade-off between instruction following and reasoning, and invocation of the sheet"}
**Gating.** **a**, A scalar input $g$ multiplies every adapter branch; at $g=0$ the model is identical to the base model, at $g=1$ it executes the sheet procedures. **b**, IFEval against GSM8K, in points relative to the base model, for the dialogue fine-tunes and for switching the gate within a reply; the shaded region satisfies both criteria, and the dotted line at −5 points is the pre-registered stopping rule. **c**, Precision and recall of invoking the sheet on held-out problems: base model with four examples (cobalt) and fine-tunes (rose).
:::

## Mechanism {#sec-inside}

We applied the logit lens [@nostalgebraist2020logitlens; @belrose2023tunedlens] at the first output position: with $h_\ell$ the residual state after depth $\ell$, and $W_U$ and $\mathrm{norm}$ the final unembedding and normalisation,
$$ \hat p_\ell = \operatorname{softmax}\big(W_U\, \mathrm{norm}(h_\ell)\big). $$ {#eq-lens}
The correct output becomes and remains the top token at a median depth of 19 for addition, 20 for multiplication and 18 for the addition steps of the multiplier; up to depth 15 it is the top token for at most 13% of views in any of these tables (Fig. {@fig-inside}a). At the final layer, states cluster by output, and sums with a carry (10–19) separate from those without (Fig. {@fig-inside}b). A class-mean intervention [@turner2023actadd; @rimsky2024caa] moves the state of a view with output $a$ toward a target output $a'$,
$$ h_\ell \leftarrow h_\ell + \mu^{\ell}_{a'} - \mu^{\ell}_{a}, $$ {#eq-steer}
where $\mu^{\ell}_a$ is the mean of $h_\ell$ over the table's views with output $a$. Applied after depth 20, the end of the fifth full-attention layer, it changes the output to $a'$ in 79 of 80 addition steps and 80 of 80 multiplication steps; applied at any depth up to 15, it changes none (Fig. {@fig-inside}c). For multiplication the transition is abrupt: no step changes at depth 19 and every step at depth 20, so the digit is decided in the fifth full-attention layer. For addition it is gradual, with 31 and 38 of 80 steps changed at depths 18 and 19, and the same layer completes a decision that the preceding layers have begun, consistent with the median decision depth of 19 under the logit lens.

::: figure {#fig-inside src=fig6.svg pdf=fig6.pdf alt="Logit lens, output states and activation steering"}
**Mechanism.** Arithmetic adapter. **a**, Logit lens: fraction of views whose top token at each depth equals the final output, by operation; ticks mark the median decision depth, triangles the ends of full-attention layers. **b**, Final-layer states projected onto three discriminant directions, coloured by output, for addition (0–19) and multiplication digits; nearest-centre shares are measured in this projection (Methods). **c**, Fraction of 80 steps whose output a class-mean intervention changes to its target, against the depth at which it is applied, for addition and multiplication; the shaded band is the fifth full-attention layer.
:::

## Related work {#sec-related}

**Neural arithmetic.** The Neural GPU learned binary addition and multiplication that generalise beyond the training length [@kaiser2016neuralgpu; @price2016neuralgpu], and specialised arithmetic units followed [@trask2018nalu; @madsen2020nau]. For transformers, positional encodings and data formats determine length generalisation [@nogueira2021limitations; @anil2022length; @lee2024teaching; @zhou2024raspl; @zhou2024robust; @mcleish2024abacus; @cho2024coupling], and fine-tuned models reach high accuracy on bounded arithmetic [@liu2023goat; @yang2023mathglm], with division and gcd remaining difficult [@shen2024revorder; @charton2024gcd; @kasliwal2026division]. Neural cellular automata and differentiable transducers trained from scratch add and multiply far beyond their training lengths [@wei2026nca; @wei2026ncaadd; @dfst2025]. Mechanistic analyses find addition circuits correct on almost all inputs [@quirke2024verified]. Exactness has been proved under idealised training [@backdeluca2025exact], for small recurrent networks that add inputs of any length after training with a description-length objective [@lan2022mdl], and for a purpose-built transformer parameterisation that evaluates Boolean circuits of any depth [@ito2026circuits]. Sketchpad differs in using a pretrained vision-language model, in covering division, square roots and gcd, and in certifying the trained weights by enumeration, where these works estimate accuracy on samples or prove exactness for idealised, small or purpose-built networks.

**Procedures in language models.** Neural programmer-interpreters learned grade-school addition as a sequence of steps on a scratch pad read through pointers [@reed2016npi], the architecture whose generalisation Cai et al. later verified [@cai2017recursion], and a controller moving over a two-dimensional grid learned multi-digit addition that extends to thousands of digits [@zaremba2016simple]. CAEF fine-tunes Llama-3.1-8B to execute arithmetic operators step by step on a text tape, with one adapter per operator [@lai2024caef]. Other work embeds non-learned arithmetic modules [@dugan2024occamllm; @igc2025], compiles programs into transformer weights [@giannou2023looped; @loom2026; @percepta2026vm; @dong2023neuralcomprehension], trains transformers to predict program execution traces [@xu2026universal], or lets a language model emulate an interpreter [@li2024chainofcode].

**Tool use.** Toolformer [@schick2023toolformer], PAL, Program of Thoughts, ToRA, ReTool and ToolRL [@gao2023pal; @chen2023pot; @gou2024tora; @feng2025retool; @qian2025toolrl] and recursive language models [@zhang2025rlm] delegate computation to external interpreters.

**Verification.** Neural network verification typically bounds outputs over continuous input regions [@katz2017reluplex]; here the input set is finite, as in computer-assisted proofs of a small transformer's accuracy on a task of fixed input size [@gross2024compact], except that a finite set of views covers inputs of every length. Our theorems specialise results on the identification of finite machines [@moore1956gedanken; @chow1978testing], the verification of learned recursive programs [@cai2017recursion] and certified universal computation by language models [@schuurmans2024universal; @lewandowski2026universal]. The context discipline resembles the inductive scratchpad [@abbe2024globality] and PENCIL [@yang2025pencil]. Certification from examples can be hard in general and length-generalisation bounds can be uncomputable [@backdeluca2026certification; @yang2026lengthbounds]; the pinned policy avoids these obstacles by making the input set finite.

**Visual input and scratchpads.** Pixel-based language models [@rust2023pixel; @tschannen2023clippo; @lee2023pix2struct] and visual context compression [@wei2025deepseekocr; @cheng2025glyph] read rendered text. A small network learned addition and subtraction of seven-digit numbers, but not multiplication, from pictures of numbers [@hoshen2016visual], and vision-language models still fail at multiplication from images [@balter2026vlm]. Visual scratchpads support multimodal reasoning [@hu2024visualsketchpad; @menon2024whiteboard; @li2025mvot; @selfimagine2024; @mathcanvas2025]. The name refers to Sutherland's Sketchpad [@sutherland1963sketchpad].

**Algebra.** Transformers have been trained for symbolic integration [@lample2020symbolic], polynomial simplification [@agarwal2021polynomial] and Gröbner bases [@kera2024groebner], and large models solve school algebra with chain of thought [@lewkowycz2022minerva; @feng2023cot]. None of these is exact by construction.

**Continual learning.** Learning without Forgetting [@li2017lwf], progressive networks [@rusu2016progressive], elastic weight consolidation [@kirkpatrick2017ewc] and adapter routing [@buehler2024xlora] address forgetting; on-policy distillation and the analysis of Shenfeld et al. relate forgetting to divergence from the base model on its own outputs [@agarwal2024gkd; @lu2025onpolicy; @shenfeld2025razor]. Our gate is a hard switch in the spirit of progressive networks. Activated LoRA likewise applies an adapter only to tokens after its invocation, reusing the base model's cache for earlier tokens [@greenewald2025alora], and modality-gated adapters leave inputs of other modalities bit-for-bit unchanged, as their authors verify by exact-equality tests [@tonmoy2026modalitygated]. In Sketchpad the gate is a graph input set by the runtime, and the identity is tested on every logit, hidden state and cached state (Methods).

## Limitations {#sec-limits}

The certificate covers the model's steps only. The runtime, its layouts and outer loops, the choice of procedure and the transcription of a problem are conventional code and are not certified; that the runtime presents only table views is checked at every step but not proved in Lean, and in algebra, answer checks partly compensate. The theorems assume exact arithmetic; on hardware they hold through the margins, for the path on which the margins were measured, and a client by default rechecks only the lowest-margin tenth of each table, which screens for a changed path but does not establish the hypothesis of Theorem {@thm-transfer} on a new GPU; the full check does. The algebra is limited to polynomials of low degree in one variable and linear systems of up to three equations, and its checks verify the roots found, not that all roots were found. Inputs are rendered in the model's glyph set. Execution is slow, about 0.1 s per step on a laptop GPU. Translating a word problem into a computation is not certified, and the 0.8-billion-parameter model mistranslates about 7% of held-out word problems.

## Methods {#methods .unnumbered}

### Model and adapter

The language model of Qwen3.5-0.8B [@qwen35] has 24 layers with hidden size 1,024; layers 4, 8, …, 24 use full attention (8 query and 2 key-value heads), the others Gated DeltaNet [@yang2025gateddeltanet]. The LoRA adapter (rank 16, scale 2) is applied to the query, key, value and output projections of the 6 attention layers (24 matrices), the two input projections and the output projection of the 18 Gated DeltaNet layers (54) and the three projections of each of the 24 feed-forward blocks (72): 150 matrices and 10,223,616 parameters, against 873,438,784 in the base model. For deployment the model is exported to ONNX, with a 16-bit vision encoder and language model and 4-bit token embeddings (16-bit, looked up inside the decoder graph, for the dialogue adapter); the adapter is folded into the decoder graph. Two additional graph inputs implement the gate and the steering intervention, and one additional output returns hidden states.

### Views, prompts and tables

Glyphs are fixed 32 × 32 sprites of blank and the ten digits, so the set of possible views is finite and each view is an exact image. The prompt of a step is its operation token, the 32 × 96 image, `=` and two placeholder tokens, padded with further placeholders to a common length. The tables are exhaustive over each operation's views; for example, `MUL` covers every multiplicand digit or blank, every multiplier digit and every carry from blank to 8 (11 × 10 × 10 = 1,100 views). The view of `EST` is assembled from three cells that do not share a column: the leading remainder digit $r_1$, the next remainder digit $r_2$ and the divisor's leading digit $d$, in the column of $r_2$. A blank $r_1$ is written as 0 before the view is read, so `EST` covers $r_1 \in \{0, \dots, d\}$, $r_2 \in \{0, \dots, 9\}$ and $d \in \{5, \dots, 9\}$, $10 \sum_{d=5}^{9} (d + 1) = 400$ views; `DEC` reads the guess and two blank cells. That the procedures reach no other view follows from the layout and, for division and square roots, from normalisation; the runtime checks it at every step, and a reference implementation checked it on 1,000 random problems per procedure.

### Training

Each training step draws a batch $R$ of rows from every table, together with rows replayed from the last certificate. With $z_k(v;\theta)$ the logits at output position $k$ of row $v$, $K_v \in \{1, 3\}$ the number of output positions and $m_k(v;\theta)$ the margin at position $k$, the term inside the minimum in ({@eq-margin}), the loss is
$$
\begin{aligned}
\mathcal L(\theta) = {} & \frac{1}{|R|} \sum_{v \in R} \frac{1}{K_v} \sum_{k=1}^{K_v} \Big[ -\log \operatorname{softmax}\big(z_k(v;\theta)\big)_{T_k(v)} + \max\big(0,\, h - m_k(v;\theta)\big) \Big] \\
& + \frac{\lambda}{n} \sum_{j=1}^{n} \mathrm{KL}\big(p_0(\cdot \mid x_{\le j}) \,\big\|\, p_\theta(\cdot \mid x_{\le j})\big),
\end{aligned}
$$ {#eq-loss}
with hinge target $h = 4$ and $\lambda = 1$, where $x$ is a passage of $n = 128$ tokens of plain text and $p_0$ the base model [@li2017lwf]. Every 100 steps the full certificate is computed and rows with margins below $h/2 = 2$ are replayed until the next; training stops when every row has a margin of at least 3. The published adapter was initialised from an adapter certified on the addition and multiplication tables, with the subtraction, estimation and decrement tables added. It passed every row at step 1,200 and was stopped at step 1,600 (19.8 minutes on one H100 GPU; learning rate on a cosine schedule from $2\times10^{-4}$ to $2\times10^{-5}$ over 4,000 steps). Its plain-text perplexity is 1.0048 times that of the base model.

### Certification

Margins are computed over the full vocabulary of 248,320 tokens. The server certificate uses PyTorch in 32-bit floating point. The device certificate runs the deployed files (transformers.js 4.2.0 [@transformersjs], ONNX Runtime Web on WebGPU) through the inference code path and batched prompt form, and records every margin with the device, library version, file hashes and glyph set (Appendix {@app-cert}). Padding the addition prompt to the batched form changed no margin by more than 0.0018. Two device certificates, with and without the gate, agree on all margins to $10^{-3}$.

The base-model control scores the same 2,446 views with the base model, in 32-bit PyTorch and the prompt form of the server certificate. Zero-shot, it passes 12 views, all of them `SUM` views, and 1.1% of output positions are correct. With eight solved views of the same table (fixed seed), each followed by its outputs, prefixed to every query, it passes 35 of the 2,380 views not among the examples, with outputs read at the placeholder positions, and 158 when each output after the first is read after the correct earlier outputs, the form the examples show (45.8% of positions); no table passes completely in any setting.

### Procedures and timing

Subtraction ends on a row that reports a final borrow, in which case the operands are swapped and the sign recorded. In division and square roots, a multiply-subtract pass of the divisor (or trial divisor) by a guess runs `MUL` one column ahead of `SUB`, two views per forward pass, with separate rows for the carry and the borrow. The runtime checks each next-operation output against the pass (`A` within it, `Z` at its end for `MUL`, `S` for `SUB`), and the borrow `SUB` writes out of the top column is the branch: no borrow keeps the guess, a borrow lowers it with `DEC`. In division the divisor is then added back with `SUM`, and the carry out of the top column, which cancels the borrow, decides whether to lower again; in square roots the pass is repeated from the saved remainder. A guess of 0 from `EST` comes with the next-operation `N` and skips the pass. In square roots, the trial divisor for the next digit, twice the partial root, is formed on the sheet by adding the last digit to the previous trial divisor with `ADD`.

For square roots, write $a = A \cdot 100^k$ with $1 \le A < 100$. The runtime takes $c = 4$ if $A < 1.5625$, $c = 2$ if $A < 6.25$, $c = 1$ if $A < 25$ and $c = 5$ otherwise, comparing the first six digits of $a$, aligned to pairs, with 15625, 62500 and 250000. Then $c \sqrt A$ lies in $[4, 5)$, $[2.5, 5)$, $[2.5, 5)$ or $[25, 50)$, so the root of $c^2 a$ begins with 25 to 49 for every $a$; we also verified this for every radicand from 1 to 999,999. Division scales by $f = \lfloor 10/(d_0+1) \rfloor \in \{1, 2, 3, 5\}$, and $f (d_0 + 1) \le 10$ keeps the scaled divisor at the same length. The scalings use the multiplication procedure; the remainder of a division is unscaled by multiplying by $10/f$ and dropping the last digit ($f = 2, 5$) or by an exact division by 3, and the root by multiplying by $10/c$ or $100/c$ and dropping one or two digits. The runtime's choice of scale factors and initial guesses affects the number of steps but not the result, since every guess is at least the true digit and is lowered only by certified steps. The cost model was fitted on batches of 1 to 32 views on the M4.

The browser test drew its 200 problems from a fixed generator before any run: $a \div b$ to 10 places with $a \le 999$ and $2 \le b \le 99$; $\sqrt a$ to 6 places with $2 \le a \le 999$; $\gcd(a, b)$ with $10 \le a, b \le 999$; and signed sums and differences of 1 to 20 digits. It ran in Chrome on an Apple M4, one problem at a time. Answers were checked against arbitrary-precision arithmetic. The test was repeated with the gated adapter, with identical views and outputs.

### Algebra

The algebra runtime parses a problem, constructs the derivation and obtains every number through the calculator interface; independent calls are batched. Each line of the derivation records the model calls that produced its numbers. The default check substitutes rational roots into the collected equation and evaluates expansions at $x = 1$; the strict check substitutes into the original expressions and evaluates expansions at $x = -1, 0, 1, 2$. For equations, both modes also confirm the collection of terms by evaluating each side before and after collection at $x = y = z = 1$. Evaluation at fixed points is a spot check: an incorrect expansion of degree $D$ passes if the difference from the correct one vanishes at every checked point, which a single wrong coefficient cannot achieve at $x = 1$. For an irrational pair, the runtime removes square factors from the discriminant by trial division by the primes up to 47 and divides $p$, $q$ and $d$ by their greatest common divisor, so the radical is fully reduced when the discriminant is below $53^2 = 2{,}809$. The pair, written $(p \pm q\sqrt m)/d$ with an integer $p$ and positive integers $q$, $m$ and $d$, is accepted only if
$$ 2ap = -bd \quad \text{and} \quad a\,(p^2 - q^2 m) = c\,d^2, $$ {#eq-vieta}
which are Vieta's relations $x_1 + x_2 = -b/a$ and $x_1 x_2 = c/a$ multiplied by $ad$ and $ad^2$; for $a \neq 0$ they hold if and only if the pair are the two roots. The check concerns the values of the roots; that the form is reduced rests on the reduction above. Fault injection planted an incorrect root (200 problems per route) or corrupted one arithmetic result (200 per route), with fixed seeds; a further 200 perturbed radical pairs were all rejected. The reference test suite (264 tests, 2,200 generated problems per route and check mode) uses exact tables in place of the model.

### Gating

The gate multiplies each adapter branch before it is added to the frozen projection. The identity test compared, bit for bit, every logit, hidden state and cached state of the base, ungated and gated graphs under ONNX Runtime 1.31.1 on CPU, on 100 chat prompts (first user turns of the No Robots test split [@norobots2023]; one prefill and 24 greedy steps each) and on all table views.

### Dialogue fine-tuning

The training data comprise about 3,150 synthetic dialogues, about 30% of which should not invoke the sheet, and 547 grade-school problems solved by the base model with each calculation replaced by a call to the sheet. A call is a Markdown code block labelled `sheet`, with one calculator expression or equation per line; generation stops when the block closes, the runtime executes the block and appends one result line per expression, and generation resumes, with at most two blocks per reply. Every training step, in the supervised, distillation and reinforcement-learning stages alike, includes a batch of table rows under the objective ({@eq-loss}), with low-margin rows replayed, and every stage was required to end with all 2,446 rows passing. The held-out set contains 780 items from unseen templates. Invocations are scored by execution. Criteria were fixed before training: precision and recall of invocation of at least 0.95; correct invocations for at least 90% of word problems and 95% of equations; IFEval, GSM8K (250 problems) and MMLU (500 questions) within 2 points of the base model. GSM8K is evaluated at $g = 1$ with the sheet in the loop; in these evaluations, and in the reward, the blocks are executed by a reference implementation of the procedures in exact integer arithmetic rather than by the model, which by Theorem {@thm-p} returns the same results. The benchmark differences are reported with the standard error of a paired difference, $\sqrt{n_{+} + n_{-}}/n$ for $n_{+}$ and $n_{-}$ items gained and lost out of $n$. Reinforcement learning used GRPO with groups of eight samples per task and four tasks per step, a reward that requires a finished reply quoting the executed result and penalises repeated or excess invocations, and a KL penalty toward the supervised checkpoint on every generated token; it ran for 200 steps on one H100 GPU.

### Mechanism

The analyses use the arithmetic adapter. Depth $\ell$ counts layers from the input: $h_0$ is the embedding and $h_\ell$ the output of the $\ell$-th of the 24 layers, so the full-attention layers end at depths 4, 8, …, 24. The logit lens ({@eq-lens}) is computed at every depth at the first output position, for the 1,795 addition and multiplication views. The decision depth of a view is the first depth after which the final output remains the top token. Fig. {@fig-inside}b projects the final-layer states, after the final normalisation and with the table's mean subtracted, onto an orthonormal basis of the three leading Fisher discriminant directions of the output classes, with the within-class covariance shrunk 90% toward a multiple of the identity; the nearest-centre shares are measured in this projection. The class-mean intervention ({@eq-steer}) acts at the first output position on 80 views per table drawn without replacement with a fixed seed, excluding the halting view of `SUM` and the `MUL` views with a blank multiplicand digit, and the target is drawn uniformly from the table's other outputs; the class means are taken over all of the table's views.

### Baselines

The comparison was pre-registered with its scoring rule. Problems were generated with a fixed seed; every model received the prompt "What is a + b? Give the exact integer. Put the final answer in \boxed{}." (with × for products). The answer was the last boxed integer, and a reply that exhausted the budget or gave no answer was scored as wrong. Qwen3.5-0.8B and Qwen3.5-27B (FP8 release) ran under vLLM with the recommended sampling settings and budgets of 32,768 tokens with chain of thought and 4,096 without. GPT-6.1 Sol (`gpt-6.1-sol`, reasoning effort high), Claude Opus 5.5 (`claude-opus-5-5`, effort high) and Gemini 4 Argon (`gemini-4-argon`, thinking level high) were accessed through their APIs on 31 October 2026 with default sampling and a budget of 32,768 output tokens including reasoning. Five open-weight models, DeepSeek-V4-Pro (`deepseek-v4-pro:0813`), Mistral-Large-4, Gemma 4 31B, GLM-5.3 and gpt-oss-120b, ran through the Ollama cloud API on 31 October 2026 with reasoning enabled at the highest available setting and the same budget; Kimi K3 was piloted and excluded on cost. Sketchpad ran all 220 problems in batched lockstep in PyTorch.

### Data and code availability

The model, adapter, certificate and analysis data are available on Hugging Face (`mohsenvand/sketchpad-0.8b-preview`). The runtime, the algebra, the baselines and the sources of this paper are available under the Apache 2.0 licence in the Sketchpad repository. The Lean proofs are in `paper/lean/` of the same repository (Appendix {@app-proofs}).

## Extended Data {#extended .unnumbered}

::: figure {#fig-ed1 .extended src=ed1.svg pdf=ed1.pdf alt="Exact answers by length for every system"}
**Exact answers by length.** Problems answered exactly, of 20 per length, for every system in the comparison: sums of 10 to 1,000 digits (left) and products of 2- to 20-digit numbers (right).
:::

::: table {#tbl-tables .extended}
**Tables.** Each row is one view an operation can encounter. Margins are the minimum over the table, in logits, on the server (PyTorch, 32-bit) and on the M4 (WebGPU, 16-bit), for the arithmetic adapter. `SUM` has one output position ($K_v = 1$), the other operations three; – marks an output that is always the same placeholder. The five multiplication tables, `MUL` to `NXT`, total 1,553 views. Next-operation codes: `A` add the partial product, `Z` end of pass, `M` multiply (or, after `EST`, proceed with the guess), `F` flush, `N` next digit (after `EST`, the guess is 0), `H` halt, `B` final borrow, `S` continue subtraction, `C` correct the remainder.

| Operation | View (top to bottom) | Outputs at `=`, `?`, `?` | Rows | Server | M4 |
|---|---|---|---:|---:|---:|
| `SUM` | carry (blank, 1), top digit (blank, 0–9), bottom digit (blank, 0–9) | sum and carry as one token (0–19), or `H` | 242 | 3.96 | 3.02 |
| `MUL` | multiplicand digit (blank, 0–9), multiplier digit (0–9), carry (blank, 0–8) | digit, carry, `A` or `Z` | 1,100 | 6.39 | 6.52 |
| `ADD` | carry (blank, 1), product digit (0–9), running-total digit (blank, 0–9) | digit, carry, `M` | 220 | 9.37 | 9.50 |
| `ADZ` | as `ADD`, at the end of a pass | digit, carry, `F` | 220 | 8.41 | 8.00 |
| `FLS` | carry (blank, 1), blank, blank | final carry, –, `N` | 2 | 12.93 | 13.11 |
| `NXT` | next multiplier digit (blank, 0–9), blank, blank | –, –, `M` or `H` | 11 | 10.48 | 10.22 |
| `SUB` | borrow (blank, 1), top digit (blank, 0–9), bottom digit (blank, 0–9) | digit, borrow, `S`; all blank: –, –, `H` or `B` | 242 | 8.36 | 8.19 |
| `EST` | leading remainder digits $r_1$ (0–$d$) and $r_2$ (0–9), leading divisor digit $d$ (5–9) | $\hat q = \min(9, \lfloor(10r_1+r_2)/d\rfloor)$, –, `M` if $\hat q > 0$, else `N` | 400 | 4.51 | 4.61 |
| `DEC` | estimate $q$ (1–9), blank, blank | $q-1$, –, `C` | 9 | 10.00 | 10.09 |
| **All** | | | **2,446** | **3.96** | **3.02** |
:::

::: table {#tbl-t3 .extended}
**Browser test.** 50 problems per set on the Apple M4 (WebGPU, 16-bit decoder), one problem at a time. Passes are fewer than views because independent views of one problem, such as the `MUL` and `SUB` views of a multiply-subtract pass, share a forward pass.

| Set | Exact | Median s | Max s | Over 12 s | Median passes / views | Cost model median s |
|---|---:|---:|---:|---:|---:|---:|
| $a \div b$ to 10 places ($a \le 999$, $b \le 99$) | 50 | 7.0 | 13.3 | 1 | 65 / 90 | 7.6 |
| $\sqrt a$ to 6 places ($a \le 999$) | 50 | 9.8 | 16.5 | 11 | 86 / 137 | 10.7 |
| $\gcd(a,b)$ ($a, b \le 999$) | 50 | 7.0 | 13.4 | 4 | 61 / 84 | 7.1 |
| signed $\pm$, up to 20 digits | 50 | 2.0 | 4.7 | 0 | 19 / 19 | 1.9 |
:::

::: table {#tbl-algebra .extended}
**Cost of the algebra benchmark.** Views, forward passes after batching and seconds under the cost model, default check, for the textbook and evaluation routes. The first eleven problems are those of Fig. {@fig-algebra}c. The last three have irrational roots, which the textbook route returns as radicals and the evaluation route only as decimal bounds, so they have no comparable evaluation entry and were not measured on the M4.

| Problem | Textbook views / passes / s | Evaluation views / passes / s |
|---|---:|---:|
| `solve 3(x-2)+5=2x+14` | 36 / 22 / 2.8 | 75 / 27 / 4.5 |
| `solve 7x+13=2026-4x` | 97 / 62 / 7.6 | 165 / 88 / 11.8 |
| `solve 2x+3y=7, x-y=1` | 75 / 48 / 5.9 | 194 / 41 / 9.8 |
| `solve (2x-3)(x+5)=x^2+1-16` | 79 / 43 / 5.7 | 177 / 50 / 9.8 |
| `solve x^2-x-6=0` | 102 / 77 / 8.8 | 162 / 79 / 11.1 |
| `123456 * 654321` | 96 / 46 / 6.5 | 96 / 46 / 6.5 |
| `expand (x+2)^5` | 159 / 95 / 12.1 | 458 / 248 / 33.1 |
| `expand (2x-3)^4` | 172 / 94 / 12.5 | 492 / 274 / 36.0 |
| `factor x^3-6x^2+11x-6` | 195 / 149 / 16.9 | 483 / 210 / 31.5 |
| `expand (x+1)^10` | 322 / 154 / 21.9 | 2,359 / 845 / 142.2 |
| `solve 2x+3y-z=1, x-y+2z=3, 3x+y+z=8` | 323 / 167 / 22.8 | 538 / 102 / 26.5 |
| `solve x^2-2=0` | 86 / 65 / 7.4 | |
| `solve 2x^2+3x-1=0` | 144 / 88 / 11.0 | |
| `solve x^2-6x+4=0` | 133 / 96 / 11.2 | |
:::

::: table {#tbl-chat .extended}
**Dialogue fine-tuning.** Held-out templates with the gate on and no examples, against the base model prompted with four examples (invocation and translation) or with none (benchmarks). IFEval, GSM8K and MMLU in points relative to the base model (0.536, 0.516 and 0.476), on the same 541, 250 and 500 items for every recipe; for the final adapter, with the standard error of the paired difference. GSM8K replies at $g = 1$ invoke the sheet, executed by the reference implementation (Methods); –, not measured.

| Recipe | Precision / recall | Word | Equations | Prose | IFEval | GSM8K | MMLU |
|---|---|---:|---:|---:|---:|---:|---:|
| criterion | ≥ 0.95 / ≥ 0.95 | ≥ 0.90 | ≥ 0.95 | ≥ 0.95 | ≥ −2 | ≥ −2 | ≥ −2 |
| base model, four examples | 0.971 / 0.809 | 0.789 | 0.583 | 0.667 | 0 | 0 | 0 |
| synthetic dialogues, self-distillation (multiplier adapter) | 0.957 / 0.996 | 0.872 | 0.967 | 0.983 | −4.8 | – | −6.6 |
| synthetic dialogues, self-distillation | 1.000 / 0.998 | 0.894 | 0.975 | 1.000 | −0.55 | −31.2 | −5.4 |
| + human multi-step solutions | 1.000 / 0.994 | 0.856 | 0.975 | 0.992 | −2.8 | −14.0 | −2.4 |
| + base-model multi-step solutions | 1.000 / 0.994 | 0.817 | 0.958 | 0.992 | −4.4 | −6.4 | −3.4 |
| + on-policy distillation | 1.000 / 0.946 | 0.678 | 0.958 | 0.983 | −1.5 | −2.0 | −2.2 |
| + wider word-problem data | 1.000 / 0.991 | 0.856 | 0.958 | 0.975 | +0.2 | −2.4 | −2.2 |
| + GRPO | 1.000 / 0.981 | 0.861 | 0.958 | 0.992 | −2.0 | −4.8 | −0.6 |
| + GRPO, strict reward and task mix | 1.000 / 0.794 | 0.378 | 0.933 | 0.975 | −2.2 | −0.8 | −1.0 |
| **+ GRPO anchored to the supervised checkpoint (final)** | **0.994 / 0.989** | **0.928** | **0.967** | **0.983** | **−1.5 ± 2.0** | **−1.6 ± 3.4** | **−1.4 ± 1.6** |
:::

::: table {#tbl-baselines .extended}
**Comparison.** Problems answered exactly, of 20 per cell; in brackets, the number of replies that exhausted the token budget. Qwen3.5-27B is the FP8 release; all other models ran with reasoning at their highest available setting, accessed on 31 October 2026.

| System | +10 | +30 | +100 | +300 | +1,000 | ×2 | ×4 | ×6 | ×10 | ×15 | ×20 | All |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Sketchpad | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 220 |
| GPT-6.1 Sol | 20 (0) | 20 (0) | 20 (0) | 18 (0) | 19 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 217 |
| Claude Opus 5.5 | 20 (0) | 20 (0) | 20 (0) | 19 (0) | 17 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 216 |
| Gemini 4 Argon | 20 (0) | 20 (0) | 20 (0) | 18 (1) | 9 (8) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 207 |
| DeepSeek-V4-Pro | 20 (0) | 20 (0) | 19 (0) | 18 (0) | 2 (17) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 199 |
| Mistral-Large-4 | 20 (0) | 20 (0) | 14 (5) | 7 (10) | 0 (20) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 7 (13) | 168 |
| Gemma 4 31B | 20 (0) | 20 (0) | 17 (0) | 6 (2) | 0 (15) | 20 (0) | 20 (0) | 20 (0) | 19 (1) | 9 (0) | 5 (0) | 156 |
| GLM-5.3 | 20 (0) | 19 (1) | 11 (6) | 4 (15) | 0 (20) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 16 (3) | 2 (18) | 152 |
| gpt-oss-120b | 20 (0) | 20 (0) | 10 (9) | 0 (18) | 0 (20) | 20 (0) | 20 (0) | 20 (0) | 20 (0) | 16 (4) | 3 (17) | 149 |
| Qwen3.5-27B, chain of thought | 18 (2) | 12 (8) | 8 (10) | 1 (19) | 0 (20) | 20 (0) | 20 (0) | 15 (4) | 14 (6) | 6 (11) | 7 (13) | 121 |
| Qwen3.5-0.8B, chain of thought | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 3 (17) | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 3 |
| Qwen3.5-0.8B | 0 (8) | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 15 (4) | 8 (9) | 0 (14) | 0 (20) | 0 (19) | 0 (20) | 23 |
:::

::: appendix

## Proofs {#app-proofs}

The theorems are proved in the Lean 4 proof assistant [@demoura2021lean4] with Mathlib [@mathlib2020] (version 4.35.0), without `sorry` or additional axioms; `#print axioms` reports only `propext`, `Classical.choice` and `Quot.sound`, or a subset. The formalisation models the network as a deterministic function of its context, or as a causal decoder whose layer at a position reads only earlier positions, with arbitrary tie-breaking in the argmax and exact arithmetic; floating point enters only through $\tau$ in Theorem {@thm-transfer}. The proofs below follow the Lean proofs, whose declarations are listed in Extended Data Table {@tbl-lean} (in the namespace `Polyformer.Pinned` unless prefixed). Lemmas {@lem-argmax}–{@lem-cache} and Theorem {@thm-compose}a are formalised in general, and Theorems {@thm-p}, {@thm-compose}b and {@thm-transfer} for the sheet machine (`Sheet.lean`) and for a token form, in which the state is a token and each step reads a state token and an event token after a fixed prompt (`Pinned.lean`, `Compose.lean`). In the sheet form of Theorem {@thm-compose}b, each call runs a sheet procedure for a given number of steps from a configuration built from its input and reads its result from the final configuration. The hypotheses $R_T(I) \subseteq V$ and the correctness of the reference procedures are assumptions of these theorems, not formalised for the concrete layouts. `Paper.lean` names every statement by its number in this paper.

::: table {#tbl-lean .extended}
**Lean statements.** The package is in `paper/lean/` of the Sketchpad repository (Lean 4.35.0, Mathlib); the files other than `Sheet.lean` and `Paper.lean` are in its `Polyformer/` folder. `Paper.lean` provides aliases by paper number, such as `theorem2_counterexample` for `theorem8a_counterexample`.

| Statement | Lean declarations | File |
|---|---|---|
| Theorem {@thm-p} | `Sketchpad.sheet_exact_iff`, `Sketchpad.sheet_certified`; token form `regeneration_trace_iff`, `pinned_regeneration_iff` | `Sheet.lean`, `Pinned.lean` |
| Theorem {@thm-nofinite} | `no_finite_test_suite`, `theorem8a_counterexample`, `no_finite_check` | `Unpinned.lean` |
| Theorem {@thm-compose} | (a) `error_decomposition`; (b) `Sketchpad.sheet_compose_exact`, `Sketchpad.sheet_error_bound`; token form `compose_exact`, `error_bound` | `Compose.lean`, `Sheet.lean` |
| Theorem {@thm-transfer} | `Sketchpad.sheet_exact_of_close`; token form `regeneration_of_close`; unpinned decoding `unpinned_exact_of_close` | `Sheet.lean`, `Pinned.lean`, `Unpinned.lean` |
| Lemma {@lem-argmax} | `sel_eq_of_close`, `sel_eq_of_strict` | `Pinned.lean` |
| Lemma {@lem-regen} | `Polyformer.Interp.regeneration`, `scanl_eq_iff_foldl_eq`, `regeneration_trace_iff` | `Interp.lean`, `Pinned.lean` |
| Lemma {@lem-hist} | `histRun_eq_of_closed`, `reach_closed` | `Pinned.lean` |
| Lemma {@lem-cache} | `resid_congr`, `cache_sound`, `cachedForward_eq`, `policy_tick_eq` | `Pinned.lean`, `Policy.lean` |
:::

### Definitions and lemmas

::: definition {#def-machine title="Sheet machine"}
A sheet machine consists of sets $C$ of configurations, $\mathcal V$ of views and $A$ of outputs, a view map $\mathrm{view}\colon C \to \mathcal V \cup \{\bot\}$ and a paint map $\mathrm{paint}\colon C \times A \to C$. For $g\colon \mathcal V \to A$, the step $\sigma_g\colon C \to C$ is
$$
\sigma_g(c) = \begin{cases} \mathrm{paint}\big(c, g(v)\big) & \text{if } \mathrm{view}(c) = v \in \mathcal V, \\ c & \text{if } \mathrm{view}(c) = \bot, \end{cases}
$$ {#eq-sigma}
and the run of length $n$ from $c_0$ is $(c_0, \sigma_g(c_0), \dots, \sigma_g^n(c_0))$. The model's run and the reference run are those of $\sigma_f$ and $\sigma_T$. For $I \subseteq C$,
$$
\mathrm{Reach}_T(I) = \{\sigma_T^n(c_0) : c_0 \in I,\ n \ge 0\}, \qquad R_T(I) = \{\mathrm{view}(c) : c \in \mathrm{Reach}_T(I)\} \setminus \{\bot\}.
$$
:::

::: definition {#def-fold title="Runs over events"}
Let $S$ be a set of states, $E$ a set of events and $F\colon S \times E \to S$. For $s_0 \in S$ and a word $w$ over $E$, $F^w(s_0)$ is the left fold, $F^{\varepsilon}(s_0) = s_0$ and $F^{ue}(s_0) = F(F^u(s_0), e)$, and the trace of $F$ on $w = e_1 \cdots e_n$ is $\big(F^{e_1 \cdots e_i}(s_0)\big)_{i=0}^{n}$. For $B \subseteq E$, $\mathrm{Reach}^B_F(s_0) = \{F^u(s_0) : u \in B^*\}$.
:::

::: lemma {#lem-argmax title="Margins decide the argmax"}
Let $O$ be a finite set, $z, \tilde z \in \mathbb R^O$, $y \in O$ and $\tau \in \mathbb R$. If $z_a + 2\tau < z_y$ for every $a \in O \setminus \{y\}$ and $|\tilde z_a - z_a| \le \tau$ for every $a \in O$, then every maximiser of $\tilde z$ over $O$ is $y$. In particular, if $m(v) > 0$, then $f(v) = T(v)$ under every tie rule.
:::

::: proof {title="Proof"}
Let $s$ maximise $\tilde z$ over $O$ and suppose $s \neq y$. Then $\tilde z_s \le z_s + \tau < z_y - \tau \le \tilde z_y$, which contradicts $\tilde z_y \le \tilde z_s$. For the second statement take, at each output position $k$, $O = \Sigma$, $y = T_k(v)$, $\tilde z = z = z_k(v)$ and $\tau = 0$; the hypothesis is that the $k$-th term in ({@eq-margin}) is positive.
:::

::: lemma {#lem-regen title="Regeneration"}
Let $F, \delta\colon S \times E \to S$, $s_0 \in S$ and $B \subseteq E$. Then $F^w(s_0) = \delta^w(s_0)$ for every $w \in B^*$ if and only if $F(s, e) = \delta(s, e)$ for every $s \in \mathrm{Reach}^B_\delta(s_0)$ and $e \in B$. Both conditions are equivalent to equality of the traces of $F$ and $\delta$ on every $w \in B^*$.
:::

::: proof {title="Proof"}
($\Leftarrow$) Induction on the length of $w$. For $w = \varepsilon$ both sides are $s_0$. For $w = ue$ with $u \in B^*$ and $e \in B$,
$$
F^{ue}(s_0) = F\big(F^u(s_0), e\big) = F\big(\delta^u(s_0), e\big) = \delta\big(\delta^u(s_0), e\big) = \delta^{ue}(s_0),
$$
by the induction hypothesis and then by the assumption at $s = \delta^u(s_0) \in \mathrm{Reach}^B_\delta(s_0)$.

($\Rightarrow$) Let $s = \delta^u(s_0)$ with $u \in B^*$, and let $e \in B$. Applying the assumption to $u$ and to $ue$,
$$
F(s, e) = F\big(F^u(s_0), e\big) = F^{ue}(s_0) = \delta^{ue}(s_0) = \delta(s, e).
$$
Traces: the $i$-th entry of the trace on $w$ is the fold over the prefix $e_1 \cdots e_i \in B^*$, so equal folds on all words give equal traces; conversely, the last entries of equal traces are the folds over $w$.
:::

::: lemma {#lem-hist title="Steps that read the history"}
Let $G\colon E^* \times S \times E \to S$, and for $w = e_1 \cdots e_n$ let $s'_0 = s_0$ and $s'_i = G(e_1 \cdots e_{i-1}, s'_{i-1}, e_i)$. If $G(u, s, e) = \delta(s, e)$ for all $u \in B^*$, $s \in \mathrm{Reach}^B_\delta(s_0)$ and $e \in B$, then $s'_n = \delta^w(s_0)$ for every $w \in B^*$.
:::

::: proof {title="Proof"}
By induction on $i$, $s'_i = \delta^{e_1 \cdots e_i}(s_0)$. This holds for $i = 0$. If it holds for $i - 1$, then $s'_{i-1} \in \mathrm{Reach}^B_\delta(s_0)$, and the assumption with $u = e_1 \cdots e_{i-1}$ gives $s'_i = \delta(s'_{i-1}, e_i) = \delta^{e_1 \cdots e_i}(s_0)$. Lean proves the lemma with any set $Q \ni s_0$ closed under $\delta$ on $B$ in place of $\mathrm{Reach}^B_\delta(s_0)$, which is the smallest such set.
:::

::: definition {#def-decoder title="Causal decoder"}
A causal decoder of depth $L$ maps tokens $x_0 x_1 \cdots$ to states $h^0_p = \mathrm{emb}(x_p, p)$ and $h^{\ell+1}_p = \Lambda_\ell(p, h^\ell)$, where $h^\ell = (h^\ell_0, h^\ell_1, \dots)$ is the sequence of layer-$\ell$ states and $\Lambda_\ell(p, h)$ depends only on $h_0, \dots, h_p$; the logits of a sequence of length $N$ are $\mathrm{head}(h^L_{N-1})$. A cached forward of a block $b$ after a prefix $\Pi$ reads $h^\ell_p$ for $p < |\Pi|$ from a cache computed on $\Pi$ alone and computes the positions $p \ge |\Pi|$ by the same recursion.
:::

::: lemma {#lem-cache title="Causality and caching"}
(i) $h^\ell_p$ depends only on $x_0, \dots, x_p$. (ii) The cached forward of $b$ after $\Pi$ computes $h^\ell_p(\Pi b)$ at every layer and position, and hence the logits of $\Pi b$. (iii) Decoding a two-token block $b_1 b_2$ one token at a time on the cache of $\Pi$ gives the logits of $\Pi b_1 b_2$.
:::

::: proof {title="Proof"}
(i) Induction on $\ell$: $h^0_p$ reads only $x_p$; if $x$ and $x'$ agree up to $p$, the induction hypothesis gives $h^\ell_i(x) = h^\ell_i(x')$ for $i \le p$, so $h^{\ell+1}_p(x) = h^{\ell+1}_p(x')$ by causality of $\Lambda_\ell$. (ii) Induction on $\ell$. For $p < |\Pi|$ the cache holds $h^\ell_p(\Pi)$, which equals $h^\ell_p(\Pi b)$ by (i). For $p \ge |\Pi|$, layer 0 embeds $b_{p - |\Pi|} = (\Pi b)_p$, and layer $\ell + 1$ applies $\Lambda_\ell(p, \cdot)$ to states equal to $h^\ell(\Pi b)$ by the induction hypothesis. (iii) Decoding $b_1$ on the cache of $\Pi$ leaves the cache of $\Pi b_1$ by (ii), and decoding $b_2$ on that cache gives the logits of $\Pi b_1 b_2$, again by (ii).
:::

### Theorem 1

::: proof {title="Proof of Theorem 1"}
Fix $c_0 \in I$ and apply Lemma {@lem-regen} with $S = C$, a single event $E = B = \{\ast\}$, $F(c, \ast) = \sigma_f(c)$ and $\delta(c, \ast) = \sigma_T(c)$. The words over $B$ are $\ast^n$, $F^{\ast^n}(c_0) = \sigma_f^n(c_0)$, the trace on $\ast^n$ is the run of length $n$, and $\mathrm{Reach}^B_\delta(c_0) = \{\sigma_T^n(c_0) : n \ge 0\} = \mathrm{Reach}_T(\{c_0\})$ (Definition {@def-machine}). By the lemma, the model's run from $c_0$ equals the reference run at every length if and only if
$$
\sigma_f(c) = \sigma_T(c) \quad \text{for every } c \in \mathrm{Reach}_T(\{c_0\}).
$$ {#eq-agree}

*Sufficiency.* Let $f = T$ on $R_T(I)$ and $c \in \mathrm{Reach}_T(\{c_0\})$. If $\mathrm{view}(c) = \bot$, then $\sigma_f(c) = c = \sigma_T(c)$. Otherwise $v = \mathrm{view}(c) \in R_T(I)$ and $\sigma_f(c) = \mathrm{paint}(c, f(v)) = \mathrm{paint}(c, T(v)) = \sigma_T(c)$. So ({@eq-agree}) holds for every $c_0 \in I$.

*Necessity.* Let $v \in R_T(I)$, so that $v = \mathrm{view}(c)$ for some $c \in \mathrm{Reach}_T(\{c_0\})$ and $c_0 \in I$; then $\mathrm{view}(c) \neq \bot$, because $R_T(I)$ excludes $\bot$. By ({@eq-agree}), $\mathrm{paint}(c, f(v)) = \mathrm{paint}(c, T(v))$, and injectivity of $\mathrm{paint}(c, \cdot)$ gives $f(v) = T(v)$.

*The certificate.* If $R_T(I) \subseteq V$ and $m(v) > 0$ for all $v \in V$, Lemma {@lem-argmax} gives $f = T$ on $V \supseteq R_T(I)$, and sufficiency, which did not use injectivity, applies.
:::

### Theorem 2

Let $\Sigma$ be a set of tokens, $\Pi$ a fixed prompt and $\rho\colon \Sigma^* \to \Sigma$ a step map that returns a maximiser of the logits at the last position of a context. On events $e_1 e_2 \cdots$ from a state $s_0$, pinned decoding computes $s_i = \rho(\Pi\, s_{i-1}\, e_i)$; unpinned decoding keeps the whole context, $x_0 = \Pi\, s_0$, $s_i = \rho(x_{i-1}\, e_i)$ and $x_i = x_{i-1}\, e_i\, s_i$. A row $(s, e)$ of a table $\delta$ passes if the logits at $\Pi\, s\, e$ have their strict maximum at $\delta(s, e)$.

::: definition {#def-counter title="The counterexample"}
The tokens are $\Sigma = \{\omega, \mathsf u, \mathsf v, \mathsf a\}$, where $\omega$ is a sink token, and the prompt is $\Pi = \omega\, \mathsf u\, \mathsf a\, \mathsf u\, \mathsf v\, \mathsf a\, \mathsf v$. The table has states $\{\mathsf u, \mathsf v\}$, the event $\mathsf a$, $\delta(\mathsf u, \mathsf a) = \mathsf u$, $\delta(\mathsf v, \mathsf a) = \mathsf v$ and start $\mathsf u$, so its state is $\mathsf u$ after every input. For $R > 0$ and $c \in \mathbb R$, the logits at the last position of a context $x = x_0 x_1 \cdots x_{N-1}$ are
$$
\ell(x)_y = R\, [\, y = x_{N-2} \,] + [\, y = \mathsf v \,]\, \eta(x), \qquad \eta(x) = \frac{\sum_{j=0}^{N-1} e^{\kappa_j} \beta_j}{\sum_{j=0}^{N-1} e^{\kappa_j}},
$$ {#eq-counter}
where $[P]$ is 1 if $P$ holds and 0 otherwise, with scores $\kappa_0 = c$ and $\kappa_j = 0$ for $j \ge 1$, and values $\beta_j = 4R$ if $x_j = \mathsf a$ and $\beta_j = 0$ otherwise. The first term is a lookup that returns the state token of the last row, which is the correct output for $\delta$; the second is one attention head at the last position, with score $c$ on the sink, which writes its value to the logit of $\mathsf v$. If $x_0 = \omega$ and $k$ of the $n = N - 1$ tokens after it are $\mathsf a$,
$$
\eta(x) = \frac{4Rk}{e^{c} + n}.
$$ {#eq-write}
:::

::: theorem {restate=thm-nofinite title="Necessity of the pinned policy, precise form"}
Let $\mathcal T$ be a finite set of contexts, $M$ the largest length of a context in $\mathcal T$ ($M = 0$ if $\mathcal T$ is empty), and $e^{c} = 3M + 5$. For every $R > 0$ and every tie rule, the decoder ({@eq-counter}): (a) passes both rows of $\delta$ with positive margins; (b) at every context in $\mathcal T$ of the form $\Pi\, w\, s\, \mathsf a$ with $s \in \{\mathsf u, \mathsf v\}$, has its strict maximum at $\delta(s, \mathsf a)$; (c) under unpinned decoding of $\mathsf a^{2M+4}$ ends in the state $\mathsf v$, whereas $\delta$ ends in $\mathsf u$; and (d) under pinned decoding equals $\delta$ on every input.
:::

::: proof {title="Proof"}
*Two facts.* At a context ending in $\mathsf v\, \mathsf a$, $\ell_{\mathsf v} = R + \eta \ge R > 0$ while every other logit is 0, since $\eta \ge 0$; so $\mathsf v$ is the strict maximiser. At a context ending in $\mathsf u\, \mathsf a$, $\ell_{\mathsf u} = R$, $\ell_{\mathsf v} = \eta$ and $\ell_\omega = \ell_{\mathsf a} = 0$; so $\mathsf u$ is the strict maximiser if $\eta < R$, and $\mathsf v$ is if $\eta > R$.

(a) A row $\Pi\, s\, \mathsf a$ has $n = 8$ tokens after the sink, three of them $\mathsf a$, so $\eta = 12R/(e^{c} + 8)$ by ({@eq-write}), which is less than $R$ because $e^{c} = 3M + 5 > 4$. Both facts then give the rows.

(b) A test context $x = \Pi\, w\, \mathsf u\, \mathsf a$ of length $N \le M$ has $n = N - 1$ tokens after the sink and at most $N - 1$ of them $\mathsf a$, so
$$
\eta(x) \le \frac{4R(N - 1)}{3M + 4 + N},
$$
and the right-hand side is less than $R$ if and only if $3N < 3M + 8$, which holds because $N \le M$. Test contexts ending in $\mathsf v\, \mathsf a$ are covered by the first fact.

(c) A state $\mathsf v$ is followed only by $\mathsf v$, by the first fact, so if $s_{i-1} = \mathsf u$, then $s_0 = \cdots = s_{i-1} = \mathsf u$ and the context that determines $s_i$ is $\Pi\, \mathsf u\, (\mathsf a\, \mathsf u)^{i-1}\, \mathsf a$, with $2i + 6$ tokens after the sink, $i + 2$ of them $\mathsf a$. By ({@eq-write}),
$$
\eta = \frac{4R(i + 2)}{e^{c} + 2i + 6} > R \iff 2i > e^{c} - 2,
$$
and $\eta < R$ if $2i < e^{c} - 2$. Induction on $i$ gives $s_i = \mathsf u$ while $2i < e^{c} - 2$. If $M$ is odd, the step $i = (3M + 3)/2$ has $2i = e^{c} - 2$, so $\eta = R$ and $\ell_{\mathsf u} = \ell_{\mathsf v}$; the tie rule may return either state. In every case, $s_i = \mathsf v$ for the first $i$ with $2i > e^{c} - 2$, if not earlier, and $\mathsf v$ persists by the first fact. For $i = 2M + 4$, $2i = 4M + 8 > 3M + 3 = e^{c} - 2$, so $s_{2M+4} = \mathsf v$.

(d) Under pinned decoding every step reads a row $\Pi\, s\, \mathsf a$ with $s \in \{\mathsf u, \mathsf v\}$, which returns $\delta(s, \mathsf a) \in \{\mathsf u, \mathsf v\}$ by (a). Lemma {@lem-regen} with $S = \{\mathsf u, \mathsf v\}$, $B = \{\mathsf a\}$ and $F(s, \mathsf a) = \rho(\Pi\, s\, \mathsf a)$ gives equality with $\delta$ on every input.
:::

With $e^{c} = 2N + 5$ instead, the same computation gives a decoder that passes both rows and is exact under unpinned decoding on every input of length at most $N$, yet wrong on $\mathsf a^{N+2}$ (`no_finite_check`); testing every input up to a given length does not suffice either. Conversely, if the context moves every logit by at most $\tau$ from the logit at the pinned row and every certified margin exceeds $2\tau$, unpinned decoding is exact on every input (`unpinned_exact_of_close`). In the construction, the head's write is such a perturbation, and it grows without bound.

### Theorem 3

::: definition {#def-transcript title="Transcript"}
A transcript makes $K$ calls. Call $i$ receives the input $x_i = q_i(r_{<i})$ and returns $r_i = E_i(x_i)$, where $E_i$ is the procedure that executes it and $r_{<i} = (r_1, \dots, r_{i-1})$; the answer $g(r)$ reads only $r = (r_1, \dots, r_K)$. Call $i$ has a table $T_i$, the function its procedure is certified to compute. The intended computation has inputs $q^*_i$, functions $T^*_i$ and combining program $g^*$, with results $r^*_i = T^*_i(q^*_i(r^*_{<i}))$ and answer $g^*(r^*)$.
:::

::: theorem {restate=thm-compose title="Composition, precise form"}
(a) If $g(r) \neq g^*(r^*)$, then for some $i \le K$, $E_i(x_i) \neq T_i(x_i)$, or $T_i(q^*_i(r^*_{<i})) \neq T^*_i(q^*_i(r^*_{<i}))$, or $q_i(r^*_{<i}) \neq q^*_i(r^*_{<i})$; or else $g(r^*) \neq g^*(r^*)$. (b) Let every quantity depend on a transcript $\omega$ in a set $\Omega$ with a measure $\mu$. If $E_i(x_i) = T_i(x_i)$ for every call of every transcript, then
$$
\begin{aligned}
\mu\{g(r) \neq g^*(r^*)\} \le {} & \mu\{\exists i\colon T_i(q^*_i(r^*_{<i})) \neq T^*_i(q^*_i(r^*_{<i}))\} \\
& + \mu\{\exists i\colon q_i(r^*_{<i}) \neq q^*_i(r^*_{<i})\} + \mu\{g(r^*) \neq g^*(r^*)\}.
\end{aligned}
$$
:::

::: proof {title="Proof"}
(a) Suppose that none of the four events occurs. We show $r_i = r^*_i$ for all $i \le K$ by strong induction on $i$. If $r_j = r^*_j$ for all $j < i$, then $r_{<i} = r^*_{<i}$, and
$$
r_i = E_i(q_i(r_{<i})) = T_i(q_i(r_{<i})) = T_i(q_i(r^*_{<i})) = T_i(q^*_i(r^*_{<i})) = T^*_i(q^*_i(r^*_{<i})) = r^*_i,
$$
using in turn that the procedure, the transcription and the table are correct. Then $g(r) = g(r^*) = g^*(r^*)$, because $g$ reads only the results and the combining program is correct, a contradiction.

(b) Under the hypothesis, (a) places the event $\{g(r) \neq g^*(r^*)\}$ inside the union of the other three, and the bound follows from monotonicity and subadditivity of $\mu$, which hold for arbitrary sets, so no measurability is needed; a probability distribution gives ({@eq-compose}). For a procedure certified on the views it reaches, the hypothesis $E_i(x_i) = T_i(x_i)$ is Theorem {@thm-p} applied to its run on $x_i$, whatever the length of $x_i$ and the order of the calls. In Lean, (a) is proved for arbitrary $E_i$, $T_i$ and $T^*_i$, and (b) for calls executed by sheet procedures (`Sketchpad.sheet_error_bound`) and by the token-form procedure (`error_bound`), with the hypothesis derived from Theorem {@thm-p} in each form (`Sketchpad.sheet_compose_exact`, `compose_exact`).
:::

### Theorem 4

::: proof {title="Proof of Theorem 4"}
The first statement is Lemma {@lem-argmax}. For the second, fix $c_0 \in I$ and let the execution path's step $t$ be $G_t(c) = \mathrm{paint}(c, \tilde f_t(\mathrm{view}(c)))$ if $\mathrm{view}(c) \neq \bot$ and $G_t(c) = c$ otherwise, where $\tilde f_t(v)$ is the argmax of the execution-path logits $\tilde z^{(t)}_k(v)$ at each position; these may depend on $t$, and through it on the rest of the batch. Let $c \in \mathrm{Reach}_T(\{c_0\})$ with $v = \mathrm{view}(c) \neq \bot$. Then $v \in R_T(I) \subseteq V$, so $\lVert \tilde z^{(t)}_k(v) - z_k(v) \rVert_\infty \le \tau$ and $m(v) > 2\tau$, and Lemma {@lem-argmax} at each position gives $\tilde f_t(v) = T(v)$, hence $G_t(c) = \sigma_T(c)$; this also holds when $\mathrm{view}(c) = \bot$. Lemma {@lem-hist} with a single event, so that the history is the step count, gives $G_t \circ \cdots \circ G_1(c_0) = \sigma_T^t(c_0)$ for every $t$.

In Lean, the first statement is `sel_eq_of_close` and Lemma {@lem-hist} is `histRun_eq_of_closed`; their combination is `Sketchpad.sheet_exact_of_close` for the sheet machine, with the margin condition stated per output position, `regeneration_of_close` for the token form and `unpinned_exact_of_close` for unpinned decoding. By Lemma {@lem-cache}, a pinned step computed on a cache of a fixed prefix, or decoded token by token on it, yields exactly the logits of the full prompt (`cachedForward_eq`, `policy_tick_eq`), so in exact arithmetic it is an execution path with $\tau = 0$.
:::

## Certificate format {#app-cert}

A certificate is a JSON file distributed with the model graph. It specifies the prompt forms under which it was measured, the numerical precision of each graph, the library version, hashes of the glyph set and of every model file, the device and the time, and, for each table, the number of rows, the number passed and every row's margin in a fixed order, to $10^{-3}$ logits. A client accepts a certificate only if every hash matches the loaded files, and recomputes the lowest-margin tenth of each table before use.

## Reproducibility {#app-repro}

Every number in this paper is listed, with its source record, in `paper/numbers.md` of the Sketchpad repository. Training, server certification, the gate identity test and dialogue fine-tuning are scripted for Modal; the device certificate and browser test run in the client; the algebra tests and cost tables run with `pnpm vitest run src/lib/sketchpad/program`; the comparison is in `paper/baselines/`; the Lean proofs build with `lake build` in `paper/lean/`, and `lake env lean Paper.lean` prints the axioms of every statement.

:::
