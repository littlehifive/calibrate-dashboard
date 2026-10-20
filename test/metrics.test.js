const test = require('node:test');
const assert = require('node:assert/strict');
const CD = require('./load.js');

test("Krippendorff's alpha matches the published nominal example (0.743)", () => {
  // Krippendorff (2011), "Computing Krippendorff's Alpha-Reliability": 4 coders, 12 units, missing data.
  const A = [1, 2, 3, 3, 2, 1, 4, 1, 2, null, null, null];
  const B = [1, 2, 3, 3, 2, 2, 4, 1, 2, 5, null, 3];
  const C = [null, 3, 3, 3, 2, 3, 4, 2, 2, 5, 1, null];
  const D = [1, 2, 3, 3, 2, 4, 4, 1, 2, 5, 1, null];
  const units = A.map((_, i) => ({ a: A[i], b: B[i], c: C[i], d: D[i] }));
  assert.equal(CD.metrics.krippAlpha(units, ['a', 'b', 'c', 'd']).toFixed(3), '0.743');
});

function tiny() {
  // 3 humans + AI on one question: unanimous, 2-1 disagree, split (1-1 with a skip), thin
  const scale = [{ name: 'Yes', value: '1' }, { name: 'No', value: '2' }, { name: 'NEI', value: '3' }];
  const q = { key: 'q', binary: false, scale };
  const rows = [['Yes', 'Yes', 'Yes', 'Yes'], ['Yes', 'Yes', 'No', 'No'], ['Yes', 'No', null, 'Yes'], ['Yes', null, null, null], ['NEI', 'No', 'No', 'Yes']];
  const R = ['a', 'b', 'c'].map(k => ({ key: k, kind: 'human' })).concat([{ key: 'ai', kind: 'ai' }]);
  const C = rows.map((row, i) => ({ idx: i + 1, ratings: { q: Object.fromEntries(R.map((r, j) => [r.key, { label: row[j] }])) } }));
  return { questions: [q], raters: R, conversations: C };
}

test('majority, dissent, split and thin follow the template rules', () => {
  const model = tiny();
  const state = { ref: 'humans', cat: 'strict' };
  const m = CD.metrics.create(model, () => state);
  const st = model.conversations.map(c => m.cell(c, model.questions[0]));
  assert.deepEqual(st.map(a => a.status), ['unanimous', 'disagree', 'split', 'thin', 'disagree']);
  assert.deepEqual(st[1].dis, ['c', 'ai']); // the AI is compared even when not in the reference set
  assert.equal(st[1].majority, 'Yes');
  // "Yes vs. rest": NEI and No fold together, so conversation 5 becomes unanimous among humans
  state.cat = 'yes'; m.clear();
  assert.equal(m.cell(model.conversations[4], model.questions[0]).status, 'disagree');
  assert.equal(m.cell(model.conversations[4], model.questions[0]).majority, 'Not Yes');
  assert.deepEqual(m.cell(model.conversations[4], model.questions[0]).dis, ['ai']);
  // humanCell ignores the switches
  assert.equal(m.humanCell(model.conversations[4], model.questions[0]).majority, 'No');
});

test('qStats: unanimity, AI vs human majority', () => {
  const model = tiny();
  const m = CD.metrics.create(model, () => ({ ref: 'humans', cat: 'strict' }));
  const s = m.qStats(model.questions[0]);
  assert.equal(s.uN, 4); assert.equal(s.uY, 1);
  assert.equal(s.aN, 3); assert.equal(s.aY, 1); // conv 1 agrees, conv 2 and 5 do not; 3 split, 4 thin
  assert.equal(s.splits, 1); assert.equal(s.thin, 1);
});

test('no AI rater: AI statistics are empty, not errors', () => {
  const model = tiny();
  model.raters = model.raters.filter(r => r.kind !== 'ai');
  const m = CD.metrics.create(model);
  const s = m.qStats(model.questions[0]);
  assert.equal(s.aiMaj, null); assert.equal(s.alphaAll, null);
});
