import Sketchpad.Pinned
import Sketchpad.Compose

/-!
# Theorems 1, 3b and 4 in sheet form (the Sketchpad paper, Certification and Appendix A)

The files in `Sketchpad/` prove Theorem P for a pinned step on (state, event) pairs: `Sketchpad.Pinned.regeneration_trace_iff` and `pinned_regeneration_iff`.
Here it is instantiated for a sheet machine, whose state is unbounded (the whole sheet) while the model only ever
reads a view of it. The same instance gives the sheet forms of composition (Theorem 4b, `sheet_compose_exact`,
`sheet_error_bound`) and of robustness to perturbation (Theorem 3, `sheet_exact_of_close`).

**The machine.** Configurations `C` hold the sheet, the window's place and the procedure's control. At a
configuration the runtime either halts (`query c = none`) or shows the model one view (`query c = some v`, a
view in `V`: the step word and three cells) and applies the model's answer `a : A` with `paint c a` (write the
glyphs, move the window, choose the next step). The model is a function `f : V → A`: under the pinned-sheet
policy each forward pass sees the fixed prompt and the view and nothing else, so its answer is a function of
the view. The reference table is `T : V → A`.

**The theorem.** Every run of every length from a start in `I` is the reference run, step for step, if and
only if the model agrees with the table on every view a reference run meets. Sufficiency needs nothing more;
necessity needs that the runtime paints the answer (different answers give different sheets).

Build: `lake build` in this folder (`paper/lean`). No `sorry`; the axiom check is at the end.
-/

namespace Sketchpad

open Sketchpad.Pinned

variable {C V A : Type*}

/-- One step of the runtime driven by the answers of `f`: halt, or paint `f`'s answer on the view shown. -/
def step (query : C → Option V) (paint : C → A → C) (f : V → A) (c : C) : C :=
  match query c with
  | none => c
  | some v => paint c (f v)

/-- The views a reference run from a start in `I` shows the model, at any step. -/
def reachedViews (query : C → Option V) (paint : C → A → C) (T : V → A) (I : Set C) : Set V :=
  {v | ∃ c₀ ∈ I, ∃ c ∈ Reach (fun c (_ : Unit) => step query paint T c) Set.univ c₀, query c = some v}

/-- The run of `n` steps, as the list of configurations it passes through (`List.scanl` over `n` ticks). -/
def trace (query : C → Option V) (paint : C → A → C) (f : V → A) (c₀ : C) (n : ℕ) : List C :=
  (List.replicate n ()).scanl (fun c (_ : Unit) => step query paint f c) c₀

/-- **Theorem P, sheet form.** If the runtime paints the answer (`hpaint`), the model's run equals the
reference run, configuration by configuration, for every start in `I` and every length `n`, if and only if
the model agrees with the table on every view a reference run meets. -/
theorem sheet_exact_iff {query : C → Option V} {paint : C → A → C} {f T : V → A} {I : Set C}
    (hpaint : ∀ c v, query c = some v → ∀ a a', paint c a = paint c a' → a = a') :
    (∀ c₀ ∈ I, ∀ n, trace query paint f c₀ n = trace query paint T c₀ n) ↔
      ∀ v ∈ reachedViews query paint T I, f v = T v := by
  constructor
  · rintro h v ⟨c₀, hc₀, c, hc, hq⟩
    -- Theorem P's necessity: the step is right at every reachable state.
    have htr : ∀ w : List Unit, (∀ e ∈ w, e ∈ (Set.univ : Set Unit)) →
        w.scanl (fun c (_ : Unit) => step query paint f c) c₀ =
          w.scanl (fun c (_ : Unit) => step query paint T c) c₀ := by
      intro w _
      have hw : w = List.replicate w.length () := List.eq_replicate_iff.mpr ⟨rfl, fun _ _ => rfl⟩
      rw [hw]
      exact h c₀ hc₀ w.length
    have hstep := regeneration_trace_iff.mp htr c hc () (Set.mem_univ _)
    simp only [step, hq] at hstep
    exact hpaint c v hq _ _ hstep
  · intro h c₀ hc₀ n
    -- Theorem P's sufficiency: agreement at every reachable state gives the whole trace.
    refine regeneration_trace_iff.mpr ?_ (List.replicate n ()) (fun _ _ => Set.mem_univ _)
    intro c hc e _
    cases e
    cases hq : query c with
    | none => simp [step, hq]
    | some v => simp only [step, hq]; rw [h v ⟨c₀, hc₀, c, hc, hq⟩]

/-- **The certificate.** If the model agrees with the table on a finite set `W` of views (the table's rows)
and every view a reference run meets is in `W`, every run of every length is the reference run. -/
theorem sheet_certified {query : C → Option V} {paint : C → A → C} {f T : V → A} {I : Set C}
    {W : Set V} (hW : reachedViews query paint T I ⊆ W) (hcert : ∀ v ∈ W, f v = T v) :
    ∀ c₀ ∈ I, ∀ n, trace query paint f c₀ n = trace query paint T c₀ n := by
  intro c₀ hc₀ n
  refine regeneration_trace_iff.mpr ?_ (List.replicate n ()) (fun _ _ => Set.mem_univ _)
  intro c hc e _
  cases e
  cases hq : query c with
  | none => simp [step, hq]
  | some v => simp only [step, hq]; rw [hcert v (hW ⟨c₀, hc₀, c, hc, hq⟩)]

/-! ## The configuration after `n` steps -/

/-- The configuration after `n` steps of the run driven by `g` (the last entry of `trace`). -/
def runAt (query : C → Option V) (paint : C → A → C) (g : V → A) (c₀ : C) (n : ℕ) : C :=
  (List.replicate n ()).foldl (fun c (_ : Unit) => step query paint g c) c₀

/-- The run of length `n` lists the configurations after `0, 1, …, n` steps. -/
theorem trace_eq_map_runAt (query : C → Option V) (paint : C → A → C) (g : V → A) (c₀ : C)
    (n : ℕ) : trace query paint g c₀ n = (List.range (n + 1)).map (runAt query paint g c₀) := by
  refine List.ext_getElem (by simp [trace]) fun i h₁ _ => ?_
  have hi : i ≤ n := by simp [trace] at h₁; omega
  simp only [trace, List.getElem_scanl, List.getElem_map, List.getElem_range, runAt,
    List.take_replicate, Nat.min_eq_left hi]

/-- The last configuration of the run of length `n` is the configuration after `n` steps. -/
theorem trace_getLast? (query : C → Option V) (paint : C → A → C) (g : V → A) (c₀ : C) (n : ℕ) :
    (trace query paint g c₀ n).getLast? = some (runAt query paint g c₀ n) :=
  List.getLast?_scanl

/-! ## Theorem 3, sheet form: robustness to perturbation

The model writes, at each output position `k` of a view, one token of a vocabulary `O`, so an answer is a tuple
`K → Tok` and the table is `T : V → K → Tok`. The certificate records the model's logits `z v k` at each view;
on the execution path (the deployment kernel, batch and cache) step `t` computes logits `zt t v k`, which may
differ from `z` and from step to step, and the runtime paints the tokens that an argmax selection `sel` (any tie
rule, `IsArgmax`) picks from them. -/

section Transfer

variable {K Tok : Type*}

/-- Step `t` of an execution path: halt, or show the view `v` and paint, at every output position `k`, the token
that `sel` picks from the path's logits `zt t v k`. -/
def pathStep (query : C → Option V) (paint : C → (K → Tok) → C) (sel : (Tok → ℝ) → Tok)
    (zt : ℕ → V → K → Tok → ℝ) (t : ℕ) (c : C) : C :=
  match query c with
  | none => c
  | some v => paint c fun k => sel (zt t v k)

/-- The configuration after `n` steps of the execution path: Lemma 3's run (`histRun`) with a single event, whose
history is the step count, so the first step uses `zt 0`, the next `zt 1`, and so on. -/
def pathRun (query : C → Option V) (paint : C → (K → Tok) → C) (sel : (Tok → ℝ) → Tok)
    (zt : ℕ → V → K → Tok → ℝ) (c₀ : C) (n : ℕ) : C :=
  histRun (fun hist c (_ : Unit) => pathStep query paint sel zt hist.length c) c₀ (List.replicate n ())

/-- The execution path's run of length `n`: the configurations after `0, 1, …, n` steps. -/
def pathTrace (query : C → Option V) (paint : C → (K → Tok) → C) (sel : (Tok → ℝ) → Tok)
    (zt : ℕ → V → K → Tok → ℝ) (c₀ : C) (n : ℕ) : List C :=
  (List.range (n + 1)).map (pathRun query paint sel zt c₀)

/-- **Theorem 3, sheet form.** Let every view a reference run meets lie in `W`, let every view of `W` have
margin `> 2τ` at every output position (the paper's `m(v) > 2τ`, unfolded: the table's token is in `O` and leads
every other token of `O` by more than `2τ`), and let the execution path's logits be within `τ` of the certified
ones at every step, view of `W`, position and token. Then the execution path's run from every start in `I` is
the reference run, configuration by configuration, at every length. -/
theorem sheet_exact_of_close {query : C → Option V} {paint : C → (K → Tok) → C}
    {O : Finset Tok} {sel : (Tok → ℝ) → Tok} (hsel : IsArgmax O sel)
    {T : V → K → Tok} {z : V → K → Tok → ℝ} {zt : ℕ → V → K → Tok → ℝ} {τ : ℝ}
    {I : Set C} {W : Set V} (hW : reachedViews query paint T I ⊆ W)
    (hmargin : ∀ v ∈ W, ∀ k, T v k ∈ O ∧ ∀ a ∈ O, a ≠ T v k → z v k a + 2 * τ < z v k (T v k))
    (hclose : ∀ t, ∀ v ∈ W, ∀ k, ∀ a ∈ O, |zt t v k a - z v k a| ≤ τ) :
    ∀ c₀ ∈ I, ∀ n, pathTrace query paint sel zt c₀ n = trace query paint T c₀ n := by
  intro c₀ hc₀ n
  -- Lemma 3 with a single event: at every reachable configuration, step `t` of the path is the reference step.
  have hrun : ∀ m, pathRun query paint sel zt c₀ m = runAt query paint T c₀ m := by
    intro m
    refine histRun_eq_of_closed (δ := fun c (_ : Unit) => step query paint T c) (B := Set.univ)
      (reach_closed _ _ c₀) ?_ (List.replicate m ()) (fun _ _ => Set.mem_univ _)
    intro hist _ c hc e _
    cases e
    cases hq : query c with
    | none => simp [pathStep, step, hq]
    | some v =>
      have hv : v ∈ W := hW ⟨c₀, hc₀, c, hc, hq⟩
      -- Lemma 1 at every output position.
      have hans : (fun k => sel (zt hist.length v k)) = T v := funext fun k =>
        sel_eq_of_close hsel (hmargin v hv k).1 (hmargin v hv k).2 (hclose hist.length v hv k)
      simp only [pathStep, step, hq, hans]
  rw [trace_eq_map_runAt, pathTrace,
    (funext hrun : pathRun query paint sel zt c₀ = runAt query paint T c₀)]

end Transfer

/-! ## Theorem 4b, sheet form: composition of certified procedures

`Sketchpad.Pinned.error_decomposition` (Theorem 4a) holds for any executors `E_i`; Theorem 4b assumes
`E_i(x_i) = T_i(x_i)` for every call. Here each call is executed by a sheet procedure, and the hypothesis is
Theorem 1 applied to that call's run, whatever the length of its input and the order of the calls. -/

section Compose

open MeasureTheory

variable {X β γ : Type*}

/-- A sheet procedure executing one call: the runtime (`query`, `paint`), the start built from the call's input
(a word over `X`, for example the digits of the operands), the number of steps the runtime runs, and the readout
of the result from the configuration after those steps. -/
structure Procedure (C V A X β : Type*) where
  /-- The view shown at a configuration, or `none` when the procedure has halted. -/
  query : C → Option V
  /-- Write an answer at a configuration (glyphs, window move, next step). -/
  paint : C → A → C
  /-- The start configuration for an input. -/
  init : List X → C
  /-- The number of steps run on an input. -/
  len : List X → ℕ
  /-- The result read from the final configuration. -/
  read : C → β

/-- The result of procedure `P` on input `x` with answers from `g`: with the model `f` this is the call's
executor `E_i`; with the table `T` it is `T_i`, the function the procedure is certified to compute. -/
def Procedure.result (P : Procedure C V A X β) (g : V → A) (x : List X) : β :=
  P.read (runAt P.query P.paint g (P.init x) (P.len x))

/-- Theorem 1 for one call: a procedure certified on the views its runs from `I` reach returns its table's
result on every input whose start is in `I`. -/
theorem Procedure.result_eq_of_certified {P : Procedure C V A X β} {f T : V → A} {I : Set C}
    {W : Set V} (hW : reachedViews P.query P.paint T I ⊆ W) (hcert : ∀ v ∈ W, f v = T v)
    {x : List X} (hx : P.init x ∈ I) : P.result f x = P.result T x := by
  have h := congrArg List.getLast? (sheet_certified hW hcert (P.init x) hx (P.len x))
  simp only [trace_getLast?, Option.some.injEq] at h
  rw [Procedure.result, Procedure.result, h]

/-- **Theorem 4b, sheet form, exact calls.** If call `i` is executed by procedure `P i` with the model `f`, and
`f` agrees with the table `T i` on a set `W i` of views containing every view the reference runs of `P i` from
`I i` meet, and call `i`'s start is in `I i`, then every call's result is its table's result on the input it
received (the hypothesis `E_i(x_i) = T_i(x_i)` of Theorem 4), at any length and in any order of calls. -/
theorem sheet_compose_exact {K : ℕ} {f : V → A} {P : ℕ → Procedure C V A X β} {T : ℕ → V → A}
    {I : ℕ → Set C} {W : ℕ → Set V}
    (hW : ∀ i < K, reachedViews (P i).query (P i).paint (T i) (I i) ⊆ W i)
    (hcert : ∀ i < K, ∀ v ∈ W i, f v = T i v)
    {q : ℕ → (ℕ → β) → List X} {v : ℕ → β} (hqI : ∀ i < K, (P i).init (q i v) ∈ I i)
    (hv : ∀ i < K, v i = (P i).result f (q i v)) :
    ∀ i < K, v i = (P i).result (T i) (q i v) := fun i hi =>
  (hv i hi).trans (Procedure.result_eq_of_certified (hW i hi) (hcert i hi) (hqI i hi))

/-- **Theorem 4b, sheet form, the decomposition.** With every call certified, the executor term of
`error_decomposition` is empty: a wrong answer means a wrong table, a wrong transcription or a wrong combining
program. -/
theorem sheet_error_decomposition_certified {K : ℕ} {f : V → A} {P : ℕ → Procedure C V A X β}
    {T : ℕ → V → A} {I : ℕ → Set C} {W : ℕ → Set V}
    (hW : ∀ i < K, reachedViews (P i).query (P i).paint (T i) (I i) ⊆ W i)
    (hcert : ∀ i < K, ∀ v ∈ W i, f v = T i v)
    {q q' : ℕ → (ℕ → β) → List X} (tab' : ℕ → List X → β) {g g' : (ℕ → β) → γ}
    (hq : CitesEarlier K q) (hg : ReadsResults K g) {v v' : ℕ → β}
    (hqI : ∀ i < K, (P i).init (q i v) ∈ I i)
    (hv : ∀ i < K, v i = (P i).result f (q i v))
    (hv' : ∀ i < K, v' i = tab' i (q' i v')) (hwrong : g v ≠ g' v') :
    (∃ i < K, (P i).result (T i) (q' i v') ≠ tab' i (q' i v')) ∨
    (∃ i < K, q i v' ≠ q' i v') ∨
    g v' ≠ g' v' := by
  rcases error_decomposition (fun i => (P i).result f) (fun i => (P i).result (T i)) tab' hq hg hv
    hv' hwrong with h | h
  · exfalso
    obtain ⟨i, hi, hne⟩ := h
    exact hne (Procedure.result_eq_of_certified (hW i hi) (hcert i hi) (hqI i hi))
  · exact h

/-- **Theorem 4b, sheet form, as a bound on probabilities.** Over any measure on transcripts `ω` (no
measurability needed), if every call of every transcript is executed by a certified sheet procedure:
μ(answer wrong) ≤ μ(some table wrong) + μ(some transcription wrong) + μ(combining program wrong). -/
theorem sheet_error_bound {Ω : Type*} [MeasurableSpace Ω] (μ : Measure Ω) {K : ℕ} {f : V → A}
    {P : Ω → ℕ → Procedure C V A X β} {T : Ω → ℕ → V → A} {I : Ω → ℕ → Set C}
    {W : Ω → ℕ → Set V}
    (hW : ∀ ω, ∀ i < K, reachedViews (P ω i).query (P ω i).paint (T ω i) (I ω i) ⊆ W ω i)
    (hcert : ∀ ω, ∀ i < K, ∀ v ∈ W ω i, f v = T ω i v)
    {q q' : Ω → ℕ → (ℕ → β) → List X} (tab' : Ω → ℕ → List X → β) {g g' : Ω → (ℕ → β) → γ}
    (hq : ∀ ω, CitesEarlier K (q ω)) (hg : ∀ ω, ReadsResults K (g ω)) {v v' : Ω → ℕ → β}
    (hqI : ∀ ω, ∀ i < K, (P ω i).init (q ω i (v ω)) ∈ I ω i)
    (hv : ∀ ω, ∀ i < K, v ω i = (P ω i).result f (q ω i (v ω)))
    (hv' : ∀ ω, ∀ i < K, v' ω i = tab' ω i (q' ω i (v' ω))) :
    μ {ω | g ω (v ω) ≠ g' ω (v' ω)} ≤
      μ {ω | ∃ i < K, (P ω i).result (T ω i) (q' ω i (v' ω)) ≠ tab' ω i (q' ω i (v' ω))} +
        μ {ω | ∃ i < K, q ω i (v' ω) ≠ q' ω i (v' ω)} +
        μ {ω | g ω (v' ω) ≠ g' ω (v' ω)} := by
  set Tw := {ω | ∃ i < K, (P ω i).result (T ω i) (q' ω i (v' ω)) ≠ tab' ω i (q' ω i (v' ω))}
  set Qw := {ω | ∃ i < K, q ω i (v' ω) ≠ q' ω i (v' ω)}
  set G := {ω | g ω (v' ω) ≠ g' ω (v' ω)}
  have hsub : {ω | g ω (v ω) ≠ g' ω (v' ω)} ⊆ Tw ∪ Qw ∪ G := by
    intro ω hω
    rcases sheet_error_decomposition_certified (hW ω) (hcert ω) (tab' ω) (hq ω) (hg ω) (hqI ω)
      (hv ω) (hv' ω) hω with h | h | h
    · exact Or.inl (Or.inl h)
    · exact Or.inl (Or.inr h)
    · exact Or.inr h
  calc μ {ω | g ω (v ω) ≠ g' ω (v' ω)} ≤ μ (Tw ∪ Qw ∪ G) := measure_mono hsub
    _ ≤ μ (Tw ∪ Qw) + μ G := measure_union_le _ _
    _ ≤ μ Tw + μ Qw + μ G := by gcongr; exact measure_union_le _ _

end Compose

end Sketchpad

#print axioms Sketchpad.sheet_exact_iff
#print axioms Sketchpad.sheet_certified
#print axioms Sketchpad.trace_eq_map_runAt
#print axioms Sketchpad.sheet_exact_of_close
#print axioms Sketchpad.Procedure.result_eq_of_certified
#print axioms Sketchpad.sheet_compose_exact
#print axioms Sketchpad.sheet_error_decomposition_certified
#print axioms Sketchpad.sheet_error_bound
