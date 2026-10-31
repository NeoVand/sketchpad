import Polyformer.Pinned

/-!
# The pinned tick is decoding under a cache policy (BIGIDEA H2, policy TOK)

The policy: keep Π's cache as a sink; decode the state token alone at position `|Π|` (it sees Π
and itself), writing its entries to the cache; decode the event token alone at `|Π| + 1` (it sees
Π, the state and itself) and read the logits there; then evict both, so the next tick starts again
from Π's cache with positions restarting at `|Π|`. This is token-by-token decoding of the stream
`s₀ e₁ s₁ e₂ …`, where each `sᵢ` is the argmax at `eᵢ`'s position.

- `decodeStep_eq_prefill`: decoding one token on Π's cache leaves the cache of Π ++ [s] (by
  `cache_sound`).
- `policy_tick_eq`: the policy's logits are the pinned two-token tick's,
  `cachedForward D (prefill D Π) |Π| [s, e]`, and both are `forward D (Π ++ [s, e])`. The proof is
  `cachedForward_eq` applied twice, to Π ++ [s] with block `[e]` and to Π with block `[s, e]`.
- `policyRun_eq_pinned`, `policy_regeneration`: the policy's run is the pinned clock's run, so
  Theorem P holds for it, with the certificate taken on either path.

All in exact arithmetic. On hardware the two paths use different kernel shapes: BIGIDEA measured
max |Δ logit| 0.375 between them and no argmax difference, and each path is bitwise equal to its own
certificate. Which path is certified must match the path that runs (Corollary P2).
-/

namespace Polyformer.Pinned

section Policy

variable {Tok H V : Type*} [Inhabited Tok] (D : CausalDecoder Tok H V)

/-- Decode one token `x` at position `P` on a cache: the cache afterwards holds the old entries
below `P` and the new token's residuals at `P`. -/
def decodeStep (cache : ℕ → ℕ → H) (P : ℕ) (x : Tok) : ℕ → ℕ → H := cachedResid D cache P [x]

/-- One tick under the policy: the state alone at `|Π|` on Π's cache, then the event alone at
`|Π| + 1` on the cache that holds the state; the logits at the event's position. Each tick starts
from Π's cache (eviction) at the same positions (restart). -/
def policyLogits (prog : List Tok) (s e : Tok) : V :=
  cachedForward D (decodeStep D (prefill D prog) prog.length s) (prog.length + 1) [e]

/-- Decoding the state token on Π's cache leaves exactly the cache of Π ++ [s]. -/
theorem decodeStep_eq_prefill (prog : List Tok) (s : Tok) :
    decodeStep D (prefill D prog) prog.length s = prefill D (prog ++ [s]) := by
  funext ℓ p
  exact cache_sound D prog [s] ℓ p

/-- **The cache policy computes the pinned tick.** Token-by-token decoding under the policy gives
the logits of the pinned two-token block on Π's cache, and both are the logits of Π ++ [s, e]. -/
theorem policy_tick_eq (prog : List Tok) (s e : Tok) :
    policyLogits D prog s e = cachedForward D (prefill D prog) prog.length [s, e] ∧
      policyLogits D prog s e = forward D (prog ++ [s, e]) := by
  have h1 : policyLogits D prog s e = forward D (prog ++ [s] ++ [e]) := by
    rw [policyLogits, decodeStep_eq_prefill]
    have := cachedForward_eq D (prog ++ [s]) [e]
    simpa using this
  have h2 : forward D (prog ++ [s] ++ [e]) = forward D (prog ++ [s, e]) := by simp
  refine ⟨?_, h1.trans h2⟩
  rw [h1, h2, cachedForward_eq]

/-- The policy's run: each state is the argmax at the event's position. -/
def policyTrace (sel : V → Tok) (prog : List Tok) (s₀ : Tok) (tape : List Tok) : List Tok :=
  tape.scanl (fun s e => sel (policyLogits D prog s e)) s₀

/-- The policy's run is the pinned clock's run (`pinned_regeneration_decoder`'s clock). -/
theorem policyRun_eq_pinned (sel : V → Tok) (prog : List Tok) (s₀ : Tok) (tape : List Tok) :
    policyTrace D sel prog s₀ tape =
      tape.scanl (tick (fun p blk => sel (cachedForward D (prefill D p) p.length blk)) prog) s₀ := by
  simp only [policyTrace, (policy_tick_eq D _ _ _).1]
  rfl

/-- **Theorem P for the cache policy.** If the policy's own certificate (or, equivalently in exact
arithmetic, the pinned block's) passes on a closed `Q × B`, the policy's run is the table's on every
tape over `B`. -/
theorem policy_regeneration (sel : V → Tok) {prog : List Tok} {δ : Tok → Tok → Tok} {s₀ : Tok}
    {Q B : Set Tok} (hQ : ClosedFrom δ B s₀ Q)
    (hcert : ∀ s ∈ Q, ∀ e ∈ B, sel (policyLogits D prog s e) = δ s e)
    (tape : List Tok) (htape : ∀ e ∈ tape, e ∈ B) :
    policyTrace D sel prog s₀ tape = tape.scanl δ s₀ :=
  scanl_eq_of_closed hQ hcert tape htape

end Policy

end Polyformer.Pinned
