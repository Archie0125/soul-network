# Soul Network

**Multiplayer AI for teams.** Built for YC's Request for Startups, Fall 2026: *Multiplayer AI*.

Every person has an AI secretary. When a request needs several people, Soul Network finds who owns each part, sends each person only the slice they need to confirm, and gives the requester the full result with a record of who confirmed what, on which version.

> **Status:** prototype built at c0mpiled-18 Taipei on 2026-11-11. The product is in planning. All data in this repo is fictional; only roles appear, never people.

**Demo video (89 s):** [watch on YouTube](https://www.youtube.com/watch?v=h6or_s2vEaQ) · [download mp4](media/soul-network-demo.mp4)

[![Soul Network demo video](https://img.youtube.com/vi/h6or_s2vEaQ/hqdefault.jpg)](https://www.youtube.com/watch?v=h6or_s2vEaQ)

---

## 1. The problem

Everyone at work has an AI now, but each one works alone.

- **Finding the right person** still happens by asking around.
- **Context gets re-explained** every time work crosses a team.
- **Sign-off waits** on people who only needed to check one line.
- **Solved problems get solved again**, because one person's AI session is invisible to everyone else.

The cost is not tokens. It is coordination time: chasing, re-explaining, and waiting.

## 2. The concept

### One shared task, many human owners, one AI secretary each

Multiplayer AI is not ten people typing into one chat, and it is not ten agents giving each other orders. It is:

- **One shared task** that several people can steer.
- **Multiple human owners**, each accountable for a defined part.
- **A personal AI secretary per person**, acting for that person and only within that person's authority.

### Every session becomes discoverable experience

Each person's past AI sessions are turned into vectors. When new work arrives, a trusted router compares it against the whole team's experience to find who has actually done this kind of work before, instead of relying on an org chart or a self-written skills list. The router returns **who**, never **what they said**.

### Private context, distributed verification

1. **Anyone asks.** For example: *prepare a visit plan for an overseas patient.*
2. **Route.** The router finds the owner of each part.
3. **Draft.** The AI prepares the whole draft, with sources and open questions.
4. **Split.** The draft is cut into slices. Each confirmer receives only the fields they must check.
5. **Confirm.** Each person's AI secretary asks them to approve, reject or correct their slice.
6. **Deliver.** Only the requester sees the assembled result, with a receipt for every part: which role confirmed it, when, and against which version.

In healthcare, one request can need four different confirmations:

| Part | Confirmed by | What they never see |
|---|---|---|
| Travel dates | Patient | Clinical details beyond their own plan |
| Time slot | Front desk | Exam list, insurance terms |
| Exam list | Doctor | Travel and payment details |
| Coverage | Insurer | Scheduling details |

### It is linear algebra underneath

| Object | Shape | Meaning |
|---|---|---|
| Session matrix `S` | sessions × d | Every past session as a vector |
| Request vector `q` | d | One part of a new request |
| Scores `r = S·q` | sessions | How close each past session is to this part |
| Mask `M_role` | fields × fields, diagonal 0/1 | Which fields a role may see: `slice = M_role · draft` |
| Collaboration matrix `C` | roles × roles | Who has worked with whom: `C ← C + ΔC` after each confirmation |
| Permission matrix `P` | roles × actions | Who may do what. Set by people, never learned |

Because every field has exactly one owner, the masks sum to the identity: `draft = Σ M_role · draft`. Nothing is lost, and nothing is shown twice.

**Two matrices, two rules.** Capability can be learned: the more people work together, the better the system knows who owns what. Authority cannot: a person who confirms twenty invoices becomes the obvious person to ask, but never gains the right to approve a bank transfer unless a person grants it.

### Conflicts are decided by rules, not by a model

- Every slice has exactly one writer.
- An approval is bound to the hash of the exact version it approved. Change the content and the approval no longer matches.
- Two direct instructions to the same field on the same version are a conflict, and go to that field's owner.
- The model may *propose* a merge. Rules and people decide whether it happens.

### What this prototype actually does

- `soul.js` runs the real math in plain JavaScript: toy keyword embeddings, `r = S·q`, owner selection, masks, slice hashes, and the collaboration matrix.
- `slides.html` is the 90-second walkthrough. Every chart in it is computed live by `soul.js`.
- Embeddings are a bag of keywords over a fixed vocabulary. A real deployment swaps `embed()` for an embedding model; nothing else changes.
- Subtask decomposition is hand-written in this demo.
- Fields outside a confirmer's mask are never passed to that confirmer's view; they are not blurred, they are absent.

### What it does not do yet

- Real AI secretaries, real users, storage, or any network calls.
- Feeding `C` back into routing.
- Authorized, audited cross-person lookups. In this demo nobody can read anyone's sessions because nothing is stored, not because an audit system exists.

### Privacy, stated honestly

Session vectors live in one company index that only the router can search. That protection comes from access control and audit logs, not from cryptography: the operator of the router can technically reach the index. We will say exactly that to customers. A planned additional layer: each person's AI secretary summarizes their sessions into a short capability card, the person approves it, and only approved cards join cross-person discovery.

## 3. Validation

We do not ask people whether they want an AI secretary; most will say yes. We test whether work that stalls today finishes faster with Soul Network.

### Targets (not results)

| Check | Pass bar |
|---|---|
| Right owner found | 18 of 20 test requests |
| Five people steering one task | No instruction lost |
| Out-of-scope access attempts | 20 of 20 blocked |
| Human approval | Nothing delivered or executed before every slice is confirmed |
| Speed | Completion time at least 30% lower than the current process |
| Willingness to pay | At least 2 of 10 interviewed companies agree to a paid trial |

### First test scenario

One request, four confirmations, one requester. We measure the number of human interventions, time to completion, whether routing picked the right owner, and whether any field reached someone outside its mask.

### The test we run against ourselves

Turn the vector router off and let a manager assign owners by hand. If completion time does not change, the matrix math is not the product and we stop selling it as one.

### Interviews first

Twenty companies, three questions: which cross-team sign-off makes you wait the most, how do you handle it today, and where are the rules written down.

## 4. Business model

### Who pays first

Service companies of 5 to 100 people that already use AI and coordinate across teams every day: healthcare service providers, agencies, software teams. They are too small for heavyweight workflow suites and today run sign-offs over chat and email.

### Why they would pay

The value is coordination time, not tokens. An illustrative assumption, not a measurement: a 10-person team where each person saves 2 hours a week at US$20 an hour saves US$1,600 a month. If pilots show savings like that, a paid plan is justified; if they do not, nothing else in this section matters.

### Pricing to test

- **Per completed decision**, with confirmers free. If most decisions complete automatically, per-seat pricing stops making sense, and incumbents built on seats will find it hard to follow.
- A flat monthly team plan as the comparison arm.

### Moat

Features can be copied. What accumulates cannot: each company's record of who owns what, who decided what, and on which version. Replacing it means re-mapping the whole company's responsibilities.

### Path

1. **Wedge:** one multi-party sign-off flow inside the chat tools a team already uses, launched in shadow mode against past decisions before it acts.
2. **Expand:** the same engine for every decision that needs several people in the same company.
3. **Governance layer:** any agent, from any vendor, asks before acting: is this allowed here, and who must confirm it?
4. **Across companies:** each side's AI secretary represents its own constraints, so two companies settle terms by computing what both can accept.

### First pilot

Planned as a **B2B2C cross-border collaboration**: a business, its partner providers, and the end customer each confirming their own part of one request.

### Risks we take seriously

| Risk | Early check |
|---|---|
| Companies do not want authority written down | Start where the rules are already explicit; show "this is how you already decide" from past records |
| A rule is misread and money is involved | Every rule is confirmed by its owner; early on, automation only on clear-cut cases |
| Exceptions never end | Measure the automatable share on historical data before launching a flow |
| Who is accountable for an automatic decision | Every automatic decision traces to the person who set the rule |

## 5. Run it

No install, no network.

```bash
python -m http.server 8000
# open http://localhost:8000/slides.html
```

Or open `slides.html` directly. Keys: `Space` play / pause, `←` `→` previous / next, `R` restart, `C` captions on / off.

## Files

| File | What it is |
|---|---|
| `soul.js` | Routing, masks, hashes, collaboration and permission matrices |
| `view.js` | Heatmap renderer |
| `slides.html` | The 90-second walkthrough, computed live |
| `media/soul-network-demo.mp4` | The submitted demo video, also on [YouTube](https://www.youtube.com/watch?v=h6or_s2vEaQ) |

## Thanks

Thanks to NewDawn Health for inspiring this idea.

Independent hackathon project. Not a NewDawn Health product; no NewDawn Health data, code or systems were used.

## License

MIT
