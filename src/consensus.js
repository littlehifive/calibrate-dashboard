// Consensus notes from the conflict-review meeting, and the CSV that carries them.
// Each conversation's notes are a draft while the group talks; "Submit" freezes a copy
// (item.submitted). Only submitted decisions go into the download, and editing after a submit
// shows as "changed since submitted" until it is submitted again.
// The download is the original export, every original cell unchanged, plus these columns:
//   consensus_<Q>/value      agreed answer in Calibrate's own encoding (1, true), like a rater column
//   consensus_<Q>/label      agreed answer name, or "No consensus"
//   consensus_<Q>/reasoning  the note for that question
//   agreement_<Q>/status     unanimous | disagree | split | thin   (humans only, answers as rated)
//   agreement_<Q>/majority   human majority answer
//   agreement_<Q>/dissenters raters off the majority, separated by "; "
//   consensus/status, consensus/comment, consensus/next_steps, consensus/updated_at (when it was submitted)
// Re-uploading that file restores the notes as submitted; agreement_* columns are recomputed, never read.
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};

  const NO_CONSENSUS = '__none__';
  const NO_CONSENSUS_LABEL = 'No consensus';
  // Outcome of the discussion for the whole conversation. Values are stable (they go in the CSV via
  // the names); `also` lists names used by earlier versions so their files still read back.
  const STATUSES = [
    { value: '', name: 'Not discussed yet', also: ['Not discussed'], help: 'Nobody has looked at this one together yet.' },
    { value: 'agreed', name: 'Resolved', also: ['Agreed'], help: 'The group agreed on the answers. Nothing else to do.' },
    { value: 'follow_up', name: 'Needs follow-up', also: [], help: 'Something to check or someone to ask before it is settled.' },
    { value: 'rubric_change', name: 'Change the rubric', also: ['Change rubric'], help: 'The disagreement came from unclear guidance; the question or its options need rewording.' },
  ];
  const statusName = v => (STATUSES.find(s => s.value === v) || STATUSES[0]).name;

  // Notes are keyed by conversation id, or by row number when ids repeat.
  const keyOf = (model, c) => (model.meta.unique_ids ? 'id:' + c.rawId : 'row:' + c.row);

  function empty() { return { status: '', comment: '', next_steps: '', q: {}, updated_at: '', submitted: null }; }
  // The parts of a record that make up the decision, in a stable shape for comparing.
  function fieldsOf(it) {
    const q = {};
    Object.keys((it && it.q) || {}).sort().forEach(k => { const x = it.q[k]; if (x && (x.agreed || x.note)) q[k] = { agreed: x.agreed || '', note: x.note || '' }; });
    return { status: (it && it.status) || '', comment: (it && it.comment) || '', next_steps: (it && it.next_steps) || '', q };
  }
  function hasContent(f) { return !!(f.status || f.comment || f.next_steps || Object.keys(f.q).length); }
  const isSubmitted = it => !!(it && it.submitted && it.submitted.submitted_at);
  // Changes not yet submitted: a first draft with content, or edits since the last submit.
  function isDirty(it) {
    if (!it) return false;
    const cur = fieldsOf(it);
    if (!isSubmitted(it)) return hasContent(cur);
    return JSON.stringify(cur) !== JSON.stringify(fieldsOf(it.submitted));
  }
  function submit(it, now) {
    it.submitted = Object.assign(fieldsOf(it), { submitted_at: now || new Date().toISOString() });
    return it;
  }
  function isRecorded(it) { return !!it && (isSubmitted(it) || hasContent(fieldsOf(it))); }
  function clean(items) {
    const out = {};
    Object.entries(items || {}).forEach(([k, it]) => { if (isRecorded(it)) out[k] = it; });
    return out;
  }
  // Only what has been submitted: for the download and for read-only copies.
  function submittedOnly(items) {
    const out = {};
    Object.entries(items || {}).forEach(([k, it]) => {
      if (isSubmitted(it)) { const s = it.submitted; out[k] = Object.assign({}, s, { q: s.q, updated_at: s.submitted_at, submitted: Object.assign({}, s) }); }
    });
    return out;
  }
  function counts(items) {
    let submitted = 0, dirty = 0;
    Object.values(items || {}).forEach(it => { if (isSubmitted(it)) submitted++; if (isDirty(it)) dirty++; });
    return { submitted, dirty };
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
  // Submitted decisions that are not in a downloaded file yet.
  function pendingCount(draft) {
    return Object.values(draft.items).filter(it => isSubmitted(it) && (!draft.downloadedAt || it.submitted.submitted_at > draft.downloadedAt)).length;
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
      const it = items[keyOf(model, c)];
      const s = isSubmitted(it) ? it.submitted : null;
      const vals = [];
      model.questions.forEach(q => {
        const x = (s && s.q[q.key]) || {};
        const opt = x.agreed && x.agreed !== NO_CONSENSUS ? q.scale.find(o => o.name === x.agreed) : null;
        vals.push(opt ? opt.value : '', x.agreed === NO_CONSENSUS ? NO_CONSENSUS_LABEL : (opt ? opt.name : (x.agreed || '')), x.note || '');
        const a = metrics.humanCell(c, q);
        vals.push(a.status, a.majority || '', a.humanDis.join('; '));
      });
      vals.push(s && s.status ? statusName(s.status) : '', s ? s.comment : '', s ? s.next_steps : '', s ? s.submitted_at : '');
      rowsByIndex[c.row - 1] = vals;
    });
    const extraRows = ctx.parsed.rows.slice(1).map((_, r) => rowsByIndex[r] || header.map(() => ''));
    return CD.csv.rebuild(ctx.parsed, ctx.det.original, header, extraRows);
  }

  // Notes carried by an uploaded CSV that this tool exported earlier. They come back as submitted.
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
      const low = status.toLowerCase();
      it.status = (STATUSES.find(s => s.value === status || [s.name].concat(s.also).some(n => n.toLowerCase() === low)) || STATUSES[0]).value;
      it.comment = get(row, 'consensus/comment');
      it.next_steps = get(row, 'consensus/next_steps');
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
      if (hasContent(fieldsOf(it))) {
        const at = get(row, 'consensus/updated_at').trim() || '1970-01-01T00:00:00.000Z';
        it.updated_at = at;
        submit(it, at);
        out[keyOf(model, c)] = it;
      }
    });
    return out;
  }

  // Per conversation the newer record wins: the file's submit time against the browser's last edit
  // or submit. Returns the merged items and where each came from.
  function merge(fromFile, fromDraft) {
    const items = {}; let file = 0, draft = 0;
    const stamp = it => [it.updated_at || '', isSubmitted(it) ? it.submitted.submitted_at : ''].sort().pop();
    new Set(Object.keys(fromFile).concat(Object.keys(fromDraft))).forEach(k => {
      const a = fromFile[k], b = fromDraft[k];
      if (a && (!b || stamp(a) >= stamp(b))) { items[k] = a; file++; } else { items[k] = b; draft++; }
    });
    return { items, file, draft };
  }

  const api = { STATUSES, NO_CONSENSUS, NO_CONSENSUS_LABEL, statusName, keyOf, empty, fieldsOf, isSubmitted, isDirty, submit, isRecorded, clean, submittedOnly, counts, loadDraft, saveDraft, pendingCount, exportColumns, exportCsv, importFromCsv, merge, storageKey };
  CD.consensus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
