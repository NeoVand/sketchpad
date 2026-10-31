# STYLE: making paper.md read like a paper

**Verdict.** The science and the honesty are in place. The paper reads like a report for three reasons:

- It poses the problem as accuracy when its subject is a guarantee.
- Most results sections open with procedure, not with the question they answer.
- The caveats a reviewer prompted are scattered across six places as separate checks.

The fix is mostly moving material, not cutting it.

## 1. Calibration

| Paper | What to learn |
|---|---|
| AlphaGeometry (Nature 2024) | The introduction runs: why the problem matters, why it is hard, the approach (scope excluded in its second sentence), then the headline against the previous best (25 vs 10). The human-comparison caveat sits in a caption. Related work is in Methods, and there is no Limitations section. |
| FunSearch (Nature 2023) | One framing pair (easy to evaluate, hard to solve) carries the paper. Its ingredients are given in prose ("First… Finally"). Its scope is one Discussion paragraph of conditions, and related work is in Methods. |
| AlphaDev (Nature 2023) | Correctness is part of the problem, because the game rewards correct, fast programs. Results therefore call a program "correct" as a property, and the checking lives in a figure and in Methods. Sentences run about 20 words. |
| AlphaProof (Nature 2025) | Caveats are concessive clauses inside result sentences (multi-day compute against human time limits). In the Discussion, each limit is paired with a direction. Its adjectives ("landmark", "profound") are not a model. |
| McLeish et al. 2024 | It diagnoses the cause before the fix, and gives the headline against the prior best (6× vs 2.5×). It states its reporting conventions once, in the setup, and orders results by two hypotheses stated in advance. |
| Zhou et al. 2024; Abbe et al. 2024 | Each introduction moves from a tension or question to a minimal worked example and then to the framework. Failures are reported as results. |
| Cho et al. 2025 | It concedes that both components are known, then states exactly what is new. |
| Gross et al. 2024 | Its baseline is exhaustive enumeration. Floating point is relegated to a footnote, and the main obstacle is reported as a finding. |
| Yang et al. 2025 (PENCIL) | Its introduction has five paragraphs: problem, precedent from another field, the method as one displayed rule, the result against a baseline, then theory. |
| Lewandowski et al. 2026 | It shows that a model realises every rule of a finite table and presents this as a proof strategy, not as a checklist. |
| Hu et al. 2024 | Its method is also named "Sketchpad", which paper.md should acknowledge in one clause. |

**Habits to adopt.**

1. Give each introduction paragraph one job. State contributions in prose, never as a table of contents.
2. Put the idea before the results, and open each results section with its question.
3. State scope once, as a choice or a condition. Other caveats become clauses, captions or Methods.
4. State guarantees as properties of the construction, and leave the checking machinery to Methods.
5. Introduce each number with its comparator, in the same sentence.
6. Keep sentences short. I measured both bodies (paper.md without theorems, captions and abstract):

| | Median sentence | Sentences over 40 words | Uses of "every" |
|---|---|---|---|
| Four Nature main texts | 21–24 words | 6–10% | 0–2 |
| paper.md (3,947 words) | 29.5 words | 29% | 26 |

## 2. Diagnosis

### 2.1 The arc

**Thesis.** When each step of a computation reads only a bounded view of an external sheet, a pretrained network's exactness at every input length becomes a finite, checkable property. We make a 0.8B vision-language model satisfy it, certify it on the device that runs it, and build arithmetic and algebra on it.

| Section | Step of the argument | What the reader then believes |
|---|---|---|
| Introduction | Sampled accuracy, even when high, carries no guarantee, and the remaining errors are silent | The gap is a missing guarantee, not low accuracy |
| Sheet machine | Every step reads only a view drawn from a finite, listable set | The hypothesis holds by construction |
| Certification | Exactness on views is equivalent to exactness at every length; the restriction is necessary; margins carry the check to hardware | The certificate concerns the deployed model |
| Arithmetic | The procedures keep their views inside the tables | The guarantee holds at 1,000 digits, where frontier models err silently |
| Algebra (+ Theorem 3) | Certified procedures compose, and the uncertified parts are checked | The guarantee extends beyond a single procedure, to a stated boundary |
| Gating | The adapter costs the base model nothing | The method can attach to a general model |
| Mechanism | Where the step is decided | The decision has a location |
| Discussion (new) | What is covered and what is not | Scope, said once |

**Where the current order fights the arc.**

- Intro P1 reports the paper's own result (217 of 220) before the method. It also calls arithmetic a "weakness" two sentences before saying frontier models are accurate.
- The cost model ({@eq-cost}) interrupts the construction.
- Theorem 3 sits in Certification but is used only in Algebra.
- Arithmetic never says why the normalisations exist: they keep every view inside the tables, which is Theorem 1's hypothesis.
- Gating puts the exact identity and the statistical dialogue results in one paragraph.
- Mechanism has no stated purpose.
- The main text ends on Related work and Limitations, with no Discussion.

### 2.2 Audit-sounding passages

| Passage | Fix |
|---|---|
| "The runtime checks that every extracted view is a row…" | Move to Methods. In its place, say why views stay in the tables. |
| "Theorem {@thm-p} takes the runtime as given… Two hypotheses…" | Keep, but recast as the theorem's scope. This is the single precise statement of coverage (3.3). |
| "The certificate is bound to the model files by their hashes…" | Move to Appendix {@app-cert}, which already says it. |
| "…and every view was a table row" | Move to Methods. |
| "Each model was run once per problem…" | Move to Methods. It is unneeded once the main text stops ranking frontier models. |
| "Every answer is checked before it is returned…" | Turn into the argument from Theorem 3 (3.3). |
| "Success criteria were fixed before training. The final adapter meets all of them:" | Reduce to "against criteria fixed before training (Methods)". |
| "The benchmark differences are paired, with standard errors…; the final adapter was the fifth candidate…; on the M4…" | Send the SE formula to Methods, and "fifth candidate" to Methods and the Extended Data Table {@tbl-chat} caption. Keep the clause "within one standard error of the −2 criterion", because it qualifies the claim. |
| "On ONNX Runtime, every logit, hidden state…" | State the identity as a property of ({@eq-gate}), "confirmed bit for bit (Methods)", and move the counts to Methods. |
| "…and the identity is tested on every logit…" (Related work) | Delete. |
| Limitations | Dissolve into the Discussion. |

The runtime caveat appears six times: intro P3, Runtime, after Theorem 1, Methods, Limitations and Appendix A. State it precisely once, after Theorem 1. Leave one clause in the introduction and the operational detail in Methods.

### 2.3 Marketing and AI-ish prose

- "We take a third route:" is a slogan. State the approach.
- "Our contribution is a system… Specifically:" plus five items with section pointers is a table of contents.
- The abstract ranks models ("the strongest of ten… the strongest open-weight model"). Read as a contest, 220 against 217 invites the reply "three problems". The point is that one result is guaranteed and the other is not.
- "The gate does not decide when to compute. We therefore…" announces a turn instead of making it.
- "We therefore" appears three times, and 21 of 116 sentences open with "The". Semicolon chains stack unrelated claims.

### 2.4 Flow problems

- **Terms used before they are defined:**
  - "pinned-sheet policy" and "pinned policy": define one name in Sheet machine.
  - $\sigma_T$ is defined only in Appendix A; write "the reference run".
  - "The M4" is defined only in a caption.
- **Six names for adapters** (earlier, earlier arithmetic, published, final, gated, multiplier). Fix three in Sheet machine: the *arithmetic adapter* (Sections 2–4 and 7), the *dialogue adapter* (Section 6, also certified) and *preliminary adapters* (for the 4-bit, forgetting and steering contrasts).
- **Numbers without context:**
  - "Within 12 s" never says why 12 s.
  - "3.02 logits" needs its meaning. By Theorem 4 it tolerates any logit perturbation below 1.51, against the 4-bit decoder's swing of about 18 logits (+9.4 to −8.9). This is arithmetic on existing numbers.
  - "1.0065" should be stated as a 0.65% change.
- **Abrupt transitions.** Certification to Arithmetic, Algebra to Gating, and Gating to Mechanism are joined only by headings.

## 3. Recommendations

### 3.1 Abstract

*Problem:* it states the wrong gap ("unreliable"), ranks models, and ends on a feature. *Rewrite:*

> Language models are accurate on most long-arithmetic problems, but their accuracy is estimated on samples and carries no guarantee for an unseen input; tool use is exact but moves the computation outside the network. Here we show that exactness at every input length becomes a finite, checkable property of a network when each of its steps reads only a bounded view of an external working memory. In Sketchpad, Qwen3.5-0.8B with a low-rank adapter executes arithmetic procedures on a rendered sheet. Each forward pass reads a three-cell view and emits one step: a digit, a carry or borrow, and the next operation. A fixed runtime moves the view and writes no digit of a result. We prove in Lean that the model is then exact on all inputs of any length if and only if it is exact on the finite set of views the runtime presents, and that no finite test suffices when steps also read earlier steps. All 2,446 views pass on the deployment device, a laptop GPU running the model in a web browser. The certified model performs signed addition and subtraction, long multiplication and division, square roots and greatest common divisors at arbitrary length. It solved 200 of 200 pre-registered problems in the browser, and 220 of 220 sums of up to 1,000 digits and products of up to 20 digits, of which the strongest of ten other models, GPT-6.1 Sol, solved 217. Built on these procedures, a symbolic runtime solves, expands and factors polynomials with every number computed by the model, and a multiplicative gate on the adapter recovers the base model exactly whenever the sheet is not in use.

To keep composition and robustness in the abstract, add "with bounds for composition and numerical perturbation" after "earlier steps".

### 3.2 Introduction

**P1.** Now it lists prior methods, then the paper's own result, then tool use. Make it state the problem and the gap:

> Language models now answer most long-arithmetic problems correctly, but that accuracy is measured on samples. Chain-of-thought prompting [..] and changes to positional encoding and data format [..] extend the lengths at which transformers add and multiply correctly; in each case, correctness on an unseen input is an estimate. The remaining errors are silent. The three errors GPT-6.1 Sol made in our comparison, on sums of 300 and 1,000 digits, were completed replies within the token budget, indistinguishable from its 217 correct answers. Tool use [..] is exact, but places the computation outside the network.

**P2.** New; it states the insight, built from the current P3:

> A guarantee for every input requires that behaviour on unboundedly many inputs be fixed by finitely many facts. This holds when each step reads only a bounded view of an external memory and no other state passes between steps. The steps then range over a finite set of views, and a network that is correct on each view is correct on every run of every length. The observation is classical: it underlies Moore's analysis of experiments on finite automata [..], the verification of learned recursive programs [..] and the certificate for universal computation by language-model decoding [..]. We make the hypothesis hold by construction for a pretrained model, and we check the resulting finite condition on the hardware that runs it.

**P3.** The current P2, without "We take a third route", in shorter sentences.

**P4.** Replaces the five-item list with the results in prose, one sentence each and each number with its comparator:

- Theorems 1 and 2 in Lean, plus composition and robustness;
- the device certificate, with its smallest margin of 3.02 logits;
- the calculator;
- 220 of 220 problems, against 217 for the strongest other model;
- algebra;
- the gate.

**P5.** One sentence of scope: "The guarantee is relative to the runtime, whose layouts, outer loops and reference procedures are conventional code; Section 3 states what they must satisfy."

### 3.3 Section openings

- **Sheet machine.** It now opens with model specifications. Open instead with: "Sketchpad has three parts: a sheet that holds all state, a model that maps a view of the sheet to one step's outputs, and a runtime that moves the view and writes the outputs. The design serves one requirement: every step's input comes from a finite set that can be listed in advance."
  - Define *pinned*, the adapters and the M4 here.
  - Move the per-layer details and ({@eq-cost}) to Methods.
- **Certification.** Lead with: "Because each step is a function of its view, a check over the 2,446 views is a check of every run." After Theorem 1, add:

  > Theorem 1 separates what the network must get right from what the runtime must get right. The network's part, $f = T$ on $V$, is finite, and we certify it below. The runtime's part is that reference runs present only table views and compute the intended functions. The first follows from the layouts and normalisations of Section 4, the second from the correctness of the classical procedures. Neither is formalised in Lean; Methods describes how both were tested.

  Introduce Theorem 4 through its evidence: the 4-bit swing from +9.4 to −8.9 is why we certify the deployed 16-bit path. Move Theorem 3 to Algebra.
- **Arithmetic.** Open:

  > Theorem 1 applies to a procedure only if every view it reaches is a table row. Addition, subtraction and multiplication meet this by layout. Division needs more, because a quotient digit is estimated from the divisor's leading digit. Scaling both operands so that this digit is at least 5 keeps every estimate in the 400-row `EST` table and within two of the true digit [Knuth].

  - Cut square roots to two sentences and move the case analysis to Methods.
  - Cut the comparison to three sentences: Sketchpad answered 220; frontier models 207–217, with errors only on sums of 300 and 1,000 digits; open-weight models 149–199, mostly by exhausting the token budget, and the base model 23.
  - Move the breakdown of each model's errors to the caption of Extended Data Table {@tbl-baselines}.
- **Algebra.** Open:

  > An algebraic derivation is a composition of calls to certified procedures. By Theorem 3, a wrong answer then requires a wrong table, a wrong transcription of a call's input, or a wrong combining program. The certificate excludes the first; the symbolic runtime guards the other two by checking each answer before returning it.

  State Theorem 3 here in words; its precise form is in the appendix.
- **Gating.** The opening on forgetting is right; name the preliminary adapter. Split the section in two: the gate (exact by ({@eq-gate}) and confirmed bit for bit), then dialogue, opening with "Exactness of the identity leaves to the model the decision of when to compute."
- **Mechanism.** Open: "The certificate establishes what the model outputs on each view, not where in the network that output is decided."
- **Discussion.** New; it replaces Related work and Limitations, and Related work moves to Methods as in the Nature papers. Three paragraphs:
  1. What is shown, with one number.
  2. Scope, said once. The certificate covers the model's steps. It does not cover the runtime, transcription or word-problem translation (7% mistranslated). On a new GPU, only the lowest-margin tenth is rechecked by default. Inputs are limited to the glyph set, a step takes about 0.1 s, and the algebra has limits.
  3. The relation to sampled-accuracy methods, including Theorem 2's implication for chain of thought.

### 3.4 Other passages

1. "That $f$ is a function of the view alone holds because…": move it to the prompt definition.
2. "Let $r < 10b$ be the current partial remainder…": move it to Methods, but keep ({@eq-est}) in the main text.
3. "The errors of GPT-6.1 Sol and Claude Opus 5.5 occurred well within…": move "1 to 637 digits" and the breakdown for the open-weight models to the caption.
4. "Extended Data Table {@tbl-algebra} adds three quadratics…": delete it, because the caption already says this.
5. "Intermediate recipes traded instruction following against…": state it as a finding, not as history: "Across recipes, IFEval and GSM8K trade off (Fig. 5b); on-policy distillation removes most of the trade-off, and reinforcement learning reintroduces it unless anchored to the supervised checkpoint."
6. Keep "This observation is classical…", "Expansions are evaluated at $x = 1$…" and "In an earlier adapter… after depth 18…", renaming the adapter in the last. They are the credit, the blind spot and the localisation evidence.
7. Headings: consider plain declarative ones, as in AlphaGeometry, for example "Exactness on views implies exactness at every length".

**Order of work:** the introduction first, then Theorem 3 into Algebra, then the Discussion, then the Methods moves, then splitting long sentences.
