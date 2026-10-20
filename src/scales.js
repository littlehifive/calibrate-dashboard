// Answer names. Calibrate stores a human answer as the option's value (1, 2, true) and the AI
// judge's answer as the option's name ("Yes"), so the CSV alone cannot tell which value is "Yes".
// Sources, first match wins: an evaluators.json the person drops in, a mapping they saved in this
// browser, a built-in preset whose pattern fits, else the raw values (and the AI is left out of
// every comparison for that question until the options are named).
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};
  const PALETTE = ['#16a34a', '#dc2626', '#ca8a04', '#6b7280', '#2563eb', '#9333ea', '#0891b2'];

  const PRESETS = [
    {
      id: 'yes-no-nei-na', binary: false,
      questions: ['easy to understand', 'empathetic', 'contextually appropriate', 'clear next steps', 'accurate', 'safe'],
      scale: [
        { value: '1', name: 'Yes', description: 'Meets this standard.', color: '#16a34a' },
        { value: '2', name: 'No', description: 'Does not meet this standard.', color: '#dc2626' },
        { value: '3', name: 'Not enough Information', description: 'The conversation does not contain enough information to judge this.', color: '#ca8a04' },
        { value: '4', name: 'Not Applicable', description: 'This criterion does not apply to this conversation.', color: '#6b7280' },
      ],
    },
    {
      id: 'routine-emergency', binary: true, questions: ['classification'],
      scale: [
        { value: 'false', name: 'Routine', description: 'Can be handled through routine advice and follow-up.', color: '#16a34a' },
        { value: 'true', name: 'Emergency', description: 'Needs urgent medical attention or escalation.', color: '#dc2626' },
      ],
    },
    {
      id: 'yes-no', binary: true, questions: [],
      scale: [
        { value: 'true', name: 'Yes', description: '', color: '#16a34a' },
        { value: 'false', name: 'No', description: '', color: '#dc2626' },
      ],
    },
  ];

  const lower = s => String(s).toLowerCase();
  const isBool = v => v === 'true' || v === 'false';

  // evaluators.json as the calibrate-workshop skill writes it: a list, or {"evaluators": [...]}.
  function readSpecs(json) {
    const list = Array.isArray(json) ? json : (json && Array.isArray(json.evaluators) ? json.evaluators : null);
    if (!list || !list.every(s => s && typeof s.name === 'string')) throw new Error('This JSON is not an evaluator list (expected objects with a "name" and a "scale").');
    return list;
  }
  // Exact column key first; then a spec without the workshop prefix ("Accurate" for W4_-_Accurate).
  function matchSpec(qkey, specs) {
    const key = s => CD.parse.columnKey(s.name);
    return specs.find(s => key(s) === qkey) || specs.find(s => qkey.endsWith('_' + key(s)));
  }
  function specScale(spec) {
    const binary = spec.output_type === 'binary';
    const scale = Array.isArray(spec.scale) && spec.scale.length ? spec.scale
      : binary ? [{ value: true, name: 'Yes' }, { value: false, name: 'No' }] : [];
    return { binary, scale: scale.map(o => ({ value: CD.parse.normValue(o.value), name: String(o.name), description: o.description || '', color: o.color })) };
  }
  function presetFor(fullName, binary, humanVals, aiNames) {
    const name = lower(fullName);
    return PRESETS.find(p => {
      if (p.binary !== binary) return false;
      const values = p.scale.map(o => o.value), names = p.scale.map(o => lower(o.name));
      if (!humanVals.every(v => values.includes(v))) return false;
      if (aiNames.length) return aiNames.every(n => names.includes(lower(n)));
      return p.questions.some(q => name === q || name.endsWith(' ' + q));
    });
  }
  const byValue = (a, b) => (isFinite(a) && isFinite(b) ? a - b : String(a).localeCompare(String(b)));

  function finish(base, extra) {
    const scale = base.scale.map((o, i) => Object.assign({}, o, { color: o.color || PALETTE[i % PALETTE.length] }));
    const lookup = {}, aiLookup = {};
    scale.forEach(o => {
      lookup[o.value] = o.name; lookup[o.name] = o.name;
      aiLookup[lower(o.name)] = o.name; aiLookup[lower(o.value)] = o.name;
    });
    return Object.assign({ scale, lookup, aiLookup, binary: base.binary }, extra);
  }

  // ctx from CD.parse.read; specs: evaluators.json list or null; saved: {qkey: {binary, scale}}.
  function resolve(ctx, specs, saved) {
    specs = specs || []; saved = saved || {};
    const out = {};
    ctx.det.questions.forEach(q => {
      const usage = ctx.extracted.usage[q.key];
      const humanVals = Object.keys(usage.human), aiNames = Object.keys(usage.ai);
      const binaryGuess = humanVals.length ? humanVals.every(isBool) : false;
      const fullName = q.key.replace(/_/g, ' ');
      const spec = specs.length ? matchSpec(q.key, specs) : null;
      const common = { humanValues: usage.human, aiValues: usage.ai, hasAI: !!q.ai };
      if (spec) {
        const s = specScale(spec);
        out[q.key] = finish(s, Object.assign(common, {
          source: 'evaluators.json', aiMapped: true, optional: !!spec.optional,
          description: spec.description || '', rubric: spec.rubric || '', focus: spec.focus || '',
          specName: CD.parse.columnKey(spec.name) === q.key ? spec.name : null,
        }));
        return;
      }
      const mine = saved[q.key];
      if (mine && Array.isArray(mine.scale) && humanVals.every(v => mine.scale.some(o => o.value === v))) {
        out[q.key] = finish({ binary: !!mine.binary, scale: mine.scale }, Object.assign(common, { source: 'saved', aiMapped: true, optional: hasSkips(ctx, q), description: mine.description || '', rubric: mine.rubric || '' }));
        return;
      }
      const preset = presetFor(fullName, binaryGuess, humanVals, aiNames);
      if (preset) {
        out[q.key] = finish({ binary: preset.binary, scale: preset.scale }, Object.assign(common, { source: 'preset', aiMapped: true, optional: hasSkips(ctx, q) }));
        return;
      }
      const values = humanVals.slice().sort(byValue);
      out[q.key] = finish({ binary: binaryGuess, scale: values.map(v => ({ value: v, name: v, description: '' })) },
        Object.assign(common, { source: 'unnamed', aiMapped: false, optional: hasSkips(ctx, q) }));
    });
    return out;
  }
  // A question someone skipped is treated as optional (Calibrate stores a skip as an empty cell).
  function hasSkips(ctx, q) {
    return ctx.extracted.items.some(it => Object.entries(it.ratings[q.key]).some(([rk, x]) => rk !== 'ai' && x.raw == null));
  }

  function unnamed(scales) { return Object.keys(scales).filter(k => scales[k].source === 'unnamed'); }

  // evaluators.json for the next workshop (values typed back to numbers / booleans).
  function toSpecs(model) {
    const typed = v => (isBool(v) ? v === 'true' : (isFinite(v) && v !== '' ? Number(v) : v));
    return model.questions.map(q => ({
      name: q.name, description: q.description || '', output_type: q.binary ? 'binary' : 'rating',
      optional: !!q.optional,
      scale: q.scale.map(o => ({ value: typed(o.value), name: o.name, description: o.description || '', color: o.color })),
    }));
  }

  const api = { resolve, readSpecs, matchSpec, unnamed, toSpecs, PRESETS, PALETTE };
  CD.scales = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
