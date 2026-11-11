# The math, in plain words

Everything in Soul Network that decides *who* and *what* is a vector or a matrix operation. No model is asked "who should do this?". That is deliberate:

- **Fast and cheap.** Scoring a thousand sessions against a request is one matrix multiply, well under a millisecond on a laptop.
- **Deterministic.** The same inputs give the same owner every time, so a decision can be replayed and audited.
- **Explainable.** Every score is a number you can print next to the session that produced it.

Language models are used for two things only: turning text into vectors, and writing drafts. Deciding, splitting, confirming and permitting are all plain arithmetic.

Each section below gives the idea in words, then the formula, then a tiny example you can check by hand. Code lives in `soul.js` and `algorithms.js`; `node test.js` checks the claims.

---

## Notation

| Symbol | Meaning |
|---|---|
| `d` | Length of a vector (the embedding size) |
| `S` | Session matrix, one row per session, `d` columns |
| `q` | The vector of one part of a new request |
| `r` | Scores, one per session |
| `c_u` | One person's summary vector (their centroid) |
| `M_role` | A role's mask over the draft's fields |
| `C` | Collaboration matrix, role × role |
| `P` | Permission matrix, role × action |
| `·` | Dot product; for unit vectors this is the cosine similarity |

All vectors are normalized to length 1 before use, so a dot product is a number from −1 to 1 that says "how similar".

---

## Part 1 · Turning work into vectors

### 1.1 Embedding

**In words.** A piece of text becomes a list of `d` numbers. Texts about the same thing get lists that point the same way.

The prototype uses the simplest possible embedding: count how many times each word from a fixed vocabulary appears, then scale the list to length 1. `soul.js` calls this `embed()`. A real deployment replaces that one function with an embedding model. Nothing else in the repo changes.

**Example** with vocabulary `[travel, slot, exam, claim]`:

| Text | Counts | Normalized |
|---|---|---|
| "confirm travel dates for the travel plan" | `[2, 0, 0, 0]` | `[1, 0, 0, 0]` |
| "book a slot, then confirm travel" | `[1, 1, 0, 0]` | `[0.71, 0.71, 0, 0]` |

### 1.2 One session, many vectors

**In words.** A session usually covers several topics. If you average the whole session into one vector, a long chat about scheduling with one paragraph about insurance ends up looking like neither.

So a session is split into chunks and each chunk gets its own row in `S`. A session is "about" something if *any* of its chunks is. The table in a real build is `session_chunks(id, session_id, chunk_index, embedding)`, not `session_vectors(session_id)`.

---

## Part 2 · Finding the owner

### 2.1 Score every session at once

**In words.** Stack all session vectors into a matrix. Multiply by the request vector. Out comes one score per session.

```
r = S · q
```

**Example.** Three sessions, vocabulary `[travel, slot, exam]`, request "which exam":

```
S = [ [1, 0, 0],       q = [0, 0, 1]       r = S·q = [0, 0, 1]
      [0, 1, 0],
      [0, 0, 1] ]
```

The third session scores 1, the others 0. In `soul.js` this is `matVec(S, embed(query))`.

### 2.2 Many parts at once

**In words.** A request usually has several parts. Stack the part vectors into a matrix `Q` and do one multiply instead of a loop.

```
R = Q · Sᵀ          (parts × sessions)
```

### 2.3 From sessions to people

**In words.** People, not sessions, own work. Each person's score for a part is the score of their *best* chunk.

```
score(part, person) = max over that person's sessions of r
```

Why the maximum and not the average: one session where someone actually solved this exact problem matters more than ten unrelated ones that pull the average down. The prototype's heatmap on slide 3 is exactly this table: parts down the side, roles across the top, the brightest cell in each row framed as the owner.

### 2.4 Nobody matches: say so

**In words.** If the best score for a part is below a threshold, there is no owner. The system must say "no one here has done this" and hand the part to a person, rather than pick the least-bad match.

```
owner = argmax  if max score ≥ τ_route,  else NONE → ask a human
```

This is the single most important honesty rule in routing. A router that always returns someone is a router that is sometimes confidently wrong.

### 2.5 Recent work counts more

**In words.** Someone who handled refunds a year ago but has done only frontend work since should slowly stop being "the refunds person". Each session's weight halves every `h` days.

```
c_u = normalize( Σ_j  w_j · e_j ),     w_j = exp(−λ · age_j),     λ = ln 2 / h
```

**Example** with half-life `h = 30` days: a session from today weighs 1.0, one from 30 days ago 0.5, one from 90 days ago 0.125. `algorithms.js` → `decayCentroid()`.

### 2.6 One person, several specialties

**In words.** Averaging a person who knows both finance and Python gives a vector that looks like neither. Instead, cluster their chunks into a few groups (k-means with k = 3 to 5) and keep one centroid per group. A person's score is the best of their centroids.

```
score(q, u) = max_i  q · c_{u,i}
```

### 2.7 Two stages when the company is big

**In words.** With ten people, compare the request to every chunk. With a thousand, first compare it to each person's centroids (one row per person, fast), keep the top few people, then compare to only *their* chunks.

### 2.8 Suggest different people, not three of the same

**In words.** The top three scores might be three people who all did the same thing. MMR (maximal marginal relevance) picks each next person by relevance minus similarity to the people already picked.

```
next = argmax_u [ λ · sim(q, u) − (1 − λ) · max_{v already picked} sim(u, v) ]
```

`λ = 1` is "most relevant only"; `λ = 0` is "most different only". `algorithms.js` → `mmr()`.

---

## Part 3 · Splitting the draft

### 3.1 The draft is a vector of fields

**In words.** Once the AI has written the full draft, think of it as a list of fields: travel dates, time slot, exam list, coverage. A confirmer should receive only the fields they are responsible for.

A role's mask `M_role` is a diagonal matrix of 0s and 1s, one per field. Multiplying picks the role's fields and zeroes the rest:

```
slice_role = M_role · draft
```

**Example.** Fields `[dates, slot, exams, coverage]`, the doctor owns `exams`:

```
M_doctor = diag(0, 0, 1, 0)
M_doctor · [dates, slot, exams, coverage] = [0, 0, exams, 0]
```

In `soul.js`, `maskFor(role, owners)` builds the diagonal and `sliceFor()` applies it. A zero does not mean "blurred": the field is never put into that person's slice at all.

### 3.2 Nothing lost, nothing shown twice

**In words.** If every field has exactly one confirmer, the masks add up to the identity matrix. That is a one-line check that the split is complete and has no overlaps.

```
Σ_role M_role = I     ⇒     Σ_role M_role · draft = draft
```

`test.js` asserts this ("confirmer masks add up to the identity"). If someday one field needs two confirmers, the sum will have a 2 on that diagonal and the check fails on purpose: then a rule must say what "confirmed" means for that field (both sign, or either).

### 3.3 The requester's mask

The requester is allowed to see everything, so their mask is the identity. This is read from the permission matrix (Part 7), not hard-coded.

---

## Part 4 · Building a team

### 4.1 Cover every requirement

**In words.** A request may need skills no single person has. Split it into requirement vectors `r_1 … r_n`. A team `T` covers them well if each requirement has at least one strong person in `T`.

```
f(T) = Σ_i  max_{u ∈ T}  sim(r_i, c_u)
```

Add people one at a time, each time the one who raises `f` the most, and stop when nobody adds enough. Because `f` is *submodular* (each extra person helps less than the last), this greedy choice is guaranteed to reach at least 63% (1 − 1/e) of the best possible team, and in practice usually far more.

**Example.** Requirements `[x, z]`; people A = `x`, B = `y`, C = `z`. Greedy picks A (gain 1), then C (gain 1), then stops because B adds 0. `algorithms.js` → `greedyTeam()`.

### 4.2 Give each subtask to one person

**In words.** Once the team is chosen, match subtasks to people one-to-one, cheapest overall. "Cost" is distance plus a penalty for how busy the person already is, so work spreads out.

```
cost[i][j] = 1 − sim(subtask_i, c_j) + α · load_j
```

Then solve the assignment problem. `algorithms.js` → `assign()` tries every permutation, which is exact and fine up to 8 subtasks. Production uses the Hungarian algorithm (`scipy.optimize.linear_sum_assignment`) which does the same thing in `O(n³)`. If a person can take several subtasks, duplicate their column once per extra slot.

---

## Part 5 · Keeping the task on track

### 5.1 Do not solve the same request twice

**In words.** When two requests are nearly identical (similarity above `τ_dup`), link them. Linked requests form groups; one piece of work serves the whole group.

`algorithms.js` → `duplicateGroups()` uses union-find. **Caution:** similar text is not the same task. Before merging, the data version, the permissions and the expected output format must match too.

### 5.2 Vectors find conflicts, rules judge them

**In words.** "Ship it today" and "do not ship" have very similar vectors, because they are about the same thing. Similarity therefore cannot tell you whether two instructions *disagree*. What it can do is narrow the field: a high score means "these are about the same thing, check them". The checking is done by rules (same field, same version, different content → conflict) or by a small natural-language-inference model, never by the vector score alone.

### 5.3 Notice when the plan drifts

**In words.** Keep the vector of the original goal `g`. As the plan evolves, embed the current plan `p_t`. If they move apart past a threshold, alert the task owner.

```
drift_t = 1 − cos(p_t, g)        alert if drift_t > τ_drift
```

`algorithms.js` → `drift()`.

---

## Part 6 · Learning who works with whom

### 6.1 The collaboration matrix

**In words.** Every time a confirmation lands, add one to the cell for (requester, confirmer) and its mirror. Over time `C` records who actually works with whom.

```
C ← C + ΔC,   ΔC symmetric, one 1 in each of the two mirrored cells
```

`soul.js` → `recordCollaboration()`. Slide 7 shows `C` filling in as the four confirmations arrive.

### 6.2 Who is the hub

**In words.** The person everyone goes through is the one with the largest entry in the main eigenvector of `C`. Found by multiplying `C` by a vector over and over (power iteration). A single very high value is a warning: that person is a bottleneck and a single point of failure.

```
C · x = λ_max · x
```

`algorithms.js` → `centrality()`.

### 6.3 Feeding `C` back into routing (planned, not built)

**In words.** The idea is to nudge routing toward people the requester already works well with:

```
score'(part, u) = score(part, u) + β · Ĉ[requester][u]
```

with `Ĉ` row-normalized and `β` small. This is **not** in the prototype, and it must earn its place: the validation plan includes an ablation that turns it off. If it does not change completion time, it stays out.

### 6.4 Learning from accepted and declined requests

**In words.** Replace the plain cosine with a learned bilinear score:

```
s(q, u) = qᵀ · W · c_u,       W = I at the start
```

Each accepted collaboration pulls `W` toward the pairs that worked; each decline pushes it away. Over time the router learns that "questions like this go to this kind of person", even when the words differ. Keep `W` low-rank (`W = U·Vᵀ`) so it cannot memorize individuals.

---

## Part 7 · What must never be learned

**In words.** There are two different questions, and they get two different matrices:

| Question | Matrix | Changes how |
|---|---|---|
| Who is *good at* this? | Capability: `S`, centroids, `C`, `W` | Learned from work, automatically |
| Who is *allowed to* do this? | Permission: `P` (role × action) | Set by a person, through an explicit event, never by code |

Someone who confirms twenty invoices becomes the obvious person to ask about invoices. They do not thereby gain the right to approve a bank transfer. In `soul.js` the permission object is frozen, the routing code only reads it, and `test.js` checks that writing to it throws.

Every read of `P` goes through one function, `can(person, action, resource)`, that denies by default. There is no second path.

---

## Part 8 · Privacy, stated honestly

### 8.1 Rotating vectors is not encryption

Multiplying every vector by the same random rotation `R` keeps all distances the same, so search still works. But anyone who obtains a handful of (text, rotated vector) pairs can solve for `R` with Procrustes (Part 9) and undo it. Rotation is obfuscation. It must not be described to customers as a security guarantee.

### 8.2 What the honest claim is

Session vectors sit in one index that only the router can search. That protection is access control plus an audit log, not cryptography: the people who run the router can technically reach the index. The phrase we use is "employees and agents cannot access other people's sessions; every cross-person lookup is authorized and logged".

### 8.3 Capability cards

The cleaner design, planned for the product: each person's secretary summarizes their sessions into short "capability cards" ("handles refunds", "debugs webhooks"). The person approves each card. Only approved cards enter the cross-person index; raw session vectors never do. Discovery then touches only what the person agreed to share, and the "I know you did this" leak from a raw-session search disappears.

### 8.4 Publishing group summaries

If a department-level centroid is ever shown outside the department, add calibrated Gaussian noise (differential privacy). For groups of two or three people, noise is not enough; do not publish.

---

## Part 9 · Operations

### 9.1 Changing the embedding model

Re-embedding every session is expensive. Encode a sample with both the old and new model (`X` old, `Y` new) and find the rotation that best maps one onto the other:

```
W* = argmin_{WᵀW = I} ‖X·W − Y‖     →     XᵀY = U·Σ·Vᵀ,   W* = U·Vᵀ
```

Old vectors times `W*` are a usable approximation of new ones during the transition. Requires both models to have the same `d`, and must be tested, not assumed. `algorithms.js` → `rotation2d()` shows the 2-D case.

### 9.2 Scale

- 5 to 100 people: exact search over every chunk. No index. The whole matrix multiply is microseconds.
- Thousands of people: an approximate index (HNSW). **Pitfall:** approximate indexes fetch the top-k first and apply permission filters after, so a filtered query can come back short or empty. Use iterative scanning or one index per organization.
- Only if storage actually hurts: PCA or a Matryoshka-style model to shrink `d`, then int8 quantization.

---

## Part 10 · Starting values

These are starting guesses. The validation plan (`docs/validation.md`) is what turns them into numbers we trust.

| Setting | Default | Meaning |
|---|---|---|
| `d` | model-defined | Embedding length |
| `h` | 90 days | Half-life for session weight |
| `k` | 3 | Centroids per person |
| `τ_route` | 0.35 | Below this, no owner; ask a human |
| `τ_dup` | 0.85 | Above this, two requests are candidate duplicates |
| `τ_drift` | 0.40 | Above this, alert the task owner |
| `λ_mmr` | 0.7 | Relevance vs. diversity when suggesting people |
| `α` | 0.2 | Load penalty in assignment cost |
| `β` | 0.1 | Weight of collaboration history in routing (planned) |

---

## What is in the prototype and what is not

| Section | In `soul.js` / `algorithms.js` | Tested in `test.js` |
|---|---|---|
| 1.1 Embedding (toy) | yes | indirectly |
| 2.1 `r = S·q` | yes | yes |
| 2.3 Max per role | yes | yes |
| 2.4 No-owner threshold | no | — |
| 2.5 Decay centroid | yes | yes |
| 2.6 k-means centroids | no | — |
| 2.8 MMR | yes | yes |
| 3.1–3.3 Masks | yes | yes |
| 4.1 Greedy team | yes | yes |
| 4.2 Assignment | brute force ≤ 8 | yes |
| 5.1 Duplicate groups | yes | yes |
| 5.3 Drift | yes | yes |
| 6.1 `C` | yes | yes |
| 6.2 Centrality | yes | yes |
| 6.3, 6.4 Learned routing | no | — |
| 7 Frozen `P` | yes | yes |
| 9.1 Procrustes | 2-D only | yes |
