# Soul Network

**Multiplayer AI for teams** (YC Request for Startups, Fall 2026: Multiplayer AI). Every person has an AI secretary. When a request needs several people, Soul Network finds who owns each part, sends each person only their own slice to confirm, and gives the requester the full result with a record of who confirmed what.

> Status: prototype built at c0mpiled-18 Taipei (2026-11-11). The product is in planning. All data in this repo is fictional; only roles appear, never people.

## The problem

Everyone at work has an AI now, but each one works alone. Work still stalls on finding the right person, re-explaining context, and waiting for sign-off.

## The idea, in one healthcare example

Request: *Prepare a visit plan for an overseas patient.* It needs four confirmations:

| Part | Confirmed by |
|---|---|
| Travel dates | Patient |
| Time slot | Front desk |
| Exam list | Doctor |
| Coverage | Insurer |

1. **Route.** Every past session is a vector. Stack them into a matrix `S`. For each part of the request, `r = S·q` scores every session; each role's score is its best session. The highest score owns the part.
2. **Split.** The AI drafts the whole plan. A diagonal 0/1 mask `M_role` selects each confirmer's fields: `slice = M_role · draft`. Fields outside the mask are never sent to that confirmer.
3. **Confirm.** Each confirmation is bound to a hash of the exact slice it approved. Edit the slice and the old confirmation no longer matches.
4. **Deliver.** Only the requester sees the whole report. Because each field has exactly one owner, the masks sum to the identity: `draft = Σ M_role · draft`.
5. **Accumulate.** Every confirmation adds to a role-by-role collaboration matrix `C ← C + ΔC`. Feeding `C` back into routing is planned, not built.
6. **Permissions stay separate.** The permission matrix `P` is set by people. Nothing in the routing or learning code writes to it.

## What this prototype actually does

- `soul.js` runs the real math in plain JavaScript: toy keyword embeddings, `r = S·q`, owner selection, masks, slice hashes, and the collaboration matrix.
- `slides.html` is a 90-second auto-playing walkthrough whose charts are computed live by `soul.js`, with English captions.
- Embeddings are a bag of keywords over a fixed vocabulary. A real deployment swaps `embed()` for an embedding model.
- Subtask decomposition is hand-written in this demo.

## What it does not do yet (design goals)

- Authorized, audited cross-person lookups. Today nobody can read another person's sessions in this demo because there is no storage at all, not because of an audit system.
- Using `C` to improve routing.
- Real AI secretaries, real users, any network calls.

## Run it

No install, no network. Open `slides.html` in a browser, or:

```bash
python -m http.server 8000
# then open http://localhost:8000/slides.html
```

Keys: `Space` play / pause, `←` `→` previous / next, `R` restart, `C` captions on / off.

## How we would validate it (targets, not results)

| Check | Target |
|---|---|
| Right owner found | 18 of 20 test requests |
| Out-of-scope access attempts blocked | 20 of 20 |
| Nothing delivered before every slice is confirmed | always |
| Time to complete vs. today's process | at least 30% faster |

## First pilot

Planned as a B2B2C cross-border collaboration.

## Thanks

Thanks to NewDawn Health for inspiring this idea.

Independent hackathon project. Not a NewDawn Health product; no NewDawn Health data, code or systems were used.

## License

MIT
