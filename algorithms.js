// The algorithms behind docs/math.md. Plain functions, no dependencies.
// Vectors are arrays of numbers. Unless a function says otherwise, it expects
// unit-length vectors, so a dot product is a cosine similarity.

const Algo = (() => {
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const norm = v => { const n = Math.hypot(...v); return n ? v.map(x => x / n) : v; };
  const cosine = (a, b) => dot(norm(a), norm(b));

  // --- Finding people --------------------------------------------------------

  // One vector per person, where recent work counts more than old work.
  // items: [{ vector, day }], now: today's day number, halfLifeDays: after this
  // many days a session counts half as much.
  function decayCentroid(items, now, halfLifeDays) {
    const lambda = Math.LN2 / halfLifeDays;
    const sum = Array(items[0].vector.length).fill(0);
    for (const { vector, day } of items) {
      const w = Math.exp(-lambda * (now - day));
      vector.forEach((x, i) => { sum[i] += w * x; });
    }
    return norm(sum);
  }

  // Pick k results that are relevant AND different from each other.
  // lambda = 1 is pure relevance; lambda = 0 is pure diversity.
  function mmr(query, candidates, k, lambda = 0.7) {
    const chosen = [];
    const rest = candidates.map((vector, i) => ({ i, vector }));
    while (chosen.length < k && rest.length) {
      let best = null, bestScore = -Infinity;
      for (const c of rest) {
        const rel = dot(query, c.vector);
        const red = chosen.length ? Math.max(...chosen.map(ch => dot(ch.vector, c.vector))) : 0;
        const score = lambda * rel - (1 - lambda) * red;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      chosen.push(best);
      rest.splice(rest.indexOf(best), 1);
    }
    return chosen.map(c => c.i);
  }

  // --- Building a team ---------------------------------------------------------

  // Coverage: how well a team T covers a list of requirements.
  // Each requirement is scored by the best person in the team for it.
  const coverage = (requirements, team) =>
    requirements.reduce((s, r) => s + (team.length ? Math.max(...team.map(p => dot(r, p.vector))) : 0), 0);

  // Add the person who improves coverage the most, until nobody adds at least minGain.
  // Coverage is submodular, so this greedy pick is within 63% of the best possible team.
  function greedyTeam(requirements, people, maxSize, minGain = 0.05) {
    const team = [];
    const pool = people.slice();
    while (team.length < maxSize && pool.length) {
      const base = coverage(requirements, team);
      let best = null, bestGain = minGain;
      for (const p of pool) {
        const gain = coverage(requirements, [...team, p]) - base;
        if (gain > bestGain) { bestGain = gain; best = p; }
      }
      if (!best) break;
      team.push(best);
      pool.splice(pool.indexOf(best), 1);
    }
    return team;
  }

  // Cost of giving subtask i to person j: distance plus a penalty for how busy they are.
  const assignmentCost = (subtasks, people, alpha = 0.2) =>
    subtasks.map(t => people.map(p => 1 - dot(t, p.vector) + alpha * (p.load || 0)));

  // Cheapest one-to-one assignment. This is the exact answer by trying every
  // permutation, fine for up to 8 subtasks. Production uses the Hungarian
  // algorithm (for example scipy's linear_sum_assignment) for larger sizes.
  function assign(cost) {
    const n = cost.length, m = cost[0].length;
    if (n > 8) throw new Error('assign(): use the Hungarian algorithm above 8 subtasks');
    let best = null, bestTotal = Infinity;
    const walk = (i, used, picked, total) => {
      if (total >= bestTotal) return;
      if (i === n) { bestTotal = total; best = picked.slice(); return; }
      for (let j = 0; j < m; j++) if (!used[j]) {
        used[j] = true; picked.push(j);
        walk(i + 1, used, picked, total + cost[i][j]);
        picked.pop(); used[j] = false;
      }
    };
    walk(0, Array(m).fill(false), [], 0);
    return { assignment: best, total: bestTotal };
  }

  // --- Keeping a task on track -------------------------------------------------

  // Group requests that are near-duplicates (similarity above tau).
  // Uses union-find: connected requests end up in one group.
  function duplicateGroups(vectors, tau) {
    const parent = vectors.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < vectors.length; i++)
      for (let j = i + 1; j < vectors.length; j++)
        if (dot(vectors[i], vectors[j]) >= tau) parent[find(i)] = find(j);
    const groups = {};
    vectors.forEach((_, i) => { (groups[find(i)] ||= []).push(i); });
    return Object.values(groups);
  }

  // How far the current plan has moved from the original goal. 0 = on track.
  const drift = (plan, goal) => 1 - cosine(plan, goal);

  // --- Learning from collaboration ------------------------------------------

  // Who is the hub everyone goes through? The main eigenvector of the
  // collaboration matrix, found by repeated multiplication (power iteration).
  function centrality(C, iterations = 100) {
    let x = Array(C.length).fill(1 / C.length);
    for (let k = 0; k < iterations; k++) {
      const y = C.map(row => dot(row, x));
      const n = Math.hypot(...y);
      if (!n) return x;
      x = y.map(v => v / n);
    }
    return x;
  }

  // --- Changing embedding models ------------------------------------------

  // Procrustes: the rotation W that best maps old vectors X onto new vectors Y.
  // Given here only as a 2-D illustration (a full SVD is out of scope for this
  // repo); production uses a numeric library.
  function rotation2d(X, Y) {
    let a = 0, b = 0;
    for (let i = 0; i < X.length; i++) {
      a += X[i][0] * Y[i][0] + X[i][1] * Y[i][1];
      b += X[i][0] * Y[i][1] - X[i][1] * Y[i][0];
    }
    const theta = Math.atan2(b, a);
    return [[Math.cos(theta), Math.sin(theta)], [-Math.sin(theta), Math.cos(theta)]];
  }

  return { dot, norm, cosine, decayCentroid, mmr, coverage, greedyTeam, assignmentCost, assign,
    duplicateGroups, drift, centrality, rotation2d };
})();

if (typeof module !== 'undefined') module.exports = Algo;
