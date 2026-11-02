import Sketchpad.Pinned
import Mathlib.Analysis.SpecialFunctions.Log.Basic
import Mathlib.Data.Fintype.Basic

/-!
# INTERP Theorem 8(a) is false for unpinned decoding (DEMO_DESIGN §5.2)

INTERP Theorem 8(a): "Emitting the most likely state name and re-embedding it is a snap onto the
model's own codebook, so Theorem 1 holds: errors cannot accumulate across steps." In unpinned
decoding the context grows, `Π s₀ e₁ s₁ e₂ s₂ …`, and each state is decoded from the whole context.
The emitted token snaps the state but not the context, which is a second, unsnapped state.

**Counterexample** (DEMO_DESIGN §5.2, with Π made explicit). Tokens `sink, u, v, a`. Π is the sink
followed by the rows `u a u` and `v a v`. The table stays: `δ(u, a) = u`, `δ(v, a) = v`, start `u`.
The logits at the last position are a correct lookup (`R` on the block's state token) plus one
attention head's write on `v`'s logit. The head scores `c` at position 0 (the sink) and `0`
elsewhere, over every position of the context; its value is `β = 4R` on an `a` token and `0`
otherwise. So its write is `β · #a / (e^c + n)` with `n` tokens after the sink.

**What "passes every check" means here.**
- `PassesCert`: DEMO_DESIGN §2.5's certificate. At every row `(s, e)` of `S × B`, on the context
  `Π ++ [s, e]` (which is also the context of an unpinned first tick from `s` on `e`), the argmax
  over the whole vocabulary is `δ(s, e)` and its margin over every other token is strictly positive.
- `no_finite_check`: the unpinned run is also right on every tape of length `≤ N`, for any `N`.
- `no_finite_test_suite`: for any finite set of test contexts (any contexts that extend Π and end in
  a row `[s, a]`, with right or wrong earlier states), the step is right there with strictly
  positive margins.

In each case the unpinned run is wrong at some longer length, while the pinned run of the same
decoder is exact at every length (Theorem P).

`unpinned_exact_of_close` is the true version of Theorem 8(a): if the history moves every logit by
at most `τ` from the pinned row's, and every certified margin exceeds `2τ`, unpinned decoding is
exact at every length.
-/

namespace Sketchpad.Pinned

open Finset Real

section Unpinned

variable {Tok : Type*}

/-- One tick of unpinned decoding: append the event, decode the state from the whole context, and
append it. -/
def uStep (step : List Tok → Tok) (p : List Tok × Tok) (e : Tok) : List Tok × Tok :=
  (p.1 ++ [e] ++ [step (p.1 ++ [e])], step (p.1 ++ [e]))

/-- Unpinned decoding from Π and `s₀`: the context `Π s₀ e₁ s₁ … e_T s_T` and the last state. -/
def unpinned (step : List Tok → Tok) (prog : List Tok) (s₀ : Tok) (tape : List Tok) :
    List Tok × Tok :=
  tape.foldl (uStep step) (prog ++ [s₀], s₀)

theorem unpinned_append (step : List Tok → Tok) (prog : List Tok) (s₀ : Tok) (w : List Tok)
    (e : Tok) : unpinned step prog s₀ (w ++ [e]) = uStep step (unpinned step prog s₀ w) e := by
  simp [unpinned, List.foldl_append]

/-- The context extends Π and ends with the current state. -/
theorem unpinned_ctx (step : List Tok → Tok) (prog : List Tok) (s₀ : Tok) (w : List Tok) :
    ∃ mid, (unpinned step prog s₀ w).1 = prog ++ mid ++ [(unpinned step prog s₀ w).2] := by
  induction w using List.reverseRecOn with
  | nil => exact ⟨[], by simp [unpinned]⟩
  | append_singleton w e ih =>
    obtain ⟨mid, hmid⟩ := ih
    refine ⟨mid ++ [(unpinned step prog s₀ w).2, e], ?_⟩
    rw [unpinned_append]
    simp only [uStep]
    rw [hmid]
    simp

/-- DEMO_DESIGN §2.5's certificate, read on a decoder: at every row of `S × B`, on the context
`Π ++ [s, e]`, the argmax over the output set `O` is `δ s e`, with strictly positive margin over
every other output. -/
def PassesCert (logits : List Tok → Tok → ℝ) (sel : (Tok → ℝ) → Tok) (O : Finset Tok)
    (prog : List Tok) (δ : Tok → Tok → Tok) (S B : Set Tok) : Prop :=
  ∀ s ∈ S, ∀ e ∈ B, δ s e ∈ O ∧ sel (logits (prog ++ [s, e])) = δ s e ∧
    ∀ m ∈ O, m ≠ δ s e → logits (prog ++ [s, e]) m < logits (prog ++ [s, e]) (δ s e)

/-- INTERP Theorem 8(a), as a claim about unpinned decoding: a decoder that passes the certificate
on a well-formed table, and writes each state as its argmax token, runs the table exactly on every
tape. -/
def Theorem8a (Tok : Type) [Fintype Tok] : Prop :=
  ∀ (logits : List Tok → Tok → ℝ) (sel : (Tok → ℝ) → Tok), IsArgmax univ sel →
    ∀ (prog : List Tok) (δ : Tok → Tok → Tok) (S B : Set Tok) (s₀ : Tok),
      s₀ ∈ S → (∀ s ∈ S, ∀ e ∈ B, δ s e ∈ S) → PassesCert logits sel univ prog δ S B →
      ∀ tape : List Tok, (∀ e ∈ tape, e ∈ B) →
        (unpinned (fun ctx => sel (logits ctx)) prog s₀ tape).2 = tape.foldl δ s₀

/-- **Theorem 8(a), the true version.** If at every context that extends Π and ends in a row
`[s, e]` of `Q × B` (whatever lies between) every logit is within `τ` of the pinned row's logit,
and the pinned row's argmax is `δ s e` with margin `> 2τ`, unpinned decoding is exact on every tape
over `B`. -/
theorem unpinned_exact_of_close {O : Finset Tok} {sel : (Tok → ℝ) → Tok} (hsel : IsArgmax O sel)
    {logits : List Tok → Tok → ℝ} {prog : List Tok} {δ : Tok → Tok → Tok} {s₀ : Tok}
    {Q B : Set Tok} {τ : ℝ} (hQ : ClosedFrom δ B s₀ Q)
    (hcert : ∀ s ∈ Q, ∀ e ∈ B, δ s e ∈ O ∧
      ∀ m ∈ O, m ≠ δ s e → logits (prog ++ [s, e]) m + 2 * τ < logits (prog ++ [s, e]) (δ s e))
    (hclose : ∀ mid : List Tok, ∀ s ∈ Q, ∀ e ∈ B, ∀ m ∈ O,
      |logits (prog ++ mid ++ [s, e]) m - logits (prog ++ [s, e]) m| ≤ τ)
    (tape : List Tok) (htape : ∀ e ∈ tape, e ∈ B) :
    (unpinned (fun ctx => sel (logits ctx)) prog s₀ tape).2 = tape.foldl δ s₀ := by
  induction tape using List.reverseRecOn with
  | nil => rfl
  | append_singleton w e ih =>
    have hw : ∀ x ∈ w, x ∈ B := fun x hx => htape x (List.mem_append_left _ hx)
    have he : e ∈ B := htape e (List.mem_append_right _ (List.mem_singleton_self e))
    have hs := ih hw
    obtain ⟨mid, hmid⟩ := unpinned_ctx (fun ctx => sel (logits ctx)) prog s₀ w
    have hsQ : w.foldl δ s₀ ∈ Q := foldl_mem_of_closed hQ.2 w s₀ hQ.1 hw
    rw [unpinned_append, List.foldl_append]
    simp only [uStep, List.foldl_cons, List.foldl_nil]
    rw [hmid, hs]
    have hctx : prog ++ mid ++ [w.foldl δ s₀] ++ [e] = prog ++ mid ++ [w.foldl δ s₀, e] := by simp
    rw [hctx]
    exact sel_eq_of_close hsel (hcert _ hsQ e he).1 (hcert _ hsQ e he).2
      (hclose mid _ hsQ e he)

end Unpinned

/-! ### The counterexample -/

/-- Four tokens: a sink (position 0), the state names `u` and `v`, and the event `a`. -/
inductive Tk
  | sink | u | v | a
  deriving DecidableEq

instance : Fintype Tk where
  elems := {Tk.sink, Tk.u, Tk.v, Tk.a}
  complete := by intro x; cases x <;> simp

instance : Nonempty Tk := ⟨Tk.sink⟩

/-- Π: the sink, then the rows `u a u` and `v a v`. -/
def prog8 : List Tk := [.sink, .u, .a, .u, .v, .a, .v]

/-- The table: `δ(u, a) = u`, `δ(v, a) = v`. -/
def δ8 (s _e : Tk) : Tk := s

/-- The states and the events. -/
def S8 : Set Tk := {Tk.u, Tk.v}
def B8 : Set Tk := {Tk.a}

/-- The head's score: `c` at position 0 (the sink), `0` elsewhere. -/
noncomputable def sinkScore (c : ℝ) (j : ℕ) : ℝ := if j = 0 then c else 0

/-- The head's value on `v`'s logit: `β` on an `a` token, `0` otherwise. -/
noncomputable def aVal (β : ℝ) (x : Option Tk) : ℝ := if x = some Tk.a then β else 0

/-- The head's write on `v`'s logit at the last position: the softmax-weighted average of the values
over every position of the context, `Σ_j e^{score_j} val_j / Σ_j e^{score_j}`. -/
noncomputable def headPush (c β : ℝ) (ctx : List Tk) : ℝ :=
  (∑ j ∈ range ctx.length, exp (sinkScore c j) * aVal β ctx[j]?) /
    ∑ j ∈ range ctx.length, exp (sinkScore c j)

/-- The lookup: `R` on the block's state token (the second token from the end), `0` elsewhere.
This is the correct lookup for the table `δ8`. -/
noncomputable def lookup8 (R : ℝ) (ctx : List Tk) (m : Tk) : ℝ :=
  if ctx.reverse[1]? = some m then R else 0

/-- The decoder's logits at the last position: the lookup plus the head's write, with `β = 4R`. -/
noncomputable def logits8 (c R : ℝ) (ctx : List Tk) (m : Tk) : ℝ :=
  lookup8 R ctx m + if m = Tk.v then headPush c (4 * R) ctx else 0

theorem sum_aVal (β : ℝ) (l : List Tk) :
    ∑ j ∈ range l.length, aVal β l[j]? = β * l.count Tk.a := by
  induction l with
  | nil => simp
  | cons x l ih =>
    rw [List.length_cons, sum_range_succ']
    simp only [List.getElem?_cons_succ, List.getElem?_cons_zero, ih, List.count_cons]
    by_cases hx : x = Tk.a
    · subst hx; simp [aVal]; ring
    · simp [aVal, hx]

/-- The head's write in closed form, on a context that starts with the sink. -/
theorem headPush_sink (c β : ℝ) (tl : List Tk) :
    headPush c β (Tk.sink :: tl) = β * tl.count Tk.a / (exp c + tl.length) := by
  unfold headPush
  rw [List.length_cons, sum_range_succ', sum_range_succ']
  have h1 : ∀ j ∈ range tl.length, exp (sinkScore c (j + 1)) * aVal β (Tk.sink :: tl)[j + 1]? =
      aVal β tl[j]? := by
    intro j _; simp [sinkScore]
  have h2 : ∀ j ∈ range tl.length, exp (sinkScore c (j + 1)) = 1 := by
    intro j _; simp [sinkScore]
  rw [sum_congr rfl h1, sum_congr rfl h2, sum_aVal]
  simp [sinkScore, aVal]
  ring

theorem headPush_nonneg (c : ℝ) {β : ℝ} (hβ : 0 ≤ β) (ctx : List Tk) : 0 ≤ headPush c β ctx := by
  unfold headPush
  refine div_nonneg (sum_nonneg fun j _ => mul_nonneg (exp_pos _).le ?_)
    (sum_nonneg fun j _ => (exp_pos _).le)
  unfold aVal; split_ifs <;> linarith

theorem rev_one (l : List Tk) (s e : Tk) : (l ++ [s, e]).reverse[1]? = some s := by simp

/-- At a row ending in state `v`, `v` is the strict argmax. -/
theorem strict_v {c R : ℝ} (hR : 0 < R) (l : List Tk) (e : Tk) :
    ∀ m, m ≠ Tk.v → logits8 c R (l ++ [Tk.v, e]) m < logits8 c R (l ++ [Tk.v, e]) Tk.v := by
  have hp := headPush_nonneg c (by linarith : (0 : ℝ) ≤ 4 * R) (l ++ [Tk.v, e])
  intro m hm
  cases m <;> simp_all [logits8, lookup8] <;> linarith

/-- At a row ending in state `u`, `u` is the strict argmax iff the head's write is below `R`. -/
theorem strict_u {c R : ℝ} (hR : 0 < R) (l : List Tk) (e : Tk)
    (hlt : headPush c (4 * R) (l ++ [Tk.u, e]) < R) :
    ∀ m, m ≠ Tk.u → logits8 c R (l ++ [Tk.u, e]) m < logits8 c R (l ++ [Tk.u, e]) Tk.u := by
  intro m hm
  cases m <;> simp_all [logits8, lookup8]

/-- At a row ending in state `u`, `v` is the strict argmax once the head's write exceeds `R`. -/
theorem strict_v_of_gt {c R : ℝ} (hR : 0 < R) (l : List Tk) (e : Tk)
    (hgt : R < headPush c (4 * R) (l ++ [Tk.u, e])) :
    ∀ m, m ≠ Tk.v → logits8 c R (l ++ [Tk.u, e]) m < logits8 c R (l ++ [Tk.u, e]) Tk.v := by
  intro m hm
  cases m <;> simp_all [logits8, lookup8] <;> linarith

/-- At a row ending in `u` or `v`, every argmax is `u` or `v`. -/
theorem sel_mem_uv {c R : ℝ} (hR : 0 < R) {sel : (Tk → ℝ) → Tk} (hsel : IsArgmax univ sel)
    (l : List Tk) (s e : Tk) (hs : s = Tk.u ∨ s = Tk.v) :
    sel (logits8 c R (l ++ [s, e])) = Tk.u ∨ sel (logits8 c R (l ++ [s, e])) = Tk.v := by
  have hp := headPush_nonneg c (by linarith : (0 : ℝ) ≤ 4 * R) (l ++ [s, e])
  have hmax := (hsel (logits8 c R (l ++ [s, e]))).2 s (mem_univ _)
  generalize hx : sel (logits8 c R (l ++ [s, e])) = x at hmax ⊢
  rcases hs with rfl | rfl <;> cases x <;> simp_all [logits8, lookup8] <;> linarith

/-- The context of the all-`u` run after `n` ticks, after Π: `u (a u)^n`. -/
def uRun : ℕ → List Tk
  | 0 => [Tk.u]
  | n + 1 => uRun n ++ [Tk.a, Tk.u]

theorem uRun_count (n : ℕ) : (uRun n).count Tk.a = n := by
  induction n with
  | zero => rfl
  | succ n ih => simp [uRun, ih]

theorem uRun_length (n : ℕ) : (uRun n).length = 2 * n + 1 := by
  induction n with
  | zero => rfl
  | succ n ih => simp [uRun, ih]; ring

theorem uRun_last (n : ℕ) : ∃ l, uRun n = l ++ [Tk.u] := by
  cases n with
  | zero => exact ⟨[], rfl⟩
  | succ n => exact ⟨uRun n ++ [Tk.a], by simp [uRun]⟩

/-- The head's write at tick `n + 1` of the all-`u` run: `4R(n + 3)/(e^c + 2n + 8)`. -/
theorem headPush_uRun (c R : ℝ) (n : ℕ) :
    headPush c (4 * R) (prog8 ++ uRun n ++ [Tk.a]) =
      4 * R * (n + 3) / (exp c + (2 * n + 8)) := by
  have : prog8 ++ uRun n ++ [Tk.a] =
      Tk.sink :: ([Tk.u, Tk.a, Tk.u, Tk.v, Tk.a, Tk.v] ++ uRun n ++ [Tk.a]) := by simp [prog8]
  rw [this, headPush_sink]
  simp only [List.count_append, List.length_append, uRun_count, uRun_length]
  simp
  ring_nf

/-- The head's write at the certification block `Π ++ [s, a]`, `s ∈ {u, v}`: `12R/(e^c + 8)`. -/
theorem headPush_cert (c R : ℝ) (s : Tk) (hs : s = Tk.u ∨ s = Tk.v) :
    headPush c (4 * R) (prog8 ++ [s, Tk.a]) = 4 * R * 3 / (exp c + 8) := by
  have : prog8 ++ [s, Tk.a] = Tk.sink :: [Tk.u, Tk.a, Tk.u, Tk.v, Tk.a, Tk.v, s, Tk.a] := by
    simp [prog8]
  rw [this, headPush_sink]
  rcases hs with rfl | rfl <;> norm_num

section Run

variable {c R : ℝ} {sel : (Tk → ℝ) → Tk}

/-- The unpinned run of the counterexample on `a^n`. -/
noncomputable def run8 (c R : ℝ) (sel : (Tk → ℝ) → Tk) (n : ℕ) : List Tk × Tk :=
  unpinned (fun ctx => sel (logits8 c R ctx)) prog8 Tk.u (List.replicate n Tk.a)

theorem run8_succ (n : ℕ) :
    run8 c R sel (n + 1) = uStep (fun ctx => sel (logits8 c R ctx)) (run8 c R sel n) Tk.a := by
  simp only [run8, List.replicate_succ', unpinned_append]

/-- The run's states are `u` or `v`, and while the state is `u` the context is `Π u (a u)^n`. -/
theorem run8_invariant (hR : 0 < R) (hsel : IsArgmax univ sel) (n : ℕ) :
    ((run8 c R sel n).2 = Tk.u ∨ (run8 c R sel n).2 = Tk.v) ∧
      ((run8 c R sel n).2 = Tk.u → (run8 c R sel n).1 = prog8 ++ uRun n) := by
  induction n with
  | zero => exact ⟨Or.inl rfl, fun _ => rfl⟩
  | succ n ih =>
    obtain ⟨mid, hmid⟩ := unpinned_ctx (fun ctx => sel (logits8 c R ctx)) prog8 Tk.u
      (List.replicate n Tk.a)
    change (run8 c R sel n).1 = prog8 ++ mid ++ [(run8 c R sel n).2] at hmid
    have hq : (run8 c R sel n).1 ++ [Tk.a] = (prog8 ++ mid) ++ [(run8 c R sel n).2, Tk.a] := by
      rw [hmid]; simp
    rw [run8_succ]
    simp only [uStep]
    refine ⟨?_, ?_⟩
    · rw [hq]; exact sel_mem_uv hR hsel _ _ _ ih.1
    · intro hu
      rcases ih.1 with h | h
      · rw [ih.2 h] at hu ⊢
        rw [hu]; simp [uRun]
      · exfalso
        rw [hq, h] at hu
        have := sel_eq_of_strict hsel (mem_univ _) fun m _ hm =>
          strict_v (c := c) hR (prog8 ++ mid) Tk.a m hm
        rw [this] at hu; exact absurd hu (by decide)

/-- While `2n < e^c − 2`, the unpinned state after `n` ticks is `u` (right). -/
theorem run8_right (hR : 0 < R) (hsel : IsArgmax univ sel) (n : ℕ) (hn : (2 * n : ℝ) < exp c - 2) :
    (run8 c R sel n).2 = Tk.u := by
  induction n with
  | zero => rfl
  | succ n ih =>
    have hn' : (2 * n : ℝ) < exp c - 2 := by push_cast at hn; linarith
    have hu := ih hn'
    have hctx := (run8_invariant (c := c) hR hsel n).2 hu
    rw [run8_succ]
    simp only [uStep]
    rw [hctx]
    obtain ⟨l, hl⟩ := uRun_last n
    have hpush : headPush c (4 * R) (prog8 ++ uRun n ++ [Tk.a]) < R := by
      rw [headPush_uRun, div_lt_iff₀ (by positivity)]
      push_cast at hn
      nlinarith
    have hform : prog8 ++ uRun n ++ [Tk.a] = (prog8 ++ l) ++ [Tk.u, Tk.a] := by rw [hl]; simp
    rw [hform] at hpush ⊢
    exact sel_eq_of_strict hsel (mem_univ _) fun m _ hm => strict_u hR _ _ hpush m hm

/-- Once `2n > e^c − 2`, the unpinned state after `n` ticks is `v` (wrong). -/
theorem run8_wrong (hR : 0 < R) (hsel : IsArgmax univ sel) (hc : 2 ≤ exp c) (n : ℕ)
    (hn : exp c - 2 < (2 * n : ℝ)) : (run8 c R sel n).2 = Tk.v := by
  induction n with
  | zero => simp at hn; linarith
  | succ n ih =>
    rw [run8_succ]
    simp only [uStep]
    rcases (run8_invariant (c := c) hR hsel n).1 with hu | hv
    · have hctx := (run8_invariant (c := c) hR hsel n).2 hu
      rw [hctx]
      obtain ⟨l, hl⟩ := uRun_last n
      have hpush : R < headPush c (4 * R) (prog8 ++ uRun n ++ [Tk.a]) := by
        rw [headPush_uRun, lt_div_iff₀ (by positivity)]
        push_cast at hn
        nlinarith
      have hform : prog8 ++ uRun n ++ [Tk.a] = (prog8 ++ l) ++ [Tk.u, Tk.a] := by rw [hl]; simp
      rw [hform] at hpush ⊢
      exact sel_eq_of_strict hsel (mem_univ _) fun m _ hm => strict_v_of_gt hR _ _ hpush m hm
    · obtain ⟨mid, hmid⟩ := unpinned_ctx (fun ctx => sel (logits8 c R ctx)) prog8 Tk.u
        (List.replicate n Tk.a)
      change (run8 c R sel n).1 = prog8 ++ mid ++ [(run8 c R sel n).2] at hmid
      rw [hmid, hv]
      have : prog8 ++ mid ++ [Tk.v] ++ [Tk.a] = (prog8 ++ mid) ++ [Tk.v, Tk.a] := by simp
      rw [this]
      exact sel_eq_of_strict hsel (mem_univ _) fun m _ hm => strict_v hR _ _ m hm

end Run

theorem foldl_δ8 (s : Tk) (w : List Tk) : w.foldl δ8 s = s := by
  induction w generalizing s with
  | nil => rfl
  | cons e w ih => exact ih s

/-- The counterexample passes the certificate when `e^c > 4`. -/
theorem passesCert8 {c R : ℝ} (hR : 0 < R) (hc : 4 < exp c) {sel : (Tk → ℝ) → Tk}
    (hsel : IsArgmax univ sel) : PassesCert (logits8 c R) sel univ prog8 δ8 S8 B8 := by
  intro s hs e he
  simp only [S8, B8, Set.mem_insert_iff, Set.mem_singleton_iff] at hs he
  subst he
  have hstrict : ∀ m ∈ (univ : Finset Tk), m ≠ δ8 s Tk.a →
      logits8 c R (prog8 ++ [s, Tk.a]) m < logits8 c R (prog8 ++ [s, Tk.a]) (δ8 s Tk.a) := by
    intro m _ hm
    rcases hs with rfl | rfl
    · have hpush : headPush c (4 * R) ([] ++ prog8 ++ [Tk.u, Tk.a]) < R := by
        rw [List.nil_append, headPush_cert c R Tk.u (Or.inl rfl), div_lt_iff₀ (by positivity)]
        nlinarith
      have := strict_u hR (prog8) Tk.a (by simpa using hpush) m hm
      simpa [δ8] using this
    · simpa [δ8] using strict_v hR prog8 Tk.a m hm
  exact ⟨mem_univ _, sel_eq_of_strict hsel (mem_univ _) hstrict, hstrict⟩

/-- **Theorem 8(a) is false (DEMO_DESIGN §5.2).** For every `c` with `e^c > 4`, every `R > 0` and
every argmax tie rule, the decoder `logits8 c R`:
1. passes the certificate at every row of `S × B` with strictly positive margins;
2. so its *pinned* run is the table's on every tape (Theorem P);
3. its *unpinned* run is right after `n` events while `2n < e^c − 2`;
4. and wrong (state `v`, the table says `u`) once `2n > e^c − 2`. -/
theorem theorem8a_counterexample {c R : ℝ} (hR : 0 < R) (hc : 4 < exp c)
    {sel : (Tk → ℝ) → Tk} (hsel : IsArgmax univ sel) :
    PassesCert (logits8 c R) sel univ prog8 δ8 S8 B8 ∧
    (∀ tape : List Tk, (∀ e ∈ tape, e ∈ B8) →
      tape.scanl (tick (fun p blk => sel (logits8 c R (p ++ blk))) prog8) Tk.u =
        tape.scanl δ8 Tk.u) ∧
    (∀ n : ℕ, (2 * n : ℝ) < exp c - 2 →
      (unpinned (fun ctx => sel (logits8 c R ctx)) prog8 Tk.u (List.replicate n Tk.a)).2 =
        (List.replicate n Tk.a).foldl δ8 Tk.u) ∧
    (∀ n : ℕ, exp c - 2 < (2 * n : ℝ) →
      (unpinned (fun ctx => sel (logits8 c R ctx)) prog8 Tk.u (List.replicate n Tk.a)).2 = Tk.v ∧
        (List.replicate n Tk.a).foldl δ8 Tk.u = Tk.u) := by
  have hcert := passesCert8 hR hc hsel
  refine ⟨hcert, ?_, ?_, ?_⟩
  · intro tape htape
    refine pinned_regeneration_table (S := S8) (by simp [S8]) ?_ ?_ tape htape
    · intro s hs e _; simpa [δ8] using hs
    · intro s hs e he; exact (hcert s hs e he).2.1
  · intro n hn
    rw [foldl_δ8]
    exact run8_right hR hsel n hn
  · intro n hn
    exact ⟨run8_wrong hR hsel (by linarith) n hn, foldl_δ8 _ _⟩

/-- **Theorem 8(a), as a claim about unpinned decoding, is false.** -/
theorem not_theorem8a : ¬ Theorem8a Tk := by
  intro h
  obtain ⟨sel, hsel⟩ := exists_isArgmax (univ : Finset Tk) univ_nonempty
  have hc : (4 : ℝ) < exp (log 5) := by rw [exp_log (by norm_num)]; norm_num
  have h8 := theorem8a_counterexample (c := log 5) (R := 1) one_pos hc hsel
  have hwrong := (h8.2.2.2 2 (by rw [exp_log (by norm_num)]; norm_num)).1
  have hright := h (logits8 (log 5) 1) sel hsel prog8 δ8 S8 B8 Tk.u (by simp [S8])
    (by intro s hs e _; simpa [δ8] using hs) h8.1 (List.replicate 2 Tk.a)
    (by intro e he; simp [B8, List.eq_of_mem_replicate he])
  rw [foldl_δ8] at hright
  rw [hright] at hwrong
  exact absurd hwrong (by decide)

/-- **No finite length check certifies unpinned decoding.** For every `N`, a decoder of this form
passes the certificate and runs every tape of length `≤ N` exactly when unpinned, yet its unpinned
run is wrong on some longer tape. -/
theorem no_finite_check (N : ℕ) {R : ℝ} (hR : 0 < R) {sel : (Tk → ℝ) → Tk}
    (hsel : IsArgmax univ sel) :
    ∃ c : ℝ, PassesCert (logits8 c R) sel univ prog8 δ8 S8 B8 ∧
      (∀ tape : List Tk, (∀ e ∈ tape, e ∈ B8) → tape.length ≤ N →
        (unpinned (fun ctx => sel (logits8 c R ctx)) prog8 Tk.u tape).2 = tape.foldl δ8 Tk.u) ∧
      ∃ tape : List Tk, (∀ e ∈ tape, e ∈ B8) ∧
        (unpinned (fun ctx => sel (logits8 c R ctx)) prog8 Tk.u tape).2 ≠ tape.foldl δ8 Tk.u := by
  have hK : (0 : ℝ) < 2 * N + 5 := by positivity
  have hexp : exp (log (2 * N + 5)) = 2 * N + 5 := exp_log hK
  have hc : (4 : ℝ) < exp (log (2 * N + 5)) := by rw [hexp]; linarith [(N.cast_nonneg : (0:ℝ) ≤ N)]
  obtain ⟨h1, -, h3, h4⟩ := theorem8a_counterexample (c := log (2 * N + 5)) hR hc hsel
  refine ⟨log (2 * N + 5), h1, ?_, ?_⟩
  · intro tape htape hlen
    have heq : tape = List.replicate tape.length Tk.a :=
      List.eq_replicate_iff.mpr ⟨rfl, fun b hb => by simpa [B8] using htape b hb⟩
    rw [heq]
    refine h3 _ ?_
    rw [hexp]
    have : (tape.length : ℝ) ≤ N := by exact_mod_cast hlen
    linarith
  · refine ⟨List.replicate (N + 2) Tk.a, fun e he => by simp [B8, List.eq_of_mem_replicate he], ?_⟩
    have := h4 (N + 2) (by rw [hexp]; push_cast; linarith)
    rw [this.1, this.2]
    decide

/-- **No finite test suite certifies unpinned decoding.** Take any finite set `C` of contexts that
extend Π and end in a row `[s, a]` with `s ∈ {u, v}` (right or wrong earlier states, any lengths).
Some decoder of this form is right at every context of `C`, and at every certification block, with
strictly positive margins, yet its unpinned run is wrong on some tape. -/
theorem no_finite_test_suite {R : ℝ} (hR : 0 < R) {sel : (Tk → ℝ) → Tk}
    (hsel : IsArgmax univ sel) (C : Finset (List Tk)) :
    ∃ c : ℝ, PassesCert (logits8 c R) sel univ prog8 δ8 S8 B8 ∧
      (∀ ctx ∈ C, ∀ (mid : List Tk) (s : Tk), s ∈ S8 → ctx = prog8 ++ mid ++ [s, Tk.a] →
        sel (logits8 c R ctx) = δ8 s Tk.a ∧
          ∀ m, m ≠ δ8 s Tk.a → logits8 c R ctx m < logits8 c R ctx (δ8 s Tk.a)) ∧
      ∃ tape : List Tk, (∀ e ∈ tape, e ∈ B8) ∧
        (unpinned (fun ctx => sel (logits8 c R ctx)) prog8 Tk.u tape).2 ≠ tape.foldl δ8 Tk.u := by
  set M : ℕ := C.sup List.length
  have hK : (0 : ℝ) < 3 * M + 5 := by positivity
  have hexp : exp (log (3 * M + 5)) = 3 * M + 5 := exp_log hK
  have hM0 : (0 : ℝ) ≤ M := M.cast_nonneg
  have hc : (4 : ℝ) < exp (log (3 * M + 5)) := by rw [hexp]; linarith
  obtain ⟨h1, -, -, h4⟩ := theorem8a_counterexample (c := log (3 * M + 5)) hR hc hsel
  refine ⟨log (3 * M + 5), h1, ?_, ?_⟩
  · intro ctx hctx mid s hs hform
    have hlen : ctx.length ≤ M := Finset.le_sup (f := List.length) hctx
    have hstrict : ∀ m, m ≠ δ8 s Tk.a → logits8 (log (3 * M + 5)) R ctx m <
        logits8 (log (3 * M + 5)) R ctx (δ8 s Tk.a) := by
      intro m hm
      simp only [S8, Set.mem_insert_iff, Set.mem_singleton_iff] at hs
      rw [hform]
      rcases hs with rfl | rfl
      · have htl : prog8 ++ mid ++ [Tk.u, Tk.a] =
            Tk.sink :: ([Tk.u, Tk.a, Tk.u, Tk.v, Tk.a, Tk.v] ++ mid ++ [Tk.u, Tk.a]) := by
          simp [prog8]
        have hpush : headPush (log (3 * M + 5)) (4 * R) (prog8 ++ mid ++ [Tk.u, Tk.a]) < R := by
          rw [htl, headPush_sink, hexp, div_lt_iff₀ (by positivity)]
          set tl := [Tk.u, Tk.a, Tk.u, Tk.v, Tk.a, Tk.v] ++ mid ++ [Tk.u, Tk.a]
          have hcount : (tl.count Tk.a : ℝ) ≤ tl.length := by exact_mod_cast List.count_le_length
          have hlen' : (tl.length : ℝ) + 1 ≤ M := by
            have : ctx.length = tl.length + 1 := by rw [hform, htl]; simp
            exact_mod_cast (this ▸ hlen)
          nlinarith
        simpa [δ8] using strict_u hR (prog8 ++ mid) Tk.a hpush m hm
      · simpa [δ8] using strict_v hR (prog8 ++ mid) Tk.a m hm
    exact ⟨sel_eq_of_strict hsel (mem_univ _) fun m _ hm => hstrict m hm, hstrict⟩
  · refine ⟨List.replicate (2 * M + 4) Tk.a,
      fun e he => by simp [B8, List.eq_of_mem_replicate he], ?_⟩
    have := h4 (2 * M + 4) (by rw [hexp]; push_cast; linarith)
    rw [this.1, this.2]
    decide

theorem unpinned_length (step : List Tk → Tk) (prog : List Tk) (s₀ : Tk) (w : List Tk) :
    (unpinned step prog s₀ w).1.length = prog.length + 1 + 2 * w.length := by
  induction w using List.reverseRecOn with
  | nil => simp [unpinned]
  | append_singleton w e ih =>
    rw [unpinned_append]
    simp only [uStep, List.length_append, List.length_singleton, ih]
    ring

/-- The table of `stepMv`: `δ(u, a) = v`, `δ(v, a) = v`. -/
def δmv (_s _e : Tk) : Tk := Tk.v

/-- A step that is right at every context of the unpinned run but wrong on the certification
block `Π ++ [v, a]`. -/
def stepMv (ctx : List Tk) : Tk := if ctx = prog8 ++ [Tk.v, Tk.a] then Tk.u else Tk.v

theorem stepMv_of_ne {ctx : List Tk} (h : ctx ≠ prog8 ++ [Tk.v, Tk.a]) : stepMv ctx = Tk.v := by
  simp [stepMv, h]

/-- **The converse fails too.** Theorem 1(i), transferred by Theorem 8(a), would also say that an
exact run needs the step right at every reachable row. For unpinned decoding this fails: `stepMv`
runs `δmv` exactly on every tape, yet the reachable row `(v, a)` fails the certificate, because the
unpinned run never sees the context `Π ++ [v, a]`. -/
theorem unpinned_exact_not_certified :
    (∀ tape : List Tk, (∀ e ∈ tape, e ∈ B8) →
      (unpinned stepMv prog8 Tk.u tape).2 = tape.foldl δmv Tk.u) ∧
    Tk.v ∈ Reach δmv B8 Tk.u ∧ stepMv (prog8 ++ [Tk.v, Tk.a]) ≠ δmv Tk.v Tk.a := by
  refine ⟨?_, ⟨[Tk.a], by simp [B8], rfl⟩, by simp [stepMv, δmv]⟩
  intro tape _
  induction tape using List.reverseRecOn with
  | nil => rfl
  | append_singleton w e _ =>
    rw [unpinned_append, List.foldl_append]
    simp only [uStep, List.foldl_cons, List.foldl_nil, δmv]
    obtain ⟨mid, hmid⟩ := unpinned_ctx stepMv prog8 Tk.u w
    have hlen := unpinned_length stepMv prog8 Tk.u w
    refine stepMv_of_ne fun heq => ?_
    rw [hmid] at heq hlen
    have hl := congrArg List.length heq
    simp only [List.length_append, List.length_cons, List.length_nil] at hl hlen
    have hmid0 : mid = [] := List.eq_nil_of_length_eq_zero (by omega)
    have hw0 : w = [] := List.eq_nil_of_length_eq_zero (by omega)
    subst hmid0 hw0
    simp [unpinned] at heq

end Sketchpad.Pinned
