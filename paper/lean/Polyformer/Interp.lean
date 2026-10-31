import Mathlib.Analysis.InnerProductSpace.Basic
import Mathlib.Analysis.InnerProductSpace.Continuous
import Mathlib.Analysis.SpecialFunctions.Exp
import Mathlib.Analysis.Calculus.FDeriv.Const
import Mathlib.Analysis.Normed.Operator.Basic
import Mathlib.Topology.Order.OrderClosed

/-!
# INTERP Theorems 1–3: the snapped interpreter

`research/interp/INTERP.md` §2–§3 (unchanged from `52a9f521` to `07ccf3f9`). One event of the
interpreter, from a state vector `z` and a letter `a`, on a table `(S, B, δ)`:
query `q = Q_N z + Q_L f_a`, key `k_{sb} = K_N c_s + K_L f_b`, value
`v_{sb} = V_N c_s + V_L f_b + V_T c_{δ(s,b)}`, attention `w = softmax ⟨q, k_{sb}⟩/√D` over the rows
`S × B`, output `y = ι z + W_O Σ w_{sb} v_{sb}` (`ι = 0` overwrite tick, `ι = 1` residual tick),
logits `ℓ_m = ⟨y, c_m⟩/√D`. The snap sets the next state to the code of a name with the largest
logit. Row-vector products `z Q_N` of the source are written as linear maps `Q_N z`; `√D` is `sD`.
-/

namespace Polyformer.Interp

open Finset Real Filter Topology
open scoped RealInnerProductSpace

variable {Z : Type*} [NormedAddCommGroup Z] [InnerProductSpace ℝ Z]
variable {Nm Lt : Type*}

/-! ### Theorem 1: regeneration -/

section Regeneration

/-- **Theorem 1(i).** Let `step n b` be the name the snapped interpreter moves to from the exact code
of `n` on letter `b`. It runs every word over `B` exactly (its name after the word is the table's
state) if and only if its single step from exact codes is right at every reachable
(state, letter) pair. -/
theorem regeneration (δ step : Nm → Lt → Nm) (s₀ : Nm) (B : Set Lt) :
    (∀ w : List Lt, (∀ b ∈ w, b ∈ B) → w.foldl step s₀ = w.foldl δ s₀) ↔
      ∀ u : List Lt, (∀ b ∈ u, b ∈ B) → ∀ b ∈ B,
        step (u.foldl δ s₀) b = δ (u.foldl δ s₀) b := by
  constructor
  · intro h u hu b hb
    have hub := h (u ++ [b]) (by simpa [List.mem_append, or_imp, forall_and] using ⟨hu, hb⟩)
    simp only [List.foldl_append, List.foldl_cons, List.foldl_nil] at hub
    rwa [h u hu] at hub
  · intro h w hw
    induction w using List.reverseRecOn with
    | nil => rfl
    | append_singleton w b ih =>
      have hw' : ∀ c ∈ w, c ∈ B := fun c hc => hw c (List.mem_append_left _ hc)
      have hb : b ∈ B := hw b (List.mem_append_right _ (List.mem_singleton_self b))
      simp only [List.foldl_append, List.foldl_cons, List.foldl_nil]
      rw [ih hw', h w hw' b hb]

omit [InnerProductSpace ℝ Z] in
/-- **Theorem 1(iii), away from ties.** If the logits are continuous and `m₀` is the strict argmax
at `z₀`, then any argmax selection equals `m₀` near `z₀`: the snapped step is locally constant. -/
theorem snap_eventually_eq {ι : Type*} {S : Finset ι} {ℓ : Z → ι → ℝ}
    (hcont : ∀ m ∈ S, Continuous fun z => ℓ z m) (sel : Z → ι)
    (hsel : ∀ z, sel z ∈ S ∧ ∀ m ∈ S, ℓ z m ≤ ℓ z (sel z)) {z₀ : Z} {m₀ : ι} (hm₀ : m₀ ∈ S)
    (hstrict : ∀ m ∈ S, m ≠ m₀ → ℓ z₀ m < ℓ z₀ m₀) :
    ∀ᶠ z in 𝓝 z₀, sel z = m₀ := by
  have hall : ∀ᶠ z in 𝓝 z₀, ∀ m ∈ S, m ≠ m₀ → ℓ z m < ℓ z m₀ := by
    rw [Finset.eventually_all]
    intro m hm
    by_cases hmm : m = m₀
    · exact Eventually.of_forall fun _ h => absurd hmm h
    · filter_upwards [(hcont m hm).continuousAt.eventually_lt (hcont m₀ hm₀).continuousAt
        (hstrict m hm hmm)] with z hz _ using hz
  filter_upwards [hall] with z hz
  by_contra hne
  have h1 := hz (sel z) (hsel z).1 hne
  have h2 := (hsel z).2 m₀ hm₀
  linarith

/-- **Theorem 1(iii), everywhere.** A map with finitely many values (the snapped step takes values
in the table's codes) has zero derivative wherever it is differentiable, ties included. -/
theorem fderiv_eq_zero_of_finite_range {F : Type*} [NormedAddCommGroup F] [NormedSpace ℝ F]
    {g : Z → F} (hg : (Set.range g).Finite) {z : Z} (hd : DifferentiableAt ℝ g z) :
    fderiv ℝ g z = 0 := by
  have hclosed : IsClosed (Set.range g \ {g z}) := (hg.subset Set.sdiff_subset).isClosed
  have hnhds : (Set.range g \ {g z})ᶜ ∈ 𝓝 (g z) :=
    hclosed.isOpen_compl.mem_nhds (by simp)
  have hev : g =ᶠ[𝓝 z] fun _ => g z := by
    filter_upwards [hd.continuousAt hnhds] with z' hz'
    by_contra hne
    exact hz' ⟨⟨z', rfl⟩, hne⟩
  rw [hev.fderiv_eq]
  simp

end Regeneration

/-! ### The interpreter -/

/-- The interpreter's weights: name and letter codes, the eight linear maps, `√D` and the tick. -/
structure Weights (Z Nm Lt : Type*) [NormedAddCommGroup Z] [InnerProductSpace ℝ Z] where
  c : Nm → Z
  f : Lt → Z
  QN : Z →L[ℝ] Z
  QL : Z →L[ℝ] Z
  KN : Z →L[ℝ] Z
  KL : Z →L[ℝ] Z
  VN : Z →L[ℝ] Z
  VL : Z →L[ℝ] Z
  VT : Z →L[ℝ] Z
  WO : Z →L[ℝ] Z
  sD : ℝ
  tick : ℝ

variable (W : Weights Z Nm Lt)

/-- The score `⟨q, k_{sb}⟩/√D` of row `(s, b)` for the query `(z, a)`. -/
noncomputable def score (z : Z) (a : Lt) (s : Nm) (b : Lt) : ℝ :=
  ⟪W.QN z + W.QL (W.f a), W.KN (W.c s) + W.KL (W.f b)⟫ / W.sD

/-- Attention weight of row `(s, b)` on the complete table `S × B`. -/
noncomputable def attn (S : Finset Nm) (B : Finset Lt) (z : Z) (a : Lt) (s : Nm) (b : Lt) : ℝ :=
  exp (score W z a s b) / ∑ p ∈ S ×ˢ B, exp (score W z a p.1 p.2)

/-- Value of row `(s, b)`. -/
def val (δ : Nm → Lt → Nm) (s : Nm) (b : Lt) : Z :=
  W.VN (W.c s) + W.VL (W.f b) + W.VT (W.c (δ s b))

/-- The event's output. -/
noncomputable def out (S : Finset Nm) (B : Finset Lt) (δ : Nm → Lt → Nm) (z : Z) (a : Lt) : Z :=
  W.tick • z + W.WO (∑ p ∈ S ×ˢ B, attn W S B z a p.1 p.2 • val W δ p.1 p.2)

/-- The readout logit of name `m`. -/
noncomputable def logit (S : Finset Nm) (B : Finset Lt) (δ : Nm → Lt → Nm) (z : Z) (a : Lt)
    (m : Nm) : ℝ :=
  ⟪out W S B δ z a, W.c m⟫ / W.sD

/-- `x_s = e^{-Δ_N(s)}`: the same-letter row `(s, a)` against the matching row `(n, a)`. -/
noncomputable def xw (z : Z) (a : Lt) (n s : Nm) : ℝ := exp (score W z a s a - score W z a n a)

/-- `y_b = e^{-Δ_L(b)}`: the same-state row `(n, b)` against the matching row. -/
noncomputable def yw (z : Z) (a : Lt) (n : Nm) (b : Lt) : ℝ :=
  exp (score W z a n b - score W z a n a)

/-- The pushes on the margin of `t` over `m`: source, letter, destination and identity. -/
noncomputable def gN (t m s : Nm) : ℝ := ⟪W.WO (W.VN (W.c s)), W.c t - W.c m⟫ / W.sD
noncomputable def gL (t m : Nm) (b : Lt) : ℝ := ⟪W.WO (W.VL (W.f b)), W.c t - W.c m⟫ / W.sD
noncomputable def gT (t m r : Nm) : ℝ := ⟪W.WO (W.VT (W.c r)), W.c t - W.c m⟫ / W.sD
noncomputable def gI (z : Z) (t m : Nm) : ℝ := W.tick * ⟪z, W.c t - W.c m⟫ / W.sD

lemma xw_self (z : Z) (a : Lt) (n : Nm) : xw W z a n n = 1 := by simp [xw]

lemma yw_self (z : Z) (a : Lt) (n : Nm) : yw W z a n a = 1 := by simp [yw]

/-- The event's logits are continuous in the state vector. -/
lemma continuous_logit {S : Finset Nm} {B : Finset Lt} (hS : S.Nonempty) (hB : B.Nonempty)
    (δ : Nm → Lt → Nm) (a : Lt) (m : Nm) : Continuous fun z => logit W S B δ z a m := by
  have hscore : ∀ s b, Continuous fun z => score W z a s b := fun s b =>
    ((W.QN.continuous.add continuous_const).inner continuous_const).div_const _
  have hattn : ∀ s b, Continuous fun z => attn W S B z a s b := by
    intro s b
    refine (hscore s b).rexp.div (continuous_finsetSum _ fun p _ => (hscore p.1 p.2).rexp) ?_
    exact fun z => (sum_pos (fun _ _ => exp_pos _) (hS.product hB)).ne'
  have hsum : Continuous fun z => ∑ p ∈ S ×ˢ B, attn W S B z a p.1 p.2 • val W δ p.1 p.2 :=
    continuous_finsetSum _ fun p _ => (hattn p.1 p.2).smul continuous_const
  exact (((continuous_const.smul continuous_id).add (W.WO.continuous.comp hsum)).inner
    continuous_const).div_const _

/-- **Theorem 1(iii) for the interpreter.** Let the snap pick, at every state vector, a name of
the table with the largest logit. The snapped step `z ↦ c_{sel z}` is constant near every state
vector where the largest logit is unique, and its derivative is zero wherever it exists. -/
theorem snapped_step_locally_constant {S : Finset Nm} {B : Finset Lt} (hS : S.Nonempty)
    (hB : B.Nonempty) (δ : Nm → Lt → Nm) (a : Lt) (sel : Z → Nm)
    (hsel : ∀ z, sel z ∈ S ∧ ∀ m ∈ S, logit W S B δ z a m ≤ logit W S B δ z a (sel z)) :
    (∀ z₀ : Z, ∀ m₀ ∈ S, (∀ m ∈ S, m ≠ m₀ → logit W S B δ z₀ a m < logit W S B δ z₀ a m₀) →
      ∀ᶠ z in 𝓝 z₀, W.c (sel z) = W.c m₀) ∧
    ∀ z, DifferentiableAt ℝ (fun z => W.c (sel z)) z → fderiv ℝ (fun z => W.c (sel z)) z = 0 := by
  refine ⟨fun z₀ m₀ hm₀ hstrict => ?_, fun z hd => ?_⟩
  · filter_upwards [snap_eventually_eq (fun m _ => continuous_logit W hS hB δ a m) sel hsel hm₀
      hstrict] with z hz
    rw [hz]
  · refine fderiv_eq_zero_of_finite_range ((S.finite_toSet.image W.c).subset ?_) hd
    rintro _ ⟨z', rfl⟩
    exact ⟨sel z', (hsel z').1, rfl⟩

lemma exp_score_eq (z : Z) (a : Lt) (n s : Nm) (b : Lt) :
    exp (score W z a s b) = exp (score W z a n a) * (xw W z a n s * yw W z a n b) := by
  simp only [xw, yw, ← exp_add]
  congr 1
  simp only [score, inner_add_right, add_div]
  ring

/-! ### Theorem 2: four situations, one finite check -/

/-- **Theorem 2(a).** On a complete table the attention weight of row `(s, b)` is
`x_s y_b / (X Y)`: a distribution over names times a distribution over letters. -/
theorem attn_factorises (S : Finset Nm) (B : Finset Lt) (z : Z) (a : Lt) (n s : Nm) (b : Lt) :
    attn W S B z a s b = xw W z a n s * yw W z a n b /
      ((∑ s' ∈ S, xw W z a n s') * ∑ b' ∈ B, yw W z a n b') := by
  have hK : exp (score W z a n a) ≠ 0 := (exp_pos _).ne'
  have hden : ∑ p ∈ S ×ˢ B, exp (score W z a p.1 p.2)
      = exp (score W z a n a) * ((∑ s' ∈ S, xw W z a n s') * ∑ b' ∈ B, yw W z a n b') := by
    rw [sum_product, sum_mul_sum, mul_sum]
    refine sum_congr rfl fun s' _ => ?_
    rw [mul_sum]
    exact sum_congr rfl fun b' _ => exp_score_eq W z a n s' b'
  rw [attn, hden, exp_score_eq W z a n s b, mul_div_mul_left _ _ hK]

lemma sum_xw_pos {S : Finset Nm} (hS : S.Nonempty) (z : Z) (a : Lt) (n : Nm) :
    0 < ∑ s ∈ S, xw W z a n s :=
  sum_pos (fun _ _ => exp_pos _) hS

lemma sum_yw_pos {B : Finset Lt} (hB : B.Nonempty) (z : Z) (a : Lt) (n : Nm) :
    0 < ∑ b ∈ B, yw W z a n b :=
  sum_pos (fun _ _ => exp_pos _) hB

lemma attn_nonneg (S : Finset Nm) (B : Finset Lt) (z : Z) (a : Lt) (s : Nm) (b : Lt) :
    0 ≤ attn W S B z a s b :=
  div_nonneg (exp_pos _).le (sum_nonneg fun _ _ => (exp_pos _).le)

lemma sum_attn {S : Finset Nm} {B : Finset Lt} (hS : S.Nonempty) (hB : B.Nonempty) (z : Z)
    (a : Lt) : ∑ p ∈ S ×ˢ B, attn W S B z a p.1 p.2 = 1 := by
  have hpos : 0 < ∑ p ∈ S ×ˢ B, exp (score W z a p.1 p.2) :=
    sum_pos (fun _ _ => exp_pos _) (hS.product hB)
  simp only [attn, ← sum_div]
  exact div_self hpos.ne'

/-- The margin of `t` over `m` is the identity push plus the attention average of the row pushes. -/
lemma logit_sub_eq (S : Finset Nm) (B : Finset Lt) (δ : Nm → Lt → Nm) (z : Z) (a : Lt)
    (t m : Nm) :
    logit W S B δ z a t - logit W S B δ z a m = gI W z t m +
      ∑ p ∈ S ×ˢ B, attn W S B z a p.1 p.2 *
        (gN W t m p.1 + gL W t m p.2 + gT W t m (δ p.1 p.2)) := by
  have h1 : logit W S B δ z a t - logit W S B δ z a m
      = ⟪out W S B δ z a, W.c t - W.c m⟫ / W.sD := by
    rw [logit, logit, ← sub_div, ← inner_sub_right]
  have h2 : ⟪out W S B δ z a, W.c t - W.c m⟫ = W.tick * ⟪z, W.c t - W.c m⟫ +
      ∑ p ∈ S ×ˢ B, attn W S B z a p.1 p.2 *
        (⟪W.WO (W.VN (W.c p.1)), W.c t - W.c m⟫ + ⟪W.WO (W.VL (W.f p.2)), W.c t - W.c m⟫
          + ⟪W.WO (W.VT (W.c (δ p.1 p.2))), W.c t - W.c m⟫) := by
    simp only [out, val, inner_add_left, inner_smul_left, map_sum, map_smul, map_add, sum_inner,
      RCLike.conj_to_real]
  rw [h1, h2, add_div, sum_div]
  simp only [gI, gN, gL, gT]
  congr 1
  refine sum_congr rfl fun p _ => ?_
  ring

lemma weighted_sum_aux {ι κ : Type*} (S : Finset ι) (B : Finset κ) (g K : ℝ)
    (w x P : ι → κ → ℝ) (hw : ∀ s b, w s b * K = x s b)
    (hK : ∑ s ∈ S, ∑ b ∈ B, x s b = K) :
    (g + ∑ s ∈ S, ∑ b ∈ B, w s b * P s b) * K = ∑ s ∈ S, ∑ b ∈ B, x s b * (P s b + g) := by
  calc (g + ∑ s ∈ S, ∑ b ∈ B, w s b * P s b) * K
      = g * K + ∑ s ∈ S, ∑ b ∈ B, (w s b * K) * P s b := by
        rw [add_mul, sum_mul]
        congr 1
        refine sum_congr rfl fun s _ => ?_
        rw [sum_mul]
        refine sum_congr rfl fun b _ => ?_
        ring
    _ = g * (∑ s ∈ S, ∑ b ∈ B, x s b) + ∑ s ∈ S, ∑ b ∈ B, x s b * P s b := by
        rw [hK]
        simp only [hw]
    _ = ∑ s ∈ S, ∑ b ∈ B, x s b * (P s b + g) := by
        rw [mul_sum, ← sum_add_distrib]
        refine sum_congr rfl fun s _ => ?_
        rw [mul_sum, ← sum_add_distrib]
        refine sum_congr rfl fun b _ => ?_
        ring

/-- **Theorem 2(b).** `(ℓ_t − ℓ_m) X Y = Σ_{s∈S} Σ_{b∈B} x_s y_b [g_N(s) + g_L(b) + g_T(δ(s,b)) + g_I]`. -/
theorem margin_mul_eq {S : Finset Nm} {B : Finset Lt} (hS : S.Nonempty) (hB : B.Nonempty)
    (δ : Nm → Lt → Nm) (z : Z) (a : Lt) (n t m : Nm) :
    (logit W S B δ z a t - logit W S B δ z a m) * (∑ s ∈ S, xw W z a n s) *
        (∑ b ∈ B, yw W z a n b) =
      ∑ s ∈ S, ∑ b ∈ B, xw W z a n s * yw W z a n b *
        (gN W t m s + gL W t m b + gT W t m (δ s b) + gI W z t m) := by
  have hXY : (∑ s ∈ S, xw W z a n s) * (∑ b ∈ B, yw W z a n b) ≠ 0 :=
    (mul_pos (sum_xw_pos W hS z a n) (sum_yw_pos W hB z a n)).ne'
  rw [logit_sub_eq, sum_product, mul_assoc]
  exact weighted_sum_aux S B (gI W z t m)
    ((∑ s ∈ S, xw W z a n s) * ∑ b ∈ B, yw W z a n b) (fun s b => attn W S B z a s b)
    (fun s b => xw W z a n s * yw W z a n b)
    (fun s b => gN W t m s + gL W t m b + gT W t m (δ s b))
    (fun s b => by
      show attn W S B z a s b * _ = xw W z a n s * yw W z a n b
      rw [attn_factorises W S B z a n s b, div_mul_cancel₀ _ hXY])
    (sum_mul_sum _ _ _ _).symm

/-- **Theorem 2(c).** The sum splits into the four situations: the matching row (weight 1),
same-state rows (weights `y_b`), same-letter rows (weights `x_s`) and rows that differ in both. -/
theorem four_situations [DecidableEq Nm] [DecidableEq Lt] {S : Finset Nm} {B : Finset Lt} {n : Nm} {a : Lt} (hn : n ∈ S)
    (ha : a ∈ B) (x : Nm → ℝ) (y : Lt → ℝ) (hx : x n = 1) (hy : y a = 1) (φ : Nm → Lt → ℝ) :
    ∑ s ∈ S, ∑ b ∈ B, x s * y b * φ s b = φ n a + ∑ b ∈ B.erase a, y b * φ n b
      + ∑ s ∈ S.erase n, x s * φ s a + ∑ s ∈ S.erase n, ∑ b ∈ B.erase a, x s * y b * φ s b := by
  have hsplit : ∀ s, ∑ b ∈ B, x s * y b * φ s b
      = x s * y a * φ s a + ∑ b ∈ B.erase a, x s * y b * φ s b :=
    fun s => (add_sum_erase B (fun b => x s * y b * φ s b) ha).symm
  simp only [hsplit]
  rw [← add_sum_erase S _ hn, sum_add_distrib]
  simp only [hx, hy, one_mul, mul_one]
  ring

/-- The bracket of Theorem 2(b): what row `(s, b)` adds, per unit weight, to the margin of `t`
over `m`. -/
noncomputable def bracket (δ : Nm → Lt → Nm) (z : Z) (t m s : Nm) (b : Lt) : ℝ :=
  gN W t m s + gL W t m b + gT W t m (δ s b) + gI W z t m

omit [NormedAddCommGroup Z] [InnerProductSpace ℝ Z] in
/-- If at every state and letter of the table the right name has the strictly largest logit, then
any argmax selection runs every word over `B` exactly. -/
theorem exact_of_margins {S : Finset Nm} {B : Finset Lt} (δ : Nm → Lt → Nm)
    (hδ : ∀ s ∈ S, ∀ b ∈ B, δ s b ∈ S) {s₀ : Nm} (hs₀ : s₀ ∈ S) (ℓ : Nm → Lt → Nm → ℝ)
    (sel : Nm → Lt → Nm) (hsel : ∀ n b, sel n b ∈ S ∧ ∀ m ∈ S, ℓ n b m ≤ ℓ n b (sel n b))
    (hmargin : ∀ n ∈ S, ∀ b ∈ B, ∀ m ∈ S, m ≠ δ n b → ℓ n b m < ℓ n b (δ n b)) :
    ∀ w : List Lt, (∀ b ∈ w, b ∈ B) → w.foldl sel s₀ = w.foldl δ s₀ := by
  have hreach : ∀ u : List Lt, (∀ b ∈ u, b ∈ B) → u.foldl δ s₀ ∈ S := by
    intro u hu
    induction u using List.reverseRecOn with
    | nil => exact hs₀
    | append_singleton u b ih =>
      simp only [List.foldl_append, List.foldl_cons, List.foldl_nil]
      exact hδ _ (ih fun c hc => hu c (List.mem_append_left _ hc)) b
        (hu b (List.mem_append_right _ (List.mem_singleton_self b)))
  have hstep : ∀ n ∈ S, ∀ b ∈ B, sel n b = δ n b := by
    intro n hn b hb
    by_contra hne
    have h1 := hmargin n hn b hb (sel n b) (hsel n b).1 hne
    have h2 := (hsel n b).2 (δ n b) (hδ n hn b hb)
    linarith
  exact (regeneration δ sel s₀ B).mpr fun u hu b hb => hstep _ (hreach u hu) b hb

/-- The largest sum of at most `k` of the values `g` on `V` (the sum of the `k` largest when the
values are non-negative). -/
noncomputable def topSum {α : Type*} (V : Finset α) (g : α → ℝ) (k : ℕ) : ℝ :=
  (V.powerset.filter fun T => T.card ≤ k).sup' ⟨∅, by simp⟩ fun T => ∑ i ∈ T, g i

lemma sum_le_topSum {α : Type*} {V T : Finset α} (g : α → ℝ) {k : ℕ} (hT : T ⊆ V)
    (hk : T.card ≤ k) : ∑ i ∈ T, g i ≤ topSum V g k :=
  le_sup' (fun T => ∑ i ∈ T, g i) (by simp [hT, hk])

lemma topSum_nonneg {α : Type*} (V : Finset α) (g : α → ℝ) (k : ℕ) : 0 ≤ topSum V g k := by
  simpa using sum_le_topSum g (empty_subset V) (Nat.zero_le k)

/-- The leak of a table with at most `N` names is at most the vocabulary's `N − 1` largest. -/
lemma leak_le_topSum {α : Type*} [DecidableEq α] {S V : Finset α} (hSV : S ⊆ V) {N : ℕ}
    (hN : S.card ≤ N) {n : α} (hn : n ∈ S) (x : α → ℝ) (hx : x n = 1) :
    ∑ s ∈ S, x s ≤ 1 + topSum (V.erase n) x (N - 1) := by
  rw [← add_sum_erase S x hn, hx]
  gcongr
  exact sum_le_topSum x (erase_subset_erase n hSV) (by rw [card_erase_of_mem hn]; omega)

/-- **Theorem 2(d), the factorised bound.** For a query `(n, a)` with right name `t = δ(n, a)`
and competitor `m`, on any table whose names and letters come from the vocabulary `(VN, VL)` and
whose leaks are at most `X⁺`, `Y⁺`: `ℓ_t − ℓ_m ≥ g_I + (1 − λ) R₀ − λ Ω`, with
`Ω = −(min g_N + min g_L + min g_T)` over the vocabulary, `R₀ = g_N(n) + g_L(a) + g_T(t)` and
`λ = 1 − 1/((1 + X⁺)(1 + Y⁺))`. -/
theorem factorised_bound [DecidableEq Nm] [DecidableEq Lt] {VN : Finset Nm} {VL : Finset Lt} (hVN : VN.Nonempty) (hVL : VL.Nonempty)
    {S : Finset Nm} {B : Finset Lt} (hSV : S ⊆ VN) (hBV : B ⊆ VL) (δ : Nm → Lt → Nm)
    (hδ : ∀ s ∈ S, ∀ b ∈ B, δ s b ∈ S) {n : Nm} {a : Lt} (hn : n ∈ S) (ha : a ∈ B) (m : Nm)
    {Xp Yp : ℝ} (hX : ∑ s ∈ S, xw W (W.c n) a n s ≤ 1 + Xp)
    (hY : ∑ b ∈ B, yw W (W.c n) a n b ≤ 1 + Yp) :
    gI W (W.c n) (δ n a) m
        + (1 - (1 - 1 / ((1 + Xp) * (1 + Yp))))
          * (gN W (δ n a) m n + gL W (δ n a) m a + gT W (δ n a) m (δ n a))
        - (1 - 1 / ((1 + Xp) * (1 + Yp)))
          * -(VN.inf' hVN (gN W (δ n a) m) + VL.inf' hVL (gL W (δ n a) m)
            + VN.inf' hVN (gT W (δ n a) m))
      ≤ logit W S B δ (W.c n) a (δ n a) - logit W S B δ (W.c n) a m := by
  set t := δ n a with ht
  set Ω := -(VN.inf' hVN (gN W t m) + VL.inf' hVL (gL W t m) + VN.inf' hVN (gT W t m))
  set R₀ := gN W t m n + gL W t m a + gT W t m t
  set P : Nm × Lt → ℝ := fun p => gN W t m p.1 + gL W t m p.2 + gT W t m (δ p.1 p.2)
  set w : Nm × Lt → ℝ := fun p => attn W S B (W.c n) a p.1 p.2
  have hS : S.Nonempty := ⟨n, hn⟩
  have hB : B.Nonempty := ⟨a, ha⟩
  have hna : (n, a) ∈ S ×ˢ B := mem_product.mpr ⟨hn, ha⟩
  have hPlow : ∀ p ∈ S ×ˢ B, -Ω ≤ P p := by
    intro p hp
    obtain ⟨hp1, hp2⟩ := mem_product.mp hp
    have h1 := inf'_le (gN W t m) (hSV hp1)
    have h2 := inf'_le (gL W t m) (hBV hp2)
    have h3 := inf'_le (gT W t m) (hSV (hδ p.1 hp1 p.2 hp2))
    simp only [P, Ω, neg_neg]
    linarith
  have hR₀ : R₀ + Ω ≥ 0 := by
    have := hPlow (n, a) hna
    simp only [P] at this
    change -Ω ≤ R₀ at this
    linarith
  have hw0 : w (n, a) = 1 / ((∑ s ∈ S, xw W (W.c n) a n s) * ∑ b ∈ B, yw W (W.c n) a n b) := by
    simp only [w, attn_factorises W S B (W.c n) a n, xw_self, yw_self, one_mul]
  have hXpos := sum_xw_pos W hS (W.c n) a n
  have hYpos := sum_yw_pos W hB (W.c n) a n
  have hw0ge : 1 / ((1 + Xp) * (1 + Yp)) ≤ w (n, a) := by
    rw [hw0]
    apply one_div_le_one_div_of_le (mul_pos hXpos hYpos)
    exact mul_le_mul hX hY hYpos.le (hXpos.le.trans hX)
  have hsum1 : ∑ p ∈ S ×ˢ B, w p = 1 := sum_attn W hS hB (W.c n) a
  have hmargin := logit_sub_eq W S B δ (W.c n) a t m
  have hsplit : ∑ p ∈ S ×ˢ B, w p * P p
      = w (n, a) * R₀ + ∑ p ∈ (S ×ˢ B).erase (n, a), w p * P p := by
    rw [← add_sum_erase _ _ hna]
  have hrest : -Ω * (1 - w (n, a)) ≤ ∑ p ∈ (S ×ˢ B).erase (n, a), w p * P p := by
    have hsumrest : ∑ p ∈ (S ×ˢ B).erase (n, a), w p = 1 - w (n, a) := by
      rw [← hsum1, ← add_sum_erase _ _ hna]
      ring
    rw [← hsumrest, mul_sum]
    refine sum_le_sum fun p hp => ?_
    rw [mul_comm]
    exact mul_le_mul_of_nonneg_left (hPlow p (mem_of_mem_erase hp))
      (attn_nonneg W S B (W.c n) a p.1 p.2)
  have hmain : (1 / ((1 + Xp) * (1 + Yp))) * (R₀ + Ω) - Ω ≤ ∑ p ∈ S ×ˢ B, w p * P p := by
    rw [hsplit]
    have : (1 / ((1 + Xp) * (1 + Yp))) * (R₀ + Ω) ≤ w (n, a) * (R₀ + Ω) :=
      mul_le_mul_of_nonneg_right hw0ge hR₀
    nlinarith
  rw [hmargin]
  change gI W (W.c n) t m + (1 - (1 - 1 / ((1 + Xp) * (1 + Yp)))) * R₀
      - (1 - 1 / ((1 + Xp) * (1 + Yp))) * Ω ≤ gI W (W.c n) t m + ∑ p ∈ S ×ˢ B, w p * P p
  nlinarith

/-- The factorised certificate of a vocabulary quadruple `(n, a, t, m)` for tables with at most
`N` names and `A` letters: computed from the vocabulary alone. -/
noncomputable def factBound [DecidableEq Nm] [DecidableEq Lt] {VN : Finset Nm} {VL : Finset Lt} (hVN : VN.Nonempty)
    (hVL : VL.Nonempty) (N A : ℕ) (n : Nm) (a : Lt) (t m : Nm) : ℝ :=
  gI W (W.c n) t m
    + (1 - (1 - 1 / ((1 + topSum (VN.erase n) (xw W (W.c n) a n) (N - 1))
        * (1 + topSum (VL.erase a) (yw W (W.c n) a n) (A - 1)))))
      * (gN W t m n + gL W t m a + gT W t m t)
    - (1 - 1 / ((1 + topSum (VN.erase n) (xw W (W.c n) a n) (N - 1))
        * (1 + topSum (VL.erase a) (yw W (W.c n) a n) (A - 1))))
      * -(VN.inf' hVN (gN W t m) + VL.inf' hVL (gL W t m) + VN.inf' hVN (gT W t m))

/-- **Theorem 2(d), the certificate.** If the factorised bound is positive for every vocabulary
quadruple, then on every table with at most `N` names and `A` letters from the vocabulary the
snapped interpreter (any argmax selection `sel`) runs every word of every length exactly. -/
theorem certified_tables_exact [DecidableEq Nm] [DecidableEq Lt] {VN : Finset Nm} {VL : Finset Lt} (hVN : VN.Nonempty)
    (hVL : VL.Nonempty) {N A : ℕ}
    (hcert : ∀ n ∈ VN, ∀ a ∈ VL, ∀ t ∈ VN, ∀ m ∈ VN, m ≠ t → 0 < factBound W hVN hVL N A n a t m)
    {S : Finset Nm} {B : Finset Lt} (hSV : S ⊆ VN) (hBV : B ⊆ VL) (hN : S.card ≤ N)
    (hA : B.card ≤ A) (δ : Nm → Lt → Nm) (hδ : ∀ s ∈ S, ∀ b ∈ B, δ s b ∈ S) {s₀ : Nm}
    (hs₀ : s₀ ∈ S) (sel : Nm → Lt → Nm)
    (hsel : ∀ n b, sel n b ∈ S ∧ ∀ m ∈ S, logit W S B δ (W.c n) b m ≤ logit W S B δ (W.c n) b (sel n b)) :
    ∀ w : List Lt, (∀ b ∈ w, b ∈ B) → w.foldl sel s₀ = w.foldl δ s₀ := by
  refine exact_of_margins δ hδ hs₀ (fun n b m => logit W S B δ (W.c n) b m) sel hsel ?_
  intro n hn b hb m hm hmt
  have hbd := factorised_bound W hVN hVL hSV hBV δ hδ hn hb m
    (leak_le_topSum hSV hN hn _ (xw_self W (W.c n) b n))
    (leak_le_topSum hBV hA hb _ (yw_self W (W.c n) b n))
  have hpos := hcert n (hSV hn) b (hBV hb) (δ n b) (hSV (hδ n hn b hb)) m (hSV hm) hmt
  simp only [factBound] at hpos
  show logit W S B δ (W.c n) b m < logit W S B δ (W.c n) b (δ n b)
  linarith

/-! ### Theorem 2(d), the role-split bound

INTERP.md describes this bound in words; what it certifies with is `_split_rows` in
`interp_run.py` (`07ccf3f9`), and the statements below follow that code. -/

/-- The smallest sum of at most `k` of the values `g` on `V` (the sum of the `k` most negative when
the values are non-positive). -/
noncomputable def botSum {α : Type*} (V : Finset α) (g : α → ℝ) (k : ℕ) : ℝ :=
  -topSum V (fun i => -g i) k

lemma botSum_le_sum {α : Type*} {V T : Finset α} (g : α → ℝ) {k : ℕ} (hT : T ⊆ V)
    (hk : T.card ≤ k) : botSum V g k ≤ ∑ i ∈ T, g i := by
  have h := sum_le_topSum (fun i => -g i) hT hk
  rw [sum_neg_distrib] at h
  rw [botSum]
  linarith

/-- `h = min_r g_T(r) + g_I`: the least that a row's destination and the identity add to its
bracket. -/
noncomputable def hFloor {VN : Finset Nm} (hVN : VN.Nonempty) (n t m : Nm) : ℝ :=
  VN.inf' hVN (gT W t m) + gI W (W.c n) t m

/-- `β(g) = g + g_L(a) + h + G + Y⁺ min(0, g + h)`: per unit of its leak, a lower bound on what a
leaked source with source push `g` adds through its same-letter row and its cross rows. `G` is the
most negative sum of at most `A − 1` of the terms `min(0, y_b g_L(b))`, and `Y⁺` the top sum of
`A − 1` letter leaks. -/
noncomputable def splitBeta [DecidableEq Lt] {VN : Finset Nm} (hVN : VN.Nonempty) (VL : Finset Lt)
    (A : ℕ) (n : Nm) (a : Lt) (t m : Nm) (g : ℝ) : ℝ :=
  g + gL W t m a + hFloor W hVN n t m
    + botSum (VL.erase a) (fun b => min 0 (yw W (W.c n) a n b * gL W t m b)) (A - 1)
    + topSum (VL.erase a) (yw W (W.c n) a n) (A - 1) * min 0 (g + hFloor W hVN n t m)

/-- The role-split bound of a vocabulary quadruple `(n, a, t, m)` for tables with at most `N` names
and `A` letters, with head names `H`: `R_m + LB + HS + min(0, β(min g_N)) TS`. `R_m` is the matching
row's bracket; `LB` charges the same-state rows; `HS` charges the head names one by one;
`TS`, the top sum of `N − 1` leaks outside the head, is charged the worst source push. -/
noncomputable def splitBound [DecidableEq Nm] [DecidableEq Lt] {VN : Finset Nm}
    (hVN : VN.Nonempty) (VL : Finset Lt) (H : Finset Nm) (N A : ℕ) (n : Nm) (a : Lt) (t m : Nm) :
    ℝ :=
  (gN W t m n + gL W t m a + gT W t m t + gI W (W.c n) t m)
    + botSum (VL.erase a)
        (fun b => min 0 (yw W (W.c n) a n b * (gN W t m n + hFloor W hVN n t m + gL W t m b)))
        (A - 1)
    + botSum (H.erase n)
        (fun s => xw W (W.c n) a n s * min 0 (splitBeta W hVN VL A n a t m (gN W t m s))) (N - 1)
    + min 0 (splitBeta W hVN VL A n a t m (VN.inf' hVN (gN W t m)))
      * topSum ((VN.erase n) \ H) (xw W (W.c n) a n) (N - 1)

lemma splitBeta_mono [DecidableEq Lt] {VN : Finset Nm} (hVN : VN.Nonempty) (VL : Finset Lt)
    (A : ℕ) (n : Nm) (a : Lt) (t m : Nm) {g g' : ℝ} (hg : g ≤ g') :
    splitBeta W hVN VL A n a t m g ≤ splitBeta W hVN VL A n a t m g' := by
  have hY := topSum_nonneg (VL.erase a) (yw W (W.c n) a n) (A - 1)
  have := mul_le_mul_of_nonneg_left
    (min_le_min (le_refl 0) (by linarith : g + hFloor W hVN n t m ≤ g' + hFloor W hVN n t m)) hY
  simp only [splitBeta]
  linarith

/-- **Theorem 2(d), the role-split bound.** For a query `(n, a)` with right name `t = δ(n, a)` and
competitor `m`, on any table with at most `N` names and `A` letters from the vocabulary, and for
any set `H` of head names: `splitBound ≤ (ℓ_t − ℓ_m) X Y`. -/
theorem split_bound [DecidableEq Nm] [DecidableEq Lt] {VN : Finset Nm} (hVN : VN.Nonempty)
    {VL : Finset Lt} (H : Finset Nm) {N A : ℕ} {S : Finset Nm} {B : Finset Lt} (hSV : S ⊆ VN)
    (hBV : B ⊆ VL) (hN : S.card ≤ N) (hA : B.card ≤ A) (δ : Nm → Lt → Nm)
    (hδ : ∀ s ∈ S, ∀ b ∈ B, δ s b ∈ S) {n : Nm} {a : Lt} (hn : n ∈ S) (ha : a ∈ B) (m : Nm) :
    splitBound W hVN VL H N A n a (δ n a) m ≤
      (logit W S B δ (W.c n) a (δ n a) - logit W S B δ (W.c n) a m)
        * (∑ s ∈ S, xw W (W.c n) a n s) * (∑ b ∈ B, yw W (W.c n) a n b) := by
  have hS : S.Nonempty := ⟨n, hn⟩
  have hB : B.Nonempty := ⟨a, ha⟩
  have hsplit : (logit W S B δ (W.c n) a (δ n a) - logit W S B δ (W.c n) a m)
        * (∑ s ∈ S, xw W (W.c n) a n s) * (∑ b ∈ B, yw W (W.c n) a n b)
      = bracket W δ (W.c n) (δ n a) m n a
        + ∑ b ∈ B.erase a, yw W (W.c n) a n b * bracket W δ (W.c n) (δ n a) m n b
        + ∑ s ∈ S.erase n, xw W (W.c n) a n s * bracket W δ (W.c n) (δ n a) m s a
        + ∑ s ∈ S.erase n, ∑ b ∈ B.erase a,
            xw W (W.c n) a n s * yw W (W.c n) a n b * bracket W δ (W.c n) (δ n a) m s b := by
    rw [margin_mul_eq W hS hB δ (W.c n) a n (δ n a) m]
    exact four_situations hn ha _ _ (xw_self W (W.c n) a n) (yw_self W (W.c n) a n)
      (bracket W δ (W.c n) (δ n a) m)
  rw [hsplit, splitBound]
  set t := δ n a with ht
  set x := xw W (W.c n) a n with hx
  set y := yw W (W.c n) a n with hy
  set φ := bracket W δ (W.c n) t m with hφ
  set hf := hFloor W hVN n t m with hhf
  set Yp := topSum (VL.erase a) y (A - 1) with hYp
  set G := botSum (VL.erase a) (fun b => min 0 (y b * gL W t m b)) (A - 1) with hG
  set β := splitBeta W hVN VL A n a t m with hβ
  have hxpos : ∀ s, 0 < x s := fun s => exp_pos _
  have hypos : ∀ b, 0 < y b := fun b => exp_pos _
  have hcardB : (B.erase a).card ≤ A - 1 := by rw [card_erase_of_mem ha]; omega
  have hcardS : (S.erase n).card ≤ N - 1 := by rw [card_erase_of_mem hn]; omega
  have hrow : ∀ s ∈ S, ∀ b ∈ B, gN W t m s + gL W t m b + hf ≤ φ s b := by
    intro s hs b hb
    have := inf'_le (gT W t m) (hSV (hδ s hs b hb))
    simp only [hφ, bracket, hhf, hFloor]
    linarith
  have hφna : φ n a = gN W t m n + gL W t m a + gT W t m t + gI W (W.c n) t m := rfl
  have hLB : botSum (VL.erase a) (fun b => min 0 (y b * (gN W t m n + hf + gL W t m b))) (A - 1)
      ≤ ∑ b ∈ B.erase a, y b * φ n b := by
    refine (botSum_le_sum _ (erase_subset_erase a hBV) hcardB).trans (sum_le_sum fun b hb => ?_)
    have := mul_le_mul_of_nonneg_left (hrow n hn b (mem_of_mem_erase hb)) (hypos b).le
    exact (min_le_right _ _).trans (by linarith)
  have hYb0 : 0 ≤ ∑ b ∈ B.erase a, y b := sum_nonneg fun b _ => (hypos b).le
  have hYb : ∑ b ∈ B.erase a, y b ≤ Yp := sum_le_topSum y (erase_subset_erase a hBV) hcardB
  have hcol : ∀ s ∈ S, β (gN W t m s) ≤ φ s a + ∑ b ∈ B.erase a, y b * φ s b := by
    intro s hs
    have hrows : ∑ b ∈ B.erase a, (y b * (gN W t m s + hf) + min 0 (y b * gL W t m b))
        ≤ ∑ b ∈ B.erase a, y b * φ s b := by
      refine sum_le_sum fun b hb => ?_
      have := mul_le_mul_of_nonneg_left (hrow s hs b (mem_of_mem_erase hb)) (hypos b).le
      have := min_le_right 0 (y b * gL W t m b)
      linarith
    rw [sum_add_distrib, ← sum_mul] at hrows
    have hGle : G ≤ ∑ b ∈ B.erase a, min 0 (y b * gL W t m b) :=
      botSum_le_sum _ (erase_subset_erase a hBV) hcardB
    have h1 : (∑ b ∈ B.erase a, y b) * min 0 (gN W t m s + hf)
        ≤ (∑ b ∈ B.erase a, y b) * (gN W t m s + hf) :=
      mul_le_mul_of_nonneg_left (min_le_right _ _) hYb0
    have h2 : Yp * min 0 (gN W t m s + hf) ≤ (∑ b ∈ B.erase a, y b) * min 0 (gN W t m s + hf) :=
      mul_le_mul_of_nonpos_right hYb (min_le_left _ _)
    have h3 := hrow s hs a ha
    simp only [hβ, splitBeta, ← hhf]
    linarith
  have hcols : ∑ s ∈ S.erase n, x s * min 0 (β (gN W t m s))
      ≤ ∑ s ∈ S.erase n, x s * φ s a + ∑ s ∈ S.erase n, ∑ b ∈ B.erase a, x s * y b * φ s b := by
    rw [← sum_add_distrib]
    refine sum_le_sum fun s hs => ?_
    have h := mul_le_mul_of_nonneg_left
      ((min_le_right 0 _).trans (hcol s (mem_of_mem_erase hs))) (hxpos s).le
    have he : x s * φ s a + ∑ b ∈ B.erase a, x s * y b * φ s b
        = x s * (φ s a + ∑ b ∈ B.erase a, y b * φ s b) := by
      rw [mul_add, mul_sum]
      congr 1
      exact sum_congr rfl fun b _ => by ring
    rw [he]
    exact h
  have hhead : botSum (H.erase n) (fun s => x s * min 0 (β (gN W t m s))) (N - 1)
      ≤ ∑ s ∈ S.erase n ∩ H, x s * min 0 (β (gN W t m s)) := by
    refine botSum_le_sum _ ?_ ((card_le_card inter_subset_left).trans hcardS)
    intro s hs
    obtain ⟨hs1, hs2⟩ := mem_inter.mp hs
    exact mem_erase.mpr ⟨ne_of_mem_erase hs1, hs2⟩
  have htail : min 0 (β (VN.inf' hVN (gN W t m))) * topSum ((VN.erase n) \ H) x (N - 1)
      ≤ ∑ s ∈ S.erase n \ H, x s * min 0 (β (gN W t m s)) := by
    have hle : ∑ s ∈ S.erase n \ H, x s ≤ topSum ((VN.erase n) \ H) x (N - 1) :=
      sum_le_topSum x (sdiff_subset_sdiff (erase_subset_erase n hSV) (le_refl H))
        ((card_le_card sdiff_subset).trans hcardS)
    calc min 0 (β (VN.inf' hVN (gN W t m))) * topSum ((VN.erase n) \ H) x (N - 1)
        ≤ min 0 (β (VN.inf' hVN (gN W t m))) * ∑ s ∈ S.erase n \ H, x s :=
          mul_le_mul_of_nonpos_left hle (min_le_left _ _)
      _ = ∑ s ∈ S.erase n \ H, x s * min 0 (β (VN.inf' hVN (gN W t m))) := by
          rw [mul_sum]
          exact sum_congr rfl fun s _ => mul_comm _ _
      _ ≤ ∑ s ∈ S.erase n \ H, x s * min 0 (β (gN W t m s)) := by
          refine sum_le_sum fun s hs => mul_le_mul_of_nonneg_left (min_le_min (le_refl 0) ?_)
            (hxpos s).le
          exact splitBeta_mono W hVN VL A n a t m
            (inf'_le _ (hSV (mem_of_mem_erase (mem_sdiff.mp hs).1)))
  have hparts := sum_inter_add_sum_sdiff (S.erase n) H (fun s => x s * min 0 (β (gN W t m s)))
  linarith

/-- With a tolerance `τ ≥ 0`: if the role-split bound exceeds `τ (1 + X⁺)(1 + Y⁺)`, where `X⁺` and
`Y⁺` are the top sums of `N − 1` name leaks and `A − 1` letter leaks, the margin exceeds `τ`. -/
theorem split_margin_gt [DecidableEq Nm] [DecidableEq Lt] {VN : Finset Nm} (hVN : VN.Nonempty)
    {VL : Finset Lt} (H : Finset Nm) {N A : ℕ} {S : Finset Nm} {B : Finset Lt} (hSV : S ⊆ VN)
    (hBV : B ⊆ VL) (hN : S.card ≤ N) (hA : B.card ≤ A) (δ : Nm → Lt → Nm)
    (hδ : ∀ s ∈ S, ∀ b ∈ B, δ s b ∈ S) {n : Nm} {a : Lt} (hn : n ∈ S) (ha : a ∈ B) (m : Nm)
    {τ : ℝ} (hτ : 0 ≤ τ)
    (hpos : τ * ((1 + topSum (VN.erase n) (xw W (W.c n) a n) (N - 1))
        * (1 + topSum (VL.erase a) (yw W (W.c n) a n) (A - 1)))
      < splitBound W hVN VL H N A n a (δ n a) m) :
    τ < logit W S B δ (W.c n) a (δ n a) - logit W S B δ (W.c n) a m := by
  have hb := split_bound W hVN H hSV hBV hN hA δ hδ hn ha m
  have hX := leak_le_topSum hSV hN hn _ (xw_self W (W.c n) a n)
  have hY := leak_le_topSum hBV hA ha _ (yw_self W (W.c n) a n)
  have hXpos := sum_xw_pos W ⟨n, hn⟩ (W.c n) a n
  have hYpos := sum_yw_pos W ⟨a, ha⟩ (W.c n) a n
  have hXY := mul_le_mul_of_nonneg_left (mul_le_mul hX hY hYpos.le (hXpos.le.trans hX)) hτ
  rw [mul_assoc] at hb
  exact lt_of_mul_lt_mul_right (hXY.trans_lt (hpos.trans_le hb)) (mul_pos hXpos hYpos).le

/-- **Theorem 2(d), the role-split certificate.** Let `τ ≥ 0`, and let `H n a` be any head sets. If
the role-split bound exceeds `τ (1 + X⁺)(1 + Y⁺)` for every vocabulary quadruple with `m ≠ t`, then
on every table with at most `N` names and `A` letters from the vocabulary every margin exceeds
`τ`, and the snapped interpreter (any argmax selection `sel`) runs every word exactly. -/
theorem split_certified_tables_exact [DecidableEq Nm] [DecidableEq Lt] {VN : Finset Nm}
    (hVN : VN.Nonempty) {VL : Finset Lt} (H : Nm → Lt → Finset Nm) {N A : ℕ} {τ : ℝ}
    (hτ : 0 ≤ τ)
    (hcert : ∀ n ∈ VN, ∀ a ∈ VL, ∀ t ∈ VN, ∀ m ∈ VN, m ≠ t →
      τ * ((1 + topSum (VN.erase n) (xw W (W.c n) a n) (N - 1))
          * (1 + topSum (VL.erase a) (yw W (W.c n) a n) (A - 1)))
        < splitBound W hVN VL (H n a) N A n a t m)
    {S : Finset Nm} {B : Finset Lt} (hSV : S ⊆ VN) (hBV : B ⊆ VL) (hN : S.card ≤ N)
    (hA : B.card ≤ A) (δ : Nm → Lt → Nm) (hδ : ∀ s ∈ S, ∀ b ∈ B, δ s b ∈ S) {s₀ : Nm}
    (hs₀ : s₀ ∈ S) (sel : Nm → Lt → Nm)
    (hsel : ∀ n b, sel n b ∈ S ∧ ∀ m ∈ S, logit W S B δ (W.c n) b m ≤ logit W S B δ (W.c n) b (sel n b)) :
    (∀ n ∈ S, ∀ b ∈ B, ∀ m ∈ S, m ≠ δ n b →
        τ < logit W S B δ (W.c n) b (δ n b) - logit W S B δ (W.c n) b m) ∧
      ∀ w : List Lt, (∀ b ∈ w, b ∈ B) → w.foldl sel s₀ = w.foldl δ s₀ := by
  have hmar : ∀ n ∈ S, ∀ b ∈ B, ∀ m ∈ S, m ≠ δ n b →
      τ < logit W S B δ (W.c n) b (δ n b) - logit W S B δ (W.c n) b m :=
    fun n hn b hb m hm hmt => split_margin_gt W hVN (H n b) hSV hBV hN hA δ hδ hn hb m hτ
      (hcert n (hSV hn) b (hBV hb) (δ n b) (hSV (hδ n hn b hb)) m (hSV hm) hmt)
  refine ⟨hmar, exact_of_margins δ hδ hs₀ (fun n b m => logit W S B δ (W.c n) b m) sel hsel ?_⟩
  intro n hn b hb m hm hmt
  have := hmar n hn b hb m hm hmt
  show logit W S B δ (W.c n) b m < logit W S B δ (W.c n) b (δ n b)
  linarith

/-! ### Theorem 3: the size law -/

/-- **Theorem 3(a), homogeneous form, one query.** At a query `(n, a)` with right name
`t = δ(n, a)` and competitor `m`: let each same-letter row trail the matching row by at least `Δ_N`
and each same-state row by at least `Δ_L`, let the matching row's bracket be at least `R`, and let a
leaked row's harm (the negative part of its bracket, the identity push included) be at most `η_L`,
`η_N`, `η_X` in the three leaked situations. If
`(A−1) e^{−Δ_L} η_L + (N−1) e^{−Δ_N} η_N + (N−1)(A−1) e^{−(Δ_N+Δ_L)} η_X < R` with `N = |S|`,
`A = |B|`, then `ℓ_t > ℓ_m`. -/
theorem homogeneous_size_law [DecidableEq Nm] [DecidableEq Lt] {S : Finset Nm} {B : Finset Lt}
    (δ : Nm → Lt → Nm) {n : Nm} {a : Lt} (hn : n ∈ S) (ha : a ∈ B) (m : Nm)
    {ΔN ΔL R ηL ηN ηX : ℝ} (hηL : 0 ≤ ηL) (hηN : 0 ≤ ηN) (hηX : 0 ≤ ηX)
    (hxN : ∀ s ∈ S, s ≠ n → xw W (W.c n) a n s ≤ exp (-ΔN))
    (hyL : ∀ b ∈ B, b ≠ a → yw W (W.c n) a n b ≤ exp (-ΔL))
    (hR : R ≤ bracket W δ (W.c n) (δ n a) m n a)
    (hL : ∀ b ∈ B, b ≠ a → -ηL ≤ bracket W δ (W.c n) (δ n a) m n b)
    (hN : ∀ s ∈ S, s ≠ n → -ηN ≤ bracket W δ (W.c n) (δ n a) m s a)
    (hX : ∀ s ∈ S, s ≠ n → ∀ b ∈ B, b ≠ a → -ηX ≤ bracket W δ (W.c n) (δ n a) m s b)
    (hsize : ((B.card : ℝ) - 1) * exp (-ΔL) * ηL + ((S.card : ℝ) - 1) * exp (-ΔN) * ηN
      + ((S.card : ℝ) - 1) * ((B.card : ℝ) - 1) * exp (-(ΔN + ΔL)) * ηX < R) :
    logit W S B δ (W.c n) a m < logit W S B δ (W.c n) a (δ n a) := by
  set t := δ n a
  have hS : S.Nonempty := ⟨n, hn⟩
  have hB : B.Nonempty := ⟨a, ha⟩
  have hX0 := sum_xw_pos W hS (W.c n) a n
  have hY0 := sum_yw_pos W hB (W.c n) a n
  have h4 := (margin_mul_eq W hS hB δ (W.c n) a n t m).trans
    (four_situations hn ha (xw W (W.c n) a n) (yw W (W.c n) a n) (xw_self W (W.c n) a n)
      (yw_self W (W.c n) a n) (bracket W δ (W.c n) t m))
  have hcardB : ((B.erase a).card : ℝ) = (B.card : ℝ) - 1 := by
    have : 1 ≤ B.card := card_pos.mpr hB
    rw [card_erase_of_mem ha, Nat.cast_sub this, Nat.cast_one]
  have hcardS : ((S.erase n).card : ℝ) = (S.card : ℝ) - 1 := by
    have : 1 ≤ S.card := card_pos.mpr hS
    rw [card_erase_of_mem hn, Nat.cast_sub this, Nat.cast_one]
  have h1 : -(((B.card : ℝ) - 1) * exp (-ΔL) * ηL)
      ≤ ∑ b ∈ B.erase a, yw W (W.c n) a n b * bracket W δ (W.c n) t m n b := by
    have hconst : ∑ _b ∈ B.erase a, -(exp (-ΔL) * ηL)
        = -(((B.card : ℝ) - 1) * exp (-ΔL) * ηL) := by
      rw [sum_const, nsmul_eq_mul, hcardB]; ring
    rw [← hconst]
    refine sum_le_sum fun b hb => ?_
    obtain ⟨hba, hbB⟩ := mem_erase.mp hb
    have hy0 : 0 ≤ yw W (W.c n) a n b := (exp_pos _).le
    have e1 := mul_le_mul_of_nonneg_left (hL b hbB hba) hy0
    have e2 := mul_le_mul_of_nonneg_right (hyL b hbB hba) hηL
    linarith
  have h2 : -(((S.card : ℝ) - 1) * exp (-ΔN) * ηN)
      ≤ ∑ s ∈ S.erase n, xw W (W.c n) a n s * bracket W δ (W.c n) t m s a := by
    have hconst : ∑ _s ∈ S.erase n, -(exp (-ΔN) * ηN)
        = -(((S.card : ℝ) - 1) * exp (-ΔN) * ηN) := by
      rw [sum_const, nsmul_eq_mul, hcardS]; ring
    rw [← hconst]
    refine sum_le_sum fun s hs => ?_
    obtain ⟨hsn, hsS⟩ := mem_erase.mp hs
    have hx0 : 0 ≤ xw W (W.c n) a n s := (exp_pos _).le
    have e1 := mul_le_mul_of_nonneg_left (hN s hsS hsn) hx0
    have e2 := mul_le_mul_of_nonneg_right (hxN s hsS hsn) hηN
    linarith
  have h3 : -(((S.card : ℝ) - 1) * ((B.card : ℝ) - 1) * exp (-(ΔN + ΔL)) * ηX)
      ≤ ∑ s ∈ S.erase n, ∑ b ∈ B.erase a,
          xw W (W.c n) a n s * yw W (W.c n) a n b * bracket W δ (W.c n) t m s b := by
    have hconst : ∑ _s ∈ S.erase n, ∑ _b ∈ B.erase a, -(exp (-ΔN) * exp (-ΔL) * ηX)
        = -(((S.card : ℝ) - 1) * ((B.card : ℝ) - 1) * exp (-(ΔN + ΔL)) * ηX) := by
      rw [sum_const, sum_const, nsmul_eq_mul, nsmul_eq_mul, hcardS, hcardB, neg_add, exp_add]
      ring
    rw [← hconst]
    refine sum_le_sum fun s hs => sum_le_sum fun b hb => ?_
    obtain ⟨hsn, hsS⟩ := mem_erase.mp hs
    obtain ⟨hba, hbB⟩ := mem_erase.mp hb
    have hx0 : 0 ≤ xw W (W.c n) a n s := (exp_pos _).le
    have hy0 : 0 ≤ yw W (W.c n) a n b := (exp_pos _).le
    have hxy : xw W (W.c n) a n s * yw W (W.c n) a n b ≤ exp (-ΔN) * exp (-ΔL) :=
      mul_le_mul (hxN s hsS hsn) (hyL b hbB hba) hy0 (exp_pos _).le
    have e1 := mul_le_mul_of_nonneg_left (hX s hsS hsn b hbB hba) (mul_nonneg hx0 hy0)
    have e2 := mul_le_mul_of_nonneg_right hxy hηX
    linarith
  have hpos : 0 < (logit W S B δ (W.c n) a t - logit W S B δ (W.c n) a m) *
      (∑ s ∈ S, xw W (W.c n) a n s) * ∑ b ∈ B, yw W (W.c n) a n b := by
    rw [h4]
    linarith
  have h5 := (pos_iff_pos_of_mul_pos hpos).mpr hY0
  have h6 := (pos_iff_pos_of_mul_pos h5).mpr hX0
  linarith

/-- **Theorem 3(a), homogeneous form.** If the hypotheses of `homogeneous_size_law` hold at every
query of a table with `N = |S|` names and `A = |B|` letters (gaps, matching margin and harms with
uniform constants), then the snapped interpreter (any argmax selection) is exact on every word. -/
theorem homogeneous_exact [DecidableEq Nm] [DecidableEq Lt] {S : Finset Nm} {B : Finset Lt}
    (δ : Nm → Lt → Nm) (hδ : ∀ s ∈ S, ∀ b ∈ B, δ s b ∈ S) {s₀ : Nm} (hs₀ : s₀ ∈ S)
    (sel : Nm → Lt → Nm)
    (hsel : ∀ n b, sel n b ∈ S ∧
      ∀ m ∈ S, logit W S B δ (W.c n) b m ≤ logit W S B δ (W.c n) b (sel n b))
    {ΔN ΔL R ηL ηN ηX : ℝ} (hηL : 0 ≤ ηL) (hηN : 0 ≤ ηN) (hηX : 0 ≤ ηX)
    (hxN : ∀ n ∈ S, ∀ a ∈ B, ∀ s ∈ S, s ≠ n → xw W (W.c n) a n s ≤ exp (-ΔN))
    (hyL : ∀ n ∈ S, ∀ a ∈ B, ∀ b ∈ B, b ≠ a → yw W (W.c n) a n b ≤ exp (-ΔL))
    (hR : ∀ n ∈ S, ∀ a ∈ B, ∀ m ∈ S, m ≠ δ n a → R ≤ bracket W δ (W.c n) (δ n a) m n a)
    (hL : ∀ n ∈ S, ∀ a ∈ B, ∀ m ∈ S, m ≠ δ n a →
      ∀ b ∈ B, b ≠ a → -ηL ≤ bracket W δ (W.c n) (δ n a) m n b)
    (hN : ∀ n ∈ S, ∀ a ∈ B, ∀ m ∈ S, m ≠ δ n a →
      ∀ s ∈ S, s ≠ n → -ηN ≤ bracket W δ (W.c n) (δ n a) m s a)
    (hX : ∀ n ∈ S, ∀ a ∈ B, ∀ m ∈ S, m ≠ δ n a →
      ∀ s ∈ S, s ≠ n → ∀ b ∈ B, b ≠ a → -ηX ≤ bracket W δ (W.c n) (δ n a) m s b)
    (hsize : ((B.card : ℝ) - 1) * exp (-ΔL) * ηL + ((S.card : ℝ) - 1) * exp (-ΔN) * ηN
      + ((S.card : ℝ) - 1) * ((B.card : ℝ) - 1) * exp (-(ΔN + ΔL)) * ηX < R) :
    ∀ w : List Lt, (∀ b ∈ w, b ∈ B) → w.foldl sel s₀ = w.foldl δ s₀ :=
  exact_of_margins δ hδ hs₀ (fun n b m => logit W S B δ (W.c n) b m) sel hsel
    fun n hn a ha m hm hmt => homogeneous_size_law W δ hn ha m hηL hηN hηX (hxN n hn a ha)
      (hyL n hn a ha) (hR n hn a ha m hm hmt) (hL n hn a ha m hm hmt) (hN n hn a ha m hm hmt)
      (hX n hn a ha m hm hmt) hsize

/-- **Theorem 3(d), capacity.** With `z = c_n` and codes of norm `√D`, a name gap is at most
`κ_N ‖c_n − c_s‖ ≤ 2 κ_N √D`, `κ_N = (‖Q_N‖ + ‖Q_L‖) ‖K_N‖`. -/
theorem gapN_le (hD : 0 < W.sD) {n s : Nm} {a : Lt} (hcn : ‖W.c n‖ = W.sD) (hfa : ‖W.f a‖ = W.sD) :
    score W (W.c n) a n a - score W (W.c n) a s a ≤
      (‖W.QN‖ + ‖W.QL‖) * ‖W.KN‖ * ‖W.c n - W.c s‖ := by
  set q := W.QN (W.c n) + W.QL (W.f a)
  have hdiff : score W (W.c n) a n a - score W (W.c n) a s a = ⟪q, W.KN (W.c n - W.c s)⟫ / W.sD := by
    simp only [score, ← sub_div, ← inner_sub_right, map_sub]
    congr 2
    abel
  have hq : ‖q‖ ≤ (‖W.QN‖ + ‖W.QL‖) * W.sD := by
    calc ‖q‖ ≤ ‖W.QN (W.c n)‖ + ‖W.QL (W.f a)‖ := norm_add_le _ _
      _ ≤ ‖W.QN‖ * ‖W.c n‖ + ‖W.QL‖ * ‖W.f a‖ :=
        add_le_add (W.QN.le_opNorm _) (W.QL.le_opNorm _)
      _ = (‖W.QN‖ + ‖W.QL‖) * W.sD := by rw [hcn, hfa]; ring
  rw [hdiff, div_le_iff₀ hD]
  calc ⟪q, W.KN (W.c n - W.c s)⟫ ≤ ‖q‖ * ‖W.KN (W.c n - W.c s)‖ := real_inner_le_norm _ _
    _ ≤ ((‖W.QN‖ + ‖W.QL‖) * W.sD) * (‖W.KN‖ * ‖W.c n - W.c s‖) :=
        mul_le_mul hq (W.KN.le_opNorm _) (norm_nonneg _)
          (mul_nonneg (add_nonneg (norm_nonneg _) (norm_nonneg _)) hD.le)
    _ = (‖W.QN‖ + ‖W.QL‖) * ‖W.KN‖ * ‖W.c n - W.c s‖ * W.sD := by ring

/-- **Theorem 3(d) for letter gaps.** The letter gap needs `‖K_L‖`, not `‖K_N‖`:
`Δ_L(b) ≤ (‖Q_N‖ + ‖Q_L‖) ‖K_L‖ ‖f_a − f_b‖`. -/
theorem gapL_le (hD : 0 < W.sD) {n : Nm} {a b : Lt} (hcn : ‖W.c n‖ = W.sD)
    (hfa : ‖W.f a‖ = W.sD) :
    score W (W.c n) a n a - score W (W.c n) a n b ≤
      (‖W.QN‖ + ‖W.QL‖) * ‖W.KL‖ * ‖W.f a - W.f b‖ := by
  set q := W.QN (W.c n) + W.QL (W.f a)
  have hdiff : score W (W.c n) a n a - score W (W.c n) a n b = ⟪q, W.KL (W.f a - W.f b)⟫ / W.sD := by
    simp only [score, ← sub_div, ← inner_sub_right, map_sub]
    congr 2
    abel
  have hq : ‖q‖ ≤ (‖W.QN‖ + ‖W.QL‖) * W.sD := by
    calc ‖q‖ ≤ ‖W.QN (W.c n)‖ + ‖W.QL (W.f a)‖ := norm_add_le _ _
      _ ≤ ‖W.QN‖ * ‖W.c n‖ + ‖W.QL‖ * ‖W.f a‖ :=
        add_le_add (W.QN.le_opNorm _) (W.QL.le_opNorm _)
      _ = (‖W.QN‖ + ‖W.QL‖) * W.sD := by rw [hcn, hfa]; ring
  rw [hdiff, div_le_iff₀ hD]
  calc ⟪q, W.KL (W.f a - W.f b)⟫ ≤ ‖q‖ * ‖W.KL (W.f a - W.f b)‖ := real_inner_le_norm _ _
    _ ≤ ((‖W.QN‖ + ‖W.QL‖) * W.sD) * (‖W.KL‖ * ‖W.f a - W.f b‖) :=
        mul_le_mul hq (W.KL.le_opNorm _) (norm_nonneg _)
          (mul_nonneg (add_nonneg (norm_nonneg _) (norm_nonneg _)) hD.le)
    _ = (‖W.QN‖ + ‖W.QL‖) * ‖W.KL‖ * ‖W.f a - W.f b‖ * W.sD := by ring

/-- **Theorem 3(d), the `2κ√D` form.** With every code of norm `√D`, `Δ_N(s) ≤ 2κ_N√D` and
`Δ_L(b) ≤ 2κ_L√D`, `κ_N = (‖Q_N‖ + ‖Q_L‖)‖K_N‖`, `κ_L = (‖Q_N‖ + ‖Q_L‖)‖K_L‖`. -/
theorem gaps_le_two_kappa (hD : 0 < W.sD) {n s : Nm} {a b : Lt} (hcn : ‖W.c n‖ = W.sD)
    (hcs : ‖W.c s‖ = W.sD) (hfa : ‖W.f a‖ = W.sD) (hfb : ‖W.f b‖ = W.sD) :
    score W (W.c n) a n a - score W (W.c n) a s a ≤ 2 * ((‖W.QN‖ + ‖W.QL‖) * ‖W.KN‖) * W.sD ∧
      score W (W.c n) a n a - score W (W.c n) a n b ≤
        2 * ((‖W.QN‖ + ‖W.QL‖) * ‖W.KL‖) * W.sD := by
  have hk : ∀ K : Z →L[ℝ] Z, 0 ≤ (‖W.QN‖ + ‖W.QL‖) * ‖K‖ := fun K =>
    mul_nonneg (add_nonneg (norm_nonneg _) (norm_nonneg _)) (norm_nonneg _)
  have hcd : ‖W.c n - W.c s‖ ≤ 2 * W.sD := by
    calc ‖W.c n - W.c s‖ ≤ ‖W.c n‖ + ‖W.c s‖ := norm_sub_le _ _
      _ = 2 * W.sD := by rw [hcn, hcs]; ring
  have hfd : ‖W.f a - W.f b‖ ≤ 2 * W.sD := by
    calc ‖W.f a - W.f b‖ ≤ ‖W.f a‖ + ‖W.f b‖ := norm_sub_le _ _
      _ = 2 * W.sD := by rw [hfa, hfb]; ring
  constructor
  · calc _ ≤ (‖W.QN‖ + ‖W.QL‖) * ‖W.KN‖ * ‖W.c n - W.c s‖ := gapN_le W hD hcn hfa
      _ ≤ (‖W.QN‖ + ‖W.QL‖) * ‖W.KN‖ * (2 * W.sD) := mul_le_mul_of_nonneg_left hcd (hk _)
      _ = _ := by ring
  · calc _ ≤ (‖W.QN‖ + ‖W.QL‖) * ‖W.KL‖ * ‖W.f a - W.f b‖ := gapL_le W hD hcn hfa
      _ ≤ (‖W.QN‖ + ‖W.QL‖) * ‖W.KL‖ * (2 * W.sD) := mul_le_mul_of_nonneg_left hfd (hk _)
      _ = _ := by ring

end Polyformer.Interp
