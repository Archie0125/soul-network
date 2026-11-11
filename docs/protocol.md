# Soul Protocol, draft 0.1

How two AI secretaries talk to each other.

## The idea in one paragraph

Secretaries never chat freely. They exchange small, typed messages through a trusted router. Each message is signed by the secretary that sent it, bound to a task version, and written to a log that cannot be edited. Only five kinds of things ever cross the line between two people: a request for help, an offer to help, a slice to confirm, a confirmation, and a receipt. Never a session, never a vector, never someone else's slice.

## Who is involved

| Party | What it is | What it may do |
|---|---|---|
| **Person** | A human with a role | Set their own rules, answer their secretary, grant permissions they hold |
| **Secretary** | The AI agent acting for one person | Speak *for* that person, only within that person's permissions |
| **Router** | One trusted service per company | Search the session index, match owners, enforce `can()`, write the ledger |
| **Task** | The shared object several people work on | Holds the goal, the draft, the version number, the receipts |
| **Ledger** | Append-only log | Records every message; nobody can edit or delete an entry |

## Five rules

1. **Act within authority.** A secretary can do only what its person could do by hand. Every action is checked with `can(person, action, resource)` against the permission matrix. Deny by default.
2. **Least context.** A party receives the smallest piece of the task it needs. Confirmers get their slice. Candidates get a one-line summary of the subtask, not the whole goal.
3. **Version-bound.** Every message names the task version it refers to. A confirmation of version 3 is meaningless for version 4.
4. **Consent before collaboration.** Finding a person does not conscript them. Their secretary is *offered* the work and may accept, decline, or ask the person.
5. **Everything is logged.** If it is not in the ledger, it did not happen.

## Objects

```jsonc
Task      { id, requester, goal, version, status }          // status: open | drafting | confirming | delivered | recalled
Draft     { task, version, fields: { key: value } }
Slice     { task, version, role, mask: [0|1,...], fields: { key: value }, hash }
Receipt   { task, version, field, role, confirmed_at, hash }
Permission{ role, action, resource, granted_by, granted_at }  // written only by a person
```

`hash` is a hash of the slice's canonical JSON (keys sorted, no whitespace). The prototype uses FNV-1a for display; production uses SHA-256. The hash is a change detector, not a signature.

## The envelope

Every message has the same outer shape:

```jsonc
{
  "id":      "msg_01HV...",         // unique
  "type":    "SLICE",               // one of the types below
  "task":    "task_8f2c",
  "version": 3,
  "from":    "secretary:doctor",    // who sent it
  "to":      "secretary:requester", // who should read it
  "ts":      "2026-11-11T14:02:11Z",
  "body":    { ... },               // type-specific
  "sig":     "..."                  // signature by the sender's key
}
```

The transport does not matter. Messages can travel over HTTP, a queue, or a chat bot. The protocol is the messages, not the pipe.

## Message types

| Type | From → To | Body | Meaning |
|---|---|---|---|
| `FIND` | requester's secretary → router | `{ parts: [{ key, summary, vector }] }` | Find an owner for each part |
| `OFFER` | router → candidate's secretary | `{ part_key, summary, expires }` | "Someone needs help with this. Will you take it?" |
| `ACCEPT` / `DECLINE` | candidate's secretary → router | `{ part_key, reason? }` | Consent, or not |
| `NO_OWNER` | router → requester's secretary | `{ part_key, best_score }` | Nobody scored above the threshold; a human must assign |
| `SLICE` | router → confirmer's secretary | `Slice` | Here is your part to check |
| `CONFIRM` | confirmer's secretary → router | `{ field, hash }` | Approved, exactly this version |
| `REJECT` | confirmer's secretary → router | `{ field, hash, reason }` | Not approved |
| `REVISE` | confirmer's secretary → router | `{ field, hash, new_value }` | Approve with a change; bumps the version |
| `STALE` | router → sender | `{ expected_hash }` | Your confirmation was for an old version |
| `DELIVER` | router → requester's secretary | `{ draft, receipts }` | Every field confirmed; here is everything |
| `PROPOSE` | any owner's secretary → router | `{ field, value, rationale }` | A suggested change, not binding |
| `DIRECT` | field owner's secretary → router | `{ field, value }` | A binding change by the field's owner |
| `APPROVE` | approver's secretary → router | `{ field, hash }` | Sign-off bound to a version |
| `CONFLICT` | router → field owner's secretary | `{ field, a, b }` | Two binding instructions collided |
| `DRIFT_ALERT` | router → task owner's secretary | `{ drift, goal, plan }` | The plan has moved away from the goal |
| `RECALL` | requester's secretary → router | `{ reason }` | Withdraw the task; all pending slices expire |

## Flow 1 · Consent handshake

```
Requester's secretary        Router                    Candidate's secretary        Candidate (person)
        |                       |                              |                          |
        |--- FIND ------------->|                              |                          |
        |                       |-- r = S·q, pick top role --->|                          |
        |                       |--- OFFER (summary only) ---->|                          |
        |                       |                              |-- matches standing rule? |
        |                       |                              |   yes: ACCEPT            |
        |                       |                              |   no:  ask the person -->|
        |                       |                              |<------ yes / no ---------|
        |                       |<--- ACCEPT / DECLINE --------|                          |
        |<-- owner found -------|                              |                          |
        |   (or next candidate, or NO_OWNER)                   |                          |
```

What the candidate's secretary sees in the `OFFER`: the subtask summary and the deadline. It does **not** see who asked, the full goal, the other candidates, or why it was matched. The person can set standing rules ("accept scheduling requests under 10 minutes automatically") so most offers never interrupt them.

If the first candidate declines, the router moves to the next by score. Declines are logged but are not reported to the requester as "X refused"; the requester learns only who accepted.

## Flow 2 · Confirm a slice, bound to a version

```
Router                          Confirmer's secretary            Confirmer (person)
  |--- SLICE (v3, hash h3) ------->|                                   |
  |                                |--- show only these fields ------->|
  |                                |<-- confirm / reject / edit -------|
  |<-- CONFIRM {field, h3} --------|                                   |
  |  check h3 == hash(current slice)                                   |
  |  ok   → write Receipt                                              |
  |  else → STALE {expected}  ---->|  (re-show the new version)        |
```

A `REVISE` changes the field, bumps the task to v4, and automatically invalidates every other `CONFIRM` that touched that field. Confirmations on *other* fields stay valid, because their slices did not change. That is what field-level masks buy: one person's edit does not force everyone to re-confirm.

## Flow 3 · Several owners steering one task

Multiplayer does not mean everyone can change everything. Each field has one writer.

| Rule | Effect |
|---|---|
| One writer per field | `DIRECT` is accepted only from that field's owner |
| `APPROVE` binds to a hash | Change the field and the approval lapses |
| Two `DIRECT`s, same field, same version | `CONFLICT` goes to the field owner; nothing is written until they decide |
| `PROPOSE` is always allowed | Anyone on the task may suggest; it never changes the draft by itself |
| Models may propose merges | A model can draft "here is how both proposals could combine". Whether it happens is decided by the rules above and the owner, never by the model |

Conflict detection is deterministic (same field, same version, different content). Vector similarity is used only to flag "these two instructions are about the same thing, look at them", never to decide that they disagree.

## What never crosses the line

| Never sent | Why |
|---|---|
| Session text or chunks | The index is for the router only |
| Vectors | A vector is a session in disguise |
| Another role's slice | Least context |
| Scores of other candidates | Reveals who else has done this work |
| "Near miss" lists | Lets a requester probe who knows what |
| The requester's identity to a candidate (unless the requester allows it) | Offers are about the work |

## Anti-probing

A requester could learn who knows what by sending many `FIND`s. Limits:

- `FIND` is rate-limited per person per hour.
- An `OFFER` to the same person for similar parts has a cooldown.
- The requester is never told about declines or near misses, only about acceptances.
- Every `FIND` is in the ledger with its vector hash, so patterns are auditable.

With capability cards (`docs/math.md` §8.3) the index itself contains only what each person approved, which removes most of the attack surface.

## Authority: one function, deny by default

```
can(person, action, resource) → true | false
```

Reads the permission matrix `P` and nothing else. Every message handler calls it before acting. There is no other path, no "admin bypass" flag, no learned shortcut. Grants and revocations are themselves messages (`GRANT`, `REVOKE`) sent by a person's secretary on that person's explicit instruction, and they are the **only** messages that write to `P`.

## The ledger

Append-only. Each entry stores the full envelope plus the router's decision (`accepted`, `rejected:STALE`, `rejected:UNAUTHORIZED`, …).

| Who | Can read |
|---|---|
| Requester | All entries for their own tasks |
| Confirmer | Their own slices, confirmations and receipts |
| Company admin | Everything, and the read itself is logged with a stated reason |

## Timeouts and escalation

| Waiting for | Default | Then |
|---|---|---|
| `ACCEPT` / `DECLINE` | 4 hours | Offer the next candidate |
| `CONFIRM` | 24 hours | Reminder; after 48 hours, escalate to the requester |
| `CONFLICT` resolution | 24 hours | Escalate to the task owner |
| Delivery after last receipt | immediate | `DELIVER` |

## Errors

| Code | When |
|---|---|
| `STALE` | Hash does not match the current version |
| `UNAUTHORIZED` | `can()` returned false |
| `NO_OWNER` | Best score below `τ_route` |
| `CONFLICT` | Two binding instructions on one field and version |
| `EXPIRED` | Offer or slice outlived its deadline |
| `RECALLED` | Task was withdrawn |

## End to end: the healthcare example

Fictional data. Roles only.

```jsonc
// 1. The requester's secretary asks for owners.
{ "type": "FIND", "task": "task_8f2c", "version": 1, "from": "secretary:requester", "to": "router",
  "body": { "parts": [
    { "key": "dates",    "summary": "confirm travel dates" },
    { "key": "slot",     "summary": "book a time slot" },
    { "key": "exams",    "summary": "choose the exam list" },
    { "key": "coverage", "summary": "check coverage" } ] } }

// 2. The router offers the exam part to the doctor's secretary. No goal, no requester.
{ "type": "OFFER", "task": "task_8f2c", "version": 1, "from": "router", "to": "secretary:doctor",
  "body": { "part_key": "exams", "summary": "choose the exam list", "expires": "2026-11-11T18:00:00Z" } }

// 3. The doctor's standing rule accepts clinical review automatically.
{ "type": "ACCEPT", "task": "task_8f2c", "version": 1, "from": "secretary:doctor", "to": "router",
  "body": { "part_key": "exams" } }

// 4. After drafting, the router sends the doctor only the exam field.
{ "type": "SLICE", "task": "task_8f2c", "version": 2, "from": "router", "to": "secretary:doctor",
  "body": { "role": "Doctor", "mask": [0, 0, 1, 0],
            "fields": { "exams": "Blood panel, abdominal ultrasound, chest X-ray" },
            "hash": "a91c3f0" } }

// 5. The doctor confirms exactly that version.
{ "type": "CONFIRM", "task": "task_8f2c", "version": 2, "from": "secretary:doctor", "to": "router",
  "body": { "field": "exams", "hash": "a91c3f0" } }

// 6. When all four receipts exist, the requester gets everything.
{ "type": "DELIVER", "task": "task_8f2c", "version": 2, "from": "router", "to": "secretary:requester",
  "body": { "draft": { "...": "all four fields" },
            "receipts": [
              { "field": "dates",    "role": "Patient",    "confirmed_at": "...", "hash": "..." },
              { "field": "slot",     "role": "Front desk", "confirmed_at": "...", "hash": "..." },
              { "field": "exams",    "role": "Doctor",     "confirmed_at": "...", "hash": "a91c3f0" },
              { "field": "coverage", "role": "Insurer",    "confirmed_at": "...", "hash": "..." } ] } }
```

## Settings

| Setting | Default | Note |
|---|---|---|
| `offer_ttl` | 4 h | Then next candidate |
| `confirm_ttl` | 24 h | Reminder at expiry, escalate at 2× |
| `find_rate_limit` | 20 per person per hour | Anti-probing |
| `offer_cooldown` | 1 h per (person, similar part) | Anti-probing |
| `max_candidates` | 3 | Candidates tried before `NO_OWNER` |
| `hash` | SHA-256 over canonical JSON | Prototype shows FNV-1a |
| `signature` | Ed25519 per secretary | Keys issued by the company |

## What the prototype implements

`soul.js` implements the pieces the protocol depends on: routing (`route`), masks and slices (`maskFor`, `sliceFor`), version hashes (`hash`), the collaboration matrix (`recordCollaboration`), and a frozen permission matrix. The message envelope, the ledger, the handshake and the timers are specified here and not yet built.
