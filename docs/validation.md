# How we check that it works

Asking people "would you like an AI secretary?" proves nothing; almost everyone says yes. The question we test is narrower: **does work that stalls today finish faster, with nobody seeing what they should not, when Soul Network is in the loop?**

Five levels, from cheapest to most convincing. Every level says what it can and cannot prove.

## Level 1 · The math keeps its promises (automated, runs now)

```bash
node test.js
```

Nineteen checks. What they prove: the formulas do what `docs/math.md` says, on fictional data.

| Promise | Check |
|---|---|
| Each part routes to the right role | owners are Patient, Front desk, Doctor, Insurer |
| Routing is deterministic | two runs give identical scores |
| The requester never becomes a confirmer | owners exclude Requester |
| Every field has exactly one confirmer | confirmer masks sum to the identity |
| A confirmer never receives another field's text | slice JSON does not contain the hidden values |
| A confirmation is bound to a version | hash changes when one character changes |
| Collaboration never touches permissions | `P` is byte-identical after `recordCollaboration` |
| Code cannot change permissions | writing to `P` throws |
| Decay, team coverage, assignment, duplicates, drift, centrality, MMR, Procrustes | one worked example each |

What this level cannot prove: that real embeddings route real requests correctly, or that any of this saves anyone time.

## Level 2 · Scenario tests (scripted, to build next)

A fixed set of fictional companies and requests, replayed end to end through the protocol. Each scenario has an expected outcome.

| # | Scenario | Expected |
|---|---|---|
| 1 | One request, four confirmers | Four receipts, one delivery, each confirmer saw one field |
| 2 | A confirmer edits their field | Version bumps; only that field's confirmation is invalidated |
| 3 | A stale confirmation arrives | `STALE`, no receipt written |
| 4 | The best candidate declines | The next candidate is offered; the requester never learns of the decline |
| 5 | Nobody scores above the threshold | `NO_OWNER`; a human assigns; no guess is made |
| 6 | Two owners send `DIRECT` to one field, same version | `CONFLICT`; nothing written until the owner decides |
| 7 | Five people steer one task over fifty commands | Zero commands lost; the ledger replays to the same final draft |
| 8 | A task is recalled mid-flight | All pending slices expire; late confirmations are rejected |
| 9 | Two near-identical requests | Grouped; one piece of work; both requesters delivered |
| 10 | The plan drifts from the goal | `DRIFT_ALERT` before delivery |

## Level 3 · Trying to break it (adversarial, to build next)

Twenty deliberate attempts to see what one should not. Pass bar: **20 of 20 blocked**, and every attempt visible in the ledger.

| Attempt | Expected |
|---|---|
| A confirmer asks their secretary for another role's slice | `UNAUTHORIZED` |
| A confirmer replays an old `CONFIRM` after an edit | `STALE` |
| A requester sends many `FIND`s to map who knows what | Rate limit; no near-miss list ever returned |
| A requester asks "who declined?" | Not available; only acceptances are reported |
| A secretary sends `DIRECT` for a field it does not own | `UNAUTHORIZED` |
| A secretary sends `GRANT` without a person's instruction | `UNAUTHORIZED`; grants require a person-originated event |
| A task is built where one field has two owners | The mask-sum check fails before any slice is sent |
| A model's "merge proposal" is submitted as a `DIRECT` | Rejected; proposals never write |
| Someone reads the ledger without a reason | The read is refused or itself logged |
| An admin reads a session index entry | Logged with reason; visible to the company's audit view |

The remaining attempts are variations of these across roles and versions.

## Level 4 · Does the math actually help? (ablation)

The vector router is the part that is easiest to be proud of and hardest to justify. So we test it against the dumbest alternative.

| Arm | Routing |
|---|---|
| A | Router picks owners with `r = S·q` |
| B | A manager assigns owners by hand |
| C | Owners are chosen at random from plausible roles |

Same requests, same confirmers, same drafts. Measure time to delivery and number of re-routes. If A is not clearly faster than B, the router is infrastructure, not the product, and the pitch changes.

The same treatment applies later to feeding the collaboration matrix back into routing (`docs/math.md` §6.3): it ships only if turning it off makes things measurably worse.

## Level 5 · People and money (pilot)

### Interviews first

Twenty companies of 5 to 100 people. Three questions, nothing else:

1. Which cross-team sign-off makes you wait the most?
2. How do you handle it today?
3. Where are the rules for it written down?

Purpose: confirm that the pain is real and find the one flow to start with. If the answer to question 3 is usually "nowhere, and we like it that way", that is the biggest risk in the business model, found early.

### Pilot measurements

One flow, three companies, in the chat tool they already use. The system runs in **shadow mode** first: it proposes owners and slices but a person still does everything by hand. We compare its proposals to what people actually did.

| Measure | How |
|---|---|
| Right owner | Proposed owner equals the person who actually handled it |
| Time to completion | Timestamp of request to timestamp of delivery, before vs. after going live |
| Human interventions | Count of manual re-routes, re-explanations and chasers |
| Leaks | Any field reaching a person outside its mask, from the ledger |
| Willingness to pay | A signed paid trial, not a verbal yes |

### Pass bars

| Check | Target |
|---|---|
| Right owner found | 18 of 20 test requests |
| Five people steering one task | No instruction lost |
| Out-of-scope access | 20 of 20 blocked |
| Nothing delivered before every slice is confirmed | Always |
| Time to completion | At least 30% lower than the current process |
| Willingness to pay | At least 2 of 10 companies sign a paid trial |

These are targets we set before running anything. None has been met yet.

### Sample size, stated plainly

Small samples flatter. If we see zero routing errors in 20 requests, the honest statement is "we have not seen an error yet", not "the error rate is under 5%". To claim an error rate at or below 5% with 95% confidence from zero observed errors, we need at least 59 independent requests. Reports will say which it is.

## Reporting rules

- **"Not run" and "ran, found nothing" are different sentences.** Every report says which one applies to each check.
- A pass is reported with the command and its output, not a summary.
- A failure is reported as a failure. A failed check does not become a "known limitation" without a dated decision.
- Fictional data is labeled fictional in every table that contains it.

## Status today

| Level | State |
|---|---|
| 1 · Math | Runs: `node test.js`, 19 of 19 pass |
| 2 · Scenarios | Specified, not built |
| 3 · Adversarial | Specified, not built |
| 4 · Ablation | Designed, not run |
| 5 · Interviews and pilot | Not started |
