import Sketchpad.Interp

/-!
# Theorem P (pinned regeneration), the Theorem 8(a) counterexample, and the lookup lemma

Sources: DEMO_DESIGN §5 (`notes-2026-10-22/demodesign`, `research/DEMO_DESIGN.md`): Theorem P,
Corollary P2, §5.2 (Theorem 8 as stated is false) and Lemma Q (§5.3, with the outside critiques of
§8.1); ARITH_FORMAT §4, §5, §8 (`arith`, `research/arith/ARITH_FORMAT.md`): the Mealy block, two
forwards per row, forward 2 re-feeds the block; INTERP Theorems 1 and 8 (`interp`,
`research/interp/INTERP.md`).

**Abstraction.** The model is a deterministic function `step : List Tok → List Tok → Tok`: the
token chosen (an argmax of the logits, any tie rule) at the last position of a block on a fixed
context. States and events are tokens (hypothesis H1: one token per name, the same id in the block
as in the rows of Π; distinct names are distinct tokens). The clock keeps the context Π fixed, builds
the block from the current state and the next event, and sets the next state to the step's output.
The table `δ` is any function; the certificate compares the step with it.

Section 3 derives the abstraction from a causal decoder with a key–value cache (Theorem P(1)).
-/

namespace Sketchpad.Pinned

open Finset Real

/-! ## 1. Runs, reachable states and closed sets -/

section Runs

variable {St Ev : Type*}

/-- The states reachable from `s₀` under `δ` on words over `B`. -/
def Reach (δ : St → Ev → St) (B : Set Ev) (s₀ : St) : Set St :=
  {s | ∃ u : List Ev, (∀ e ∈ u, e ∈ B) ∧ u.foldl δ s₀ = s}

/-- `Q` contains `s₀` and is closed under the table's transitions on events in `B`. A set of rows
closed under the table's transitions from the start state is `Q × B` for such a `Q`. -/
def ClosedFrom (δ : St → Ev → St) (B : Set Ev) (s₀ : St) (Q : Set St) : Prop :=
  s₀ ∈ Q ∧ ∀ s ∈ Q, ∀ e ∈ B, δ s e ∈ Q

theorem foldl_mem_of_closed {δ : St → Ev → St} {B : Set Ev} {Q : Set St}
    (hcl : ∀ s ∈ Q, ∀ e ∈ B, δ s e ∈ Q) :
    ∀ (u : List Ev) (s : St), s ∈ Q → (∀ e ∈ u, e ∈ B) → u.foldl δ s ∈ Q := by
  intro u
  induction u with
  | nil => intro s hs _; simpa using hs
  | cons e u ih =>
    intro s hs hu
    simp only [List.foldl_cons]
    exact ih _ (hcl s hs e (hu e (by simp))) (fun x hx => hu x (by simp [hx]))

/-- The reachable states form the smallest closed set. -/
theorem reach_closed (δ : St → Ev → St) (B : Set Ev) (s₀ : St) :
    ClosedFrom δ B s₀ (Reach δ B s₀) := by
  refine ⟨⟨[], by simp, rfl⟩, ?_⟩
  rintro s ⟨u, hu, rfl⟩ e he
  refine ⟨u ++ [e], ?_, by simp⟩
  intro x hx
  rcases List.mem_append.mp hx with hx | hx
  · exact hu x hx
  · simp at hx; rwa [hx]

theorem reach_subset {δ : St → Ev → St} {B : Set Ev} {s₀ : St} {Q : Set St}
    (hQ : ClosedFrom δ B s₀ Q) : Reach δ B s₀ ⊆ Q := by
  rintro s ⟨u, hu, rfl⟩
  exact foldl_mem_of_closed hQ.2 u s₀ hQ.1 hu

/-- Every state of the run (the whole trace, `List.scanl`) is right on every word over `B` iff the
final state is. -/
theorem scanl_eq_iff_foldl_eq {F δ : St → Ev → St} {B : Set Ev} {s₀ : St} :
    (∀ w : List Ev, (∀ e ∈ w, e ∈ B) → w.scanl F s₀ = w.scanl δ s₀) ↔
      ∀ w : List Ev, (∀ e ∈ w, e ∈ B) → w.foldl F s₀ = w.foldl δ s₀ := by
  constructor
  · intro h w hw
    have := congrArg List.getLast? (h w hw)
    simpa [List.getLast?_scanl] using this
  · intro h w hw
    refine List.ext_getElem (by simp) fun i _ _ => ?_
    simp only [List.getElem_scanl]
    exact h _ fun e he => hw e (List.mem_of_mem_take he)

/-- **Regeneration with traces** (INTERP Theorem 1(i), whole trace). The run of `F` equals the run
of `δ`, state by state, on every word over `B` iff `F` agrees with `δ` at every reachable
(state, event) pair. -/
theorem regeneration_trace_iff {F δ : St → Ev → St} {B : Set Ev} {s₀ : St} :
    (∀ w : List Ev, (∀ e ∈ w, e ∈ B) → w.scanl F s₀ = w.scanl δ s₀) ↔
      ∀ s ∈ Reach δ B s₀, ∀ e ∈ B, F s e = δ s e := by
  rw [scanl_eq_iff_foldl_eq, Sketchpad.Interp.regeneration δ F s₀ B]
  constructor
  · rintro h s ⟨u, hu, rfl⟩ e he
    exact h u hu e he
  · intro h u hu e he
    exact h _ ⟨u, hu, rfl⟩ e he

/-- Sufficiency with any closed set: agreement on `Q × B` gives the whole trace. -/
theorem scanl_eq_of_closed {F δ : St → Ev → St} {B : Set Ev} {s₀ : St} {Q : Set St}
    (hQ : ClosedFrom δ B s₀ Q) (h : ∀ s ∈ Q, ∀ e ∈ B, F s e = δ s e) :
    ∀ w : List Ev, (∀ e ∈ w, e ∈ B) → w.scanl F s₀ = w.scanl δ s₀ :=
  regeneration_trace_iff.mpr fun s hs e he => h s (reach_subset hQ hs) e he

/-- A run whose step may also read the history (the events so far). -/
def histRun (G : List Ev → St → Ev → St) (s₀ : St) (tape : List Ev) : St :=
  (tape.foldl (fun p e => (p.1 ++ [e], G p.1 p.2 e)) (([] : List Ev), s₀)).2

theorem histRun_eq_of_closed {G : List Ev → St → Ev → St} {δ : St → Ev → St} {B : Set Ev}
    {s₀ : St} {Q : Set St} (hQ : ClosedFrom δ B s₀ Q)
    (h : ∀ hist : List Ev, (∀ x ∈ hist, x ∈ B) → ∀ s ∈ Q, ∀ e ∈ B, G hist s e = δ s e) :
    ∀ w : List Ev, (∀ e ∈ w, e ∈ B) → histRun G s₀ w = w.foldl δ s₀ := by
  suffices key : ∀ (w hist : List Ev) (s : St), s ∈ Q → (∀ x ∈ hist, x ∈ B) →
      (∀ e ∈ w, e ∈ B) →
      (w.foldl (fun p e => (p.1 ++ [e], G p.1 p.2 e)) (hist, s)).2 = w.foldl δ s from
    fun w hw => key w [] s₀ hQ.1 (by simp) hw
  intro w
  induction w with
  | nil => intro hist s _ _ _; rfl
  | cons e w ih =>
    intro hist s hs hh hw
    have he : e ∈ B := hw e (by simp)
    simp only [List.foldl_cons]
    rw [h hist hh s hs e he]
    refine ih _ _ (hQ.2 s hs e he) ?_ (fun x hx => hw x (by simp [hx]))
    intro x hx
    rcases List.mem_append.mp hx with hx | hx
    · exact hh x hx
    · simp at hx; rwa [hx]

end Runs

/-! ## 2. Argmax selections, margins, and Corollary P2 -/

section Argmax

variable {κ : Type*}

/-- `sel` picks a maximiser of a logit vector over the output set `O` (the full vocabulary, or the
program's state names for constrained decoding), with any tie rule. -/
def IsArgmax (O : Finset κ) (sel : (κ → ℝ) → κ) : Prop :=
  ∀ ℓ : κ → ℝ, sel ℓ ∈ O ∧ ∀ m ∈ O, ℓ m ≤ ℓ (sel ℓ)

/-- An argmax selection exists over any nonempty output set. -/
theorem exists_isArgmax (O : Finset κ) (hO : O.Nonempty) : ∃ sel : (κ → ℝ) → κ, IsArgmax O sel :=
  ⟨fun ℓ => Classical.choose (O.exists_max_image ℓ hO),
    fun ℓ => Classical.choose_spec (O.exists_max_image ℓ hO)⟩

theorem sel_eq_of_strict {O : Finset κ} {sel : (κ → ℝ) → κ} (hsel : IsArgmax O sel)
    {ℓ : κ → ℝ} {t : κ} (ht : t ∈ O) (h : ∀ m ∈ O, m ≠ t → ℓ m < ℓ t) : sel ℓ = t := by
  by_contra hne
  have h1 := h (sel ℓ) (hsel ℓ).1 hne
  have h2 := (hsel ℓ).2 t ht
  linarith

/-- **Corollary P2 (floating point).** If two logit vectors differ by at most `τ` at every output
and the first has margin `> 2τ` at `t`, every argmax of the second is `t`. -/
theorem sel_eq_of_close {O : Finset κ} {sel : (κ → ℝ) → κ} (hsel : IsArgmax O sel)
    {ℓ ℓ' : κ → ℝ} {t : κ} (ht : t ∈ O) {τ : ℝ}
    (hmargin : ∀ m ∈ O, m ≠ t → ℓ m + 2 * τ < ℓ t) (hclose : ∀ m ∈ O, |ℓ' m - ℓ m| ≤ τ) :
    sel ℓ' = t := by
  refine sel_eq_of_strict hsel ht fun m hm hmt => ?_
  have h1 := (abs_le.mp (hclose m hm)).2
  have h2 := (abs_le.mp (hclose t ht)).1
  have h3 := hmargin m hm hmt
  linarith

end Argmax

/-! ## 3. Theorem P(1): the pinned tick of a causal decoder with a cache

A causal decoder: each token is embedded with its position id, then `depth` layers run. Layer `ℓ`
at position `p` may read anything at positions `0, …, p` of the previous layer (attention under the
causal mask, MLPs, norms) and nothing later. The head reads the last position. -/

section Decoder

variable {Tok H V : Type*}

/-- A causal decoder. -/
structure CausalDecoder (Tok H V : Type*) where
  depth : ℕ
  emb : Tok → ℕ → H
  layer : ℕ → ℕ → (ℕ → H) → H
  causal : ∀ ℓ p (h h' : ℕ → H), (∀ i ≤ p, h i = h' i) → layer ℓ p h = layer ℓ p h'
  head : H → V

variable [Inhabited Tok] (D : CausalDecoder Tok H V)

/-- The token at position `p` of a list (padding beyond the end, never read by causal positions
inside it). -/
def seqOf (xs : List Tok) (p : ℕ) : Tok := xs.getD p default

/-- The residual stream: layer `ℓ`, position `p`, on the token sequence `x` (position ids are the
indices). -/
def resid (x : ℕ → Tok) : ℕ → ℕ → H
  | 0, p => D.emb (x p) p
  | ℓ + 1, p => D.layer ℓ p (resid x ℓ)

omit [Inhabited Tok] in
/-- The residual at position `p` depends only on the tokens at positions `≤ p`. -/
theorem resid_congr {x y : ℕ → Tok} (ℓ : ℕ) :
    ∀ p, (∀ i ≤ p, x i = y i) → resid D x ℓ p = resid D y ℓ p := by
  induction ℓ with
  | zero => intro p h; simp [resid, h p le_rfl]
  | succ ℓ ih =>
    intro p h
    simp only [resid]
    exact D.causal ℓ p _ _ fun i hi => ih i fun j hj => h j (hj.trans hi)

/-- The logits at the last position of a sequence (a full forward, no cache). -/
def forward (xs : List Tok) : V := D.head (resid D (seqOf xs) D.depth (xs.length - 1))

/-- The cache prefilled on Π: the residuals of Π alone, at every layer. -/
def prefill (prog : List Tok) : ℕ → ℕ → H := resid D (seqOf prog)

/-- A forward of the block `blk` at positions `P, P+1, …` on a cache: the first `P` positions are
read from the cache, which is never written. -/
def cachedResid (cache : ℕ → ℕ → H) (P : ℕ) (blk : List Tok) : ℕ → ℕ → H
  | 0, p => if p < P then cache 0 p else D.emb (blk.getD (p - P) default) p
  | ℓ + 1, p => if p < P then cache (ℓ + 1) p else D.layer ℓ p (cachedResid cache P blk ℓ)

/-- The logits at the block's last position, on a cache. -/
def cachedForward (cache : ℕ → ℕ → H) (P : ℕ) (blk : List Tok) : V :=
  D.head (cachedResid D cache P blk D.depth (P + blk.length - 1))

theorem seqOf_append_left {prog blk : List Tok} {i : ℕ} (hi : i < prog.length) :
    seqOf (prog ++ blk) i = seqOf prog i := by
  simp only [seqOf, List.getD_eq_getElem?_getD, List.getElem?_append_left hi]

theorem seqOf_append_right {prog blk : List Tok} {i : ℕ} (hi : prog.length ≤ i) :
    seqOf (prog ++ blk) i = blk.getD (i - prog.length) default := by
  simp only [seqOf, List.getD_eq_getElem?_getD, List.getElem?_append_right hi]

/-- **Theorem P(1), Π's positions.** Π's residuals at every layer are the same whatever block
follows: they are fixed by Π. -/
theorem prog_resid_fixed (prog blk : List Tok) (ℓ : ℕ) {p : ℕ} (hp : p < prog.length) :
    resid D (seqOf (prog ++ blk)) ℓ p = resid D (seqOf prog) ℓ p :=
  resid_congr D ℓ p fun _i hi => seqOf_append_left (lt_of_le_of_lt hi hp)

/-- **Theorem P(1), the cache.** A forward of the block on Π's prefilled cache computes the
residuals of the whole sequence Π ++ block, at every layer and position. -/
theorem cache_sound (prog blk : List Tok) (ℓ : ℕ) :
    ∀ p, cachedResid D (prefill D prog) prog.length blk ℓ p = resid D (seqOf (prog ++ blk)) ℓ p := by
  induction ℓ with
  | zero =>
    intro p
    by_cases hp : p < prog.length
    · simp only [cachedResid, hp, ↓reduceIte, prefill]
      exact (prog_resid_fixed D prog blk 0 hp).symm
    · simp only [cachedResid, hp, ↓reduceIte, resid]
      rw [seqOf_append_right (not_lt.mp hp)]
  | succ ℓ ih =>
    intro p
    by_cases hp : p < prog.length
    · simp only [cachedResid, hp, ↓reduceIte, prefill]
      exact (prog_resid_fixed D prog blk (ℓ + 1) hp).symm
    · simp only [cachedResid, hp, ↓reduceIte, resid]
      congr 1
      funext i
      exact ih i

/-- **Theorem P(1).** A tick on the cached Π computes the logits of the sequence Π ++ block: a
function of (Π, block) alone. It does not depend on the tick's index, the tape's length or earlier
ticks, since none of them is an argument. -/
theorem cachedForward_eq (prog blk : List Tok) :
    cachedForward D (prefill D prog) prog.length blk = forward D (prog ++ blk) := by
  simp only [cachedForward, forward, List.length_append, cache_sound]

/-- The block's first position cannot see the event (DEMO_DESIGN §8.1, Codex): its residuals at
every layer are the same for every event. -/
theorem block_first_blind (prog : List Tok) (s e e' : Tok) (ℓ : ℕ) :
    resid D (seqOf (prog ++ [s, e])) ℓ prog.length =
      resid D (seqOf (prog ++ [s, e'])) ℓ prog.length := by
  refine resid_congr D ℓ _ fun i hi => ?_
  rcases lt_or_eq_of_le hi with hi | rfl
  · rw [seqOf_append_left hi, seqOf_append_left hi]
  · rw [seqOf_append_right le_rfl, seqOf_append_right le_rfl]
    simp

/-- **ARITH_FORMAT §4, forward 2.** Feeding `[t]` alone at `P + 3` on the cache extended by forward
1, and re-feeding the whole block `[s, a, b, t]` at `P … P + 3` on Π's cache, give the same logits
(in exact arithmetic): both are the logits of Π ++ [s, a, b, t]. -/
theorem forward2_refeed_eq (prog : List Tok) (s a b t : Tok) :
    cachedForward D (prefill D (prog ++ [s, a, b])) (prog ++ [s, a, b]).length [t] =
      cachedForward D (prefill D prog) prog.length [s, a, b, t] := by
  rw [cachedForward_eq, cachedForward_eq]
  simp

end Decoder

/-! ## 4. Theorem P(2), P(3): the Moore clock -/

section Moore

variable {Tok : Type*}

/-- One pinned tick: the block `[s, e]` on the fixed context Π. -/
def tick (step : List Tok → List Tok → Tok) (prog : List Tok) (s e : Tok) : Tok := step prog [s, e]

/-- The certificate on the rows `Q × B`: the step on the block `[s, e]` is the table's destination
`δ s e`. -/
def Certified (step : List Tok → List Tok → Tok) (prog : List Tok) (δ : Tok → Tok → Tok)
    (Q B : Set Tok) : Prop :=
  ∀ s ∈ Q, ∀ e ∈ B, step prog [s, e] = δ s e

/-- **Theorem P(2), sufficiency.** If every row of `Q × B` passes, for a set `Q` of states that
contains the start and is closed under the table's transitions, then on every tape over `B` the
clock's trace `s₀ s₁ … s_T` is the table's (Corollary P4: the whole trace), its final state is the
table's, and so is any answer read from the final state. -/
theorem pinned_regeneration {step : List Tok → List Tok → Tok} {prog : List Tok}
    {δ : Tok → Tok → Tok} {s₀ : Tok} {Q B : Set Tok} (hQ : ClosedFrom δ B s₀ Q)
    (hcert : Certified step prog δ Q B) {α : Type*} (ans : Tok → α) (tape : List Tok)
    (htape : ∀ e ∈ tape, e ∈ B) :
    tape.scanl (tick step prog) s₀ = tape.scanl δ s₀ ∧
      tape.foldl (tick step prog) s₀ = tape.foldl δ s₀ ∧
      ans (tape.foldl (tick step prog) s₀) = ans (tape.foldl δ s₀) := by
  have htr := scanl_eq_of_closed hQ (fun s hs e he => hcert s hs e he) tape htape
  have hfin : tape.foldl (tick step prog) s₀ = tape.foldl δ s₀ :=
    scanl_eq_iff_foldl_eq.mp (scanl_eq_of_closed hQ (fun s hs e he => hcert s hs e he)) tape htape
  exact ⟨htr, hfin, by rw [hfin]⟩

/-- **Theorem P(2), "checking all of S × B suffices".** For a well-formed table (start in `S`,
every destination in `S`), certifying every row of `S × B` makes every run exact. -/
theorem pinned_regeneration_table {step : List Tok → List Tok → Tok} {prog : List Tok}
    {δ : Tok → Tok → Tok} {s₀ : Tok} {S B : Set Tok} (hs₀ : s₀ ∈ S)
    (hδ : ∀ s ∈ S, ∀ e ∈ B, δ s e ∈ S) (hcert : Certified step prog δ S B) (tape : List Tok)
    (htape : ∀ e ∈ tape, e ∈ B) :
    tape.scanl (tick step prog) s₀ = tape.scanl δ s₀ :=
  (pinned_regeneration ⟨hs₀, hδ⟩ hcert id tape htape).1

/-- **Theorem P(2), necessity.** If the clock's final state is right on every tape over `B`, every
reachable row passes. So the certificate on the reachable rows is exactly the right check. -/
theorem pinned_certificate_necessary {step : List Tok → List Tok → Tok} {prog : List Tok}
    {δ : Tok → Tok → Tok} {s₀ : Tok} {B : Set Tok}
    (h : ∀ tape : List Tok, (∀ e ∈ tape, e ∈ B) →
      tape.foldl (tick step prog) s₀ = tape.foldl δ s₀) :
    Certified step prog δ (Reach δ B s₀) B := by
  rintro s ⟨u, hu, rfl⟩ e he
  exact (Sketchpad.Interp.regeneration δ (tick step prog) s₀ B).mp h u hu e he

/-- **Theorem P(2), the equivalence.** The clock's trace equals the table's on every tape over `B`
iff the step is right at every reachable row, iff it is right on `Q × B` for some closed `Q`. -/
theorem pinned_regeneration_iff {step : List Tok → List Tok → Tok} {prog : List Tok}
    {δ : Tok → Tok → Tok} {s₀ : Tok} {B : Set Tok} :
    ((∀ tape : List Tok, (∀ e ∈ tape, e ∈ B) →
        tape.scanl (tick step prog) s₀ = tape.scanl δ s₀) ↔
      Certified step prog δ (Reach δ B s₀) B) ∧
    ((∀ tape : List Tok, (∀ e ∈ tape, e ∈ B) →
        tape.scanl (tick step prog) s₀ = tape.scanl δ s₀) ↔
      ∃ Q, ClosedFrom δ B s₀ Q ∧ Certified step prog δ Q B) := by
  have h1 : (∀ tape : List Tok, (∀ e ∈ tape, e ∈ B) →
        tape.scanl (tick step prog) s₀ = tape.scanl δ s₀) ↔
      Certified step prog δ (Reach δ B s₀) B := regeneration_trace_iff
  refine ⟨h1, ?_⟩
  rw [h1]
  constructor
  · intro h; exact ⟨_, reach_closed δ B s₀, h⟩
  · rintro ⟨Q, hQ, hc⟩ s hs e he
    exact hc s (reach_subset hQ hs) e he

/-- **Theorem P(3).** Under the certificate, the logits of tick `i` (block `[s_{i−1}, e_i]`) are
those of the certification block of the table's row `(δ(s₀, e₁ … e_{i−1}), e_i)`: the same
function on the same inputs. -/
theorem tick_logits_eq_row {V : Type*} {logits : List Tok → List Tok → V} {sel : V → Tok}
    {prog : List Tok} {δ : Tok → Tok → Tok} {s₀ : Tok} {Q B : Set Tok}
    (hQ : ClosedFrom δ B s₀ Q)
    (hcert : Certified (fun p blk => sel (logits p blk)) prog δ Q B)
    (tape : List Tok) (htape : ∀ e ∈ tape, e ∈ B) (i : ℕ) (hi : i < tape.length) :
    logits prog [(tape.take i).foldl (tick (fun p blk => sel (logits p blk)) prog) s₀, tape[i]] =
      logits prog [(tape.take i).foldl δ s₀, tape[i]] := by
  rw [(pinned_regeneration hQ hcert id (tape.take i)
    fun e he => htape e (List.mem_of_mem_take he)).2.1]

/-- **Theorem P with a causal decoder.** The clock prefills Π once and runs each tick as a forward
of `[s, e]` on that cache. If the same cached forward passes every row of a closed `Q × B`, the
clock's trace is the table's on every tape over `B`. -/
theorem pinned_regeneration_decoder {H : Type*} [Inhabited Tok] (D : CausalDecoder Tok H (Tok → ℝ))
    (sel : (Tok → ℝ) → Tok) {prog : List Tok} {δ : Tok → Tok → Tok} {s₀ : Tok} {Q B : Set Tok}
    (hQ : ClosedFrom δ B s₀ Q)
    (hcert : ∀ s ∈ Q, ∀ e ∈ B, sel (cachedForward D (prefill D prog) prog.length [s, e]) = δ s e)
    (tape : List Tok) (htape : ∀ e ∈ tape, e ∈ B) :
    tape.scanl (fun s e => sel (cachedForward D (prefill D prog) prog.length [s, e])) s₀ =
      tape.scanl δ s₀ :=
  scanl_eq_of_closed hQ hcert tape htape

/-- **Corollary P2, certification on another code path.** The run's tick logits `Lrun` may differ
from the certified logits `Lcert` (another batch shape or kernel, or any dependence on the history
`hist`) by at most `τ` per logit. If every row of a closed `Q × B` has its argmax at the table's
destination with margin `> 2τ`, the run is exact on every tape over `B`. -/
theorem regeneration_of_close {O : Finset Tok} {sel : (Tok → ℝ) → Tok} (hsel : IsArgmax O sel)
    {Lrun : List Tok → Tok → Tok → Tok → ℝ} {Lcert : Tok → Tok → Tok → ℝ} {τ : ℝ}
    {δ : Tok → Tok → Tok} {s₀ : Tok} {Q B : Set Tok} (hQ : ClosedFrom δ B s₀ Q)
    (hcert : ∀ s ∈ Q, ∀ e ∈ B, δ s e ∈ O ∧ ∀ m ∈ O, m ≠ δ s e → Lcert s e m + 2 * τ < Lcert s e (δ s e))
    (hclose : ∀ hist : List Tok, (∀ x ∈ hist, x ∈ B) → ∀ s ∈ Q, ∀ e ∈ B, ∀ m ∈ O,
      |Lrun hist s e m - Lcert s e m| ≤ τ)
    (tape : List Tok) (htape : ∀ e ∈ tape, e ∈ B) :
    histRun (fun hist s e => sel (Lrun hist s e)) s₀ tape = tape.foldl δ s₀ :=
  histRun_eq_of_closed hQ (fun hist hh s hs e he =>
    sel_eq_of_close hsel (hcert s hs e he).1 (hcert s hs e he).2 (hclose hist hh s hs e he)) tape htape

end Moore

/-! ## 5. Theorem P for the Mealy block (ARITH_FORMAT §4, §5, §8)

A tick from state `s` on the event `(a, b)` is two forwards on Π: forward 1 on `[s, a, b]` gives
`t`, and forward 2 on the re-fed block `[s, a, b, t]`, with `t` the argmax of forward 1, gives the
output `o`. A row `(s, a, b, t, o)` passes iff forward 1 gives `t` and forward 2 gives `o`. -/

section Mealy

variable {St Ev Out : Type*}

/-- The run of a Mealy machine `G s e = (next state, output)`: final state and output tape. -/
def mealyRun (G : St → Ev → St × Out) (s₀ : St) (tape : List Ev) : St × List Out :=
  tape.foldl (fun p e => ((G p.1 e).1, p.2 ++ [(G p.1 e).2])) (s₀, [])

theorem mealyRun_fst (G : St → Ev → St × Out) (s₀ : St) (tape : List Ev) :
    (mealyRun G s₀ tape).1 = tape.foldl (fun s e => (G s e).1) s₀ := by
  suffices key : ∀ (w : List Ev) (s : St) (os : List Out),
      (w.foldl (fun p e => ((G p.1 e).1, p.2 ++ [(G p.1 e).2])) (s, os)).1 =
        w.foldl (fun s e => (G s e).1) s by exact key tape s₀ []
  intro w
  induction w with
  | nil => intro s os; rfl
  | cons e w ih => intro s os; simp only [List.foldl_cons]; exact ih _ _

theorem mealyRun_append (G : St → Ev → St × Out) (s₀ : St) (u : List Ev) (e : Ev) :
    mealyRun G s₀ (u ++ [e]) =
      ((G (mealyRun G s₀ u).1 e).1, (mealyRun G s₀ u).2 ++ [(G (mealyRun G s₀ u).1 e).2]) := by
  simp [mealyRun, List.foldl_append]

/-- Two Mealy machines that agree on `Q × E`, for `Q` closed under the second's transitions from
`s₀`, have the same run (final state, output tape and state trace) on every tape over `E`. -/
theorem mealyRun_eq_of_closed {G' G : St → Ev → St × Out} {E : Set Ev} {s₀ : St} {Q : Set St}
    (hQ : ClosedFrom (fun s e => (G s e).1) E s₀ Q) (h : ∀ s ∈ Q, ∀ e ∈ E, G' s e = G s e)
    (tape : List Ev) (htape : ∀ e ∈ tape, e ∈ E) :
    mealyRun G' s₀ tape = mealyRun G s₀ tape ∧
      tape.scanl (fun s e => (G' s e).1) s₀ = tape.scanl (fun s e => (G s e).1) s₀ := by
  refine ⟨?_, scanl_eq_of_closed hQ (fun s hs e he => by rw [h s hs e he]) tape htape⟩
  suffices key : ∀ (w : List Ev) (s : St) (os : List Out), s ∈ Q → (∀ e ∈ w, e ∈ E) →
      w.foldl (fun p e => ((G' p.1 e).1, p.2 ++ [(G' p.1 e).2])) (s, os) =
        w.foldl (fun p e => ((G p.1 e).1, p.2 ++ [(G p.1 e).2])) (s, os) from
    key tape s₀ [] hQ.1 htape
  intro w
  induction w with
  | nil => intro s os _ _; rfl
  | cons e w ih =>
    intro s os hs hw
    have he : e ∈ E := hw e (by simp)
    simp only [List.foldl_cons, h s hs e he]
    exact ih _ _ (hQ.2 s hs e he) fun x hx => hw x (by simp [hx])

/-- One Mealy tick on Π: forward 1 on `[s, a, b]` gives `t`; forward 2 on the re-fed block
`[s, a, b, t]` gives `o`. -/
def mealyTick {Tok : Type*} (step : List Tok → List Tok → Tok) (prog : List Tok) (s : Tok)
    (ab : Tok × Tok) : Tok × Tok :=
  (step prog [s, ab.1, ab.2], step prog [s, ab.1, ab.2, step prog [s, ab.1, ab.2]])

/-- The Mealy certificate on the rows `Q × E` (two cells per row): forward 1's argmax is the row's
`t = δ s (a, b)`, and forward 2, fed that argmax, gives the row's `o = out s (a, b)`. -/
def MealyCertified {Tok : Type*} (step : List Tok → List Tok → Tok) (prog : List Tok)
    (δ out : Tok → Tok × Tok → Tok) (Q : Set Tok) (E : Set (Tok × Tok)) : Prop :=
  ∀ s ∈ Q, ∀ ab ∈ E, step prog [s, ab.1, ab.2] = δ s ab ∧
    step prog [s, ab.1, ab.2, step prog [s, ab.1, ab.2]] = out s ab

/-- **Theorem P for the Mealy block.** If every row of `Q × E` passes both checks, for `Q` closed
under the table's transitions from `s₀`, then on every tape of digit pairs over `E` the clock's state
trace, final state and output tape are the table's, and so is any answer read from them (e.g. the
`<final>` line: the final state and the outputs read backwards, leading zeros dropped). -/
theorem pinned_regeneration_mealy {Tok : Type*} {step : List Tok → List Tok → Tok}
    {prog : List Tok} {δ out : Tok → Tok × Tok → Tok} {s₀ : Tok} {Q : Set Tok}
    {E : Set (Tok × Tok)} (hQ : ClosedFrom δ E s₀ Q) (hcert : MealyCertified step prog δ out Q E)
    {α : Type*} (ans : Tok → List Tok → α) (tape : List (Tok × Tok)) (htape : ∀ e ∈ tape, e ∈ E) :
    tape.scanl (fun s e => (mealyTick step prog s e).1) s₀ = tape.scanl δ s₀ ∧
      mealyRun (mealyTick step prog) s₀ tape = mealyRun (fun s e => (δ s e, out s e)) s₀ tape ∧
      ans (mealyRun (mealyTick step prog) s₀ tape).1 (mealyRun (mealyTick step prog) s₀ tape).2 =
        ans (mealyRun (fun s e => (δ s e, out s e)) s₀ tape).1
          (mealyRun (fun s e => (δ s e, out s e)) s₀ tape).2 := by
  have hagree : ∀ s ∈ Q, ∀ e ∈ E, mealyTick step prog s e = (δ s e, out s e) := by
    intro s hs e he
    obtain ⟨h1, h2⟩ := hcert s hs e he
    rw [h1] at h2
    simp only [mealyTick, h1, h2]
  have := mealyRun_eq_of_closed (G' := mealyTick step prog) (G := fun s e => (δ s e, out s e))
    hQ hagree tape htape
  exact ⟨this.2, this.1, by rw [this.1]⟩

/-- **Theorem P for the Mealy block, necessity.** If the clock's final state and output tape are
right on every tape over `E`, every reachable row passes both checks. -/
theorem mealy_certificate_necessary {Tok : Type*} {step : List Tok → List Tok → Tok}
    {prog : List Tok} {δ out : Tok → Tok × Tok → Tok} {s₀ : Tok} {E : Set (Tok × Tok)}
    (h : ∀ tape : List (Tok × Tok), (∀ e ∈ tape, e ∈ E) →
      mealyRun (mealyTick step prog) s₀ tape = mealyRun (fun s e => (δ s e, out s e)) s₀ tape) :
    MealyCertified step prog δ out (Reach δ E s₀) E := by
  rintro s ⟨u, hu, rfl⟩ ab hab
  have hu' := h u hu
  have hue := h (u ++ [ab]) (by
    intro x hx
    rcases List.mem_append.mp hx with hx | hx
    · exact hu x hx
    · simp at hx; rwa [hx])
  rw [mealyRun_append, mealyRun_append, hu'] at hue
  have hs : (mealyRun (fun s e => (δ s e, out s e)) s₀ u).1 = u.foldl δ s₀ := by
    rw [mealyRun_fst]
  rw [hs] at hue
  simp only [Prod.mk.injEq, List.append_cancel_left_eq, List.cons.injEq, and_true] at hue
  obtain ⟨h1, h2⟩ := hue
  refine ⟨h1, ?_⟩
  simpa [mealyTick] using h2

/-- **Theorem P for the Mealy block, the full table.** A well-formed table (start in `S`, every
destination in `S`; outputs unchecked) certified on every row of `S × E` runs exactly. -/
theorem pinned_regeneration_mealy_table {Tok : Type*} {step : List Tok → List Tok → Tok}
    {prog : List Tok} {δ out : Tok → Tok × Tok → Tok} {s₀ : Tok} {S : Set Tok}
    {E : Set (Tok × Tok)} (hs₀ : s₀ ∈ S) (hδ : ∀ s ∈ S, ∀ e ∈ E, δ s e ∈ S)
    (hcert : MealyCertified step prog δ out S E) (tape : List (Tok × Tok))
    (htape : ∀ e ∈ tape, e ∈ E) :
    mealyRun (mealyTick step prog) s₀ tape = mealyRun (fun s e => (δ s e, out s e)) s₀ tape :=
  (pinned_regeneration_mealy ⟨hs₀, hδ⟩ hcert (fun _ _ => ()) tape htape).2.1

/-- **Theorem P(3) for the Mealy block.** Under the certificate, both logit vectors of tick `i`
are those of the certification forwards of the table's row `(δ(s₀, e₁ … e_{i−1}), e_i)`: forward 1
on `[s, a, b]`, and forward 2 on `[s, a, b, t]` with `t` forward 1's argmax. -/
theorem mealy_tick_logits_eq_row {Tok V : Type*} {logits : List Tok → List Tok → V}
    {sel : V → Tok} {prog : List Tok} {δ out : Tok → Tok × Tok → Tok} {s₀ : Tok} {Q : Set Tok}
    {E : Set (Tok × Tok)} (hQ : ClosedFrom δ E s₀ Q)
    (hcert : MealyCertified (fun p blk => sel (logits p blk)) prog δ out Q E)
    (tape : List (Tok × Tok)) (htape : ∀ e ∈ tape, e ∈ E) (i : ℕ) (hi : i < tape.length) :
    logits prog [(tape.take i).foldl
        (fun s e => (mealyTick (fun p blk => sel (logits p blk)) prog s e).1) s₀,
        tape[i].1, tape[i].2] =
      logits prog [(tape.take i).foldl δ s₀, tape[i].1, tape[i].2] ∧
    logits prog [(tape.take i).foldl
        (fun s e => (mealyTick (fun p blk => sel (logits p blk)) prog s e).1) s₀,
        tape[i].1, tape[i].2, sel (logits prog [(tape.take i).foldl
        (fun s e => (mealyTick (fun p blk => sel (logits p blk)) prog s e).1) s₀,
        tape[i].1, tape[i].2])] =
      logits prog [(tape.take i).foldl δ s₀, tape[i].1, tape[i].2,
        sel (logits prog [(tape.take i).foldl δ s₀, tape[i].1, tape[i].2])] := by
  have h := (pinned_regeneration_mealy hQ hcert (fun _ _ => ()) (tape.take i)
    fun e he => htape e (List.mem_of_mem_take he)).2.1
  have hs := congrArg Prod.fst h
  rw [mealyRun_fst, mealyRun_fst] at hs
  rw [hs]
  exact ⟨rfl, rfl⟩

end Mealy

end Sketchpad.Pinned
