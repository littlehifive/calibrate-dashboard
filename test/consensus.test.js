const test = require('node:test');
const assert = require('node:assert/strict');
const CD = require('./load.js');

function setup(text) {
  const ctx = CD.parse.read(text, 'Demo-items.csv');
  const model = CD.parse.buildModel(ctx, CD.scales.resolve(ctx), {});
  return { ctx, model, metrics: CD.metrics.create(model) };
}

test('export keeps the original text, appends columns, and re-imports to the same notes', () => {
  const original = CD.demo.makeCsv({ conversations: 6 });
  const a = setup(original);
  const [c1, c2] = a.model.conversations;
  const q = a.model.questions;
  const items = {
    [CD.consensus.keyOf(a.model, c1)]: { status: 'agreed', comment: 'Talked it through, "quoted", and\nmulti-line.', next_steps: 'Update rubric example', q: { [q[0].key]: { agreed: 'No', note: 'Jargon in turn 2' }, [q[4].key]: { agreed: 'Emergency', note: '' } }, updated_at: '2026-10-20T10:00:00.000Z' },
    [CD.consensus.keyOf(a.model, c2)]: { status: 'follow_up', comment: '', next_steps: '', q: { [q[1].key]: { agreed: CD.consensus.NO_CONSENSUS, note: 'Ask the clinician' } }, updated_at: '2026-10-20T10:05:00.000Z' },
  };
  const out = CD.consensus.exportCsv(a.ctx, a.model, a.metrics, items);

  // Every original line's text is kept in front of the new cells.
  const p = CD.csv.parse(out);
  const orig = CD.csv.parse(original);
  const n = orig.rows[0].length;
  assert.deepEqual(p.rows.map(r => r.slice(0, n)), orig.rows);
  assert.ok(out.startsWith(original.split('\n')[0] + ','));
  assert.deepEqual(p.rows[0].slice(n), CD.consensus.exportColumns(a.model));

  const row1 = Object.fromEntries(p.rows[0].map((h, i) => [h, p.rows[1][i]]));
  assert.equal(row1['consensus_' + q[0].key + '/value'], '2');
  assert.equal(row1['consensus_' + q[0].key + '/label'], 'No');
  assert.equal(row1['consensus_' + q[4].key + '/value'], 'true');
  assert.equal(row1['consensus/status'], 'Agreed');
  assert.ok(['unanimous', 'disagree', 'split', 'thin'].includes(row1['agreement_' + q[0].key + '/status']));

  // Re-upload: same dataset fingerprint, same notes.
  const b = setup(out);
  assert.equal(b.ctx.fp, a.ctx.fp);
  assert.deepEqual(b.model.raters.map(r => r.key), a.model.raters.map(r => r.key));
  assert.deepEqual(CD.consensus.importFromCsv(b.ctx, b.model), items);

  // Exporting again from the re-uploaded file replaces the old consensus columns instead of doubling them.
  const again = CD.consensus.exportCsv(b.ctx, b.model, b.metrics, items);
  assert.equal(again, out);
});

test('merge keeps the newer record per conversation', () => {
  const file = { x: { status: 'agreed', updated_at: '2026-10-20T10:00:00Z' }, y: { status: 'agreed', updated_at: '2026-10-20T12:00:00Z' } };
  const draft = { x: { status: 'follow_up', updated_at: '2026-10-20T11:00:00Z' }, z: { comment: 'only here', updated_at: '2026-10-20T09:00:00Z' } };
  const m = CD.consensus.merge(file, draft);
  assert.equal(m.items.x.status, 'follow_up');
  assert.equal(m.items.y.status, 'agreed');
  assert.equal(m.items.z.comment, 'only here');
  assert.equal(m.file, 1); assert.equal(m.draft, 2);
});

test('repeated ids fall back to row keys', () => {
  const text = CD.demo.makeCsv({ conversations: 3, names: ['5', '5', '6'] });
  const { model } = setup(text);
  assert.equal(model.meta.unique_ids, false);
  assert.deepEqual(model.conversations.map(c => CD.consensus.keyOf(model, c)), ['row:1', 'row:2', 'row:3']);
});
