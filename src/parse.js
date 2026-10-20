// Turn a Calibrate annotation-task export ("<task>-items.csv") into the dashboard model.
// Everything is inferred from the column names, so new rater names, question names, prefixes
// and AI-judge versions need no configuration:
//   name, description, conversation_history          the item as uploaded
//   <rater>_<Question_Name>/value, /reasoning        one pair per human rater and question
//   <rater>/comment                                   the rater's note on the whole conversation
//   evaluator_<Question_Name>_v<N>/value, /reasoning  the AI judge, version N (only if it was run)
// Spaces in question names become underscores. Columns this tool adds on export start with
// consensus_ / consensus/ / agreement_ and are kept apart from the ratings.
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};

  const REQUIRED = ['name', 'conversation_history'];
  const RESERVED = /^(consensus|agreement)([_/]|$)/;
  const AI_RE = /^evaluator_(.+)_v(\d+)\/(value|reasoning)$/;

  // Mirrors the message body the calibrate-workshop skill's build_items.py writes.
  const MESSAGE_RE = /^\*\*\* ([^*]+?) \*\*\*\n(?:([^\n]+)\n)?\n\[([^\]]+)\]\n([\s\S]*?)(?:\n\n\[([^\]]+)\]\n([\s\S]*))?$/;

  // ---------- small helpers ----------
  // Human answers are scale values; spreadsheets sometimes rewrite them as True / 1.0.
  function normValue(v) {
    const s = (v == null ? '' : String(v)).trim();
    if (/^(true|false)$/i.test(s)) return s.toLowerCase();
    if (/^-?\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
    return s;
  }
  const clean = v => { const s = (v == null ? '' : String(v)).trim(); return s || null; };
  const columnKey = name => String(name).replace(/ /g, '_');
  const displayId = raw => String(raw).replace(/^'/, ''); // the export's formula escape: '-123 -> -123
  function displayName(key) {
    return String(key).split(/[_.\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || String(key);
  }
  function titleFromFile(fileName) {
    const base = String(fileName || '').replace(/\.[^.]+$/, '').replace(/-items$/i, '').replace(/[_]+/g, ' ').trim();
    return base || 'Calibrate review';
  }
  // 'W4 - Easy to understand' -> 'Easy to understand'; otherwise drop a prefix all names share.
  function shortNames(names) {
    if (names.every(n => n.includes(' - '))) return names.map(n => n.slice(n.indexOf(' - ') + 3));
    if (names.length < 2) return names.slice();
    let p = names[0];
    names.forEach(n => { while (p && !n.startsWith(p)) p = p.slice(0, -1); });
    p = p.slice(0, p.lastIndexOf(' ') + 1);
    return p && names.every(n => n.length > p.length) ? names.map(n => n.slice(p.length)) : names.slice();
  }
  // cyrb53: a fast non-cryptographic hash, enough to recognise the same dataset again.
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  }

  // ---------- which column is what ----------
  function splitByRaters(prefixes, raters) {
    const sorted = raters.slice().sort((a, b) => b.length - a.length);
    const pairs = new Map(), unmatched = [];
    prefixes.forEach(p => {
      const r = sorted.find(r => p.length > r.length + 1 && p.startsWith(r + '_'));
      if (r) pairs.set(p, { rater: r, q: p.slice(r.length + 1) }); else unmatched.push(p);
    });
    return { pairs, unmatched };
  }
  function splitByQuestions(prefixes, qkeys) {
    const sorted = [...new Set(qkeys)].sort((a, b) => b.length - a.length);
    const pairs = new Map(), unmatched = [];
    prefixes.forEach(p => {
      const q = sorted.find(q => p.length > q.length + 1 && p.endsWith('_' + q));
      if (q) pairs.set(p, { rater: p.slice(0, p.length - q.length - 1), q }); else unmatched.push(p);
    });
    return { pairs, unmatched };
  }
  // Without comment or AI columns: split at the k-th underscore, taking the first k that turns the
  // columns into a complete rater x question grid.
  function splitByGrid(prefixes) {
    const minParts = Math.min(...prefixes.map(p => p.split('_').length));
    for (let k = 1; k < minParts; k++) {
      const pairs = new Map();
      prefixes.forEach(p => { const parts = p.split('_'); pairs.set(p, { rater: parts.slice(0, k).join('_'), q: parts.slice(k).join('_') }); });
      const R = new Set([...pairs.values()].map(x => x.rater)), Q = new Set([...pairs.values()].map(x => x.q));
      if (R.size * Q.size === prefixes.length) return { pairs, unmatched: [] };
    }
    return { pairs: new Map(), unmatched: prefixes.slice() };
  }

  function detect(header, opts) {
    opts = opts || {};
    const idx = {};
    header.forEach((h, i) => { if (!(h in idx)) idx[h] = i; });
    const missing = REQUIRED.filter(c => !(c in idx));
    if (missing.length) {
      return { error: 'This file has no ' + missing.map(c => '“' + c + '”').join(' or ') + ' column. Is it the items export from the Calibrate task page (one row per conversation)?' };
    }
    const reserved = [], original = [];
    header.forEach((h, i) => (RESERVED.test(h) ? reserved : original).push(i));

    // AI judge: keep the newest version of each question.
    const ai = {};
    header.forEach(h => {
      const m = AI_RE.exec(h); if (!m || m[3] !== 'value') return;
      const v = +m[2], cur = ai[m[1]];
      if (!cur) ai[m[1]] = { version: v, base: h.slice(0, -6), versions: [v] };
      else { cur.versions.push(v); if (v > cur.version) { cur.version = v; cur.base = h.slice(0, -6); } }
    });

    const humanPrefixes = header.filter(h => h.endsWith('/value') && !RESERVED.test(h) && !h.startsWith('evaluator_')).map(h => h.slice(0, -6));
    const commentRaters = header.filter(h => /^[^/]+\/comment$/.test(h) && !RESERVED.test(h)).map(h => h.slice(0, -8));
    const qHints = Object.keys(ai).concat((opts.questionKeys || []));

    const attempts = [];
    if (commentRaters.length) attempts.push(Object.assign(splitByRaters(humanPrefixes, commentRaters), { method: 'comment columns' }));
    if (qHints.length) attempts.push(Object.assign(splitByQuestions(humanPrefixes, qHints), { method: 'question names' }));
    if (humanPrefixes.length) attempts.push(Object.assign(splitByGrid(humanPrefixes), { method: 'column pattern' }));
    let chosen = attempts.find(a => !a.unmatched.length) || attempts.slice().sort((a, b) => a.unmatched.length - b.unmatched.length)[0];
    if (!chosen) chosen = { pairs: new Map(), unmatched: [], method: 'none' };

    // Order: raters as the export lists them (comment columns, else first appearance); questions by first appearance.
    const raterSet = new Set([...chosen.pairs.values()].map(x => x.rater));
    const raters = commentRaters.filter(r => raterSet.has(r));
    [...chosen.pairs.values()].forEach(x => { if (!raters.includes(x.rater)) raters.push(x.rater); });
    const qOrder = [];
    header.forEach(h => {
      let q = null;
      const m = AI_RE.exec(h);
      if (m && m[3] === 'value') q = m[1];
      else if (h.endsWith('/value') && chosen.pairs.has(h.slice(0, -6))) q = chosen.pairs.get(h.slice(0, -6)).q;
      if (q && !qOrder.includes(q)) qOrder.push(q);
    });
    const col = name => (name in idx ? idx[name] : -1);
    const questions = qOrder.map(key => ({
      key,
      ai: ai[key] ? { value: col(ai[key].base + '/value'), reasoning: col(ai[key].base + '/reasoning'), version: ai[key].version, versions: ai[key].versions.sort((a, b) => a - b) } : null,
      human: Object.fromEntries(raters.filter(r => (r + '_' + key + '/value') in idx).map(r => [r, { value: col(r + '_' + key + '/value'), reasoning: col(r + '_' + key + '/reasoning') }])),
    }));
    return {
      idx, original, reserved, raters, questions,
      comments: Object.fromEntries(raters.filter(r => (r + '/comment') in idx).map(r => [r, idx[r + '/comment']])),
      method: chosen.method,
      unmatched: chosen.unmatched.map(p => p + '/value'),
      hasAI: Object.keys(ai).length > 0,
    };
  }

  // ---------- conversation content ----------
  function parsePairs(text, sep) {
    const out = [];
    String(text || '').split(sep).forEach(entry => {
      entry = entry.trim().replace(/;+$/, '');
      const k = entry.indexOf(':');
      const label = (k < 0 ? entry : entry.slice(0, k)).trim();
      if (label) out.push({ label, value: k < 0 ? '' : entry.slice(k + 1).trim() });
    });
    return out;
  }
  // "Label: value;\n" pairs as the skill writes them; anything else is shown as one block of text.
  function parseDescription(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const pairs = parsePairs(raw, ';\n');
    if (pairs.length && pairs.every(p => p.value !== '' && p.label.length <= 60)) return pairs;
    return [{ label: 'Description', value: raw }];
  }
  function speakerName(raw) {
    const s = String(raw || '').trim();
    if (/^[A-Z]{1,3}$/.test(s)) return s; // MSE, ASHA-style acronyms stay in capitals
    return s.toLowerCase().replace(/(^|[\s_-])\S/g, m => m.toUpperCase());
  }
  function parseTranscript(raw) {
    let list;
    try { list = JSON.parse(raw); } catch (e) { list = null; }
    if (!Array.isArray(list)) {
      return { ok: false, messages: [{ role: 'user', speaker: 'Transcript', meta: [], original_label: null, original: null, translation_label: 'Raw', translation: String(raw || ''), time: null }] };
    }
    const messages = list.map(m => {
      const content = String((m && m.content) || '');
      const match = MESSAGE_RE.exec(content.replace(/\n+$/, ''));
      if (match) {
        const translated = match[5] != null;
        return {
          role: m.role, speaker: speakerName(match[1]), meta: parsePairs(match[2] || '', '|'),
          original_label: translated ? match[3] : null, original: translated ? match[4].trim() : null,
          translation_label: translated ? match[5] : match[3], translation: (translated ? match[6] : match[4]).trim(),
          time: m.created_at || null,
        };
      }
      return { role: m && m.role, speaker: speakerName(m && m.role), meta: [], original_label: null, original: null, translation_label: 'Message', translation: content, time: (m && m.created_at) || null };
    });
    return { ok: true, messages };
  }

  // Description labels worth showing under each list row: present everywhere, a few short values.
  function guessHintFields(conversations) {
    const seen = new Map();
    conversations.forEach(c => c.description.forEach(d => {
      if (!seen.has(d.label)) seen.set(d.label, { n: 0, values: new Set(), long: false });
      const s = seen.get(d.label); s.n++; s.values.add(d.value); if (d.value.length > 40) s.long = true;
    }));
    const out = [];
    seen.forEach((s, label) => {
      const numeric = [...s.values].every(v => /^-?[\d.,\s]+$/.test(v));
      if (out.length < 3 && s.n === conversations.length && !s.long && !numeric && s.values.size >= 2 && s.values.size <= 8 && !/\bid$|^description$/i.test(label)) out.push(label);
    });
    return out;
  }

  // ---------- read the rows ----------
  // Raw values per question, before answer names are known (scales.js resolves those).
  function extract(parsed, det) {
    const rows = parsed.rows.slice(1);
    const cell = (row, i) => (i >= 0 && i < row.length ? row[i] : '');
    const usage = {};
    det.questions.forEach(q => { usage[q.key] = { human: {}, ai: {} }; });
    const items = rows.map((row, r) => {
      const ratings = {};
      det.questions.forEach(q => {
        const per = {};
        Object.entries(q.human).forEach(([rk, c]) => {
          const v = normValue(cell(row, c.value));
          if (v) usage[q.key].human[v] = (usage[q.key].human[v] || 0) + 1;
          per[rk] = { raw: v || null, reasoning: clean(cell(row, c.reasoning)) };
        });
        if (q.ai) {
          const v = String(cell(row, q.ai.value)).trim();
          if (v) usage[q.key].ai[v] = (usage[q.key].ai[v] || 0) + 1;
          per.ai = { raw: v || null, reasoning: clean(cell(row, q.ai.reasoning)) };
        }
        ratings[q.key] = per;
      });
      const comments = {};
      Object.entries(det.comments).forEach(([rk, i]) => { const t = clean(cell(row, i)); if (t) comments[rk] = t; });
      const t = parseTranscript(cell(row, det.idx.conversation_history));
      const rawId = cell(row, det.idx.name);
      return {
        row: r + 1, rawId, id: displayId(rawId) || String(r + 1),
        description: parseDescription('description' in det.idx ? cell(row, det.idx.description) : ''),
        transcript: t.messages, transcriptOk: t.ok, ratings, comments,
      };
    });
    return { items, usage };
  }

  function fingerprint(parsed, det) {
    const header = det.original.map(i => parsed.rows[0][i]).join('\u0001');
    const ids = parsed.rows.slice(1).map(r => r[det.idx.name]).join('\u0001');
    return hash(header + '\u0002' + ids);
  }

  // ---------- model ----------
  // `scales` comes from CD.scales.resolve; `settings` holds the person's overrides (title, names, hints).
  function buildModel(ctx, scales, settings) {
    const { parsed, det, extracted, fileName } = ctx;
    settings = settings || {};
    const names = settings.raterNames || {};
    const raters = det.raters.map(k => { const name = names[k] || displayName(k); return { key: k, name, short: name, kind: 'human' }; });
    if (det.hasAI) {
      const versions = [...new Set(det.questions.filter(q => q.ai).map(q => 'v' + q.ai.version))];
      raters.push({ key: 'ai', name: 'AI evaluator (' + versions.join(', ') + ')', short: 'AI', kind: 'ai' });
    }
    const fullNames = det.questions.map(q => (scales[q.key] && scales[q.key].specName) || q.key.replace(/_/g, ' '));
    const shorts = shortNames(fullNames);
    const questions = det.questions.map((q, i) => {
      const s = scales[q.key];
      return {
        key: q.key, name: fullNames[i], short: (settings.questionNames || {})[q.key] || shorts[i],
        description: s.description || '', rubric: s.rubric || '', focus: s.focus || '',
        binary: s.binary, optional: s.optional,
        scale: s.scale.map(o => ({ value: o.value, name: o.name, color: o.color, description: o.description || '' })),
        source: s.source, aiMapped: s.aiMapped, hasAI: !!q.ai, aiVersion: q.ai ? q.ai.version : null,
      };
    });
    const warnings = [];
    const unknown = [];
    const conversations = extracted.items.map((it, n) => {
      const ratings = {};
      det.questions.forEach(q => {
        const s = scales[q.key], per = {};
        Object.entries(it.ratings[q.key]).forEach(([rk, x]) => {
          let label = null;
          if (x.raw != null) {
            if (rk === 'ai') label = s.aiMapped ? (s.aiLookup[x.raw.toLowerCase()] || null) : null;
            else label = s.lookup[x.raw] || null;
            if (label == null && !(rk === 'ai' && !s.aiMapped)) { unknown.push([it.id, q.key, rk, x.raw]); label = x.raw; }
          }
          per[rk] = { label, reasoning: x.reasoning, raw: x.raw };
        });
        ratings[q.key] = per;
      });
      return { idx: n + 1, row: it.row, id: it.id, rawId: it.rawId, description: it.description, transcript: it.transcript, ratings, comments: it.comments };
    });
    if (det.unmatched.length) warnings.push(det.unmatched.length + ' rating column(s) could not be matched to a rater and question and are ignored (e.g. ' + det.unmatched.slice(0, 2).join(', ') + ').');
    if (unknown.length) warnings.push(unknown.length + ' answer(s) did not match any answer option and are shown as they appear in the file.');
    const badTranscripts = extracted.items.filter(it => !it.transcriptOk).length;
    if (badTranscripts) warnings.push(badTranscripts + ' conversation(s) have a transcript that is not valid JSON (was the CSV saved from a spreadsheet, which cuts long cells?). They are shown as raw text.');
    const ids = conversations.map(c => c.id);
    if (new Set(ids).size !== ids.length) warnings.push('Some conversation ids repeat; consensus notes are matched by row instead.');
    const title = settings.title || titleFromFile(fileName);
    return {
      meta: {
        title, task_name: title, source_file: fileName || '', generated_at: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
        n_conversations: conversations.length, fingerprint: ctx.fp, storage_key: 'cd-' + ctx.fp,
        hint_fields: settings.hintFields || guessHintFields(conversations), id_label: 'Conversation ID',
        detected_by: det.method, unique_ids: new Set(ids).size === ids.length,
      },
      raters, questions, conversations, warnings,
    };
  }

  // One call for the common path: CSV text -> context (everything except answer names).
  function read(text, fileName, opts) {
    const parsed = CD.csv.parse(text);
    if (parsed.rows.length < 2) return { error: 'This file has no data rows.' };
    const det = detect(parsed.rows[0], opts);
    if (det.error) return { error: det.error };
    if (!det.questions.length) return { error: 'No rating columns were found (columns ending in “/value”). Is this the items export from a Calibrate annotation task?' };
    const extracted = extract(parsed, det);
    return { parsed, det, extracted, fileName, fp: fingerprint(parsed, det) };
  }

  const api = { read, detect, extract, buildModel, fingerprint, parseTranscript, parseDescription, guessHintFields, normValue, columnKey, displayId, displayName, titleFromFile, shortNames, speakerName, hash, RESERVED };
  CD.parse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
