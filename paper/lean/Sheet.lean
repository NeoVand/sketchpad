import Polyformer.Pinned

/-!
# Theorem P in sheet form (the Sketchpad paper, §3)

The polyformer Lean package (`research/lean`, branch `lean-p`) proves Theorem P for a pinned step on
(state, event) pairs: `Polyformer.Pinned.regeneration_trace_iff` and `pinned_regeneration_iff`. Here it is
instantiated for a sheet machine, whose state is unbounded (the whole sheet) while the model only ever reads a
view of it.

**The machine.** Configurations `C` hold the sheet, the window's place and the procedure's control. At a
configuration the runtime either halts (`query c = none`) or shows the model one view (`query c = some v`, a
view in `V`: the step word and three cells) and applies the model's answer `a : A` with `paint c a` (write the
glyphs, move the window, choose the next step). The model is a function `f : V → A`: under the pinned-sheet
policy each forward pass sees the fixed prompt and the view and nothing else, so its answer is a function of
the view. The reference table is `T : V → A`.

**The theorem.** Every run of every length from a start in `I` is the reference run, step for step, if and
only if the model agrees with the table on every view a reference run meets. Sufficiency needs nothing more;
necessity needs that the runtime paints the answer (different answers give different sheets).

Build: from the package folder, `lake env lean <path>/Sheet.lean`. No `sorry`; the axiom check is at the end.
-/

namespace Sketchpad

open Polyformer.Pinned

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

end Sketchpad

#print axioms Sketchpad.sheet_exact_iff
#print axioms Sketchpad.sheet_certified
