import Sheet
import Polyformer.Compose
import Polyformer.Unpinned
import Polyformer.Policy

/-!
# The paper's statements under the paper's numbering

One alias per statement of the Sketchpad paper (Certification, and Appendix A, "Proofs"), so the paper can cite
`Sketchpad.Paper.theoremN_…` and `Sketchpad.Paper.lemmaN…`. Each alias is the declaration it names, with the same
statement; the axiom check for every alias is at the end of the file.

Where a statement has a sheet form and a token form, `_sheet` is the sheet machine (`Sheet.lean`) and `_token`
the pinned token step (`Polyformer/Pinned.lean`, `Polyformer/Compose.lean`).
-/

namespace Sketchpad.Paper

/-! ### Theorem 1 (Exactness on views) -/

/-- Theorem 1, the equivalence: exact runs from `I` at every length iff `f = T` on `R_T(I)`. -/
alias theorem1_iff := Sketchpad.sheet_exact_iff
/-- Theorem 1, the certificate: `R_T(I) ⊆ W` and `f = T` on `W` give exact runs at every length. -/
alias theorem1_sheet := Sketchpad.sheet_certified
/-- Theorem 1, token form. -/
alias theorem1_token := Polyformer.Pinned.pinned_regeneration_iff

/-! ### Theorem 2 (Necessity of the pinned policy) -/

/-- Theorem 2, precise form: for every finite test suite, a decoder passes every test yet errs unpinned. -/
alias theorem2_no_finite_test := Polyformer.Pinned.no_finite_test_suite
/-- Theorem 2, the counterexample decoder (Definition "The counterexample", parts (a)–(d)). -/
alias theorem2_counterexample := Polyformer.Pinned.theorem8a_counterexample
/-- Theorem 2, remark: testing every input up to a given length does not suffice either. -/
alias theorem2_no_finite_check := Polyformer.Pinned.no_finite_check

/-! ### Theorem 3 (Composition) -/

/-- Theorem 3a: a wrong answer needs a wrong executor, table, transcription or combining program. -/
alias theorem3a := Polyformer.Pinned.error_decomposition
/-- Theorem 3b, sheet form: the measure bound for calls executed by certified sheet procedures. -/
alias theorem3b_sheet := Sketchpad.sheet_error_bound
/-- Theorem 3b, sheet form: the hypothesis `E_i(x_i) = T_i(x_i)` from Theorem 1. -/
alias theorem3b_sheet_exact := Sketchpad.sheet_compose_exact
/-- Theorem 3b, token form: the measure bound. -/
alias theorem3b_token := Polyformer.Pinned.error_bound
/-- Theorem 3b, token form: the hypothesis `E_i(x_i) = T_i(x_i)`. -/
alias theorem3b_token_exact := Polyformer.Pinned.compose_exact

/-! ### Theorem 4 (Robustness to perturbation) -/

/-- Theorem 4, first statement: a margin `> 2τ` and logits within `τ` fix the argmax. -/
alias theorem4_argmax := Polyformer.Pinned.sel_eq_of_close
/-- Theorem 4, sheet form: an execution path within `τ` of the certified logits runs exactly. -/
alias theorem4_sheet := Sketchpad.sheet_exact_of_close
/-- Theorem 4, token form. -/
alias theorem4_token := Polyformer.Pinned.regeneration_of_close
/-- Theorem 4 for unpinned decoding (the converse remark after Theorem 2). -/
alias theorem4_unpinned := Polyformer.Pinned.unpinned_exact_of_close

/-! ### Lemmas 1–4 -/

/-- Lemma 1 (Margins decide the argmax). -/
alias lemma1 := Polyformer.Pinned.sel_eq_of_close
/-- Lemma 1, second statement (`τ = 0`, strict margin). -/
alias lemma1_strict := Polyformer.Pinned.sel_eq_of_strict
/-- Lemma 2 (Regeneration), final states. -/
alias lemma2 := Polyformer.Interp.regeneration
/-- Lemma 2, traces. -/
alias lemma2_trace := Polyformer.Pinned.regeneration_trace_iff
/-- Lemma 2, equal traces iff equal final states. -/
alias lemma2_trace_iff_fold := Polyformer.Pinned.scanl_eq_iff_foldl_eq
/-- Lemma 3 (Steps that read the history), with any closed set in place of the reachable set. -/
alias lemma3 := Polyformer.Pinned.histRun_eq_of_closed
/-- Lemma 3: the reachable set is closed. -/
alias lemma3_reach_closed := Polyformer.Pinned.reach_closed
/-- Lemma 4 (i): a causal decoder's state at position `p` depends only on tokens `0, …, p`. -/
alias lemma4i := Polyformer.Pinned.resid_congr
/-- Lemma 4 (ii): the cached forward computes the states of `Π b` at every layer and position. -/
alias lemma4ii := Polyformer.Pinned.cache_sound
/-- Lemma 4 (ii): hence the logits of `Π b`. -/
alias lemma4ii_logits := Polyformer.Pinned.cachedForward_eq
/-- Lemma 4 (iii): token-by-token decoding of a two-token block on the cache gives the logits of `Π b₁ b₂`. -/
alias lemma4iii := Polyformer.Pinned.policy_tick_eq

end Sketchpad.Paper

#print axioms Sketchpad.Paper.theorem1_iff
#print axioms Sketchpad.Paper.theorem1_sheet
#print axioms Sketchpad.Paper.theorem1_token
#print axioms Sketchpad.Paper.theorem2_no_finite_test
#print axioms Sketchpad.Paper.theorem2_counterexample
#print axioms Sketchpad.Paper.theorem2_no_finite_check
#print axioms Sketchpad.Paper.theorem3a
#print axioms Sketchpad.Paper.theorem3b_sheet
#print axioms Sketchpad.Paper.theorem3b_sheet_exact
#print axioms Sketchpad.Paper.theorem3b_token
#print axioms Sketchpad.Paper.theorem3b_token_exact
#print axioms Sketchpad.Paper.theorem4_argmax
#print axioms Sketchpad.Paper.theorem4_sheet
#print axioms Sketchpad.Paper.theorem4_token
#print axioms Sketchpad.Paper.theorem4_unpinned
#print axioms Sketchpad.Paper.lemma1
#print axioms Sketchpad.Paper.lemma1_strict
#print axioms Sketchpad.Paper.lemma2
#print axioms Sketchpad.Paper.lemma2_trace
#print axioms Sketchpad.Paper.lemma2_trace_iff_fold
#print axioms Sketchpad.Paper.lemma3
#print axioms Sketchpad.Paper.lemma3_reach_closed
#print axioms Sketchpad.Paper.lemma4i
#print axioms Sketchpad.Paper.lemma4ii
#print axioms Sketchpad.Paper.lemma4ii_logits
#print axioms Sketchpad.Paper.lemma4iii
