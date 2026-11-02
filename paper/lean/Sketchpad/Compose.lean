import Sketchpad.Pinned
import Mathlib.MeasureTheory.Measure.MeasureSpaceDef

/-!
# Theorem C: composition of certified calls

Source: INSIGHTS §1, row C ("Composition of certified calls"); PAPER_V2_PLAN, "Claims we make".

A transcript interleaves the model's text with `K` calls, in order. Call `i` has its own program:
a context `prog i` built fresh from that call's rows, a table `δ i`, a start `s₀ i`, an event set
`B i` and a readout `out i` of the final state. Its tape is the model's quote `q i v`, which may
cite the results `v j` of earlier calls `j < i` (and the question, which is fixed). The clock runs
the call on its own Π, so the call's result is `out i` of the clock's final state on that tape. The
answer is the glue `g v`, the text after the last result, which reads the results.

- `compose_exact`: if every call's table is certified on its reachable rows, every call's result
  is its table's output on its actual input, whatever the tape lengths and the order of the calls.
- `error_decomposition`: with no certificate, a wrong answer has one of four causes: an executor
  error on some call's actual input, a wrong table, a wrong quote, or wrong glue.
- `error_decomposition_certified`: with certificates the executor term is empty, so a wrong
  answer means a wrong table, a wrong quote or wrong glue.
- `error_bound`: the same as a bound on probabilities, P(wrong) ≤ P(some table wrong) +
  P(some quote wrong) + P(glue wrong).
-/

namespace Sketchpad.Pinned

open MeasureTheory

section Compose

variable {Tok β γ : Type*}

/-- Call `i`'s quote cites only the results of earlier calls. -/
def CitesEarlier (K : ℕ) (q : ℕ → (ℕ → β) → List Tok) : Prop :=
  ∀ i < K, ∀ v v' : ℕ → β, (∀ j < i, v j = v' j) → q i v = q i v'

/-- The glue reads only the `K` results. -/
def ReadsResults (K : ℕ) (g : (ℕ → β) → γ) : Prop :=
  ∀ v v' : ℕ → β, (∀ j < K, v j = v' j) → g v = g v'

/-- The clock's result of call `i` on a tape: the pinned clock on the call's own Π. It depends on
the call's program and the tape only, not on the transcript. -/
def clockOut (step : List Tok → List Tok → Tok) (prog : ℕ → List Tok) (s₀ : ℕ → Tok)
    (out : ℕ → Tok → β) (i : ℕ) (tape : List Tok) : β :=
  out i (tape.foldl (tick step (prog i)) (s₀ i))

/-- The output of call `i`'s table on a tape. -/
def tableOut (δ : ℕ → Tok → Tok → Tok) (s₀ : ℕ → Tok) (out : ℕ → Tok → β) (i : ℕ)
    (tape : List Tok) : β :=
  out i (tape.foldl (δ i) (s₀ i))

/-- **Theorem C, exact calls.** If every call's table is certified on its reachable rows, and every
quoted tape is over the call's events (the clock rejects any other symbol), then every call's result
is its table's output on its actual input. So every cited result is exact, at any length and in any
order of calls. -/
theorem compose_exact {K : ℕ} {step : List Tok → List Tok → Tok} {prog : ℕ → List Tok}
    {δ : ℕ → Tok → Tok → Tok} {s₀ : ℕ → Tok} {B : ℕ → Set Tok} {out : ℕ → Tok → β}
    (hcert : ∀ i < K, Certified step (prog i) (δ i) (Reach (δ i) (B i) (s₀ i)) (B i))
    {q : ℕ → (ℕ → β) → List Tok} (hq : ∀ i < K, ∀ v, ∀ e ∈ q i v, e ∈ B i)
    {v : ℕ → β} (hv : ∀ i < K, v i = clockOut step prog s₀ out i (q i v)) :
    ∀ i < K, v i = tableOut δ s₀ out i (q i v) := by
  intro i hi
  rw [hv i hi, clockOut, tableOut,
    (pinned_regeneration (reach_closed (δ i) (B i) (s₀ i)) (hcert i hi) id (q i v)
      (hq i hi v)).2.1]

/-- **Theorem C, the error decomposition** (no certificate assumed). The model's executor `exec`,
the tables it wrote `tab`, its quotes `q` and its glue `g` give the results `v` and the answer
`g v`. The right tables `tab'`, quotes `q'` and glue `g'` give the right results `v'` and the
right answer `g' v'`. If the answer is wrong, then some call's executor is wrong on its actual
input, or some table is wrong on its right input, or some quote is wrong given the right earlier
results, or the glue is wrong on the right results. -/
theorem error_decomposition {K : ℕ} (exec tab tab' : ℕ → List Tok → β)
    {q q' : ℕ → (ℕ → β) → List Tok} {g g' : (ℕ → β) → γ} (hq : CitesEarlier K q)
    (hg : ReadsResults K g) {v v' : ℕ → β} (hv : ∀ i < K, v i = exec i (q i v))
    (hv' : ∀ i < K, v' i = tab' i (q' i v')) (hwrong : g v ≠ g' v') :
    (∃ i < K, exec i (q i v) ≠ tab i (q i v)) ∨
    (∃ i < K, tab i (q' i v') ≠ tab' i (q' i v')) ∨
    (∃ i < K, q i v' ≠ q' i v') ∨
    g v' ≠ g' v' := by
  by_contra hno
  simp only [not_or, not_exists, not_and, not_not] at hno
  obtain ⟨hexec, htab, hquote, hglue⟩ := hno
  have hall : ∀ i, i < K → v i = v' i := by
    intro i
    induction i using Nat.strong_induction_on with
    | _ i ih =>
      intro hi
      rw [hv i hi, hexec i hi, hq i hi v v' (fun j hj => ih j hj (hj.trans hi)), hquote i hi,
        htab i hi, hv' i hi]
  exact hwrong (by rw [hg v v' hall, hglue])

/-- **Theorem C, certified.** With every call certified, the executor term is empty: a wrong
answer means some table is wrong, some quote is wrong, or the glue is wrong. -/
theorem error_decomposition_certified {K : ℕ} {step : List Tok → List Tok → Tok}
    {prog : ℕ → List Tok} {δ : ℕ → Tok → Tok → Tok} {s₀ : ℕ → Tok} {B : ℕ → Set Tok}
    {out : ℕ → Tok → β}
    (hcert : ∀ i < K, Certified step (prog i) (δ i) (Reach (δ i) (B i) (s₀ i)) (B i))
    {q q' : ℕ → (ℕ → β) → List Tok} (hqB : ∀ i < K, ∀ v, ∀ e ∈ q i v, e ∈ B i)
    (tab' : ℕ → List Tok → β) {g g' : (ℕ → β) → γ} (hq : CitesEarlier K q)
    (hg : ReadsResults K g) {v v' : ℕ → β}
    (hv : ∀ i < K, v i = clockOut step prog s₀ out i (q i v))
    (hv' : ∀ i < K, v' i = tab' i (q' i v')) (hwrong : g v ≠ g' v') :
    (∃ i < K, tableOut δ s₀ out i (q' i v') ≠ tab' i (q' i v')) ∨
    (∃ i < K, q i v' ≠ q' i v') ∨
    g v' ≠ g' v' := by
  rcases error_decomposition (clockOut step prog s₀ out) (tableOut δ s₀ out) tab' hq hg hv hv'
    hwrong with h | h
  · exfalso
    obtain ⟨i, hi, hne⟩ := h
    apply hne
    rw [clockOut, tableOut,
      (pinned_regeneration (reach_closed (δ i) (B i) (s₀ i)) (hcert i hi) id (q i v)
        (hqB i hi v)).2.1]
  · exact h

/-- **Theorem C, as a bound on probabilities.** Over any distribution of transcripts `ω` (any
measure; no measurability is needed), every one of whose calls is certified:
P(answer wrong) ≤ P(some table wrong) + P(some quote wrong) + P(glue wrong). -/
theorem error_bound {Ω : Type*} [MeasurableSpace Ω] (μ : Measure Ω) {K : ℕ}
    {step : List Tok → List Tok → Tok} {prog : Ω → ℕ → List Tok} {δ : Ω → ℕ → Tok → Tok → Tok}
    {s₀ : Ω → ℕ → Tok} {B : Ω → ℕ → Set Tok} {out : Ω → ℕ → Tok → β}
    (hcert : ∀ ω, ∀ i < K,
      Certified step (prog ω i) (δ ω i) (Reach (δ ω i) (B ω i) (s₀ ω i)) (B ω i))
    {q q' : Ω → ℕ → (ℕ → β) → List Tok} (hqB : ∀ ω, ∀ i < K, ∀ v, ∀ e ∈ q ω i v, e ∈ B ω i)
    (tab' : Ω → ℕ → List Tok → β) {g g' : Ω → (ℕ → β) → γ} (hq : ∀ ω, CitesEarlier K (q ω))
    (hg : ∀ ω, ReadsResults K (g ω)) {v v' : Ω → ℕ → β}
    (hv : ∀ ω, ∀ i < K, v ω i = clockOut step (prog ω) (s₀ ω) (out ω) i (q ω i (v ω)))
    (hv' : ∀ ω, ∀ i < K, v' ω i = tab' ω i (q' ω i (v' ω))) :
    μ {ω | g ω (v ω) ≠ g' ω (v' ω)} ≤
      μ {ω | ∃ i < K, tableOut (δ ω) (s₀ ω) (out ω) i (q' ω i (v' ω)) ≠
          tab' ω i (q' ω i (v' ω))} +
        μ {ω | ∃ i < K, q ω i (v' ω) ≠ q' ω i (v' ω)} +
        μ {ω | g ω (v' ω) ≠ g' ω (v' ω)} := by
  set A := {ω | ∃ i < K, tableOut (δ ω) (s₀ ω) (out ω) i (q' ω i (v' ω)) ≠
    tab' ω i (q' ω i (v' ω))}
  set Qw := {ω | ∃ i < K, q ω i (v' ω) ≠ q' ω i (v' ω)}
  set G := {ω | g ω (v' ω) ≠ g' ω (v' ω)}
  have hsub : {ω | g ω (v ω) ≠ g' ω (v' ω)} ⊆ A ∪ Qw ∪ G := by
    intro ω hω
    rcases error_decomposition_certified (hcert ω) (hqB ω) (tab' ω) (hq ω) (hg ω) (hv ω) (hv' ω)
      hω with h | h | h
    · exact Or.inl (Or.inl h)
    · exact Or.inl (Or.inr h)
    · exact Or.inr h
  calc μ {ω | g ω (v ω) ≠ g' ω (v' ω)} ≤ μ (A ∪ Qw ∪ G) := measure_mono hsub
    _ ≤ μ (A ∪ Qw) + μ G := measure_union_le _ _
    _ ≤ μ A + μ Qw + μ G := by gcongr; exact measure_union_le _ _

end Compose

end Sketchpad.Pinned
