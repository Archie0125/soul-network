// Soul Network core: toy embeddings, routing by matrix product, field masks,
// version-bound confirmations, and a collaboration matrix that accumulates.
// Subtask decomposition is hand-written in this prototype.
// All data is fictional. Only roles appear, never people.

const Soul = (() => {
  const ROLES = ['Requester', 'Patient', 'Front desk', 'Doctor', 'Insurer'];

  // Toy embedding space: bag of keywords. A real deployment swaps embed()
  // for an embedding model; every other line stays the same.
  const VOCAB = ['travel', 'dates', 'flight', 'arrival', 'slot', 'schedule', 'booking',
    'appointment', 'exam', 'blood', 'imaging', 'clinical', 'coverage', 'claim', 'policy',
    'plan', 'summary', 'report'];

  const SESSIONS = [
    { role: 'Requester', text: 'draft visit plan summary report' },
    { role: 'Requester', text: 'collect report summary for the plan' },
    { role: 'Patient', text: 'confirm travel dates and flight arrival' },
    { role: 'Patient', text: 'share arrival dates for the travel plan' },
    { role: 'Front desk', text: 'book appointment slot on the schedule' },
    { role: 'Front desk', text: 'move booking slot to match arrival' },
    { role: 'Doctor', text: 'select exam list blood imaging' },
    { role: 'Doctor', text: 'review clinical exam plan' },
    { role: 'Insurer', text: 'check coverage policy for exam' },
    { role: 'Insurer', text: 'process claim under policy coverage' },
  ];

  const SUBTASKS = [
    { key: 'dates', label: 'Travel dates', query: 'confirm travel dates flight arrival' },
    { key: 'slot', label: 'Time slot', query: 'appointment slot schedule booking' },
    { key: 'exams', label: 'Exam list', query: 'exam list blood imaging clinical' },
    { key: 'coverage', label: 'Coverage', query: 'coverage policy claim' },
  ];

  const REQUEST = 'Prepare a visit plan for an overseas patient';

  const DRAFT = {
    dates: 'Arrive Day 1, depart Day 4',
    slot: 'Day 2, 08:30 check-in',
    exams: 'Blood panel, abdominal ultrasound, chest X-ray',
    coverage: 'Exams covered under plan tier B; imaging needs pre-approval',
  };

  const norm = v => {
    const n = Math.hypot(...v);
    return n ? v.map(x => x / n) : v;
  };

  const embed = text => {
    const words = text.toLowerCase().split(/[^a-z]+/);
    return norm(VOCAB.map(term => words.filter(w => w === term).length));
  };

  const matVec = (M, v) => M.map(row => row.reduce((s, x, i) => s + x * v[i], 0));

  // S: one row per session. r = S·q scores every session against the request.
  const S = SESSIONS.map(s => embed(s.text));

  // Per subtask: r = S·q, then each role's score is its best session.
  function route() {
    const scores = SUBTASKS.map(t => {
      const r = matVec(S, embed(t.query));
      return ROLES.map(role => Math.max(...r.filter((_, i) => SESSIONS[i].role === role)));
    });
    const owners = scores.map(row => ROLES[row.indexOf(Math.max(...row))]);
    return { scores, owners };
  }

  // M_role is a diagonal 0/1 mask over the draft's fields: slice = M_role · draft.
  // A role allowed to see the full report gets the identity matrix.
  const maskFor = (role, owners) => SUBTASKS.map((_, j) =>
    (PERMISSIONS[role][0] || owners[j] === role) ? 1 : 0);

  // Fields outside the mask are never returned, so they never reach the screen.
  const sliceFor = (role, owners, draft) => {
    const m = maskFor(role, owners);
    return SUBTASKS.map((t, j) => (m[j] ? { key: t.key, label: t.label, value: draft[t.key] } : null));
  };

  // FNV-1a: a confirmation is bound to the exact text of its slice.
  const hash = text => {
    let h = 0x811c9dc5;
    for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0').slice(0, 7);
  };

  const emptyMatrix = n => Array.from({ length: n }, () => Array(n).fill(0));

  // Accumulated: who works with whom. Never touches PERMISSIONS.
  // Feeding C back into routing is planned, not built.
  const recordCollaboration = (C, a, b) => {
    const i = ROLES.indexOf(a), j = ROLES.indexOf(b);
    C[i][j] += 1; C[j][i] += 1;
  };

  // Set by people. Nothing in this file writes to it after this line.
  const ACTIONS = ['See full report', 'Confirm own slice', 'Edit draft'];
  const PERMISSIONS = Object.freeze(Object.fromEntries(Object.entries({
    'Requester': [1, 0, 1],
    'Patient': [0, 1, 0],
    'Front desk': [0, 1, 0],
    'Doctor': [0, 1, 0],
    'Insurer': [0, 1, 0],
  }).map(([k, v]) => [k, Object.freeze(v)])));

  return { ROLES, VOCAB, SESSIONS, SUBTASKS, REQUEST, DRAFT, ACTIONS, PERMISSIONS, S,
    embed, route, maskFor, sliceFor, hash, emptyMatrix, recordCollaboration };
})();
