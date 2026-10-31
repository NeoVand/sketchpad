---
title: Sketchpad: a small vision-language model that computes exactly on its own sheet
authors: Mostafa 'Neo' Mohsenvand
affiliation: MIT Media Lab
date: 31 October 2026
---

::: abstract
Language models still get long arithmetic wrong, and the standard remedy hands the computation to a tool outside the model, so nothing the model computes itself comes with a guarantee. Here we present Sketchpad, in which a vision-language model of 0.8 billion parameters computes exactly on a rendered sheet that is its only working memory. Each forward pass of Qwen3.5-0.8B, with one low-rank adapter, reads three cells of the sheet through the model's own vision encoder and writes one step: a digit, a carry or borrow, and the name of the next step. A fixed runtime that does no arithmetic paints the answer and moves the window. Because a step sees only its view, exactness on the finite set of views is equivalent to exactness on every run of every length. We state this, its necessity, composition and transfer across hardware as theorems checked in Lean, and we certify all 2,446 views on the device that runs the model, a laptop GPU in a web browser. The certified model adds, subtracts, multiplies and divides integers of any length, takes square roots digit by digit and finds greatest common divisors: it solved 200 of 200 registered problems exactly in the browser, and 220 of 220 sums of up to 1,000 digits and products of up to 20-digit numbers, of which Qwen3.5-27B with chain of thought solved 121. On this arithmetic the runtime does algebra as a textbook writes it, with every number computed by the model and every answer checked by substitution. One graph input switches the adapter off, and the model is then stock Qwen bit for bit. Computation done by a neural network can carry a proof of its correctness that is checked where it runs.
:::

## Introduction {#sec-intro}

Exact computation over many steps is where language models still fail. Multiplying two long numbers, adding a thousand-digit sum or carrying a remainder through a long division takes hundreds of steps, and one wrong step spoils the answer. Chain of thought, in which the model writes out its intermediate steps before answering [@wei2022cot; @nye2021scratchpad], extends how far a model gets, and a great deal of work has gone into making transformers generalise arithmetic to longer inputs than they were trained on [@nogueira2021limitations; @anil2022length; @lee2024teaching; @zhou2024raspl; @zhou2024robust; @mcleish2024abacus; @cho2024coupling]. Each of these works measures exactness on samples: none can say that the next, longer input will be right. On the 220 problems of our registered baseline, Qwen3.5-27B with chain of thought, a model with 27 billion parameters, answered 8 of 20 hundred-digit additions and none of 20 thousand-digit ones exactly within 32,768 tokens of reasoning (Fig. {@fig-sheet}c; Methods).

The usual way out is to leave the arithmetic to a tool. Toolformer, PAL, ToRA and their successors train a model to write a call or a program and let an interpreter return the result [@schick2023toolformer; @gao2023pal; @chen2023pot; @gou2024tora; @feng2025retool]. That is accurate and practical, but the computation happens outside the network, and what the network itself computes stays unverified.

We take the other path and keep the computation inside the model, in a form that can be checked completely. A person doing long multiplication does not hold the numbers in their head; they write them down and look at a few digits at a time. Sketchpad gives a vision-language model, a language model that also reads images through a vision encoder, a sheet to work on. A fixed runtime draws the problem on the sheet. At each step it cuts out a strip of three cells, the *view*, and shows it to the model with a one-word prompt naming the step. In one forward pass, one evaluation of the network on its input, the model writes that step's answers: a digit, a carry or a borrow, and the name of the step to take next. The runtime paints the answers onto the sheet and moves the window where the model's answer says. The runtime holds no arithmetic, and nothing passes from one step to the next except what is painted on the sheet (Fig. {@fig-sheet}a,b).

This design makes the model's behaviour checkable. Every step is a function of its view, and the views come from a finite set: 242 for column addition, 1,553 for the steps of long multiplication, 651 for subtraction and division, 2,446 in all. We run the model on every one of them and require the correct answer to win by a margin. Exactness on every view is then equivalent to exactness on every run of every length (Theorem {@thm-p}). The idea is not new: Moore's analysis of experiments on sequential machines [@moore1956gedanken], Cai, Shin and Song's verification of learned recursive programs [@cai2017recursion] and Lewandowski, Machado and Schuurmans' certificate for universal computation by a language model's decoding [@lewandowski2026universal] rest on it. We state it for the sheet, together with its necessity, the composition of certified procedures and the transfer of a certificate between devices, and we check all four in the Lean proof assistant.

We make five contributions.

1. **The sheet machine.** Qwen3.5-0.8B [@qwen35] with a low-rank adapter (LoRA [@hu2022lora]) of 10.2 million parameters, 1.2% of the model, writes one step per forward pass (Section {@sec-machine}).
2. **A certificate on the device.** All 2,446 views pass on an Apple M4 laptop GPU in the browser, the weakest by 3.02 logits, and every visitor's GPU checks the weakest tenth again (Section {@sec-cert}).
3. **A calculator.** Five tables give signed sums and differences, long multiplication and division, square roots and greatest common divisors at any length; 200 of 200 registered problems were exact in the browser (Section {@sec-calc}).
4. **Algebra as written.** The runtime solves, expands and factors as a textbook does, with every number computed by the model and every answer checked (Section {@sec-algebra}).
5. **A gate.** One graph input switches the adapter off, and the model is then stock Qwen3.5-0.8B bit for bit (Section {@sec-gate}).

::: figure {#fig-sheet src=fig1.svg pdf=fig1.pdf alt="The sheet, one tick, exactness against length and the certificate"}
**The sheet: one step, any length, one certificate.** **a**, Long multiplication of 74,829 by 6,153 on the sheet, as the runtime lays it out, at step 33 of 56. The window (dark outline) shows the model three cells: a digit of each factor and the carry. What the model has written is in rose. **b**, One step is one forward pass of Qwen3.5-0.8B. The view, 32 × 96 pixels, enters the vision encoder as three image tokens after the step's word (`MUL`); the answers are read at `=` and at two placeholder slots: the digit, the carry and the next step (`A`, add the partial product). The 24 layers are 6 full-attention layers and 18 Gated DeltaNet layers. **c**, Share of problems answered exactly against digits per number: sums of 10 to 1,000 digits and products of 2- to 20-digit numbers, 20 problems per point (registered run, Methods). Sketchpad (rose) is exact on all 220; Qwen3.5-27B with chain of thought (cobalt) and Qwen3.5-0.8B with and without it (blue-grey) fall away with length. The certificate covers every length (dotted). **d**, The certificate: all 2,446 views, one square each, shaded by margin, as measured on the M4 in the browser. The smallest margin, 3.02 logits, is an addition view reading 5 and 6 with no carry.
:::

## The sheet machine {#sec-machine}

**The model.** Qwen3.5-0.8B is an open vision-language model with a vision encoder and a 24-layer language model [@qwen35]. Six of its layers are full attention; the other eighteen are Gated DeltaNet layers, a form of linear attention that keeps a fixed-size running state instead of a cache of every past token [@yang2025gateddeltanet]. We add a LoRA adapter, a pair of small matrices beside each of 150 weight matrices of the language layers, whose product is added to the frozen weight's output [@hu2022lora]. The vision encoder and the base weights stay frozen.

**Views and steps.** The sheet is a grid of 32-pixel cells holding blank or a digit, drawn from one fixed set of glyph images. A view is a column of three cells, 32 × 96 pixels, which the vision encoder turns into three image tokens. A step is the prompt `WORD<image>=??`: a word naming the step (`SUM`, `MUL`, `ADD`, `SUB`, `EST`, `DEC` and four control words), the view, an equals sign and two placeholder slots. The model's answers are read at the equals sign and at the two slots of a single forward pass, so a step costs one pass however many answers it has (Fig. {@fig-sheet}b). Because every layer of the model is causal, what follows the equals sign cannot change the answer read there, so every prompt is padded to the same length and steps of different kinds share one batch (Methods).

**Tables.** For each step word, the *table* lists every view the step can meet with its correct answers. Column addition (`SUM`) reads a carry and two digits and writes their sum as one token, or `H` to halt: 242 views. Long multiplication uses five steps (multiply a digit pair with the carry, add into the running total, end a pass, flush the last carry, move to the next digit): 1,553 views. Subtraction (`SUB`, 242), guessing a quotient digit (`EST`, 400) and lowering a guess (`DEC`, 9) complete the calculator: 2,446 views in nine tables (Extended Data Table {@tbl-tables}).

**The runtime.** The runtime is a small TypeScript program. For each procedure it lays the numbers out on the sheet, cuts the views, sends them to the model, writes the glyphs the model returns and moves the window as the model's next-step answer says. In multiplication it holds no arithmetic and no loop: the model's own next-step token decides when a row ends and when the product is done. In division and square roots the runtime chooses the procedure's skeleton (bring down the next digit, guess, multiply and subtract), and the branches inside it are the model's: the borrow the model writes out of the top column says whether a guess was too high. Every view the runtime cuts is checked against the tables before it is sent, and a view outside them would be reported; none occurred in any run reported here.

**Waves.** Independent procedures can share forward passes: when an algebra problem needs many separate products, the runtime steps them in lockstep and sends one view from each in a single batch. On the M4, a pass costs about 0.065 s plus 0.037 s per view in the batch, so batching cuts the fixed cost of a step, not the work per view (Fig. {@fig-machine}c).

::: figure {#fig-machine src=fig2.svg pdf=fig2.pdf alt="The five tables, a long division as a walk over tables, waves and timings"}
**The sheet machine.** **a**, The five step tables of the calculator, each with one real view (the model's own input pixels) and its answers in rose: `SUM` writes 6 with carry 1 from 1 + 7 + 8; `MUL` writes 6 and carry 4 from 7 × 6 + 4; `SUB` writes 4 and borrow 1 from 3 − 8 − 1; `EST` guesses 7 from ⌊47/6⌋; `DEC` lowers a guess of 7 to 6. **b**, A procedure is a walk over tables. Left, the division 4,100 ÷ 59 on its sheet, where the borrow out of the top column shows that the guess 8 is too high. Right, every forward pass of that run by Knuth's Algorithm D, and the 56 passes of the square root of 2,000,000. **c**, Waves: four independent jobs share 32 forward passes instead of 73 one after another. Measured seconds on the M4 against the cost model (0.065 s per pass plus 0.037 s per view) for the 200 registered problems; the median ratio is 1.01. **d**, The 200 registered problems in the browser, 50 per set, all exact; seconds per problem against the 12-second line.
:::

## Certification {#sec-cert}

**Margins.** The model's answer at a position is the token with the largest logit, the score the network gives each possible token. A view *passes* when, at every answer position, the correct token's logit exceeds every other; the smallest difference is its *margin*, and a margin of 3 makes the correct token about 20 times more probable than any other. A *certificate* records that every view of every table passes, with the margins.

We certify twice. In PyTorch on the training server, in 32-bit floating point, the smallest margin over the 2,446 views is 3.96 (an addition view; Extended Data Table {@tbl-tables}). In the browser, the page runs the deployed graph through ONNX Runtime Web on WebGPU [@onnxruntime; @transformersjs; @webgpu] in 16-bit floating point, in exactly the padded batch form that runs; on the M4 all 2,446 views pass, with smallest margins 3.02 for addition, 6.52 for the multiplier's steps and 4.61 for the calculator's (Fig. {@fig-cert}c). The full check takes 3.5 minutes there. The certificate travels with the model files, fingerprinted by the hash of every file, and a visitor's GPU checks the weakest tenth of every table again, the rows with the smallest margins, before it trusts the shipped table; it can check all of them on request.

**What the certificate implies.** Write $C$ for the configurations of a procedure (the whole sheet, the window's place and the procedure's control state), $V$ for the views, and $A$ for the answers. At a configuration $c$ the runtime either halts or shows the model a view $v=\mathrm{view}(c)$, then paints the model's answer: $c' = \mathrm{paint}(c, f(v))$. Under the *pinned-sheet policy*, each forward pass sees the step's prompt and its view and nothing else, so the model's answers are a function $f: V\to A$. The reference table is $T: V \to A$.

::: theorem {#thm-p title="Theorem P, sheet form" lean="Sketchpad.sheet_exact_iff, Sketchpad.sheet_certified, Polyformer.Pinned.regeneration_trace_iff, Polyformer.Pinned.pinned_regeneration_iff"}
Suppose the runtime paints the answer, so that different answers to a view give different sheets. Then for every start in a set $I$ and every number of steps, the model's run equals the reference run configuration by configuration if and only if $f(v) = T(v)$ for every view $v$ that some reference run from $I$ meets. In particular, if every such view is a row of the tables and the model passes every row, every run of every length is exact.
:::

::: proof
Sufficiency is induction on steps: if the two runs agree up to step $t$, they show the model the same view, which is a row the model passes, so they agree at step $t+1$. For necessity, take the first view where the model and the table disagree; the reference run meets it, and the two runs paint different answers there. The Lean proof instantiates the package's general regeneration theorem with the configuration as the state, so the sheet form and the token form of Theorem P are the same theorem.
:::

Theorem {@thm-p} turns a statement about infinitely many runs into 2,446 checks, as Cai et al. did for learned recursive programs [@cai2017recursion] and Lewandowski et al. for a language model's decoding of a universal machine, by checking its 1,857 production rules [@lewandowski2026universal]. Its force lies in the hypothesis that the model's answer is a function of the view, which the pinned-sheet policy guarantees. If the model kept earlier steps in its context, as chain of thought does, no finite set of checks would suffice.

::: theorem {#thm-nofinite title="No finite test once state leaves the sheet" lean="Polyformer.Pinned.no_finite_test_suite, Polyformer.Pinned.no_finite_check"}
Suppose each step's context keeps the earlier steps. Then for any finite set of test contexts there is a decoder, for a two-state table, that passes every row of the table and is right on every test context, all with strictly positive margins, and still makes an error on some longer run. The pinned run of the same decoder is exact at every length.
:::

::: proof
The counterexample is a correct lookup plus one attention head whose write grows with the number of a given token in the context, scaled so that it crosses the margin only after more steps than any test contains. This is Moore's observation that no finite experiment identifies a machine whose number of states is unbounded [@moore1956gedanken], realised by a decoder that passes the per-row certificate.
:::

Long procedures are built from many certified calls: a square root runs multiply-subtract passes, an algebra problem runs dozens of products and quotients whose inputs quote earlier results.

::: theorem {#thm-compose title="Composition" lean="Polyformer.Pinned.compose_exact, Polyformer.Pinned.error_decomposition_certified, Polyformer.Pinned.error_bound"}
Let a transcript make $K$ calls in order, each a certified procedure on its own sheet, whose inputs may quote the results of earlier calls. Every call's result equals its table's output on the input it actually received, at any lengths and in any order. If the final answer is wrong, then some table is wrong, some quote is wrong, or the glue that combines the results is wrong; for any distribution of transcripts, the probability of a wrong answer is at most the sum of the probabilities of those three events.
:::

For the calculator the tables are fixed and correct by construction, so a wrong answer can come only from a wrong transcription of the problem or wrong glue. In the algebra of Section {@sec-algebra}, the glue is the runtime's textbook procedure and every answer it returns is checked, so a wrong transcription is the remaining risk.

A certificate is measured on one code path: one device, one numerical precision, one batch shape. The run may take another.

::: theorem {#thm-transfer title="Transfer across code paths" lean="Polyformer.Pinned.sel_eq_of_close, Polyformer.Pinned.regeneration_of_close, Polyformer.Pinned.policy_tick_eq"}
Suppose that at every view a run can meet, the logits on the path that runs differ from the certified logits by at most $\tau$ at every output. If every certified row has margin greater than $2\tau$, the run is exact on every input of every length.
:::

::: proof
At each view the correct token leads by more than $2\tau$ on the certified path; moving every logit by at most $\tau$ cannot overturn that lead, so each step picks the same answer, and Theorem {@thm-p} applies. The package also proves that a pinned step computed through a cached prompt prefix, with the step's tokens evicted after each step, gives the same logits as a fresh forward pass, so that choice of cache is another path with $\tau = 0$ in exact arithmetic.
:::

Theorem {@thm-transfer} explains what we measured on hardware. A 4-bit quantised decoder moved some add rows of an earlier adapter from a margin of +9.4 on the server to −8.9 on the M4, far more than any margin, so the page ships the 16-bit decoder, which reproduces the server's certificate. Padding the addition prompt to the batch form moved no margin by more than 0.0018. The device certificate is measured on the path that runs, so there $\tau$ is only the variation between runs; two certificates taken on the M4, with and without the gate, agree on all 2,446 margins to the stored thousandth. On another GPU, the spot check of the weakest tenth measures how far the margins have moved (Fig. {@fig-cert}d).

::: figure {#fig-cert src=fig3.svg pdf=fig3.pdf alt="Theorem P on the sheet, the counterexample, the margins and the transfer across devices"}
**Certification.** **a**, Sums of every length, one step per column, read only views from the 242-view addition table; nine sums from 4 to 1,024 digits already read 202 of them, and the other 40 need numbers of unequal length. Exact on every view is exact on every run (Theorem {@thm-p}). **b**, The counterexample of Theorem {@thm-nofinite}: when the state lives in the context, a decoder can pass every test up to $N$ steps and fail at step $N+1$ (blue, for $N$ = 4, 8 and 16), while the pinned run keeps its margin at every step (rose). **c**, Margins of all 2,446 views on the M4, per step word; the weakest tenth of each, which every new device checks again, is dark. **d**, Smallest margin per step word on the server (PyTorch, 32-bit) against the browser (WebGPU): the 16-bit decoder follows the identity line for the published model (E7) and the one before it (E6); the 4-bit decoder of the first adders (E2, E2b) moved the smallest margin by up to 3 logits.
:::

## A calculator on the sheet {#sec-calc}

Every key of a pocket calculator is a pen-and-paper procedure over a few digit tables. Signed sums and differences use addition or subtraction column by column; the borrow out of the last column says which number was larger, so the sign comes free. Multiplication is the schoolbook method, one multiply step per digit pair and one add step per partial-product digit.

**Division** follows Knuth's Algorithm D, the standard method for dividing long numbers [@knuth1997taocp2]. Both numbers are first scaled by a single digit so that the divisor's leading digit is at least 5, which costs one multiplication pass. Each quotient digit is then guessed from the top two digits of the remainder and the top digit of the divisor, the `EST` table. After scaling, the guess is never too small and at most two too large. The runtime multiplies the divisor by the guess and subtracts it from the remainder in one pass; if the model's borrow out of the top column is 1, the guess was too high, `DEC` lowers it and the divisor is added back.

**Square roots** are taken digit by digit, the method taught in schools, bringing the number down two digits at a time. We scale the number by $c^2$, with $c$ one of 1, 2, 4 or 5, so that the root starts with 25 to 49; twice the root then starts with 5 to 9, so each digit's guess is division's guess, at most two too high, and the same three tables serve. The **greatest common divisor** is Euclid's algorithm by repeated division.

We registered the test before running it: 50 problems each of division to 10 decimal places, square roots to 6 places, greatest common divisors of numbers up to 999, and signed sums and differences of up to 20 digits, run one after another in the browser on the M4. All 200 answers were exact, and every view of every run was a certified row. Median times were 7.0 s for division, 9.8 s for square roots, 7.0 s for the greatest common divisor and 2.0 s for sums (Fig. {@fig-machine}d; Extended Data Table {@tbl-t3}). 184 of 200 finished within 12 s; the slowest were roots of three-digit numbers, at up to 16.5 s, because the trial divisor grows a digit with every root digit and a guess that is too high costs a whole pass. Measured times followed the cost model with a median ratio of 1.01.

On a server GPU, where many problems can run in one batch, the same model answered all 220 problems of the registered baseline, sums of 10 to 1,000 digits and products of 2- to 20-digit numbers: 64,700 views, all certified rows, in 1,001 batched forward passes. Qwen3.5-27B with chain of thought, run with the same prompts and a 32,768-token budget, answered 121 of the 220, falling from 18 of 20 ten-digit sums to none of the thousand-digit ones and from 20 of 20 four-digit products to 7 of 20 twenty-digit ones; 93 of its 99 failures reached the token budget. Stock Qwen3.5-0.8B answered 3 of 220 with chain of thought, nearly always looping until the budget ran out, and 23 without (Fig. {@fig-sheet}c; Extended Data Table {@tbl-baselines}).

## Algebra as written {#sec-algebra}

Algebra in school is arithmetic organised by a few rewriting rules. The runtime writes a derivation the way a textbook would, one line per step, and every number on every line comes from a certified procedure on the sheet. To solve $3(x-2)+5=2x+14$, it multiplies out the bracket, which needs the product $3\cdot 2$; collects $-6+5$; moves the terms across; divides; and substitutes $x=15$ back into both sides, which gives 44 on each. Quadratics use the discriminant and the quadratic formula, with a square root that ends with remainder zero exactly when the roots are rational. Powers of a binomial are expanded by the binomial theorem, with Pascal's rule supplying the coefficients by addition. Polynomials are factored by the rational root theorem, which says that a rational root of an integer polynomial is a divisor of the constant term over a divisor of the leading coefficient, and by synthetic division, the shortcut for dividing by $x - r$; systems of equations by elimination (Fig. {@fig-algebra}a). Irrational roots of quadratics are given exactly, as simplified radicals such as $3 \pm \sqrt 5$, checked through Vieta's formulas, that the roots sum to $-b/a$ and multiply to $c/a$, in integer arithmetic.

**Every answer is checked.** Rational roots are substituted back into the equation, expansions are compared with the original at a further point, and irrational root pairs pass the Vieta identities exactly; an answer that fails is refused and the failed check is shown. A substitution check confirms the roots found, not that all roots were found; the runtime knows the degree and reports when a factor remains unresolved. With deliberately planted faults, the checks refused 200 of 200 wrong roots offered as answers, and 185 of 200 runs in which one call's arithmetic was corrupted; in the 15 runs they did not refuse, the corrupted number did not change the answer (Fig. {@fig-algebra}b). The certificate already covers the arithmetic; the checks guard what it does not cover, the runtime's algebra and the transcription of the problem, and as the planted faults show they also catch most arithmetic faults.

**Cost.** The algebra is classical and so is the comparison. Computer algebra can also solve by evaluating both sides at a few numbers and reading the polynomial off the values (interpolation [@kaltofen1990blackbox]), or by evaluating at a power of ten so the coefficients appear in groups of digits (Kronecker substitution [@kronecker1882]: $(x+2)^5$ at $x=1000$ is $1\,010\,040\,080\,080\,032$). That route needs only arithmetic too, but it hides the algebra and costs more rows on the sheet. By the cost model, which the calculator's measured times follow (median ratio 1.01), the textbook route takes 2.8 s for the linear equation above against 4.5 s by evaluation, 12.1 s for $(x+2)^5$ against 33.1 s, and 16.9 s to factor $x^3-6x^2+11x-6$ against 31.5 s. Six of the eleven worked examples take less than 12 s by the cost model, by either route and either check. Measured on the M4 with the default check, eight do: the expansions of $(x+2)^5$ and $(2x-3)^4$ finish in 9.5 and 10.4 s, while $(x+1)^{10}$, cubic factoring and a three-by-three system take 16 to 22 s. The exact irrational roots of three quadratics take 7.4 to 11.2 s, and their four-place decimal approximations, which the page shows after the exact answer, about as long again (Fig. {@fig-algebra}c; Extended Data Table {@tbl-algebra}).

::: figure {#fig-algebra src=fig4.svg pdf=fig4.pdf alt="A derivation threaded to the sheet, refusals and costs"}
**Algebra as written.** **a**, Factoring $x^3-6x^2+11x-6$, typeset as the runtime writes it. Each number in rose was computed by the model on its sheet; the thread leads from the number to the small column sum or product that produced it. Numbers copied from the problem stay in ink. **b**, Refusals under planted faults: wrong roots offered as answers (200 of 200 refused by both routes) and one call's arithmetic corrupted (185 of 200 refused by the textbook route, 173 of 200 by evaluation); every fault that was not refused left the answer right. **c**, Seconds for eleven worked examples with the default check: the textbook route measured on the M4 (rose) and by the cost model (open rose), against evaluation and interpolation by the cost model (cobalt), with the 12-second line.
:::

## One model that decides {#sec-gate}

Teaching a model a new skill tends to erode its old ones, the problem of continual learning [@mccloskey1989catastrophic; @kirkpatrick2017ewc]. Our arithmetic adapters barely move the model's perplexity on plain text, the usual check: the multiplier adapter E6 raised it by a factor of 1.0065. Yet with that adapter on, the model's instruction following dropped by 16.4 points on IFEval, a benchmark of prompts with checkable instructions [@zhou2023ifeval]. Perplexity does not see the damage.

**The gate.** We therefore built the adapter into the graph behind a gate, in the spirit of progressive networks, which add capacity beside a frozen model instead of changing it [@rusu2016progressive]. Every adapter branch's output is multiplied by one input of the graph, $g$, before it is added back: $y = xW + g\,s\,(xA^{\top})B^{\top}$, where $W$ is the frozen weight, $A$ and $B$ the adapter's matrices and $s$ its fixed scale (Fig. {@fig-gate}a). At $g=0$ every patched layer adds a floating-point zero, which returns the other operand unchanged, so the model is stock Qwen3.5-0.8B; at $g=1$ it is the sheet machine. On ONNX Runtime, over 2,500 chat forward passes and 2,688 table views, every logit, hidden state and cached state of the gated graph equals stock at $g=0$ and the ungated sheet machine at $g=1$, bit for bit, and greedy replies to all 100 chat prompts are identical. On the M4 the certificate at $g=1$ reproduced all 2,446 margins. The page's chat runs at $g=0$, so its language is stock by construction.

**Deciding to open the sheet.** The goal is a model that, in the middle of a reply, opens its sheet, writes a short work order, lets the certified procedures run, and continues with the results. That decision must live in weights that are on during chat, so the gate cannot provide it. We train it on synthetic dialogues (problems that need the sheet, distractors that do not, and problems inside prose) and score it on phrasings and scenarios held out from training. To keep the model's language, training adds a penalty on the divergence from the gate-0 model's own next-token distributions, on its replies to instruction prompts (self-distillation, as in Learning without Forgetting [@li2017lwf]) and on the model's own samples (on-policy distillation [@agarwal2024gkd; @lu2025onpolicy]), the regime in which fine-tuning is known to forget least [@shenfeld2025razor].

::: status {label="Today"}
The fine-tune has not yet passed all of its registered bars. The best adapter so far opens the sheet on held-out problems with precision 1.000 and recall 0.991, keeps IFEval at stock (0.538 against 0.536; paired flips 52 won, 51 lost), writes correct work orders for 96% of held-out equations, and keeps all 2,446 certified views and perplexity within 1%. Three bars are still short: correct work orders for 85.6% of held-out word problems against a bar of 90%, and grade-school word problems (GSM8K [@cobbe2021gsm8k]) and general knowledge (MMLU [@hendrycks2021mmlu]) 2.4 and 2.2 points below stock against a bar of 2. Until all pass, the page's chat runs at the gate's stock setting.
:::

The runs so far show a trade-off. Each change that restored multi-step reasoning cost instruction following, until on-policy distillation removed most of that cost (Fig. {@fig-gate}b). Opening the sheet is the easy part: stock Qwen, shown four examples, opens it with recall 0.81; the fine-tunes, shown none, with recall 0.946 to 0.998 (Fig. {@fig-gate}c). The hard part is the language around it: translating a word problem into the right expression, which the sheet does not check.

::: figure {#fig-gate src=fig5.svg pdf=fig5.pdf alt="The gate, the trade-off between instruction following and reasoning, and opening the sheet"}
**One model that decides.** **a**, The gate: one input of the graph multiplies every adapter branch. At $g=0$ the model is stock Qwen3.5-0.8B bit for bit, on 2,500 chat forward passes and 2,688 table views; at $g=1$ it is the sheet machine. **b**, Instruction following (IFEval) against multi-step reasoning (GSM8K), in points against stock, for the chat fine-tunes P2 to P5 and for switching the gate inside a reply; the shaded region passes both bars. **c**, Opening the sheet on held-out problems: precision against recall, for stock Qwen with four examples (cobalt) and the fine-tunes (rose).
:::

## Inside the model {#sec-inside}

Where in the network is a step decided? The logit lens reads the residual stream, the running sum of every layer's output, through the model's final normalisation and output matrix after each layer, as if the network stopped there [@nostalgebraist2020logitlens; @belrose2023tunedlens]. We count depth as the number of layers applied; the six full-attention layers end at depths 4, 8, 12, 16, 20 and 24. For the published model, the answer takes the lead for good at a median depth of 19 for addition, 20 for multiplication and 18 for the add steps of the multiplier, and through depth 15 it is the top token for at most 13% of the views of any of these tables (Fig. {@fig-inside}a).

The decision can be moved. A class-mean push adds to the residual stream, at the answer position, the difference between the mean state of a target answer and that of the true one [@turner2023actadd; @rimsky2024caa]. Applied after depth 20, the end of the fifth full-attention layer, it changes 79 of 80 addition steps and 80 of 80 multiplication steps to the pushed answer. In an earlier adapter the same push moved 8 of 80 addition steps when applied after depth 18 and 75 of 80 after depth 20: the step is decided in or just before the full-attention layer that ends at depth 20 (Fig. {@fig-inside}c). In a three-dimensional projection of the final layer, the states of the views gather by the answer they write, and the sums that carry (10 to 19) lie apart from those that do not (Fig. {@fig-inside}b). The page runs this push on the visitor's own GPU, through an extra input of the graph, and shows the next step change.

::: figure {#fig-inside src=fig6.svg pdf=fig6.pdf alt="The logit lens, the answer-writing states and the push"}
**Inside the model.** **a**, The logit lens: the share of views whose top token after each depth is the final answer, per step word; ticks mark the median depth at which the answer leads for good, triangles the ends of the full-attention layers. **b**, The states that write the answer, projected to three dimensions at the last layer and coloured by answer: addition (the sum written, 0 to 19) and the multiplier's digit. **c**, A class-mean push at the answer position: the share of steps changed to the pushed answer against the depth of the push, for an earlier adapter (E5, addition and multiplication) and the published one (E7, at depth 20).
:::

## Related work {#sec-related}

**Neural arithmetic.** Learned exact arithmetic at unbounded length has a long line. The Neural GPU learned binary addition and multiplication with convolutional updates that generalise far beyond training lengths [@kaiser2016neuralgpu], with failures on structured inputs such as long runs of zeros [@price2016neuralgpu]. Arithmetic units with built-in inductive biases followed [@trask2018nalu; @madsen2020nau]. For transformers, positional encodings and data formats decide whether addition generalises to longer inputs [@nogueira2021limitations; @anil2022length; @lee2024teaching; @zhou2024raspl; @zhou2024robust; @mcleish2024abacus; @cho2024coupling], and fine-tuned language models reach near-perfect accuracy on bounded arithmetic [@liu2023goat; @yang2023mathglm], with division and the greatest common divisor the hard cases [@shen2024revorder; @charton2024gcd; @kasliwal2026division]. Neural cellular automata and differentiable transducers trained from scratch now add and multiply exactly at hundreds to thousands of times their training length [@wei2026nca; @wei2026ncaadd; @dfst2025]. Mechanistic studies find addition circuits that are correct on all but a vanishing fraction of inputs [@quirke2024verified], and exactness has been proved for idealised training [@backdeluca2025exact]. Sketchpad differs in three ways: the executor is a pretrained vision-language model with a small adapter, not a network trained from scratch; its procedures include division, square roots and the greatest common divisor; and exactness is certified by exhausting the views, not estimated on samples.

**Procedures inside language models.** CAEF fine-tunes Llama-3.1-8B to step through arithmetic operators, division included, on a text tape, with one adapter per operator, reaching nearly 100% up to 100 digits without a certificate [@lai2024caef]. OccamLLM and a gated calculator place exact arithmetic inside a language model as a built-in, non-learned module [@dugan2024occamllm; @igc2025]; compiled and looped transformers run programs with hand-set weights [@giannou2023looped; @loom2026; @percepta2026vm; @dong2023neuralcomprehension]; and a 60-million-parameter transformer trained as an interpreter predicts the steps of program traces thousands of lines long [@xu2026universal]. Chain of Code lets a language model emulate an interpreter for lines that cannot run [@li2024chainofcode]. In Sketchpad the procedure is learned, each step is one forward pass of a pretrained model, and nothing is carried between steps but the sheet.

**Tools.** Toolformer showed that a model can learn when to call a tool by keeping the calls that help [@schick2023toolformer]; PAL, Program of Thoughts, ToRA, ReTool and ToolRL interleave reasoning with code or tool calls [@gao2023pal; @chen2023pot; @gou2024tora; @feng2025retool; @qian2025toolrl], and recursive language models call themselves through an interpreter [@zhang2025rlm]. Our chat fine-tune borrows Toolformer's recipe, with the model's own certified computation as the tool.

**Verification on finite sets.** Neural-network verification usually bounds a network's output over continuous regions of input [@katz2017reluplex]. Our inputs are finite by construction, so verification is enumeration. Moore showed that experiments on a machine identify it only given a bound on its states [@moore1956gedanken], the basis of conformance testing [@chow1978testing]. Cai et al. proved learned recursive programs correct by checking a finite verification set [@cai2017recursion]. Schuurmans et al. and Lewandowski et al. certified universal computation by a language model's decoding by checking every production rule of a universal machine [@schuurmans2024universal; @lewandowski2026universal], Abbe et al. proposed the same context discipline, keeping the question and the current state and dropping the rest, as the inductive scratchpad [@abbe2024globality], and PENCIL erases intermediate reasoning to keep the context short [@yang2025pencil]. Certification from examples can be hard under small changes of architecture, and length generalisation bounds can be uncomputable [@backdeluca2026certification; @yang2026lengthbounds]; our guarantee needs no such bound, because the pinned-sheet policy makes the set of inputs finite. Our theorems are lifts of these results to a sheet; we claim the instance, its formal statement and its check on the deployed device.

**Reading rendered text.** Vision encoders can read text as pixels well enough to model language [@rust2023pixel; @tschannen2023clippo; @lee2023pix2struct], and rendered text is now used to compress long contexts [@wei2025deepseekocr; @cheng2025glyph], though vision-language models that read digits reliably still fail at the multiplication [@balter2026vlm]. Visual scratch pads let multimodal models draw and reread diagrams as a visual chain of thought [@hu2024visualsketchpad; @menon2024whiteboard; @li2025mvot; @selfimagine2024; @mathcanvas2025]. Our sheet is narrower and exact: one fixed glyph set, read three cells at a time, where untouched Qwen3.5-0.8B reads single cells exactly but long rendered numbers only to 98 to 99% per digit. The name Sketchpad nods to Sutherland's interactive drawing system [@sutherland1963sketchpad].

**Algebra.** Transformers have learned symbolic integration [@lample2020symbolic], step-by-step polynomial simplification with the arithmetic offloaded to a calculator [@agarwal2021polynomial], Gröbner bases [@kera2024groebner] and, as large language models, school algebra in chain of thought [@lewkowycz2022minerva]; theory shows that chain of thought lets small transformers solve arithmetic and linear equations [@feng2023cot]. None is exact by construction. Our algebra algorithms are classical; what is new is that every number in them comes from a certified learned executor.

**Continual learning.** Learning without Forgetting distils the old model into the new one [@li2017lwf]; progressive networks keep the old weights and add new ones beside them [@rusu2016progressive]; elastic weight consolidation protects important weights [@kirkpatrick2017ewc]; X-LoRA routes between adapters [@buehler2024xlora]. On-policy distillation and RL's Razor show that forgetting tracks the divergence from the base on the model's own outputs [@agarwal2024gkd; @lu2025onpolicy; @shenfeld2025razor]. Our gate is a hard switch of the progressive kind: it guarantees stock behaviour at 0, and leaves the decision to compute to the fine-tune.

**What we did not find.** In a search of the literature on 30 October 2026, covering the work above and 50 arXiv abstracts read in full (Methods), we found no earlier pretrained vision-language model that does exact arithmetic at any length with a rendered sheet as its only state, certified on every view and checked again on the user's device; no learned, certified long division, square root or greatest common divisor; and no algebra whose every arithmetic step is done by a learned, certified executor.

## Limits {#sec-limits}

The certificate covers the model's steps and nothing else. The runtime's layout, its choice of procedure, and the transcription of a problem into a work order are not certified; they are ordinary code and, in chat, ordinary language. The theorems assume exact arithmetic; on hardware they hold through the margins, and the device certificate holds for the device and path that measured it. A visitor's GPU checks the weakest tenth of the shipped table, not all of it, unless asked. The algebra covers polynomial equations of small degree in one unknown and linear systems in up to three, and it checks the roots it finds, not that it found all of them. The model reads typed problems drawn in its own glyphs, not photographs. And it is slow: a step costs about 0.1 s on a laptop GPU, so a thousand-digit sum takes over a minute and some square roots and expansions take more than 12 s. The model that decides for itself when to compute is still in training.

## Methods {#methods .unnumbered}

### Model and adapter

We use Qwen3.5-0.8B [@qwen35] (language model: 24 layers, hidden size 1,024; layers 4, 8, …, 24 are full attention with 8 query and 2 key-value heads, the rest Gated DeltaNet [@yang2025gateddeltanet]). The adapter is a LoRA of rank 16 and scale 32/16 on the query, key, value and output projections of the 6 attention layers, the input and output projections of the 18 Gated DeltaNet layers and the three projections of all 24 feed-forward blocks: 150 matrices and 10,223,616 parameters, against 873,438,784 in the base model with its vision encoder. For the browser the model is exported to ONNX: the token embedding in 4-bit, the vision encoder and the language model in 16-bit floating point; the adapter is folded into a 21 MB decoder graph that shares the base's external weights. Two extra graph inputs serve the page: the gate (`lora_gate`, Section {@sec-gate}) and a push vector added to the residual stream after depth 20 (Section {@sec-inside}); one extra output returns the hidden states for the inside view.

### Views, prompts and tables

Glyphs are 32 × 32 pixel sprites of blank and the ten digits, rendered once and reused for every view, so every view the model can see is one of a finite set of exact images. A view stacks three cells into a 32 × 96 image, which the processor, set to its native size, turns into three image tokens. The prompt of a step is its word, the image, `=` and two `?` slots, padded with further `?` to the length of the longest word; the answers are read at `=` and the two slots. Extended Data Table {@tbl-tables} lists the nine tables. The rows are exhaustive over each step's possible views: for example, `MUL` covers every digit or blank of the multiplicand, every digit of the multiplier and every carry from blank to 8 (11 × 10 × 10 = 1,100), and `EST` covers every remainder pair under every normalised divisor digit from 5 to 9 (400). That the procedures meet no other view follows from the layout and, for division and roots, from normalisation; it is also checked by the runtime on every step, and by the reference runtime on 1,000 random cases per procedure, with no view outside the tables.

### Training

Training reads the tables, not sampled problems: every step draws rows from each table, and the loss is cross-entropy plus a hinge that pushes every margin above 4, plus a penalty on the divergence from the base model's next-token distributions on plain text [@li2017lwf]. Every 100 steps the whole certificate is computed; rows with margins below 2 are replayed, and training stops when every row passes with margin at least 3. The published adapter, E7, continued from the adapter E6, which already passed the addition and multiplication tables, with the subtraction, guess and lowering tables added. It passed every row first at step 1,200 and stopped at step 1,600, after 19.8 minutes on one H100 GPU (about \$1.30), with the learning rate decaying on a cosine from $2\times10^{-4}$ to $2\times10^{-5}$. Its plain-text perplexity is 1.0048 times stock. End to end on the server it multiplied 20 of 20 four-digit, 10 of 10 six-digit and 5 of 5 ten-digit pairs and added 20 of 20 ten-digit, 5 of 5 hundred-digit and 2 of 2 thousand-digit pairs exactly.

### Certification

A margin is the correct token's logit minus the largest logit of any other token in the vocabulary of 248,320, at each answer position; a row passes when every answer position has a positive margin. The server certificate runs in PyTorch in 32-bit floating point. The device certificate runs the deployed files (transformers.js 4.2.0 [@transformersjs], ONNX Runtime Web on WebGPU) on an Apple M4, through the page's own code path and padded batch form, and records every margin together with the device, the library version, the hash of every file and the sprite sheet. The page accepts a shipped certificate only for identical files, and checks the weakest tenth of each table again on the visitor's GPU before a run. The certificate file format is described in Appendix B.

### Procedures and timing

Signed sums and differences run `SUM` or `SUB` column by column; a subtraction ends on a halt row that reports whether a borrow came out, in which case the subtraction runs the other way round and the sign flips. Long division follows Algorithm D [@knuth1997taocp2]: both numbers are scaled by $f = \lfloor 10/(d+1) \rfloor$, $d$ the divisor's leading digit, in one multiplication pass each; each quotient digit is guessed by `EST` from the remainder's top two digits and the divisor's top digit (or skipped when the guess is zero); a multiply-subtract pass runs `MUL` one column ahead of `SUB`, two views per call; a borrow out of the top column triggers `DEC` and an add-back with `SUM`. Square roots scale the radicand by $c^2$ with $c\in\{1,2,4,5\}$ so the root starts with 25 to 49, which we verified for every radicand from 1 to 999,999; the first guess is 4, the second 9 when the root starts with 2, and every later guess comes from `EST`. The runtime picks $f$, $c$ and the first two guesses from the leading digits it lays out; each guess is at least the true digit and is lowered only by a certified multiply-subtract and `DEC`, so these choices can cost steps but cannot change a digit. Greatest common divisors run Euclid's algorithm by repeated division. The cost model, fitted on batches of 1 to 32 rows on the M4 with layer states left on the GPU, is 0.065 s per forward pass plus 0.037 s per view.

The registered browser test (Extended Data Table {@tbl-t3}) drew its 200 problems from a fixed generator (seed 12345) before any run: $a \div b$ to 10 places with $a \le 999$ and $2 \le b \le 99$; $\sqrt a$ to 6 places with $2\le a \le 999$; $\gcd(a,b)$ with $10 \le a,b \le 999$; and signed sums and differences of 1 to 20 digits. It ran in Chrome on an Apple M4 in the page's fast mode, one problem after another, with wall time measured from the call to the answer. The WebGPU device was lost three times during the run; each time the model was reloaded and the interrupted problem redone, and only completed runs are counted. Every answer was checked against the page's own big-integer arithmetic and again in Python. The run was repeated in full with the gated published model: all 200 answers were again exact, and every step's views and answers were identical.

### Algebra

The algebra runtime (`program/`) parses a problem, writes the derivation line by line, and obtains every number through the calculator's interface, which runs certified procedures on the sheet; independent calls share waves. Each line records which model calls produced its numbers, which the page uses to light each number when its call completes (Fig. {@fig-algebra}a). The light check confirms collected coefficients at one further point and substitutes rational roots into the collected equation; the strong check substitutes into the typed sides. Irrational roots of a quadratic $ax^2+bx+c$ are written as a reduced pair $(p \pm q\sqrt m)/d$ and checked by the integer identities $a\cdot 2p = -b\,d$ and $a(p^2 - q^2 m) = c\,d^2$, which hold exactly when the pair is the quadratic's two roots; square factors are extracted by trial of the primes up to 50. The fault populations planted a wrong root (200 per route) or corrupted the result of one call inside the initial evaluation or collection work (200 per route, fixed seeds); a second population perturbed one parameter of 200 radical pairs, and all 200 were refused in both check modes. The reference test suite of 264 tests, including 2,200 generated problems per route and check mode, runs with exact reference tables in place of the model; every cost is computed by the cost model from rows and calls, not measured on the device.

### The gate

The gate multiplies each LoRA branch's output before it is added to the frozen projection, in all 150 patched matrices. The identity test ran on ONNX Runtime 1.31.1 on CPU, with three graphs on the same external weights: stock (the base with the inside patch), the ungated adapter and the gated one. It compared every logit, hidden state and cached state, bit for bit, on 100 chat prompts (the first user turn of the No Robots test split [@norobots2023]; one prefill and 24 greedy decoding steps each, 2,500 calls) and on all 2,446 table views plus the 242 addition views in padded form, with inputs captured from the reference forward pass.

### The chat fine-tune

The training set has about 3,150 synthetic dialogues, of which about 30% are distractors that must not open the sheet, plus 547 grade-school training problems solved by stock Qwen in its own words, with each calculation turned into a sheet call and kept only when the stand-in sheet reproduced it. The held-out set has 780 items from templates never trained on. Every work order is scored by running it, never by string match. Registered bars, set before any run: precision and recall of opening the sheet at least 0.95; correct work orders for at least 90% of word problems and 95% of equations and expressions; IFEval strict prompt-level accuracy [@zhou2023ifeval] within 2 points of stock; and, from the second round, GSM8K (250 test problems) and MMLU (500 questions) within 2 points of stock. Kill lines: any certified view lost, perplexity above 1.03 times stock, or IFEval more than 5 points down. Paired flips (the prompts only one of two models gets right) give the noise of each comparison. Extended Data Table {@tbl-chat} lists every run.

### Inside the model

The logit lens applies the final normalisation and output matrix to the residual stream after each depth at the first answer position, for the 1,795 addition and multiplication views; a view's decision depth is the first depth after which the final answer stays the top token. The class-mean push replaces the answer position's state after depth 20 by itself plus the mean state of the target answer's views minus the mean of the true answer's, and counts how often the step's answer becomes the target (80 trials per table).

### Baselines

The baseline of Fig. {@fig-sheet}c was registered before it ran (`paper/BASELINES.md`): 220 problems, 20 per length, sums of 10, 30, 100, 300 and 1,000 digits and products of 2-, 4-, 6-, 10-, 15- and 20-digit numbers (seed 20261031), the same prompt for every model ("What is a + b? Give the exact integer. Put the final answer in \boxed{}."), Qwen's recommended sampling for each mode, and a budget of 32,768 new tokens with chain of thought and 4,096 without. The stock models ran under vLLM on one H100 GPU. The 27-billion-parameter slot used the FP8 release of Qwen3.5-27B, because the 16-bit model held only 8 replies at full length and would have exceeded the budget; the choice was fixed before scoring. Sketchpad ran in PyTorch with the published adapter, all 220 problems in lockstep. The answer was the last boxed integer after the reasoning, separators removed; a reply that hit the budget or gave no answer counted as wrong. The run cost about \$7 on Modal.

### Literature search

The prior-art search of 30 October 2026 read 50 arXiv abstracts and the proof method of Cai et al., on exact arithmetic by learned models, certification of learned programs, procedure-stepping and compiled arithmetic in language models, algebra by learned models, tool use and adapter switching. It is a search, not a proof of absence. Every reference in this paper was checked against its source on 31 October 2026 (`paper/refs_verified.md`).

### Data and code availability

The model, its adapter, the certificate and the inside data are on Hugging Face (`mohsenvand/sketchpad-0.8b-preview`, revision `2df87172`). The runtime, the page, the algebra, the baselines and this paper's sources are in the Sketchpad repository under the Apache 2.0 licence. The training and evaluation scripts and the records cited in `paper/numbers.md` are in the polyformer repository (`research/sketch/`) and in this one. The Lean proofs are in the polyformer package `research/lean` (branch `lean-p`) and in `paper/lean/Sheet.lean`.

## Extended Data {#extended .unnumbered}

::: table {#tbl-tables .extended}
**The nine tables.** Each row is one view the step can meet. Margins are the smallest over the table, in logits, for the published model: on the server in 32-bit PyTorch, and on the M4 in the browser in 16-bit, from the shipped certificate. Next-step letters: `A` add the partial product, `Z` end of pass, `M` multiply (or multiply-subtract), `F` flush, `N` next digit, `H` halt, `B` borrow out, `S` subtract on, `C` correct the remainder.

| Step | View (top to bottom) | Answers at `=`, `?`, `?` | Rows | Server | M4 |
|---|---|---|---:|---:|---:|
| `SUM` | carry (blank, 1), top digit, bottom digit (blank, 0–9) | sum and carry as one token (0–19), or `H` | 242 | 3.96 | 3.02 |
| `MUL` | multiplicand digit (blank, 0–9), multiplier digit (0–9), carry (blank, 0–8) | digit, carry, `A` or `Z` | 1,100 | 6.39 | 6.52 |
| `ADD` | carry (blank, 1), product digit, running-total digit (blank, 0–9) | digit, carry, `M` | 220 | 9.37 | 9.50 |
| `ADZ` | as `ADD`, at the end of a pass | digit, carry, `F` | 220 | 8.41 | 8.00 |
| `FLS` | carry (blank, 1), blank, blank | the last carry, –, `N` | 2 | 12.93 | 13.11 |
| `NXT` | next multiplier digit (blank, 0–9), blank, blank | –, –, `M` or `H` | 11 | 10.48 | 10.22 |
| `SUB` | borrow (blank, 1), top digit, bottom digit (blank, 0–9) | digit, borrow, `S`; all blank: –, –, `H` or `B` | 242 | 8.36 | 8.19 |
| `EST` | remainder's top two digits $r_1 \le d$, divisor's top digit $d$ (5–9) | $\min(9, \lfloor(10r_1+r_2)/d\rfloor)$, –, `M` or `N` | 400 | 4.51 | 4.61 |
| `DEC` | guess $q$ (1–9), blank, blank | $q-1$, –, `C` | 9 | 10.00 | 10.09 |
| **All** | | | **2,446** | **3.96** | **3.02** |
:::

::: table {#tbl-t3 .extended}
**The registered browser test.** 50 problems per set on the Apple M4 (WebGPU, 16-bit decoder), ungated E7; the full certificate passed first.

| Set | Exact | Median s | Max s | Over 12 s | Median calls / views | Cost model median s |
|---|---:|---:|---:|---:|---:|---:|
| $a \div b$ to 10 places ($a \le 999$, $b \le 99$) | 50 | 7.0 | 13.3 | 1 | 65 / 90 | 7.6 |
| $\sqrt a$ to 6 places ($a \le 999$) | 50 | 9.8 | 16.5 | 11 | 86 / 137 | 10.7 |
| $\gcd(a,b)$ ($a, b \le 999$) | 50 | 7.0 | 13.4 | 4 | 61 / 84 | 7.1 |
| signed $\pm$, up to 20 digits | 50 | 2.0 | 4.7 | 0 | 19 / 19 | 1.9 |
:::

::: table {#tbl-algebra .extended}
**Cost of the worked algebra examples.** Rows (views), forward passes after waves and seconds by the cost model, light check, for the textbook and evaluation routes.

| Work order | Textbook rows / passes / s | Evaluation rows / passes / s |
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
| `solve x^2-2=0` (exact answer) | 86 / 65 / 7.4 | |
| `solve 2x^2+3x-1=0` (exact answer) | 144 / 88 / 11.0 | |
| `solve x^2-6x+4=0` (exact answer) | 133 / 96 / 11.2 | |
:::

::: table {#tbl-chat .extended}
**The chat fine-tunes against their registered bars.** Held-out templates at gate 1 with no examples, against stock Qwen with four examples (opening and work orders) or stock with none (benchmarks). IFEval, GSM8K and MMLU are in points against stock (0.536, 0.516 and 0.476). Bars as registered; GSM8K and MMLU became bars in the second round. P7 is running.

| Run | Precision / recall | Word | Equations | Prose | IFEval | GSM8K | MMLU | Views kept |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| bar | ≥ 0.95 / ≥ 0.95 | ≥ 0.90 | ≥ 0.95 | ≥ 0.95 | ≥ −2 | ≥ −2 | ≥ −2 | all |
| stock, four examples | 0.971 / 0.809 | 0.789 | 0.583 | 0.667 | 0 | 0 | 0 | |
| P1 (from E6) | 0.957 / 0.996 | 0.872 | 0.967 | 0.983 | −4.8 | | −6.6 | 1,795 |
| P2 | 1.000 / 0.998 | 0.894 | 0.975 | 1.000 | −0.55 | −31.2 | −5.4 | 2,446 |
| P3 | 1.000 / 0.994 | 0.856 | 0.975 | 0.992 | −2.8 | −14.0 | −2.4 | 2,446 |
| P4 | 1.000 / 0.994 | 0.817 | 0.958 | 0.992 | −4.4 | −6.4 | −3.4 | 2,446 |
| P5 (on-policy) | 1.000 / 0.946 | 0.678 | 0.958 | 0.983 | −1.5 | −2.0 | −2.2 | 2,446 |
| P6 (wider word data) | 1.000 / 0.991 | 0.856 | 0.958 | 0.975 | +0.2 | −2.4 | −2.2 | 2,446 |
:::

::: table {#tbl-baselines .extended}
**The registered baseline.** Problems answered exactly, of 20 per cell, with the number of replies that reached the token budget in brackets. Qwen3.5-27B is the FP8 release.

| System | +10 | +30 | +100 | +300 | +1,000 | ×2 | ×4 | ×6 | ×10 | ×15 | ×20 | All |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Sketchpad | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 220 |
| Qwen3.5-27B, thinking | 18 (2) | 12 (8) | 8 (10) | 1 (19) | 0 (20) | 20 (0) | 20 (0) | 15 (4) | 14 (6) | 6 (11) | 7 (13) | 121 |
| Qwen3.5-0.8B, thinking | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 3 (17) | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 3 |
| Qwen3.5-0.8B, no thinking | 0 (8) | 0 (20) | 0 (20) | 0 (20) | 0 (20) | 15 (4) | 8 (9) | 0 (14) | 0 (20) | 0 (19) | 0 (20) | 23 |
:::

::: appendix

## The Lean package {#app-lean .unnumbered}

The theorems are proved in Lean 4 [@demoura2021lean4] with Mathlib [@mathlib2020] (Lean and Mathlib 4.35.0). The package builds with `lake build` (3,150 jobs) and contains no `sorry`, `admit` or added axiom; `#print axioms` on every theorem below lists only `propext`, `Classical.choice` and `Quot.sound`, Lean's standard axioms, or a subset. The model in Lean is an abstraction: the network is a deterministic function of its context (or a causal decoder whose layer at a position reads only earlier positions), the argmax may break ties any way, and arithmetic is exact; floating point enters only through Theorem {@thm-transfer}'s $\tau$.

::: table {#tbl-lean .extended}
**Lean statements.** Files in the polyformer package `research/lean/Polyformer/` (branch `lean-p`, commit `a114d08b`), except `Sheet.lean`, which is `paper/lean/Sheet.lean` in this repository and builds against the package.

| Theorem | Lean name | File | Axioms |
|---|---|---|---|
| {@thm-p}, sheet form | `Sketchpad.sheet_exact_iff`, `Sketchpad.sheet_certified` | `Sheet.lean` | `propext`, `Quot.sound` |
| {@thm-p}, token form | `pinned_regeneration_iff`, `regeneration_trace_iff`, `pinned_regeneration_decoder` | `Pinned.lean` | standard |
| {@thm-nofinite} | `no_finite_test_suite`, `no_finite_check` | `Unpinned.lean` | standard |
| {@thm-compose} | `compose_exact`, `error_decomposition_certified`, `error_bound` | `Compose.lean` | standard |
| {@thm-transfer} | `sel_eq_of_close`, `regeneration_of_close` | `Pinned.lean` | standard |
| {@thm-transfer}, the cache | `policy_tick_eq`, `policy_regeneration` | `Policy.lean` | `propext`, `Quot.sound` |
:::

## The certificate format {#app-cert .unnumbered}

A certificate is one JSON file shipped beside the model graph (`arithmetic/certificate.json`). Its `format` string names the prompt forms it was measured in (for the published model, the padded addition prompt and the slotted, padded multiplier and calculator prompts, on 32 × 96 strips from the sprite sheet). It records the numerical precision of each graph, the transformers.js version, a fingerprint of the sprite sheet and of every model file, the device's GPU description and the time. For each table it lists the number of rows, the number that passed and every row's margin, in the table's fixed row order, to a thousandth of a logit. The page accepts it only if every fingerprint matches the files it loaded, and then checks the rows with the smallest tenth of margins again on the visitor's GPU.

## Reproducing the numbers {#app-repro .unnumbered}

Every number in this paper is listed in `paper/numbers.md` with the record it comes from. Training, certification on the server, the identity test of the gate and the chat runs are Modal jobs in polyformer `research/sketch/` (`e7_calc.py`, `e7_gate_identity.py`, `chat/`), each logged with its job id and cost. The device certificate and the registered browser test run on the page itself (`sketchpad.exportCertificate()` and `sketchpad.runCalc()` in the browser console). The algebra's tests and costs run with `pnpm vitest run src/lib/sketchpad/program`, and the costs are checked independently by `verify_costs.py` and `verify_round3.py`. The baseline is `paper/baselines/` (`spawn.py` launches it, `score.py` rebuilds `results.json` from the raw replies). The Lean proofs build as described above.

:::
