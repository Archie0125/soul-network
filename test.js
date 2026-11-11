// Run: node test.js
// Checks the promises the README and docs make about the math.
const assert = require('assert');
const Soul = require('./soul.js');
const Algo = require('./algorithms.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// --- soul.js: routing ---------------------------------------------------------

test('each part of the request routes to the expected role', () => {
  const { owners } = Soul.route();
  assert.deepStrictEqual(owners, ['Patient', 'Front desk', 'Doctor', 'Insurer']);
});

test('routing is deterministic and scores stay within 0..1', () => {
  const a = Soul.route(), b = Soul.route();
  assert.deepStrictEqual(a.scores, b.scores);
  for (const v of a.scores.flat()) assert.ok(v >= 0 && v <= 1 + 1e-9);
});

test('the Requester never wins a confirmation part', () => {
  const { owners } = Soul.route();
  assert.ok(!owners.includes('Requester'));
});

// --- soul.js: masks and slices --------------------------------------------------

test('confirmer masks add up to the identity: every field has exactly one confirmer', () => {
  const { owners } = Soul.route();
  const confirmers = Soul.ROLES.filter(r => r !== 'Requester');
  const sum = Soul.SUBTASKS.map((_, j) => confirmers.reduce((s, r) => s + Soul.maskFor(r, owners)[j], 0));
  assert.deepStrictEqual(sum, Soul.SUBTASKS.map(() => 1));
});

test('the Requester mask is the identity', () => {
  const { owners } = Soul.route();
  assert.deepStrictEqual(Soul.maskFor('Requester', owners), Soul.SUBTASKS.map(() => 1));
});

test('a confirmer slice never contains text from another field', () => {
  const { owners } = Soul.route();
  for (const role of Soul.ROLES.filter(r => r !== 'Requester')) {
    const slice = Soul.sliceFor(role, owners, Soul.DRAFT);
    const sent = JSON.stringify(slice.filter(Boolean));
    slice.forEach((f, j) => {
      if (!f) assert.ok(!sent.includes(Soul.DRAFT[Soul.SUBTASKS[j].key]), `${role} can see ${Soul.SUBTASKS[j].key}`);
    });
    assert.strictEqual(slice.filter(Boolean).length, 1);
  }
});

test('the requester slice contains every field', () => {
  const { owners } = Soul.route();
  assert.strictEqual(Soul.sliceFor('Requester', owners, Soul.DRAFT).filter(Boolean).length, Soul.SUBTASKS.length);
});

// --- soul.js: versions, collaboration, permissions ---------------------------------

test('a confirmation hash changes when the slice changes', () => {
  assert.strictEqual(Soul.hash('Day 2, 08:30 check-in'), Soul.hash('Day 2, 08:30 check-in'));
  assert.notStrictEqual(Soul.hash('Day 2, 08:30 check-in'), Soul.hash('Day 2, 09:30 check-in'));
});

test('collaboration is symmetric and never writes to permissions', () => {
  const before = JSON.stringify(Soul.PERMISSIONS);
  const C = Soul.emptyMatrix(Soul.ROLES.length);
  Soul.recordCollaboration(C, 'Requester', 'Doctor');
  assert.strictEqual(C[0][3], 1); assert.strictEqual(C[3][0], 1);
  assert.strictEqual(JSON.stringify(Soul.PERMISSIONS), before);
});

test('permissions cannot be changed by code', () => {
  assert.throws(() => { 'use strict'; Soul.PERMISSIONS.Patient[0] = 1; });
  assert.throws(() => { 'use strict'; Soul.PERMISSIONS.Patient = [1, 1, 1]; });
  assert.strictEqual(Soul.PERMISSIONS.Patient[0], 0);
});

// --- algorithms.js -------------------------------------------------------------

const unit = Algo.norm;

test('recent work counts more in a decayed centroid', () => {
  const c = Algo.decayCentroid([
    { vector: unit([1, 0]), day: 0 },   // old
    { vector: unit([0, 1]), day: 90 },  // today
  ], 90, 30);
  assert.ok(c[1] > c[0]);
});

test('greedy team covers both requirements with two people, not one', () => {
  const reqs = [unit([1, 0, 0]), unit([0, 0, 1])];
  const people = [
    { name: 'A', vector: unit([1, 0, 0]) },
    { name: 'B', vector: unit([0, 1, 0]) },
    { name: 'C', vector: unit([0, 0, 1]) },
  ];
  assert.deepStrictEqual(Algo.greedyTeam(reqs, people, 3).map(p => p.name), ['A', 'C']);
});

test('assignment finds the cheapest one-to-one matching', () => {
  const { assignment, total } = Algo.assign([[1, 5, 9], [5, 1, 9], [9, 9, 1]]);
  assert.deepStrictEqual(assignment, [0, 1, 2]);
  assert.strictEqual(total, 3);
});

test('a busy person costs more in assignment', () => {
  const t = [unit([1, 0])];
  const free = { vector: unit([1, 0]), load: 0 }, busy = { vector: unit([1, 0]), load: 3 };
  const [[a, b]] = Algo.assignmentCost(t, [free, busy]);
  assert.ok(b > a);
});

test('duplicate requests group together, different ones stay apart', () => {
  const groups = Algo.duplicateGroups([unit([1, 0]), unit([0.99, 0.1]), unit([0, 1])], 0.9);
  assert.strictEqual(groups.length, 2);
});

test('drift is 0 on the goal and grows as the plan moves away', () => {
  const goal = unit([1, 0]);
  assert.ok(Algo.drift(goal, goal) < 1e-9);
  assert.ok(Algo.drift(unit([0, 1]), goal) > 0.9);
});

test('centrality finds the hub of a star-shaped team', () => {
  const C = [[0, 1, 1, 1], [1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]];
  const x = Algo.centrality(C);
  assert.strictEqual(x.indexOf(Math.max(...x)), 0);
});

test('MMR skips a near-duplicate of the first pick', () => {
  const q = unit([1, 0]);
  const picks = Algo.mmr(q, [unit([1, 0]), unit([0.99, 0.1]), unit([0.6, 0.8])], 2, 0.3);
  assert.deepStrictEqual(picks, [0, 2]);
});

test('2-D Procrustes recovers a known rotation', () => {
  const theta = 0.4;
  const X = [[1, 0], [0, 1], [0.6, 0.8]];
  const Y = X.map(([x, y]) => [x * Math.cos(theta) - y * Math.sin(theta), x * Math.sin(theta) + y * Math.cos(theta)]);
  const W = Algo.rotation2d(X, Y);
  const back = X.map(([x, y]) => [x * W[0][0] + y * W[1][0], x * W[0][1] + y * W[1][1]]);
  back.forEach((v, i) => v.forEach((c, k) => assert.ok(Math.abs(c - Y[i][k]) < 1e-9)));
});

// --- runner ----------------------------------------------------------------------

let failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
