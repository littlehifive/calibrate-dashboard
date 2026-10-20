// Invented data shaped exactly like a Calibrate items export, for trying the page and for tests.
// No real conversation is involved; every message is made up and repetitive by design.
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};

  const USER_LINES = [
    ['नमस्ते, मुझे एक सवाल पूछना है।', 'Hello, I want to ask a question.'],
    ['मेरी अगली जांच कब है?', 'When is my next check-up?'],
    ['क्या यह सामान्य है?', 'Is this normal?'],
    ['धन्यवाद, समझ गई।', 'Thank you, I understood.'],
    ['कृपया बताएं क्या खाना चाहिए।', 'Please tell me what I should eat.'],
  ];
  const AGENT_LINES = [
    ['नमस्ते! बताइए, मैं आपकी कैसे मदद कर सकती हूँ?', 'Hello! Tell me, how can I help you?'],
    ['कृपया अपने नजदीकी स्वास्थ्य केंद्र पर जांच करवाएं।', 'Please get a check-up at your nearest health centre.'],
    ['यह आम बात है, पर ध्यान रखें।', 'This is common, but please take care.'],
    ['दिन में तीन बार पौष्टिक भोजन लें, "दाल" और सब्ज़ी के साथ।', 'Eat nutritious food three times a day, with "dal", and vegetables.'],
  ];
  const STATES = ['Uttar Pradesh', 'Madhya Pradesh', 'Punjab', 'Karnataka'];
  const AREAS = ['ANC', 'PNC', 'Newborn care'];
  const RATING = ['Yes', 'No', 'Not enough Information', 'Not Applicable'];
  const QUESTIONS = [
    { name: 'Easy to understand' }, { name: 'Empathetic' }, { name: 'Accurate' }, { name: 'Safe' },
    { name: 'Classification', binary: true, optional: true, names: { false: 'Routine', true: 'Emergency' } },
  ];

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // opts: seed, conversations, raters, prefix ("Demo W1"), aiVersions ([1]; [] = no AI), comments (true),
  // agreement (0..1), questions (QUESTIONS), names (raw ids, optional)
  function makeCsv(opts) {
    opts = Object.assign({ seed: 7, conversations: 12, raters: ['asha', 'meena', 'ravi', 'john'], prefix: 'Demo W1', aiVersions: [1], comments: true, agreement: 0.72, questions: QUESTIONS }, opts || {});
    const r = rng(opts.seed);
    const pick = list => list[Math.floor(r() * list.length)];
    const qname = q => (opts.prefix ? opts.prefix + ' - ' : '') + q.name;
    const key = q => qname(q).replace(/ /g, '_');
    const raters = opts.raters.slice().sort();
    const header = ['name', 'description', 'conversation_history'];
    opts.questions.forEach(q => {
      raters.forEach(rt => header.push(rt + '_' + key(q) + '/value', rt + '_' + key(q) + '/reasoning'));
      opts.aiVersions.forEach(v => header.push('evaluator_' + key(q) + '_v' + v + '/value', 'evaluator_' + key(q) + '_v' + v + '/reasoning'));
    });
    if (opts.comments) raters.forEach(rt => header.push(rt + '/comment'));
    const rows = [header];
    for (let c = 0; c < opts.conversations; c++) {
      const id = opts.names ? opts.names[c] : (c === 3 ? "'-" : '') + String(9100000000 + Math.floor(r() * 899999999));
      const n = 4 + Math.floor(r() * 6);
      const start = Date.UTC(2026, 2, 1 + Math.floor(r() * 50), 4, 30);
      const history = [];
      for (let k = 0; k < n; k++) {
        const user = k % 2 === 0, line = pick(user ? USER_LINES : AGENT_LINES);
        const t = new Date(start + k * 7 * 60000).toISOString().slice(0, 19).replace('T', ' ');
        history.push({ role: user ? 'user' : 'assistant', content: '*** ' + (user ? 'USER' : 'AGENT') + ' ***\nType: text | Tags: none\n\n[Hindi]\n' + line[0] + '\n\n[English]\n' + line[1], created_at: t });
      }
      const desc = ['Chat ID: ' + id.replace(/^'/, ''), 'Messages: ' + n, 'User state: ' + pick(STATES), 'RES program: RES', 'RES condition area: ' + pick(AREAS)].join(';\n') + ';';
      const row = [id, desc, JSON.stringify(history)];
      opts.questions.forEach(q => {
        const options = q.binary ? ['false', 'true'] : ['1', '2', '3', '4'];
        const truth = r() < 0.65 ? options[0] : pick(options);
        const said = () => (r() < opts.agreement ? truth : pick(options));
        const name = v => (q.binary ? q.names[v] : RATING[+v - 1]);
        raters.forEach(() => {
          if (q.optional && r() < 0.25) { row.push('', ''); return; }
          const v = said();
          row.push(v, r() < 0.5 ? 'Picked ' + name(v) + ', because the reply was "fine", mostly.\nSecond line.' : '');
        });
        opts.aiVersions.forEach(() => { const v = said(); row.push(name(v), 'The agent response ' + (v === options[0] ? 'meets' : 'misses') + ' the bar.'); });
      });
      if (opts.comments) raters.forEach(() => row.push(r() < 0.15 ? 'Practice comment, with a comma.' : ''));
      rows.push(row);
    }
    return rows.map(row => CD.csv.line(row, ',')).join('\n');
  }

  const api = { makeCsv, QUESTIONS };
  CD.demo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
