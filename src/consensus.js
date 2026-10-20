// Consensus notes from the conflict-review meeting, and the CSV that carries them.
// The download is the original export, every original cell unchanged, plus these columns:
//   consensus_<Q>/value      agreed answer in Calibrate's own encoding (1, true), like a rater column
//   consensus_<Q>/label      agreed answer name, or "No consensus"
//   consensus_<Q>/reasoning  the note for that question
//   agreement_<Q>/status     unanimous | disagree | split | thin   (humans only, answers as rated)
//   agreement_<Q>/majority   human majority answer
//   agreement_<Q>/dissenters raters off the majority, separated by "; "
//   consensus/status, consensus/comment, consensus/next_steps, consensus/updated_at
// Re-uploading that file restores the notes; agreement_* columns are recomputed, never read.
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};

  const NO_CONSENSUS = '__none__';
  const NO_CONSENSUS_LABEL = 'No consensus';
  const STATUSES = [
    { value: '', name: 'Not discussed' },
    { value: 'agreed', name: 'Agreed' },
    { value: 'follow_up', name: 'Needs follow-up' },
    { value: 'rubric_change', name: 'Change rubric' },
  ];
  const statusName = v => (STATUSES.find(s => s.value === v) || STATUSES[0]).name;

  // Notes are keyed by conversation id, or by row number when ids repeat.
  const keyOf = (model, c) => (model.meta.unique_ids ? 'id:' + c.rawId : 'row:' + c.row);

  function empty() { return { status: '', comment: '', next_steps: '', q: {}, updated_at: '' }; }
  function isRecorded(item) {
    return !!item && (!!item.status || !!item.comment || !!item.next_steps || Object.values(item.q || {}).some(x => x && (x.agreed || x.note)));
  }
  function clean(items) {
    const out = {};
    Object.entries(items || {}).forEach(([k, it]) => { if (isRecorded(it)) out[k] = it; });
    return out;
  }

  // ---------- browser storage (a convenience; the downloaded CSV is the record) ----------
  function storageKey(model) { return 'cd:' + model.meta.fingerprint + ':consensus'; }
  function loadDraft(model) {
    try { const s = localStorage.getItem(storageKey(model)); if (s) { const d = JSON.parse(s); if (d && d.items) return d; } } catch (e) {}
    return { items: {}, downloadedAt: '' };
  }
  function saveDraft(model, draft) {
    try { localStorage.setItem(storageKey(model), JSON.stringify({ items: clean(draft.items), downloadedAt: draft.downloadedAt || '' })); return true; } catch (e) { return false; }
  }
  function pendingCount(draft) {
    return Object.values(draft.items).filter(it => isRecorded(it) && (!draft.downloadedAt || it.updated_at > draft.downloadedAt)).length;
  }

  // ---------- CSV ----------
  const qcols = q => ['consensus_' + q.key + '/value', 'consensus_' + q.key + '/label', 'consensus_' + q.key + '/reasoning',
    'agreement_' + q.key + '/status', 'agreement_' + q.key + '/majority', 'agreement_' + q.key + '/dissenters'];
  const CONV_COLS = ['consensus/status', 'consensus/comment', 'consensus/next_steps', 'consensus/updated_at'];

  function exportColumns(model) { return model.questions.flatMap(qcols).concat(CONV_COLS); }

  function exportCsv(ctx, model, metrics, items) {
    const header = exportColumns(model);
    const rowsByIndex = {};
    model.conversations.forEach(c => {
      const it = items[keyOf(model, c)] || empty();
      const vals = [];
      model.questions.forEach(q => {
        const x = (it.q || {})[q.key] || {};
        const opt = x.agreed && x.agreed !== NO_CONSENSUS ? q.scale.find(o => o.name === x.agreed) : null;
        vals.push(opt ? opt.value : '', x.agreed === NO_CONSENSUS ? NO_CONSENSUS_LABEL : (opt ? opt.name : (x.agreed || '')), x.note || '');
        const a = metrics.humanCell(c, q);
        vals.push(a.status, a.majority || '', a.humanDis.join('; '));
      });
      vals.push(it.status ? statusName(it.status) : '', it.comment || '', it.next_steps || '', isRecorded(it) ? (it.updated_at || '') : '');
      rowsByIndex[c.row - 1] = vals;
    });
    const extraRows = ctx.parsed.rows.slice(1).map((_, r) => rowsByIndex[r] || header.map(() => ''));
    return CD.csv.rebuild(ctx.parsed, ctx.det.original, header, extraRows);
  }

  // Notes carried by an uploaded CSV that this tool exported earlier.
  function importFromCsv(ctx, model) {
    const header = ctx.parsed.rows[0];
    const idx = {}; header.forEach((h, i) => { if (!(h in idx)) idx[h] = i; });
    if (!header.some(h => /^consensus[_/]/.test(h))) return {};
    const get = (row, name) => (name in idx && idx[name] < row.length ? row[idx[name]] : '');
    const out = {};
    model.conversations.forEach(c => {
      const row = ctx.parsed.rows[c.row];
      const it = empty();
      const status = get(row, 'consensus/status').trim();
      it.status = (STATUSES.find(s => s.name.toLowerCase() === status.toLowerCase() || s.value === status) || STATUSES[0]).value;
      it.comment = get(row, 'consensus/comment');
      it.next_steps = get(row, 'consensus/next_steps');
      it.updated_at = get(row, 'consensus/updated_at').trim();
      model.questions.forEach(q => {
        const value = CD.parse.normValue(get(row, 'consensus_' + q.key + '/value'));
        const label = get(row, 'consensus_' + q.key + '/label').trim();
        const note = get(row, 'consensus_' + q.key + '/reasoning');
        let agreed = '';
        if (label.toLowerCase() === NO_CONSENSUS_LABEL.toLowerCase()) agreed = NO_CONSENSUS;
        else {
          const opt = q.scale.find(o => o.name === label) || q.scale.find(o => o.name.toLowerCase() === label.toLowerCase()) || q.scale.find(o => value && o.value === value);
          agreed = opt ? opt.name : label;
        }
        if (agreed || note) it.q[q.key] = { agreed, note };
      });
      if (isRecorded(it)) { if (!it.updated_at) it.updated_at = '1970-01-01T00:00:00.000Z'; out[keyOf(model, c)] = it; }
    });
    return out;
  }

  // Per conversation the newer record wins. Returns the merged items and where each came from.
  function merge(fromFile, fromDraft) {
    const items = {}; let file = 0, draft = 0;
    new Set(Object.keys(fromFile).concat(Object.keys(fromDraft))).forEach(k => {
      const a = fromFile[k], b = fromDraft[k];
      if (a && (!b || (a.updated_at || '') >= (b.updated_at || ''))) { items[k] = a; file++; } else { items[k] = b; draft++; }
    });
    return { items, file, draft };
  }

  const api = { STATUSES, NO_CONSENSUS, NO_CONSENSUS_LABEL, statusName, keyOf, empty, isRecorded, clean, loadDraft, saveDraft, pendingCount, exportColumns, exportCsv, importFromCsv, merge, storageKey };
  CD.consensus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
