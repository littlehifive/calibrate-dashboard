// Page controller: reading dropped files, the setup panel, header actions, downloads and the
// protected copy. Nothing here touches the network; the page's CSP forbids it.
(function (root) {
  'use strict';
  const CD = root.CD;
  const $ = id => document.getElementById(id);
  const esc = CD.dashboard.esc;
  const K = CD.consensus;

  // The page exactly as loaded, before anything is rendered: the base of protected copies.
  const APP_HTML = '<!doctype html>\n' + document.documentElement.outerHTML;
  const UNLOCK = JSON.parse($('unlock-template').textContent);

  const store = {
    get(k, d) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const UI_KEY = 'cd:ui';
  const SCALES_KEY = 'cd:scales';

  // S: everything about the loaded file. ctx is absent in a read-only copy.
  let S = null;
  const state = Object.assign({ tab: 'overview', ref: 'humans', cat: 'strict', sort: 'disagree', qFocus: '', matrixQ: 'all', sel: 0, showOriginal: false, distCounts: false, show: 'all', allQs: false, cfilter: 'recorded' }, store.get(UI_KEY, {}));
  function persistUi() { store.set(UI_KEY, { ref: state.ref, cat: state.cat, sort: state.sort, showOriginal: state.showOriginal }); }

  // ---------- loading ----------
  function startError(msg) { const e = $('start-error'); e.textContent = msg; e.hidden = !msg; }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Could not read ' + file.name));
      r.readAsText(file, 'utf-8');
    });
  }
  async function handleFiles(list) {
    startError('');
    const files = Array.from(list || []);
    const csv = files.filter(f => /\.(csv|tsv|txt)$/i.test(f.name) || /csv/.test(f.type));
    const json = files.filter(f => /\.json$/i.test(f.name) || /json/.test(f.type));
    if (files.some(f => /\.(xlsx|xls)$/i.test(f.name))) return startError('That is an Excel file. Download the CSV from Calibrate instead (or save it as “CSV UTF-8”).');
    let specs = null;
    try {
      if (json.length) specs = CD.scales.readSpecs(JSON.parse(await readFile(json[0])));
    } catch (e) { return startError(json[0].name + ': ' + e.message); }
    if (!csv.length) {
      if (specs && S && S.ctx) { S.specs = specs; rebuild('Answer names taken from ' + json[0].name + '.'); return; }
      return startError(specs ? 'Got the evaluators file; now add the items CSV as well.' : 'Choose the items CSV from Calibrate (a .csv file).');
    }
    if (csv.length > 1) return startError('Drop one CSV at a time.');
    try {
      load(await readFile(csv[0]), csv[0].name, specs);
    } catch (e) {
      startError('Could not read ' + csv[0].name + ': ' + e.message);
    }
  }

  function load(text, fileName, specs) {
    const ctx = CD.parse.read(text, fileName, { questionKeys: (specs || []).map(s => CD.parse.columnKey(s.name)) });
    if (ctx.error) { startError(ctx.error); return; }
    const fp = ctx.fp;
    S = { ctx, specs, settings: store.get('cd:' + fp + ':settings', {}), readOnly: false, notices: [] };
    const draft = K.loadDraft({ meta: { fingerprint: fp } });
    S.draft = draft;
    build();
    // Notes carried by the file (an earlier download) and by this browser: the newer one wins.
    const fromFile = K.importFromCsv(ctx, S.model);
    const merged = K.merge(fromFile, K.clean(draft.items));
    S.draft.items = merged.items;
    if (Object.keys(fromFile).length || Object.keys(draft.items).length) {
      const parts = [];
      if (merged.file) parts.push(merged.file + ' from the file');
      if (merged.draft) parts.push(merged.draft + ' saved earlier in this browser');
      if (parts.length) S.notices.push({ text: 'Consensus notes restored for ' + (merged.file + merged.draft) + ' conversation' + (merged.file + merged.draft === 1 ? '' : 's') + ': ' + parts.join(', ') + '.' });
      // Notes that came in the file were downloaded already; newer browser notes were not.
      const inFile = Object.values(fromFile).map(it => it.updated_at).sort().pop();
      if (inFile && inFile > (S.draft.downloadedAt || '')) S.draft.downloadedAt = inFile;
    }
    K.saveDraft(S.model, S.draft);
    state.sel = 0;
    show();
    if (CD.scales.unnamed(S.scales).length) openSetup();
  }

  function build() {
    S.scales = CD.scales.resolve(S.ctx, S.specs, store.get(SCALES_KEY, {}));
    S.model = CD.parse.buildModel(S.ctx, S.scales, S.settings);
  }
  function rebuild(notice) {
    build();
    if (notice) S.notices.push({ text: notice });
    show();
  }

  function loadPreload(P) {
    S = { ctx: null, model: P.model, draft: { items: P.items || {}, downloadedAt: '' }, readOnly: true, notices: [] };
    S.notices.push({ text: 'Read-only copy made ' + new Date(P.created_at).toLocaleString() + ' from ' + (P.model.meta.source_file || 'a Calibrate export') + '. Consensus notes are shown but cannot be edited here.' });
    show();
  }

  // ---------- showing ----------
  let view = null;
  function show() {
    const D = S.model;
    S.metrics = CD.metrics.create(D, () => state);
    if (!D.raters.some(r => r.kind === 'ai')) state.ref = 'humans';
    $('start').hidden = true; $('app').hidden = false;
    document.title = D.meta.title;
    $('title').textContent = D.meta.title;
    const humans = D.raters.filter(r => r.kind === 'human').length, ai = D.raters.find(r => r.kind === 'ai');
    $('subtitle').textContent = (D.meta.source_file ? D.meta.source_file + ' · ' : '') + D.conversations.length + ' conversations · ' + humans + ' human raters' + (ai ? ' + ' + ai.name : ' (no AI evaluator in this export)') + ' · ' + D.questions.length + ' questions';
    ['act-download', 'act-protect', 'act-setup'].forEach(id => { $(id).hidden = S.readOnly; });
    $('act-open').hidden = S.readOnly;
    $('ro-tag').hidden = !S.readOnly;
    $('ref-control').hidden = !ai;
    // The grouping switch only means something when a question has more than two options.
    const groupable = D.questions.filter(q => !q.binary && q.scale.length > 2);
    const firsts = [...new Set(groupable.map(q => q.scale[0].name))];
    $('cat-control').hidden = !firsts.length;
    if (!firsts.length) state.cat = 'strict';
    $('cat-yes-btn').textContent = firsts.length === 1 && groupable.every(q => q.source !== 'unnamed') ? firsts[0] + ' vs. not ' + firsts[0] : 'First option vs. rest';
    syncSeg();
    view = CD.dashboard.create({ model: D, metrics: S.metrics, state, draft: S.draft, readOnly: S.readOnly, onNote, persist: persistUi, setTab });
    if (state.sel >= D.conversations.length) state.sel = 0;
    const hm = /^#c-(.+)$/.exec(location.hash);
    if (hm) {
      let id; try { id = decodeURIComponent(hm[1]); } catch (e) { id = hm[1]; }
      const i = D.conversations.findIndex(c => c.id === id);
      if (i >= 0) { state.sel = i; state.tab = 'conversations'; }
    } else if (location.hash === '#consensus') state.tab = 'consensus';
    renderBanners();
    view.renderAll();
    setTab(state.tab === 'setup' ? 'overview' : state.tab);
    updatePending();
  }

  function renderBanners() {
    const el = $('banners');
    const D = S.model;
    let h = '';
    S.notices.forEach((n, i) => { h += '<div class="banner"><span>' + esc(n.text) + '</span><span class="sp"></span><button class="x" data-dismiss="' + i + '" aria-label="Dismiss">×</button></div>'; });
    D.warnings.forEach(w => { h += '<div class="banner warn"><span>' + esc(w) + '</span></div>'; });
    const unnamed = D.questions.filter(q => q.source === 'unnamed');
    if (unnamed.length && !S.readOnly) h += '<div class="banner warn"><span>The answer options of ' + unnamed.length + ' question' + (unnamed.length > 1 ? 's are' : ' is') + ' not named yet (' + esc(unnamed.map(q => q.short).join(', ')) + '). The export stores answers as values, so name them once' + (D.raters.some(r => r.kind === 'ai') ? ' to compare the AI evaluator' : '') + '.</span><span class="sp"></span><button class="btn" data-setup>Name the options</button></div>';
    el.innerHTML = h;
    el.querySelectorAll('[data-dismiss]').forEach(b => b.addEventListener('click', () => { S.notices.splice(+b.dataset.dismiss, 1); renderBanners(); }));
    el.querySelectorAll('[data-setup]').forEach(b => b.addEventListener('click', openSetup));
  }

  function setTab(t) {
    state.tab = t;
    document.querySelectorAll('.tabs [role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    ['overview', 'conversations', 'consensus', 'setup'].forEach(v => { $('view-' + v).hidden = t !== v; });
    const C = S.model.conversations;
    if (t === 'overview') history.replaceState(null, '', '#overview');
    else if (t === 'consensus') { view.renderConsensus(); history.replaceState(null, '', '#consensus'); }
    else if (t === 'conversations' && C[state.sel]) history.replaceState(null, '', view.anchor(C[state.sel]));
  }
  function syncSeg() {
    document.querySelectorAll('#ref-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ref === state.ref)));
    document.querySelectorAll('#cat-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === state.cat)));
  }

  // ---------- consensus notes ----------
  let saveTimer = null;
  function onNote() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { K.saveDraft(S.model, S.draft); }, 300);
    updatePending();
  }
  function updatePending() {
    const n = S && !S.readOnly ? K.pendingCount(S.draft) : 0;
    const el = $('pending');
    el.hidden = !n; el.textContent = n;
    $('act-download').title = n ? n + ' conversation' + (n > 1 ? 's' : '') + ' with notes not downloaded yet' : 'The original CSV plus consensus columns';
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const baseName = () => (S.ctx.fileName || 'calibrate-export').replace(/\.[^.]+$/, '').replace(/-consensus-\d{4}-\d{2}-\d{2}(-\d+)?$/, '');
  function downloadCsv() {
    clearTimeout(saveTimer);
    const text = K.exportCsv(S.ctx, S.model, CD.metrics.create(S.model), K.clean(S.draft.items));
    download(baseName() + '-consensus-' + today() + '.csv', text, 'text/csv;charset=utf-8');
    S.draft.downloadedAt = new Date().toISOString();
    K.saveDraft(S.model, S.draft);
    updatePending();
  }

  // ---------- setup ----------
  function openSetup() {
    if (!S || S.readOnly) return;
    renderSetup();
    setTab('setup');
    window.scrollTo(0, 0);
  }
  function renderSetup() {
    const D = S.model, det = S.ctx.det;
    const descLabels = [...new Set(D.conversations.flatMap(c => c.description.map(d => d.label)))];
    const srcName = { 'evaluators.json': 'from evaluators.json', saved: 'saved in this browser', preset: 'recognised', unnamed: 'not named yet' };
    let h = '<section class="panel setup"><div class="panel-head"><h2>Setup</h2><p>Everything below was read from the column names. Check it once; your changes are remembered in this browser for this file and for questions with the same name.</p></div>';
    h += '<div class="row" style="margin-bottom:14px"><label class="inline">Title <input type="text" id="s-title" size="48" value="' + esc(D.meta.title) + '"></label>';
    h += '<span class="muted" style="font-size:12.5px">' + D.conversations.length + ' conversations · raters found from the ' + esc(det.method) + (det.hasAI ? ' · AI evaluator ' + esc(D.raters.at(-1).name.replace(/^AI evaluator /, '')) : ' · no AI evaluator') + '</span></div>';

    h += '<h3>Raters</h3><div class="tablewrap" style="margin:6px 0 14px"><table style="width:auto"><thead><tr><th>In the export</th><th>Shown as</th></tr></thead><tbody>';
    D.raters.filter(r => r.kind === 'human').forEach(r => { h += '<tr><td class="mono">' + esc(r.key) + '</td><td><input type="text" data-rater="' + esc(r.key) + '" value="' + esc(r.name) + '"></td></tr>'; });
    h += '</tbody></table></div>';

    h += '<h3>Questions and answer options</h3><p class="muted" style="font-size:12.5px;margin:4px 0 10px">Calibrate stores a rater’s answer as the option’s value (1, 2, true…) and the AI evaluator’s answer as its name. Give every value the name raters saw; for the AI to be compared, the names must match the AI’s answers.</p><div class="grid">';
    D.questions.forEach(q => {
      const s = S.scales[q.key];
      const aiNames = Object.keys(s.aiValues || {});
      const human = s.humanValues || {};
      const values = [...new Set(q.scale.map(o => o.value).concat(Object.keys(human)))];
      h += '<div class="qcard' + (q.source === 'unnamed' ? ' need' : '') + '" data-q="' + esc(q.key) + '">';
      h += '<div class="qhead"><input type="text" data-qname value="' + esc(q.short) + '" aria-label="Short name"><span class="src ' + esc(q.source) + '">' + esc(srcName[q.source] || q.source) + '</span>' + (q.binary ? '<span class="muted" style="font-size:12px">yes/no type</span>' : '') + '</div>';
      h += '<div class="mono muted" style="font-size:11.5px">' + esc(q.key) + '</div>';
      h += '<table><thead><tr><th>Value</th><th>Used</th><th>Name</th><th>Colour</th></tr></thead><tbody>';
      values.forEach((v, i) => {
        const o = q.scale.find(x => x.value === v) || { name: v, color: CD.scales.PALETTE[i % CD.scales.PALETTE.length] };
        h += '<tr data-value="' + esc(v) + '"><td class="mono">' + esc(v) + '</td><td class="num muted">' + (human[v] || 0) + '×</td><td><input type="text" data-oname list="ai-' + esc(q.key) + '" value="' + esc(o.name) + '"></td><td><input type="color" data-ocolor value="' + esc(/^#[0-9a-f]{6}$/i.test(o.color) ? o.color : '#6b7280') + '"></td></tr>';
      });
      h += '</tbody></table>';
      if (aiNames.length) {
        h += '<datalist id="ai-' + esc(q.key) + '">' + aiNames.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>';
        h += '<div class="seen">AI answered: ' + aiNames.map(n => '<span class="mono">' + esc(n) + '</span> ' + s.aiValues[n] + '×').join(', ') + '</div>';
      }
      h += '</div>';
    });
    h += '</div>';

    if (descLabels.length) {
      h += '<h3 style="margin-top:16px">Shown under each conversation in the list</h3><div class="row" style="margin:6px 0 4px">';
      descLabels.forEach(l => { h += '<label class="inline"><input type="checkbox" data-hint value="' + esc(l) + '"' + (D.meta.hint_fields.includes(l) ? ' checked' : '') + '> ' + esc(l) + '</label>'; });
      h += '</div>';
    }
    h += '<div class="foot"><button class="btn primary" id="s-apply" type="button">Apply</button><button class="btn" id="s-cancel" type="button">Cancel</button><span class="sp" style="flex:1"></span>';
    h += '<label class="btn" style="cursor:pointer">Load evaluators.json<input type="file" id="s-specs" accept=".json,application/json" hidden></label><button class="btn" id="s-export" type="button">Download evaluators.json</button></div>';
    h += '<div id="s-error" class="err" role="alert" hidden style="margin-top:8px"></div></section>';
    $('view-setup').innerHTML = h;

    $('s-cancel').addEventListener('click', () => setTab('overview'));
    $('s-apply').addEventListener('click', applySetup);
    $('s-export').addEventListener('click', () => {
      download(baseName() + '-evaluators.json', JSON.stringify(CD.scales.toSpecs(collectModel()), null, 2) + '\n', 'application/json');
    });
    $('s-specs').addEventListener('change', async e => {
      try {
        S.specs = CD.scales.readSpecs(JSON.parse(await readFile(e.target.files[0])));
        build(); renderSetup();
        S.notices.push({ text: 'Answer names taken from ' + e.target.files[0].name + '.' });
      } catch (err) { const el = $('s-error'); el.textContent = err.message; el.hidden = false; }
    });
  }
  // The model with the setup form's values applied (for export and apply).
  function collectModel() {
    const D = S.model;
    const questions = D.questions.map(q => {
      const card = document.querySelector('.qcard[data-q="' + CSS.escape(q.key) + '"]');
      const scale = [...card.querySelectorAll('tr[data-value]')].map(tr => ({
        value: tr.dataset.value, name: tr.querySelector('[data-oname]').value.trim() || tr.dataset.value,
        color: tr.querySelector('[data-ocolor]').value, description: (q.scale.find(o => o.value === tr.dataset.value) || {}).description || '',
      }));
      return Object.assign({}, q, { short: card.querySelector('[data-qname]').value.trim() || q.short, scale });
    });
    return Object.assign({}, D, { questions });
  }
  function applySetup() {
    const D = S.model, err = $('s-error');
    const edited = collectModel();
    const dupes = edited.questions.filter(q => new Set(q.scale.map(o => o.name)).size !== q.scale.length);
    if (dupes.length) { err.textContent = 'Two values share a name in: ' + dupes.map(q => q.short).join(', ') + '. Each option needs its own name.'; err.hidden = false; return; }
    const saved = store.get(SCALES_KEY, {});
    edited.questions.forEach(q => { saved[q.key] = { binary: q.binary, scale: q.scale, description: q.description, rubric: q.rubric }; });
    store.set(SCALES_KEY, saved);
    S.specs = null; // the form now holds the complete mapping
    const autoShort = CD.parse.shortNames(D.questions.map(q => q.name));
    S.settings = {
      title: $('s-title').value.trim() || D.meta.title,
      raterNames: Object.fromEntries([...document.querySelectorAll('[data-rater]')].map(i => [i.dataset.rater, i.value.trim() || i.dataset.rater])),
      questionNames: Object.fromEntries(edited.questions.filter((q, i) => q.short !== autoShort[i]).map(q => [q.key, q.short])),
      hintFields: [...document.querySelectorAll('[data-hint]:checked')].map(i => i.value),
    };
    store.set('cd:' + S.ctx.fp + ':settings', S.settings);
    // Agreed answers recorded under an old option name follow the rename.
    D.questions.forEach((q, qi) => {
      const rename = {}; q.scale.forEach(o => { const n = edited.questions[qi].scale.find(x => x.value === o.value); if (n && n.name !== o.name) rename[o.name] = n.name; });
      if (Object.keys(rename).length) Object.values(S.draft.items).forEach(it => { const x = it.q && it.q[q.key]; if (x && rename[x.agreed]) x.agreed = rename[x.agreed]; });
    });
    K.saveDraft(D, S.draft);
    state.tab = 'overview';
    rebuild();
  }

  // ---------- protected copy ----------
  function openProtect() {
    if (!(root.crypto && root.crypto.subtle)) { alert('This browser cannot encrypt here. Open the page over https (the hosted address) or from a saved file.'); return; }
    $('pw1').value = ''; $('pw2').value = ''; $('protect-status').textContent = ''; $('protect-go').disabled = false;
    $('dlg-protect').showModal();
  }
  async function protect(e) {
    const submitter = e.submitter;
    if (!submitter || submitter.value !== 'go') return;
    e.preventDefault();
    const st = $('protect-status'), p1 = $('pw1').value, p2 = $('pw2').value;
    if (p1.length < CD.snapshot.MIN_PASSWORD) { st.textContent = 'Use at least ' + CD.snapshot.MIN_PASSWORD + ' characters.'; return; }
    if (p1 !== p2) { st.textContent = 'The two passwords differ.'; return; }
    $('protect-go').disabled = true; st.textContent = 'Encrypting…';
    try {
      const preload = { v: 1, created_at: new Date().toISOString(), model: S.model, items: K.clean(S.draft.items) };
      const page = await CD.snapshot.makeProtectedCopy(APP_HTML, UNLOCK, preload, p1, { title: S.model.meta.title, eyebrow: 'Calibrate agreement review' });
      download(baseName() + '-protected-' + today() + '.html', page, 'text/html;charset=utf-8');
      $('dlg-protect').close();
    } catch (err) {
      st.textContent = err.message; $('protect-go').disabled = false;
    }
  }

  // ---------- wiring ----------
  const drop = $('drop'), input = $('file');
  input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); if (t === 'drop' || e.target === document.documentElement) drop.classList.remove('over'); }));
  document.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  $('demo').addEventListener('click', () => load(CD.demo.makeCsv({ conversations: 16 }), 'Demo_Labeling_Workshop-items.csv', null));

  $('act-download').addEventListener('click', downloadCsv);
  $('act-protect').addEventListener('click', openProtect);
  $('act-setup').addEventListener('click', openSetup);
  $('act-open').addEventListener('click', () => {
    if (K.pendingCount(S.draft) && !confirm('Some notes are not downloaded yet. They stay saved in this browser and come back when you open this file again. Continue?')) return;
    K.saveDraft(S.model, S.draft);
    S = null; $('app').hidden = true; $('start').hidden = false; document.title = 'Calibrate Agreement Review';
    history.replaceState(null, '', location.pathname + location.search);
  });
  $('protect-form').addEventListener('submit', protect);

  document.querySelectorAll('.tabs [role="tab"]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('ref-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.ref = b.dataset.ref; persistUi(); syncSeg(); view.renderAll(); });
  $('cat-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.cat = b.dataset.cat; persistUi(); syncSeg(); view.renderAll(); });
  document.addEventListener('keydown', e => {
    if (!S || state.tab !== 'conversations' || e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'j') view.selectConv(state.sel + 1);
    if (e.key === 'ArrowLeft' || e.key === 'k') view.selectConv(state.sel - 1);
  });
  window.addEventListener('beforeunload', e => {
    if (!S || S.readOnly) return;
    clearTimeout(saveTimer); K.saveDraft(S.model, S.draft);
    if (K.pendingCount(S.draft)) { e.preventDefault(); e.returnValue = ''; }
  });

  const tip = $('tip');
  document.addEventListener('mouseover', e => {
    const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip; tip.hidden = false;
  });
  document.addEventListener('mousemove', e => {
    if (tip.hidden) return;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 16, window.innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('[data-tip]')) tip.hidden = true; });

  // A protected copy carries its data; the plain page waits for a file.
  const pre = document.getElementById('preload');
  if (pre) loadPreload(JSON.parse(pre.textContent));
})(typeof globalThis !== 'undefined' ? globalThis : this);
