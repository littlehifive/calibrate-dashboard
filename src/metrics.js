// Agreement maths, lifted from the W3/W4 dashboard template so the numbers stay the same:
// majority and dissent per (conversation, question), pairwise agreement, Krippendorff's alpha.
// `getState()` supplies the two switches: ref ('humans' | 'all') and cat ('strict' | 'yes').
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};

  // Krippendorff's alpha, nominal metric, tolerates missing values (units with <2 values are skipped).
  function krippAlpha(units, keys) {
    const o = {}; const cats = new Set();
    units.forEach(u => {
      const vals = keys.map(k => u[k]).filter(v => v != null); const m = vals.length; if (m < 2) return;
      vals.forEach(v => cats.add(v));
      for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (i !== j) {
        o[vals[i]] = o[vals[i]] || {}; o[vals[i]][vals[j]] = (o[vals[i]][vals[j]] || 0) + 1 / (m - 1);
      }
    });
    const list = [...cats]; const nc = {}; let off = 0;
    list.forEach(c => { nc[c] = 0; list.forEach(k => { const v = (o[c] && o[c][k]) || 0; nc[c] += v; if (c !== k) off += v; }); });
    const n = Object.values(nc).reduce((a, b) => a + b, 0);
    let expected = 0; list.forEach(c => list.forEach(k => { if (c !== k) expected += nc[c] * nc[k]; }));
    if (n < 2 || expected === 0) return null;
    return 1 - (n - 1) * off / expected;
  }
  function pairRate(units, a, b) {
    let same = 0, both = 0;
    units.forEach(u => { const x = u[a], y = u[b]; if (x != null && y != null) { both++; if (x === y) same++; } });
    return both ? { rate: same / both, same, both } : null;
  }
  function pairAgreement(units, keys) {
    let tot = 0, cnt = 0;
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const p = pairRate(units, keys[i], keys[j]); if (p) { tot += p.rate; cnt++; }
    }
    return cnt ? tot / cnt : null;
  }

  function create(model, getState) {
    const Q = model.questions, R = model.raters, C = model.conversations;
    const HUMANS = R.filter(r => r.kind === 'human');
    const AI = R.find(r => r.kind === 'ai') || null;
    const st = () => (getState ? getState() : { ref: 'humans', cat: 'strict' });
    const EMPTY = { label: null, reasoning: null, raw: null };
    const raw = (c, q, r) => c.ratings[q.key][r.key] || EMPTY;

    // "Grouped" mode keeps a question's first option and folds every other option into "Not <first>".
    // Only questions with more than two options are grouped.
    const groupable = q => !q.binary && q.scale.length > 2;
    const notLabel = q => 'Not ' + q.scale[0].name;
    function lab(q, label, cat) {
      if (label == null) return null;
      if ((cat || st().cat) === 'yes' && groupable(q)) return label === q.scale[0].name ? label : notLabel(q);
      return label;
    }
    function refRaters(ref) { return (ref || st().ref) === 'all' ? R : HUMANS; }

    // One (conversation, question) cell: majority, who disagrees, split/thin status.
    function analyze(c, q, ref, cat) {
      ref = ref || refRaters();
      const labels = {};
      R.forEach(r => { labels[r.key] = lab(q, raw(c, q, r).label, cat); });
      const counts = {}; let n = 0;
      ref.forEach(r => { const l = labels[r.key]; if (l != null) { counts[l] = (counts[l] || 0) + 1; n++; } });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      let status = 'unanimous', majority = null, majCount = 0;
      if (n < 2) status = 'thin';
      else if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) status = 'split';
      else { majority = sorted[0][0]; majCount = sorted[0][1]; }
      const dis = [];
      if (majority != null) {
        R.forEach(r => { const l = labels[r.key]; if (l != null && l !== majority) dis.push(r.key); });
        if (dis.length) status = 'disagree';
      }
      return { labels, counts, sorted, n, status, majority, majCount, dis, aiDis: dis.includes('ai'), humanDis: dis.filter(k => k !== 'ai') };
    }
    const cache = new Map();
    function cell(c, q) {
      const s = st(), k = s.ref + '|' + s.cat + '|' + c.idx + '|' + q.key;
      if (!cache.has(k)) cache.set(k, analyze(c, q));
      return cache.get(k);
    }
    // Humans only, answers as rated: what the exported agreement_* columns record, whatever the switches say.
    function humanCell(c, q) { return analyze(c, q, HUMANS, 'strict'); }
    function unitsFor(q) {
      return C.map(c => { const u = {}; R.forEach(r => { u[r.key] = lab(q, raw(c, q, r).label); }); return u; });
    }
    function qStats(q) {
      const units = unitsFor(q);
      const hKeys = HUMANS.map(r => r.key), allKeys = R.map(r => r.key);
      let uN = 0, uY = 0;
      units.forEach(u => { const v = hKeys.map(k => u[k]).filter(x => x != null); if (v.length >= 2) { uN++; if (new Set(v).size === 1) uY++; } });
      let aN = 0, aY = 0;
      if (AI) C.forEach(c => { const h = analyze(c, q, HUMANS); const a = lab(q, raw(c, q, AI).label); if (h.majority != null && a != null) { aN++; if (a === h.majority) aY++; } });
      const cells = C.map(c => cell(c, q));
      return {
        unanimous: uN ? uY / uN : null, uN, uY,
        pairH: pairAgreement(units, hKeys), alphaH: krippAlpha(units, hKeys),
        aiMaj: aN ? aY / aN : null, aN, aY,
        alphaAll: AI ? krippAlpha(units, allKeys) : null,
        splits: cells.filter(x => x.status === 'split').length,
        thin: cells.filter(x => x.status === 'thin').length,
        answered: R.map(r => units.filter(u => u[r.key] != null).length),
      };
    }
    function raterDisagreements(r, q) {
      let k = 0, n = 0;
      C.forEach(c => { const a = cell(c, q); if (a.majority != null && a.labels[r.key] != null) { n++; if (a.dis.includes(r.key)) k++; } });
      return { k, n };
    }
    function convScore(c) {
      let dis = 0, splits = 0, ai = 0;
      Q.forEach(q => { const a = cell(c, q); dis += a.dis.length; if (a.status === 'split') splits++; if (a.aiDis) ai++; });
      return { dis, splits, ai, total: dis + 2 * splits };
    }
    const isConflict = a => a.status === 'split' || a.status === 'disagree';
    function hasConflict(c) { return Q.some(q => isConflict(cell(c, q))); }

    return {
      Q, R, C, HUMANS, AI, raw, lab, groupable, notLabel, refRaters, analyze, cell, humanCell, unitsFor, qStats,
      raterDisagreements, convScore, isConflict, hasConflict, pairRate, pairAgreement, krippAlpha,
      clear() { cache.clear(); },
    };
  }

  const api = { create, krippAlpha, pairRate, pairAgreement };
  CD.metrics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
