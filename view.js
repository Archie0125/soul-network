// Shared renderers for the MVP and the slides.
const View = (() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function heatmap(matrix, rowLabels, colLabels, { highlight = [], max, decimals = 2, cls = '' } = {}) {
    const top = max ?? Math.max(1e-9, ...matrix.flat());
    const head = `<tr><th></th>${colLabels.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const rows = matrix.map((row, i) => `<tr><th class="rl">${esc(rowLabels[i])}</th>${row.map((v, j) => {
      const a = Math.min(1, v / top);
      const hit = highlight.some(([r, c]) => r === i && c === j);
      return `<td class="${hit ? 'hit' : ''}" style="--a:${a.toFixed(3)}">${v ? v.toFixed(decimals) : '·'}</td>`;
    }).join('')}</tr>`).join('');
    return `<table class="heat ${cls}">${head}${rows}</table>`;
  }

  const ownerCells = (scores, owners, roles) => owners.map((o, i) => [i, roles.indexOf(o)]);

  return { esc, heatmap, ownerCells };
})();
