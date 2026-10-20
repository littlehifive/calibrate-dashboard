const test = require('node:test');
const assert = require('node:assert/strict');
const CD = require('./load.js');

const load = (opts, specs, saved) => {
  const ctx = CD.parse.read(CD.demo.makeCsv(opts), 'Demo_Task-items.csv');
  assert.ok(!ctx.error, ctx.error);
  const scales = CD.scales.resolve(ctx, specs, saved);
  return { ctx, scales, model: CD.parse.buildModel(ctx, scales, {}) };
};

test('five-rater export: raters from comment columns, newest AI version, presets name every answer', () => {
  const { ctx, model } = load({ raters: ['eli', 'ana', 'chen', 'bo', 'dara'], prefix: 'TW4', aiVersions: [1, 3] });
  assert.equal(ctx.det.method, 'comment columns');
  assert.deepEqual(model.raters.map(r => r.key), ['ana', 'bo', 'chen', 'dara', 'eli', 'ai']);
  assert.equal(model.raters.at(-1).name, 'AI evaluator (v3)');
  assert.deepEqual(model.questions.map(q => q.short), ['Easy to understand', 'Empathetic', 'Accurate', 'Safe', 'Classification']);
  assert.deepEqual(model.questions.map(q => q.source), ['preset', 'preset', 'preset', 'preset', 'preset']);
  assert.ok(model.questions.every(q => q.aiMapped));
  assert.equal(model.questions[4].binary, true);
  assert.deepEqual(model.questions[4].scale.map(o => o.name), ['Routine', 'Emergency']);
  const labels = new Set(model.conversations.flatMap(c => Object.values(c.ratings).flatMap(per => Object.values(per).map(x => x.label))));
  for (const l of labels) assert.ok(l == null || ['Yes', 'No', 'Not enough Information', 'Not Applicable', 'Routine', 'Emergency'].includes(l), l);
  assert.deepEqual(model.warnings, []);
});

test('ids keep their raw form but display without the formula escape', () => {
  const { model } = load({});
  const c = model.conversations[3];
  assert.match(c.rawId, /^'-\d+$/);
  assert.equal(c.id, c.rawId.slice(1));
});

test('transcript and description follow the skill format', () => {
  const { model } = load({});
  const m = model.conversations[0].transcript[0];
  assert.equal(m.speaker, 'User');
  assert.equal(m.original_label, 'Hindi');
  assert.equal(m.translation_label, 'English');
  assert.deepEqual(m.meta, [{ label: 'Type', value: 'text' }, { label: 'Tags', value: 'none' }]);
  assert.deepEqual(model.conversations[0].description.map(d => d.label), ['Chat ID', 'Messages', 'User state', 'RES program', 'RES condition area']);
  assert.deepEqual(model.meta.hint_fields, ['User state', 'RES condition area']);
});

test('no AI and no comment columns: raters found from the column pattern', () => {
  const { ctx, model } = load({ aiVersions: [], comments: false });
  assert.equal(ctx.det.method, 'column pattern');
  assert.deepEqual(model.raters.map(r => r.key), ['asha', 'john', 'meena', 'ravi']);
  assert.ok(!model.raters.some(r => r.kind === 'ai'));
  assert.equal(model.questions[0].source, 'preset'); // matched by question name
});

test('rater keys containing underscores', () => {
  const { model } = load({ raters: ['mary_k', 'asha', 'li_wei'] });
  assert.deepEqual(model.raters.filter(r => r.kind === 'human').map(r => [r.key, r.name]), [['asha', 'Asha'], ['li_wei', 'Li Wei'], ['mary_k', 'Mary K']]);
  assert.deepEqual(model.warnings, []);
});

test('rater keys containing underscores without comment columns fall back to AI question names', () => {
  const { ctx, model } = load({ raters: ['mary_k', 'asha'], comments: false });
  assert.equal(ctx.det.method, 'question names');
  assert.deepEqual(model.raters.map(r => r.key), ['asha', 'mary_k', 'ai']);
});

test('unknown questions stay unnamed without AI; with AI, its answer names pick a preset', () => {
  const questions = [{ name: 'Tone fits' }, { name: 'Flagged', binary: true, names: { false: 'No', true: 'Yes' } }];
  const a = load({ questions, aiVersions: [] }).model;
  assert.deepEqual(a.questions.map(q => q.source), ['unnamed', 'unnamed']);
  assert.deepEqual(a.questions[0].scale.map(o => o.name), ['1', '2', '3', '4']);
  const b = load({ questions, prefix: '' });
  // AI names {Yes, No, ...} fit the 4-option preset for the rating question, and Yes/No for the binary one
  assert.deepEqual(b.model.questions.map(q => q.source), ['preset', 'preset']);
  assert.equal(b.model.questions[1].scale.find(o => o.value === 'true').name, 'Yes');
});

test('evaluators.json without the workshop prefix still matches, and wins over presets', () => {
  const specs = [{ name: 'Classification', output_type: 'binary', scale: [{ value: true, name: 'Urgent', color: '#f00' }, { value: false, name: 'Fine' }] }];
  const { model } = load({ prefix: 'TW9' }, specs);
  const q = model.questions.find(q => q.short === 'Classification');
  assert.equal(q.source, 'evaluators.json');
  assert.deepEqual(q.scale.map(o => [o.value, o.name]), [['true', 'Urgent'], ['false', 'Fine']]);
  assert.equal(q.name, 'TW9 - Classification');
});

test('a mapping saved in the browser wins over presets', () => {
  const saved = { 'Demo_W1_-_Safe': { binary: false, scale: [{ value: '1', name: 'Safe' }, { value: '2', name: 'Unsafe' }, { value: '3', name: 'Unclear' }, { value: '4', name: 'N/A' }] } };
  const { model } = load({}, null, saved);
  const q = model.questions.find(q => q.short === 'Safe');
  assert.equal(q.source, 'saved');
  assert.deepEqual(q.scale.map(o => o.name), ['Safe', 'Unsafe', 'Unclear', 'N/A']);
});

test('reports a file that is not an items export', () => {
  assert.match(CD.parse.read('chat_id,text\n1,hi', 'x.csv').error, /no “name” or “conversation_history” column/);
});

test('short names: " - " prefix or a shared word prefix', () => {
  assert.deepEqual(CD.parse.shortNames(['TW4 - A b', 'TW4 - C']), ['A b', 'C']);
  assert.deepEqual(CD.parse.shortNames(['Q1 Tone', 'Q1 Safety']), ['Tone', 'Safety']);
  assert.deepEqual(CD.parse.shortNames(['Tone', 'Safety']), ['Tone', 'Safety']);
});
