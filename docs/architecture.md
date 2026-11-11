# Architecture for a first real build

What we would build after the prototype, kept as small as possible. One database, one router service, one secretary process per person, one chat-tool integration.

```
 Person ──(chat tool)──► Secretary ──(messages)──► Router ──► Postgres
                                                       │        ├─ session_chunks (vectors)
                                                       │        ├─ tasks / drafts / slices / receipts
                                                       │        ├─ permissions          (written by people only)
                                                       │        ├─ collaboration        (written by the router)
                                                       │        └─ ledger               (append-only)
                                                       └──► embedding model (the only model call in routing)
```

## Pieces

| Piece | Role | First choice | Why not more |
|---|---|---|---|
| Database | Everything, including vectors | Postgres with `pgvector`, row-level security, realtime (Supabase gives all four) | One system to run; 5 to 100 people never need a separate vector store |
| Router | Runs `r = S·q`, masks, `can()`, timers, the ledger | One small service | It is the only trusted party; keeping it one process keeps the trust boundary obvious |
| Secretary | Acts for one person: talks to them, holds their standing rules, sends messages | One worker per person, sharing code | Must not have database access beyond its own person's rows |
| Permissions | `can(person, action, resource)` | A single function over the `permissions` table | OpenFGA-style engines are overkill until roles number in the hundreds |
| Task execution | Event stream of commands | A `ledger` table plus a worker | Temporal and friends come later, if ever |
| Chat integration | Where people see offers and slices | Whatever the pilot company already uses | The product must not require a new app |

## Tables

```sql
people          (id, role, display_role, created_at)
secretaries     (id, person_id, public_key, standing_rules jsonb)

sessions        (id, person_id, started_at)
session_chunks  (id, session_id, chunk_index, embedding vector(d), day int)
capability_cards(id, person_id, text, embedding vector(d), approved_at)   -- cross-person index, approved by the person

tasks           (id, requester_id, goal, version int, status)
drafts          (task_id, version, fields jsonb)
slices          (id, task_id, version, role, mask int[], fields jsonb, hash, sent_at, expires_at)
receipts        (id, task_id, version, field, role, hash, confirmed_at)

permissions     (role, action, resource, granted_by, granted_at)           -- only GRANT/REVOKE events write here
collaboration   (role_a, role_b, count int)                                -- only the router writes here

ledger          (id, ts, type, task_id, version, from_id, to_id, body jsonb, sig, decision)  -- insert only
```

Row-level security:

- A secretary can read `sessions` and `session_chunks` only where `person_id` is its own person.
- Nobody except the router role can read `session_chunks` across people, and that role is used only inside the `FIND` handler.
- `ledger` has no `UPDATE` or `DELETE` grant for anyone.
- `permissions` is writable only by the handler for `GRANT` / `REVOKE`, which requires a person-originated event.

## One request, through the pieces

1. The requester tells their secretary what they need, in the chat tool.
2. The secretary sends `FIND` to the router.
3. The router embeds each part, runs `r = S·q` over `session_chunks` (or `capability_cards` once they exist), applies the threshold, and sends `OFFER`s.
4. Each candidate's secretary checks its standing rules, or asks its person.
5. The router drafts (one model call), builds masks, sends `SLICE`s.
6. Each confirmer sees one field in the chat tool and taps confirm, reject, or edit.
7. The router writes receipts, bumps versions on edits, re-sends only what changed.
8. When every field has a receipt, `DELIVER` goes to the requester, `collaboration` is updated, and the ledger has the whole story.

## Pilot scale

Three real accounts (requester, one confirmer, one admin). The other roles are simulated by scripts that follow the protocol. That is enough to measure routing accuracy, leaks and time to completion before asking anyone to change how they work.

## Things we will not build yet

- A workflow designer. Rules are one sentence each, confirmed by their owner.
- A separate vector database.
- A general permission engine.
- Cross-company messaging. The protocol allows it; the pilot does not need it.
