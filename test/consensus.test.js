const test = require('node:test');
const assert = require('node:assert/strict');
const CD = require('./load.js');

function setup(text) {
  const ctx = CD.parse.read(text, 'Demo-items.csv');
  const model = CD.parse.buildModel(ctx, CD.scales.resolve(ctx), {});
  return { ctx, model, metrics: CD.metrics.create(model) };
}
const K = CD.consensus;
const submitted = (fields, at) => K.submit(Object.assign(K.empty(), fields, { updated_at: at }), at);

test('only submitted decisions are exported; the original text is kept and notes re-import as submitted', () => {
  const original = CD.demo.makeCsv({ conversations: 6 });
  const a = setup(original);
  const [c1, c2, c3] = a.model.conversations;
  const q = a.model.questions;
  const items = {
    [K.keyOf(a.model, c1)]: submitted({ status: 'agreed', comment: 'Talked it through, "quoted", and\nmulti-line.', next_steps: 'Update rubric example', q: { [q[0].key]: { agreed: 'No', note: 'Jargon in turn 2' }, [q[4].key]: { agreed: 'Emergency', note: '' } } }, '2026-10-20T10:00:00.000Z'),
    [K.keyOf(a.model, c2)]: submitted({ status: 'follow_up', q: { [q[1].key]: { agreed: K.NO_CONSENSUS, note: 'Ask the clinician' } } }, '2026-10-20T10:05:00.000Z'),
    // a draft that was never submitted: not exported
    [K.keyOf(a.model, c3)]: Object.assign(K.empty(), { comment: 'still talking', updated_at: '2026-10-20T10:06:00.000Z' }),
  };
  const out = K.exportCsv(a.ctx, a.model, a.metrics, items);

  const p = CD.csv.parse(out);
  const orig = CD.csv.parse(original);
  const n = orig.rows[0].length;
  assert.deepEqual(p.rows.map(r => r.slice(0, n)), orig.rows);
  assert.ok(out.startsWith(original.split('\n')[0] + ','));
  assert.deepEqual(p.rows[0].slice(n), K.exportColumns(a.model));

  const row = i => Object.fromEntries(p.rows[0].map((h, j) => [h, p.rows[i][j]]));
  assert.equal(row(1)['consensus_' + q[0].key + '/value'], '2');
  assert.equal(row(1)['consensus_' + q[0].key + '/label'], 'No');
  assert.equal(row(1)['consensus_' + q[4].key + '/value'], 'true');
  assert.equal(row(1)['consensus/status'], 'Resolved');
  assert.equal(row(1)['consensus/updated_at'], '2026-10-20T10:00:00.000Z');
  assert.equal(row(3)['consensus/comment'], '', 'the unsubmitted draft is not in the download');
  assert.ok(['unanimous', 'disagree', 'split', 'thin'].includes(row(1)['agreement_' + q[0].key + '/status']));

  // Re-upload: same dataset fingerprint, the two submitted decisions come back as submitted.
  const b = setup(out);
  assert.equal(b.ctx.fp, a.ctx.fp);
  const back = K.importFromCsv(b.ctx, b.model);
  assert.deepEqual(Object.keys(back).sort(), [K.keyOf(a.model, c1), K.keyOf(a.model, c2)].sort());
  Object.entries(back).forEach(([k, it]) => {
    assert.ok(K.isSubmitted(it) && !K.isDirty(it));
    assert.deepEqual(K.fieldsOf(it), K.fieldsOf(items[k]));
  });

  // Exporting again from the re-uploaded file replaces the old consensus columns instead of doubling them.
  assert.equal(K.exportCsv(b.ctx, b.model, b.metrics, back), K.exportCsv(a.ctx, a.model, a.metrics, items));
});

test('dirty means changes that are not submitted yet', () => {
  const it = K.empty();
  assert.equal(K.isDirty(it), false);
  it.comment = 'first thoughts';
  assert.equal(K.isDirty(it), true);
  K.submit(it, '2026-10-20T10:00:00.000Z');
  assert.equal(K.isDirty(it), false);
  it.q = { x: { agreed: 'Yes', note: '' } };
  assert.equal(K.isDirty(it), true);
  K.submit(it, '2026-10-20T10:01:00.000Z');
  assert.deepEqual(K.counts({ a: it, b: Object.assign(K.empty(), { status: 'agreed' }) }), { submitted: 1, dirty: 1 });
});

test('merge keeps the newer record per conversation', () => {
  const file = { x: submitted({ status: 'agreed' }, '2026-10-20T10:00:00Z'), y: submitted({ status: 'agreed' }, '2026-10-20T12:00:00Z') };
  const draft = {
    x: Object.assign(submitted({ status: 'agreed' }, '2026-10-20T10:00:00Z'), { status: 'follow_up', updated_at: '2026-10-20T11:00:00Z' }), // edited after the download
    z: Object.assign(K.empty(), { comment: 'only here', updated_at: '2026-10-20T09:00:00Z' }),
  };
  const m = K.merge(file, draft);
  assert.equal(m.items.x.status, 'follow_up');
  assert.ok(K.isDirty(m.items.x));
  assert.equal(m.items.y.status, 'agreed');
  assert.equal(m.items.z.comment, 'only here');
  assert.equal(m.file, 1); assert.equal(m.draft, 2);
});

test('repeated ids fall back to row keys', () => {
  const text = CD.demo.makeCsv({ conversations: 3, names: ['5', '5', '6'] });
  const { model } = setup(text);
  assert.equal(model.meta.unique_ids, false);
  assert.deepEqual(model.conversations.map(c => K.keyOf(model, c)), ['row:1', 'row:2', 'row:3']);
});

test('outcome names from earlier versions still read back', () => {
  const a = setup(CD.demo.makeCsv({ conversations: 2 }));
  const lines = CD.csv.parse(K.exportCsv(a.ctx, a.model, a.metrics, {
    [K.keyOf(a.model, a.model.conversations[0])]: submitted({ status: 'agreed', comment: 'x' }, '2026-10-20T10:00:00.000Z'),
    [K.keyOf(a.model, a.model.conversations[1])]: submitted({ status: 'rubric_change', comment: 'y' }, '2026-10-20T10:00:00.000Z'),
  })).rows;
  const col = lines[0].indexOf('consensus/status');
  assert.equal(lines[1][col], 'Resolved');
  lines[1][col] = 'Agreed'; lines[2][col] = 'Change rubric'; // as written by the first version
  const b = setup(lines.map(r => CD.csv.line(r, ',')).join('\n'));
  const items = Object.values(K.importFromCsv(b.ctx, b.model));
  assert.deepEqual(items.map(it => it.status), ['agreed', 'rubric_change']);
});
