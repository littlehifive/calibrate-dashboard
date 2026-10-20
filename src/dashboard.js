// Rendering: (1) the overview, (2) the conversation review with its three panes, (3) the consensus
// and download page. The agreement numbers come from metrics.js; their definitions from defs.js.
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = v => (v == null ? '–' : Math.round(v * 100) + '%');
  const fmtAlpha = v => (v == null ? '–' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2));
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
  const info = key => '<button class="info" type="button" data-def="' + key + '" aria-label="How this is calculated">i</button>';

  // X: { model, metrics, state, draft, readOnly, onNote(key), persist(), setTab(tab), layout() }
  function create(X) {
    const D = X.model, Q = D.questions, R = D.raters, C = D.conversations, m = X.metrics, state = X.state;
    const HUMANS = m.HUMANS, AI = m.AI;
    const BY_KEY = Object.fromEntries(R.map(r => [r.key, r]));
    const K = CD.consensus, DEFS = CD.defs.DEFS;
    const raw = m.raw, cell = m.cell, groupable = m.groupable, notLabel = m.notLabel;
    const lab = (q, l) => m.lab(q, l);
    const itemOf = c => X.draft.items[K.keyOf(D, c)];
    const submitted = c => K.isSubmitted(itemOf(c));
    const dirty = c => K.isDirty(itemOf(c));
    const qByKey = k => Q.find(q => q.key === k);
    const experts = n => plural(n, 'expert');

    // Short forms for long option names in the compact ratings grid, so six or more people fit:
    // several words become initials ("Not enough Information" -> "NEI"), one long word is cut ("Emergency" -> "Emer.").
    const ABBR = {};
    (function () {
      const names = [...new Set(Q.flatMap(q => q.scale.map(o => o.name)).concat(Q.filter(groupable).map(notLabel)))];
      const used = new Set();
      names.forEach(n => {
        let a = n;
        if (n.length > 6) {
          const words = n.split(/\s+/).filter(Boolean);
          a = words.length > 1 ? words.map(w => w[0]).join('').toUpperCase() : n.slice(0, 4) + '.';
          if (used.has(a)) a = n.slice(0, 6) + '.';
          if (used.has(a)) a = n;
        }
        used.add(a); ABBR[n] = a;
      });
    })();

    function scaleColor(name) {
      for (const q of Q) { const o = q.scale.find(s => s.name === name); if (o && o.color) return o.color; }
      return /^Not /.test(name) ? '#475569' : '#6b7280';
    }
    function chip(label, extra, compact) {
      if (label == null) return '<span class="chip c-none ' + (extra || '') + '">' + (compact ? '–' : 'no answer') + '</span>';
      return '<span class="chip opt ' + (extra || '') + '" style="--c:' + esc(scaleColor(label)) + '">' + esc(compact ? (ABBR[label] || label) : label) + '</span>';
    }
    function bar(v, tip) {
      if (v == null) return '<span class="muted" data-tip="' + esc(tip || '') + '">–</span>';
      return '<span class="bar" data-tip="' + esc(tip || '') + '"><span class="track"><span class="fill" style="width:' + Math.round(v * 100) + '%"></span></span><span class="val">' + pct(v) + '</span></span>';
    }
    function heatClass(frac) {
      if (frac == null) return 'blank';
      if (frac === 0) return 'h0';
      if (frac <= .15) return 'h1'; if (frac <= .3) return 'h2'; if (frac <= .5) return 'h3'; if (frac <= .7) return 'h4'; return 'h5';
    }
    // Violet ramp, darker = more agreement. Percent and kappa use their own cut points.
    function agrClass(v, kappa) {
      if (v == null) return 'blank';
      const cuts = kappa ? [0, 0.2, 0.4, 0.6, 0.8] : [0.5, 0.6, 0.7, 0.8, 0.9];
      let i = 0; while (i < cuts.length && v >= cuts[i]) i++;
      return 'p' + i;
    }
    function ramp(prefix, low, high) {
      return '<div class="ramp"><span>' + low + '</span><span class="sw">' + [0, 1, 2, 3, 4, 5].map(i => '<i style="background:var(--' + prefix + '-' + i + ')"></i>').join('') + '</span><span>' + high + '</span></div>';
    }
    function fact(c, label) { const f = c.description.find(d => d.label.toLowerCase() === label.toLowerCase()); return f ? f.value : null; }
    function convHint(c) { return (D.meta.hint_fields || []).map(l => fact(c, l)).filter(Boolean).join(' · '); }
    function refLabel() { return state.ref === 'all' && AI ? 'experts + AI' : 'experts only'; }
    const anchor = c => '#c-' + encodeURIComponent(c.id);

    // ---------- (1) overview ----------
    function renderOverview() {
      const el = $('view-overview');
      const kp = m.kpis();
      const stats = kp.stats;
      const unnamed = Q.filter(q => q.source === 'unnamed');
      const conflicts = kp.conflicts;
      const discussed = conflicts.filter(submitted).length;
      let h = '';

      // KPI row
      h += '<div class="kpis">';
      h += '<div class="kpi"><span class="k-label">Conversations' + info('conversations') + '</span><span class="k-val">' + C.length + '</span><span class="k-sub">rated by ' + experts(HUMANS.length) + (AI ? ' and the AI evaluator' : '') + '</span></div>';
      h += '<div class="kpi"><span class="k-label">With a conflict' + info('conflicts') + '</span><span class="k-val">' + conflicts.length + ' <small>of ' + C.length + '</small></span>' + (conflicts.length ? '<button class="linkbtn k-go" type="button" id="kpi-conflicts">Review them →</button>' : '<span class="k-sub">nothing to discuss</span>') + '</div>';
      h += '<div class="kpi"><span class="k-label">Questions with reliable agreement' + info('reliable') + '</span><span class="k-val">' + kp.reliable + ' <small>of ' + Q.length + '</small></span><span class="k-sub">experts\' alpha 0.80 or higher</span></div>';
      if (AI) h += '<div class="kpi"><span class="k-label">AI matches the expert majority' + info('aiPooled') + '</span><span class="k-val">' + pct(kp.aiRate) + '</span><span class="k-sub">' + kp.aiY + ' of ' + kp.aiN + ' answers, all questions</span></div>';
      h += '<div class="kpi"><span class="k-label">Decisions submitted' + info('recorded') + '</span><span class="k-val">' + discussed + ' <small>of ' + conflicts.length + '</small></span><span class="k-sub">conversations with a conflict</span></div>';
      h += '</div>';

      // Agreement by question
      h += '<section class="panel"><div class="panel-head"><h2>Agreement by question</h2><p class="desc">How often the ' + experts(HUMANS.length) + ' agreed with each other' + (AI ? ', and how often the AI evaluator gave the experts\' majority answer' : '') + '. Hover over a number to see what it counts, or click <span class="info" style="pointer-events:none">i</span> for the formula.</p></div>';
      h += '<div class="tablewrap"><table><thead><tr><th>Question</th>';
      h += '<th class="num">Experts unanimous' + info('unanimous') + '</th><th class="num">Pairwise agreement' + info('pairwise') + '</th><th class="num">Alpha, experts' + info('alpha') + '</th>';
      if (AI) h += '<th class="num">AI matches majority' + info('aiMaj') + '</th><th class="num">Alpha, experts + AI' + info('alphaAll') + '</th>';
      h += '<th class="num">Ties' + info('ties') + '</th><th class="num">Answers per person' + info('answered') + '</th></tr></thead><tbody>';
      stats.forEach(({ q, s }) => {
        h += '<tr><th title="' + esc([q.description, q.rubric].filter(Boolean).join('\n\n')) + '">' + esc(q.short) + (q.optional ? ' <span class="muted">(optional)</span>' : '') + '</th>';
        h += '<td class="num">' + bar(s.unanimous, s.uY + ' of ' + s.uN + ' conversations: every expert who answered picked the same option.' + (s.uThin ? '\nLeft out: ' + plural(s.uThin, 'conversation') + ' where fewer than 2 experts answered.' : '')) + '</td>';
        const pairTip = s.pairs.length ? 'Average over ' + plural(s.pairs.length, 'pair') + ' of experts. Each pair counts only the conversations both of them answered.' + (s.pairs.length > 1 ? '\nLowest: ' + BY_KEY[s.pairs[0].a].short + ' and ' + BY_KEY[s.pairs[0].b].short + ', ' + pct(s.pairs[0].rate) + '\nHighest: ' + BY_KEY[s.pairs.at(-1).a].short + ' and ' + BY_KEY[s.pairs.at(-1).b].short + ', ' + pct(s.pairs.at(-1).rate) : '') : 'No two experts answered the same conversation.';
        h += '<td class="num">' + bar(s.pairH, pairTip) + '</td>';
        h += '<td class="num" data-tip="' + esc('Krippendorff\'s alpha over the ' + experts(HUMANS.length) + '\' answers.\n0.80 or more: reliable. 0.667 to 0.80: tentative. Below: low.') + '">' + fmtAlpha(s.alphaH) + '<span class="atag">' + CD.defs.alphaWord(s.alphaH) + '</span></td>';
        if (AI) {
          if (!q.hasAI) h += '<td class="num muted">not run</td><td class="num muted">–</td>';
          else if (!q.aiMapped) h += '<td class="num muted" data-tip="Name this question\'s answer options (menu ⋯ → Rename experts and answers) to compare the AI.">options not named</td><td class="num muted">–</td>';
          else {
            const left = [s.aTie && plural(s.aTie, 'tie') + ' among the experts', s.aThin && s.aThin + ' with fewer than 2 expert answers', s.aMissing && s.aMissing + ' the AI did not answer'].filter(Boolean);
            h += '<td class="num">' + bar(s.aiMaj, s.aY + ' of ' + s.aN + ' conversations: the AI gave the experts\' majority answer.' + (left.length ? '\nLeft out: ' + left.join(', ') + '.' : '')) + '</td>';
            h += '<td class="num" data-tip="' + esc('Krippendorff\'s alpha with the AI evaluator added as one more rater. Compare it with the experts-only alpha.') + '">' + fmtAlpha(s.alphaAll) + '<span class="atag">' + CD.defs.alphaWord(s.alphaAll) + '</span></td>';
          }
        }
        h += '<td class="num" data-tip="' + esc(plural(s.splits, 'conversation') + ' where the top two answers tied (' + refLabel() + ').' + (s.thin ? '\n' + plural(s.thin, 'conversation') + ' had fewer than 2 answers.' : '')) + '">' + s.splits + (s.thin ? ' <span class="muted">(+' + s.thin + ' too few)</span>' : '') + '</td>';
        const counts = s.answered, lo = Math.min(...counts), hi = Math.max(...counts);
        h += '<td class="num" data-tip="' + esc(R.map((r, i) => r.short + ': ' + counts[i] + ' of ' + C.length).join('\n')) + '">' + (lo === hi ? lo + ' each' : lo + '–' + hi) + '</td></tr>';
      });
      h += '</tbody></table></div></section>';

      // Who disagrees + pairwise
      h += '<div class="grid-2">';
      h += '<section class="panel"><div class="panel-head"><h2>Who is off the majority' + info('offMajority') + '</h2><p class="desc">Each cell shows <b>answers that differed from the majority / conversations counted</b>. A conversation only counts when it had a majority and that person answered, so the second number can be smaller than ' + C.length + '. Hover over a cell to see what was left out.</p></div>';
      h += '<div class="tablewrap"><table class="heat"><thead><tr><th>Person</th>' + Q.map(q => '<th class="rot">' + esc(q.short) + '</th>').join('') + '<th class="rot">All questions</th></tr></thead><tbody>';
      R.forEach(r => {
        const tot = { k: 0, n: 0, ties: 0, thin: 0, skipped: 0, total: 0 };
        h += '<tr><th' + (r.kind === 'ai' ? ' class="aihead"' : '') + '>' + esc(r.name) + '</th>';
        Q.forEach(q => {
          const d = m.raterDisagreements(r, q);
          Object.keys(tot).forEach(k => { tot[k] += d[k]; });
          const frac = d.n ? d.k / d.n : null;
          h += '<td class="cell"><div class="cellin ' + heatClass(frac) + '" data-tip="' + esc(offTip(r, q.short, d)) + '">' + (d.n ? d.k + '<span class="den">/' + d.n + '</span>' : '–') + '</div></td>';
        });
        const fr = tot.n ? tot.k / tot.n : null;
        h += '<td class="cell"><div class="cellin ' + heatClass(fr) + '" data-tip="' + esc(offTip(r, 'all questions', tot, true)) + '"><b>' + tot.k + '</b><span class="den">/' + tot.n + '</span></div></td></tr>';
      });
      h += '</tbody></table></div>' + ramp('seq', 'none off', 'more off the majority') + '<div class="note"><p>Majority from <b>' + esc(refLabel()) + '</b>.' + (AI && state.ref !== 'all' ? ' Each expert\'s own answer is part of the majority they are compared with, which makes it harder for one expert to end up off it than for the AI. Switch "Majority from" to Experts + AI for an even comparison.' : '') + '</p></div></section>';

      const kappaMode = state.pairMeasure === 'kappa';
      h += '<section class="panel"><div class="panel-head"><h2>Pairwise agreement' + info(kappaMode ? 'kappa' : 'pairPct') + '</h2>';
      h += '<div class="tools"><label>Question <select id="matrix-q" class="inp">' + ['<option value="all"' + (state.matrixQ === 'all' ? ' selected' : '') + '>All questions</option>'].concat(Q.map(q => '<option value="' + esc(q.key) + '"' + (state.matrixQ === q.key ? ' selected' : '') + '>' + esc(q.short) + '</option>')).join('') + '</select></label>';
      h += '<label>Show <select id="matrix-m" class="inp"><option value="pct"' + (!kappaMode ? ' selected' : '') + '>% same answer</option><option value="kappa"' + (kappaMode ? ' selected' : '') + '>Cohen\'s kappa</option></select></label></div>';
      h += '<p class="desc">' + (kappaMode ? 'Agreement between each pair, corrected for chance: <span class="formula-line">κ = (p<sub>o</sub> − p<sub>e</sub>) ÷ (1 − p<sub>e</sub>)</span>' : 'How often two people picked exactly the same option: <span class="formula-line">same ÷ conversations both answered</span>') + '. This is agreement, not a correlation.</p></div>';
      const mq = qByKey(state.matrixQ);
      const units = mq ? m.unitsFor(mq) : Q.flatMap(q => m.unitsFor(q));
      const scope = mq ? mq.short : 'all questions';
      h += '<div class="tablewrap"><table class="heat"><thead><tr><th></th>' + R.map(r => '<th class="rot' + (r.kind === 'ai' ? ' aihead' : '') + '">' + esc(r.short) + '</th>').join('') + '</tr></thead><tbody>';
      R.forEach(a => {
        h += '<tr><th' + (a.kind === 'ai' ? ' class="aihead"' : '') + '>' + esc(a.short) + '</th>';
        R.forEach(b => {
          if (a.key === b.key) { h += '<td class="cell"><div class="cellin blank">·</div></td>'; return; }
          const p = m.pairRate(units, a.key, b.key), k = m.cohenKappa(units, a.key, b.key);
          const tip = a.short + ' and ' + b.short + ', ' + scope + '\n' + (p ? p.same + ' of ' + p.both + ' with the same answer (' + pct(p.rate) + ')' + (k ? '\nCohen\'s kappa ' + fmtAlpha(k.kappa) + ' (chance agreement ' + pct(k.pe) + ')' : '\nCohen\'s kappa: not defined, both always gave one answer') : 'They never answered the same conversation.');
          const v = kappaMode ? (k ? k.kappa : null) : (p ? p.rate : null);
          h += '<td class="cell"><div class="cellin ' + agrClass(v, kappaMode) + '" data-tip="' + esc(tip) + '">' + (v == null ? '–' : kappaMode ? fmtAlpha(v) : pct(v)) + '</div></td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table></div>' + ramp('agr', 'less agreement', 'more agreement') + (AI ? '<div class="note"><p>The AI row shows whether the AI agrees with each expert about as often as the experts agree with each other.</p></div>' : '') + '</section>';
      h += '</div>';

      // Option use
      h += '<section class="panel"><div class="panel-head"><h2>How each person used the options' + info('usage') + '</h2>';
      h += '<div class="tools"><button class="linkbtn" id="dist-toggle" type="button">' + (state.distCounts ? 'Show bars' : 'Show counts') + '</button></div>';
      h += '<p class="desc">Share of the ' + C.length + ' conversations rated with each option. Someone who never answers No, or almost always answers Yes, stands out here.</p></div>';
      const seen = [...new Set(Q.flatMap(q => q.scale.map(o => o.name)))];
      h += '<div class="legend" style="margin-bottom:10px">' + seen.map(k => '<span><i class="sw" style="background:' + esc(scaleColor(k)) + '"></i>' + esc(k) + '</span>').join('') + (state.cat === 'yes' ? [...new Set(Q.filter(groupable).map(notLabel))].map(n => '<span><i class="sw" style="background:var(--cal-not)"></i>' + esc(n) + '</span>').join('') : '') + '</div>';
      h += '<div class="tablewrap"><table><thead><tr><th>Question</th>' + R.map(r => '<th' + (r.kind === 'ai' ? ' class="aihead"' : '') + '>' + esc(r.short) + '</th>').join('') + '</tr></thead><tbody>';
      Q.forEach(q => {
        const opts = state.cat === 'yes' && groupable(q) ? [q.scale[0].name, notLabel(q)] : q.scale.map(o => o.name);
        h += '<tr><th>' + esc(q.short) + '</th>';
        R.forEach(r => {
          const counts = {}; let n = 0;
          C.forEach(c => { const l = lab(q, raw(c, q, r).label); if (l != null) { counts[l] = (counts[l] || 0) + 1; n++; } });
          if (!n) { h += '<td class="muted">' + (r.kind === 'ai' && q.hasAI && !q.aiMapped ? 'not named' : 'no answers') + '</td>'; return; }
          const all = opts.concat(Object.keys(counts).filter(k => !opts.includes(k)));
          const tip = r.short + ' · ' + q.short + '\n' + all.map(o => o + ': ' + (counts[o] || 0)).join('\n') + '\n(' + n + ' answered)';
          if (state.distCounts) h += '<td class="stackcount" data-tip="' + esc(tip) + '">' + all.map(o => '<span style="color:' + esc(scaleColor(o)) + '">■</span> ' + (counts[o] || 0)).join('  ') + '</td>';
          else h += '<td><div class="stack" data-tip="' + esc(tip) + '">' + all.filter(o => counts[o]).map(o => '<span style="--w:' + counts[o] + ';background:' + esc(scaleColor(o)) + '"></span>').join('') + '</div></td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table></div></section>';

      el.innerHTML = h;
      $('matrix-q').addEventListener('change', e => { state.matrixQ = e.target.value; renderOverview(); });
      $('matrix-m').addEventListener('change', e => { state.pairMeasure = e.target.value; X.persist(); renderOverview(); });
      $('dist-toggle').addEventListener('click', () => { state.distCounts = !state.distCounts; renderOverview(); });
      const kc = $('kpi-conflicts'); if (kc) kc.addEventListener('click', () => { state.show = 'conflict'; X.setTab('conversations'); renderList(); });
    }
    function offTip(r, what, d, sum) {
      const who = r.kind === 'ai' ? 'the AI' : r.short;
      const lines = [r.name + ' · ' + what, d.n ? d.k + ' of ' + d.n + ' answers differed from the majority (' + pct(d.k / d.n) + ').' : 'Nothing to compare: no conversation with a majority that ' + who + ' answered.'];
      const left = [d.ties && plural(d.ties, 'tie') + ' (no majority)', d.thin && d.thin + ' with fewer than 2 answers', d.skipped && d.skipped + ' ' + who + ' did not answer'].filter(Boolean);
      lines.push('Counted ' + d.n + ' of ' + d.total + (sum ? ' question-conversation pairs' : ' conversations') + (left.length ? '. Left out: ' + left.join(', ') + '.' : ', nothing left out.'));
      return lines.join('\n');
    }
    function defHtml(key) {
      const d = DEFS[key]; if (!d) return '';
      return '<h4>' + esc(d.title) + '</h4><p>' + esc(d.what) + '</p>' + (d.formula ? '<div class="formula">' + d.formula + '</div>' : '') + (d.counted ? '<p>' + d.counted + '</p>' : '') + (d.read ? '<p>' + esc(d.read) + '</p>' : '');
    }

    // ---------- (2) review conversations ----------
    function orderedConvs() {
      let list = C.map(c => ({ c, s: m.convScore(c) }));
      if (state.show === 'conflict') list = list.filter(x => m.hasConflict(x.c));
      else if (state.show === 'open') list = list.filter(x => m.hasConflict(x.c) && !submitted(x.c));
      else if (state.show === 'draft') list = list.filter(x => dirty(x.c));
      else if (state.show === 'done') list = list.filter(x => submitted(x.c));
      const fq = qByKey(state.qFocus);
      if (fq) {
        const w = a => (a.status === 'split' ? 100 : 0) + a.dis.length * 10 + (a.aiDis ? 1 : 0);
        list.sort((a, b) => w(cell(b.c, fq)) - w(cell(a.c, fq)) || a.c.idx - b.c.idx);
      } else if (state.sort === 'disagree') list.sort((a, b) => b.s.total - a.s.total || b.s.ai - a.s.ai || a.c.idx - b.c.idx);
      else if (state.sort === 'ai') list.sort((a, b) => b.s.ai - a.s.ai || b.s.total - a.s.total || a.c.idx - b.c.idx);
      return list;
    }
    function renderList() {
      const el = $('convlist');
      const list = orderedConvs();
      const opt = (v, cur, label) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + label + '</option>';
      let h = '<div class="convlist-in"><div class="tools"><span class="eyebrow"><span>' + (list.length === C.length ? C.length + ' conversations' : list.length + ' of ' + C.length) + '</span></span>';
      h += '<label for="show-sel">Show</label><select id="show-sel">' + opt('all', state.show, 'All') + opt('conflict', state.show, 'With a conflict') + opt('open', state.show, 'Conflicts without a decision') + opt('draft', state.show, 'Not submitted yet') + opt('done', state.show, 'Submitted') + '</select>';
      h += '<label for="sort-sel">Sort</label><select id="sort-sel">' + opt('disagree', state.sort, 'Most disagreement first') + (AI ? opt('ai', state.sort, 'AI off the majority first') : '') + opt('order', state.sort, 'Order in the file') + '</select>';
      h += '<label for="focus-sel">Focus</label><select id="focus-sel"><option value="">All questions</option>' + Q.map(q => '<option value="' + esc(q.key) + '"' + (state.qFocus === q.key ? ' selected' : '') + '>' + esc(q.short) + '</option>').join('') + '</select></div>';
      if (!list.length) h += '<p class="empty" style="padding:6px 8px">' + (state.show === 'open' ? 'Every conversation with a conflict has a submitted decision.' : state.show === 'done' ? 'Nothing submitted yet.' : state.show === 'draft' ? 'No unsubmitted changes.' : 'No conversation has a conflict.') + '</p>';
      const cur = C[state.sel];
      list.forEach(({ c, s }) => {
        h += '<button class="convrow" type="button" data-idx="' + c.idx + '" aria-current="' + (cur && cur.idx === c.idx) + '">';
        h += '<span class="ix num">' + c.idx + '</span><span class="id">' + esc(c.id) + marker(c) + '</span>';
        h += '<span class="mini">' + Q.map(q => {
          const a = cell(c, q);
          let cls = a.status === 'split' ? 'split' : a.status === 'thin' ? 'thin' : a.dis.length ? 'd' + Math.min(4, a.dis.length) : '';
          if (a.aiDis) cls += ' ai';
          if (state.qFocus && q.key !== state.qFocus) cls += ' dim';
          if (state.qFocus && q.key === state.qFocus) cls += ' focus';
          const tip = q.short + ': ' + (a.status === 'split' ? 'tie, ' + a.sorted.map(x => x[0] + ' ' + x[1]).join(' · ') : a.status === 'thin' ? 'too few answers' : a.dis.length ? a.dis.map(k => BY_KEY[k].short).join(', ') + ' off the majority (' + a.majority + ')' : 'everyone said ' + a.majority);
          return '<i class="' + cls + '" data-tip="' + esc(tip) + '">' + (a.dis.length || '') + '</i>';
        }).join('') + '</span>';
        h += '<span class="hint">' + esc(convHint(c) || '') + '</span>';
        h += '</button>';
      });
      h += '<div class="minilegend"><span><i></i>everyone agreed</span><span><i class="d2"></i>n off the majority</span><span><i class="split"></i>tie</span>' + (AI ? '<span><i class="ai"></i>AI off the majority</span>' : '') + '<span><i class="thin"></i>too few answers</span><span><b class="done">✓</b> submitted</span><span><b class="draft">●</b> not submitted yet</span></div></div>';
      el.innerHTML = h;
      el.querySelectorAll('.convrow').forEach(b => b.addEventListener('click', () => { selectConv(C.findIndex(c => c.idx === +b.dataset.idx)); }));
      $('sort-sel').addEventListener('change', e => { state.sort = e.target.value; X.persist(); renderList(); });
      $('focus-sel').addEventListener('change', e => { state.qFocus = e.target.value; renderList(); renderDetail(); });
      $('show-sel').addEventListener('change', e => { state.show = e.target.value; renderList(); });
    }
    // ✓ once submitted (and unchanged since), ● while there are changes to submit.
    function marker(c) {
      if (dirty(c)) return '<span class="draft" title="Changes not submitted yet">●</span>';
      if (submitted(c)) return '<span class="done" title="Decision submitted">✓</span>';
      return '';
    }
    function selectConv(i) {
      state.sel = Math.max(0, Math.min(C.length - 1, i));
      history.replaceState(null, '', anchor(C[state.sel]));
      renderList(); renderDetail();
      const cur = document.querySelector('.convrow[aria-current="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
      ['pane-transcript', 'pane-ratings', 'pane-consensus'].forEach(id => { $(id).scrollTop = 0; });
    }
    function said(a) {
      if (a.status === 'split') return '<span class="chip xs c-nei">Tie</span>' + esc(a.sorted.map(x => x[0] + ' ' + x[1]).join(' · '));
      if (a.status === 'thin') return 'too few answers';
      return 'majority ' + chip(a.majority, 'xs') + '<span class="num">' + a.majCount + '/' + a.n + '</span>';
    }

    function renderDetail() {
      const c = C[state.sel];
      if (!c) { ['dbar', 'pane-transcript', 'pane-ratings', 'pane-consensus'].forEach(id => { $(id).innerHTML = ''; }); return; }
      const s = m.convScore(c);
      const listHidden = !!state.listHidden;

      // bar above the panes
      let h = '<div class="row1"><button class="btn" type="button" id="list-toggle" aria-expanded="' + !listHidden + '" aria-controls="convlist">☰ ' + (listHidden ? 'Show list' : 'Hide list') + '</button>';
      h += '<span class="eyebrow">Conversation ' + c.idx + ' of ' + C.length + '</span><h2>Chat ' + esc(c.id) + '</h2>';
      h += '<span class="muted">' + (s.dis ? plural(s.dis, 'answer') + ' off the majority' : 'no answer off the majority') + (s.splits ? ' · ' + plural(s.splits, 'tie') : '') + '</span>';
      h += '<div class="nav">' + (listHidden ? '<select id="jump" class="inp" aria-label="Jump to conversation">' + C.map((x, i) => '<option value="' + i + '"' + (i === state.sel ? ' selected' : '') + '>' + x.idx + '. ' + esc(x.id) + (dirty(x) ? ' ●' : submitted(x) ? ' ✓' : '') + '</option>').join('') + '</select>' : '');
      h += '<button class="btn" type="button" id="prev" ' + (state.sel === 0 ? 'disabled' : '') + '>← Previous</button><button class="btn" type="button" id="next">Next →</button></div></div>';
      h += '<div class="facts">' + c.description.filter(d => !/^(chat id|conversation id)$/i.test(d.label)).map(d => '<span class="f' + (d.value.length > 60 ? ' long' : '') + '">' + esc(d.label) + ': <b>' + esc(d.value) + '</b></span>').join('') + '</div>';
      $('dbar').innerHTML = h;

      // transcript
      const hasOriginal = c.transcript.some(t => t.original);
      h = '<div class="pane-head"><h3>Transcript</h3><span class="pane-sub">' + plural(c.transcript.length, 'message') + '</span><span class="sp"></span>' + (hasOriginal ? '<button class="linkbtn" type="button" id="orig-toggle">' + (state.showOriginal ? 'Hide original text' : 'Show original text') + '</button>' : '') + '</div><div class="transcript">';
      c.transcript.forEach(t => {
        h += '<div class="msg ' + (t.role === 'assistant' ? 'assistant' : 'user') + '"><div class="who"><b>' + esc(t.speaker) + '</b><span class="mono">' + esc(t.time || '') + '</span></div>';
        h += '<div class="bubble">' + esc(t.translation) + (state.showOriginal && t.original ? '<div class="orig">' + esc(t.original) + '</div>' : '') + '</div>';
        if (t.meta && t.meta.length) h += '<div class="metaline">' + t.meta.map(x => esc(x.label) + ' ' + esc(x.value)).join(' · ') + '</div>';
        h += '</div>';
      });
      $('pane-transcript').innerHTML = h + '</div>';

      $('pane-ratings').innerHTML = ratingsPane(c);
      $('pane-consensus').innerHTML = consensusPane(c);

      $('prev').addEventListener('click', () => selectConv(state.sel - 1));
      $('next').addEventListener('click', () => {
        if (!X.readOnly && dirty(c)) submitConv(c);
        if (state.sel < C.length - 1) selectConv(state.sel + 1);
      });
      $('list-toggle').addEventListener('click', () => X.toggleList(!state.listHidden));
      const j = $('jump'); if (j) j.addEventListener('change', e => selectConv(+e.target.value));
      const ot = $('orig-toggle'); if (ot) ot.addEventListener('click', () => { state.showOriginal = !state.showOriginal; X.persist(); renderDetail(); });
      wireConsensus(c);
      updateSubmitUI(c);
      X.layout();
    }

    function ratingsPane(c) {
      let h = '<div class="block"><div class="pane-head"><h3>Ratings</h3><span class="sp"></span><span class="pane-sub">majority from ' + esc(refLabel()) + '</span></div>';
      h += '<div class="tablewrap"><table class="rgrid"><thead><tr><th class="q">Question</th>' + R.map(r => '<th title="' + esc(r.name) + '"' + (r.kind === 'ai' ? ' class="aihead"' : '') + '>' + esc(r.short) + '</th>').join('') + '<th>Majority' + info('majority') + '</th></tr></thead><tbody>';
      const usedAbbr = new Set();
      Q.forEach(q => {
        const a = cell(c, q);
        h += '<tr class="' + a.status + '"><th class="q"><span class="qname" title="' + esc([q.description, q.rubric].filter(Boolean).join('\n\n')) + '">' + esc(q.short) + '</span></th>';
        R.forEach(r => {
          const x = raw(c, q, r), l = a.labels[r.key];
          if (l != null && ABBR[l] !== l) usedAbbr.add(l);
          if (r.kind === 'ai' && q.hasAI && !q.aiMapped && x.raw != null) {
            h += '<td><span data-tip="' + esc('The AI answered "' + x.raw + '". Name this question\'s options to compare it.' + (x.reasoning ? '\n\n' + x.reasoning : '')) + '"><span class="chip xs c-none">?</span></span></td>';
            return;
          }
          h += '<td><span data-tip="' + esc(r.name + ': ' + (l == null ? 'no answer' : l) + (a.dis.includes(r.key) ? ' (off the majority)' : '') + (x.reasoning ? '\n\n' + x.reasoning : l != null ? '\n\nNo reasoning given.' : '')) + '">' + chip(l, 'xs' + (a.dis.includes(r.key) ? ' dis' : ''), true) + '</span></td>';
        });
        if (a.status === 'split') h += '<td class="maj"><span class="chip xs c-nei" data-tip="' + esc('Tie: ' + a.sorted.map(x => x[0] + ' ' + x[1]).join(', ')) + '">Tie</span></td>';
        else if (a.status === 'thin') h += '<td class="maj"><span class="muted" data-tip="Fewer than 2 answers">–</span></td>';
        else { if (ABBR[a.majority] !== a.majority) usedAbbr.add(a.majority); h += '<td class="maj"><span data-tip="' + esc(a.majority + ', ' + a.majCount + ' of ' + a.n) + '">' + chip(a.majority, 'xs', true) + '</span><span class="tally num">' + a.majCount + '/' + a.n + '</span></td>'; }
        h += '</tr>';
      });
      h += '</tbody></table></div>';
      if (usedAbbr.size) h += '<div class="abbr-key">' + [...usedAbbr].map(n => '<b>' + esc(ABBR[n]) + '</b> = ' + esc(n)).join(' · ') + '. ≠ marks an answer off the majority. Hover over an answer for the reasoning.</div>';
      else h += '<div class="abbr-key">≠ marks an answer off the majority. Hover over an answer for the reasoning.</div>';
      h += '</div>';

      const points = Q.map(q => ({ q, a: cell(c, q) })).filter(x => x.a.status === 'split' || x.a.status === 'disagree');
      points.sort((x, y) => (y.a.status === 'split') - (x.a.status === 'split') || y.a.dis.length - x.a.dis.length);
      h += '<div class="block"><div class="pane-head"><h3>Where the answers differ</h3><span class="sp"></span><span class="pane-sub">' + points.length + ' of ' + Q.length + ' questions</span></div>';
      if (!points.length) h += '<p class="empty">Everyone who answered agreed on every question.</p>';
      h += '<div class="points">';
      points.forEach(({ q, a }) => {
        h += '<div class="point ' + a.status + '"><div class="ph"><span class="qn">' + esc(q.short) + '</span>';
        if (a.status === 'split') h += '<span class="chip sm c-nei">Tie</span><span class="muted">' + esc(a.sorted.map(x => x[0] + ' ' + x[1]).join(' · ')) + '</span>';
        else h += '<span class="muted">majority</span>' + chip(a.majority, 'sm') + '<span class="muted num">' + a.majCount + ' of ' + a.n + '</span>';
        h += '</div>';
        const withReason = r => { const rs = raw(c, q, r).reasoning; return '<li><span><span class="who">' + esc(r.short) + (r.kind === 'ai' ? ' <span class="ai-tag">AI</span>' : '') + '</span> ' + chip(a.labels[r.key], 'sm') + '</span><span class="rs' + (rs ? '' : ' none') + '">' + esc(rs || 'no reasoning given') + '</span></li>'; };
        if (a.status === 'split') h += '<ul>' + R.filter(r => a.labels[r.key] != null).map(withReason).join('') + '</ul>';
        else {
          h += '<ul>' + a.dis.map(k => withReason(BY_KEY[k])).join('') + '</ul>';
          const agreeing = R.filter(r => a.labels[r.key] === a.majority && raw(c, q, r).reasoning && r.kind !== 'ai');
          if (agreeing.length) h += '<div class="sub">With the majority, and explained</div><ul>' + agreeing.map(withReason).join('') + '</ul>';
        }
        h += '</div>';
      });
      h += '</div></div>';
      const comments = Object.entries(c.comments || {});
      if (comments.length) h += '<div class="block"><div class="pane-head"><h3>Comments on the whole conversation</h3></div><div class="comments">' + comments.map(([k, v]) => '<div><b>' + esc(BY_KEY[k] ? BY_KEY[k].short : k) + '</b><span>' + esc(v) + '</span></div>').join('') + '</div></div>';
      h += '<div class="block"><details class="all"><summary>Every answer and reason in one table</summary><div class="tablewrap"><table class="alltab"><thead><tr><th>Question</th>' + R.map(r => '<th>' + esc(r.short) + '</th>').join('') + '</tr></thead><tbody>';
      Q.forEach(q => {
        const a = cell(c, q);
        h += '<tr><th>' + esc(q.short) + '</th>' + R.map(r => { const x = raw(c, q, r); const l = a.labels[r.key] != null ? a.labels[r.key] : (r.kind === 'ai' && x.raw != null ? x.raw + ' ?' : null); return '<td>' + chip(l, 'sm' + (a.dis.includes(r.key) ? ' dis' : '')) + '<br>' + (x.reasoning ? esc(x.reasoning) : '<span class="muted">–</span>') + '</td>'; }).join('') + '</tr>';
      });
      h += '</tbody></table></div></details></div>';
      h += '<p class="note">Use <span class="kbd">←</span> <span class="kbd">→</span> to move between conversations (not while typing a note).</p>';
      return h;
    }

    // ---------- consensus pane ----------
    function strictMajority(c, q) { return m.analyze(c, q, m.refRaters(), 'strict').majority; }
    const timeOf = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
    function consensusPane(c) {
      const key = K.keyOf(D, c);
      const live = X.draft.items[key] || K.empty();
      const ro = X.readOnly;
      // A read-only copy shows the submitted decision; the live page shows the working draft.
      const it = ro ? (K.isSubmitted(live) ? Object.assign(K.empty(), live.submitted) : K.empty()) : live;
      const conflicts = Q.filter(q => m.isConflict(cell(c, q)));
      const others = Q.length - conflicts.length;
      const shown = state.allQs ? Q : conflicts;
      let h = '<div id="cons-card" data-key="' + esc(key) + '"><div class="pane-head"><h3>Consensus for this conversation</h3></div>';

      h += '<div class="sec"><div class="sec-head"><span class="tag">A</span><h4>Agreed answers</h4><p>' + (conflicts.length ? 'For each question the experts disagreed on, pick the answer the group settled on. It becomes the agreed label for this conversation.' : 'The experts agreed on every question here, so there is nothing to settle. You can still record an answer.') + '</p></div>';
      shown.forEach(q => {
        const a = cell(c, q), x = (it.q || {})[q.key] || {};
        const done = !!(x.agreed || x.note);
        h += '<div class="qblock' + (done ? ' done' : '') + '" data-q="' + esc(q.key) + '"><div class="qtop"><span class="qn">' + esc(q.short) + '</span><span class="said">' + said(a) + '</span></div>';
        if (ro) {
          h += '<div>' + (x.agreed === K.NO_CONSENSUS ? '<span class="chip sm c-nei">' + K.NO_CONSENSUS_LABEL + '</span>' : x.agreed ? 'Agreed: ' + chip(x.agreed, 'sm') : '<span class="muted">No answer recorded</span>') + '</div>' + (x.note ? '<div class="ro">' + esc(x.note) + '</div>' : '');
        } else {
          const maj = strictMajority(c, q);
          h += '<div class="pick"><select data-f="agreed" aria-label="Agreed answer for ' + esc(q.short) + '"><option value="">Agreed answer…</option>' + q.scale.map(o => '<option' + (x.agreed === o.name ? ' selected' : '') + '>' + esc(o.name) + '</option>').join('') + (x.agreed && x.agreed !== K.NO_CONSENSUS && !q.scale.some(o => o.name === x.agreed) ? '<option selected>' + esc(x.agreed) + '</option>' : '') + '<option value="' + K.NO_CONSENSUS + '"' + (x.agreed === K.NO_CONSENSUS ? ' selected' : '') + '>' + K.NO_CONSENSUS_LABEL + '</option></select>';
          if (maj) h += '<button class="btn sm" type="button" data-majority="' + esc(maj) + '">Use majority (' + esc(ABBR[maj] || maj) + ')</button>';
          h += '</div><input type="text" data-f="note" value="' + esc(x.note || '') + '" placeholder="Why (optional)" aria-label="Why, for ' + esc(q.short) + '">';
        }
        h += '</div>';
      });
      if (conflicts.length && others) h += '<button class="linkbtn" type="button" id="cons-all">' + (state.allQs ? 'Show only the questions in conflict' : 'Also record an answer for the ' + plural(others, 'question') + ' everyone agreed on') + '</button>';
      if (!conflicts.length && !state.allQs) h += '<button class="linkbtn" type="button" id="cons-all">Record an answer anyway</button>';
      h += '</div>';

      h += '<div class="sec"><div class="sec-head"><span class="tag">B</span><h4>Follow-up for this conversation</h4><p>For anything bigger than one answer: rubric wording that caused the disagreement, guidance to change, or something to check with someone.</p></div>';
      if (ro) {
        h += '<div><span class="status-pill ' + esc(it.status) + '">' + esc(K.statusName(it.status)) + '</span></div>';
        h += '<div><div class="eyebrow">What we discussed</div><div class="ro">' + (esc(it.comment) || '<span class="muted">–</span>') + '</div></div>';
        h += '<div><div class="eyebrow">Next steps</div><div class="ro">' + (esc(it.next_steps) || '<span class="muted">–</span>') + '</div></div>';
      } else {
        h += '<div class="f" style="font-size:12.5px;font-weight:600;color:var(--ink-2)">Outcome</div><div class="outcomes" role="radiogroup" aria-label="Outcome">';
        K.STATUSES.forEach(s => { h += '<label class="outcome"><input type="radio" name="outcome-' + esc(key) + '" data-f="status" value="' + s.value + '"' + ((it.status || '') === s.value ? ' checked' : '') + '><span>' + esc(s.name) + '<small>' + esc(s.help) + '</small></span></label>'; });
        h += '</div>';
        h += '<label class="f">What we discussed<textarea data-f="comment" placeholder="What the group concluded, and why">' + esc(it.comment || '') + '</textarea></label>';
        h += '<label class="f">Next steps (who does what)<textarea data-f="next_steps" placeholder="For example: Asha rewrites the Safe rubric example; recheck this chat next round">' + esc(it.next_steps || '') + '</textarea></label>';
      }
      h += '</div>';
      if (ro) h += '<p class="note">' + (K.isSubmitted(live) ? 'Submitted ' + esc(new Date(live.submitted.submitted_at).toLocaleString()) + '.' : 'No decision was submitted for this conversation.') + '</p>';
      else h += '<div class="submit-bar" id="submit-bar"><div class="submit-state" id="submit-state" role="status" aria-live="polite"></div><button class="btn primary" type="button" id="cons-submit">Submit</button></div>';
      h += '</div>';
      return h;
    }
    function submitConv(c) {
      const key = K.keyOf(D, c);
      const it = X.draft.items[key]; if (!it || !K.isDirty(it)) return;
      K.submit(it);
      X.onNote(key, true);
      updateSubmitUI(c);
    }
    // Everything that depends on whether this conversation has changes waiting to be submitted.
    function updateSubmitUI(c) {
      const it = itemOf(c), isDirty = dirty(c), isSub = submitted(c), last = state.sel === C.length - 1;
      const next = $('next');
      if (next) {
        const submitNext = !X.readOnly && isDirty;
        next.textContent = submitNext ? (last ? 'Submit' : 'Submit and next →') : 'Next →';
        next.classList.toggle('primary', submitNext);
        next.disabled = !submitNext && last;
      }
      const st = $('submit-state'), btn = $('cons-submit');
      if (st && btn) {
        if (isDirty && isSub) { st.innerHTML = '<span class="draft">●</span> Changed since you submitted at ' + esc(timeOf(it.submitted.submitted_at)) + '. Your edits are saved in this browser.'; btn.textContent = 'Submit changes'; }
        else if (isDirty) { st.innerHTML = '<span class="draft">●</span> Not submitted yet. Your draft is saved in this browser.'; btn.textContent = 'Submit'; }
        else if (isSub) { st.innerHTML = '<span class="done">✓</span> Submitted at ' + esc(timeOf(it.submitted.submitted_at)) + '.'; btn.textContent = 'Submitted'; }
        else { st.textContent = 'Nothing to submit yet.'; btn.textContent = 'Submit'; }
        btn.disabled = !isDirty;
      }
      const row = document.querySelector('.convrow[data-idx="' + c.idx + '"] .id');
      if (row) { const old = row.querySelector('.done, .draft'); if (old) old.remove(); row.insertAdjacentHTML('beforeend', marker(c)); }
      const opt = document.querySelector('#jump option[value="' + (c.idx - 1) + '"]');
      if (opt) opt.textContent = c.idx + '. ' + c.id + (isDirty ? ' ●' : isSub ? ' ✓' : '');
    }
    function wireConsensus(c) {
      const card = $('cons-card'); if (!card) return;
      const all = $('cons-all'); if (all) all.addEventListener('click', () => { state.allQs = !state.allQs; $('pane-consensus').innerHTML = consensusPane(c); wireConsensus(c); updateSubmitUI(c); });
      if (X.readOnly) return;
      const key = card.dataset.key;
      const touch = mutate => {
        const it = X.draft.items[key] ? JSON.parse(JSON.stringify(X.draft.items[key])) : K.empty();
        it.q = it.q || {};
        mutate(it);
        it.updated_at = new Date().toISOString();
        X.draft.items[key] = it;
        X.onNote(key);
        updateSubmitUI(c);
      };
      const onField = e => {
        const t = e.target, f = t.dataset && t.dataset.f; if (!f) return;
        const block = t.closest('.qblock');
        touch(it => {
          if (block) {
            const qk = block.dataset.q; it.q[qk] = Object.assign({ agreed: '', note: '' }, it.q[qk]);
            it.q[qk][f === 'agreed' ? 'agreed' : 'note'] = t.value;
            block.classList.toggle('done', !!(it.q[qk].agreed || it.q[qk].note));
          } else it[f] = t.value;
        });
      };
      card.addEventListener('input', e => { if (e.target.tagName !== 'SELECT' && e.target.type !== 'radio') onField(e); });
      card.addEventListener('change', e => { if (e.target.tagName === 'SELECT' || e.target.type === 'radio') onField(e); });
      card.addEventListener('click', e => {
        const b = e.target.closest('[data-majority]'); if (!b) return;
        const sel = b.closest('.qblock').querySelector('select[data-f="agreed"]');
        sel.value = b.dataset.majority; sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      $('cons-submit').addEventListener('click', () => submitConv(c));
    }

    // ---------- (3) consensus & download ----------
    function renderConsensus() {
      const el = $('view-consensus');
      const conflicted = C.filter(c => m.hasConflict(c));
      const sub = C.filter(submitted), drafts = C.filter(dirty);
      const open = conflicted.filter(c => !submitted(c));
      const decided = c => K.isSubmitted(itemOf(c)) ? itemOf(c).submitted : null;
      const byStatus = s => sub.filter(c => (decided(c).status || '') === s).length;
      const pending = X.readOnly ? 0 : K.pendingCount(X.draft);
      let rows, showDrafts = state.cfilter === 'drafts';
      if (state.cfilter === 'open') rows = open;
      else if (state.cfilter === 'all') rows = C;
      else if (showDrafts) rows = drafts;
      else if (state.cfilter && state.cfilter !== 'submitted' && state.cfilter !== 'recorded') rows = sub.filter(c => (decided(c).status || '') === state.cfilter);
      else rows = sub;
      let h = '';
      if (!X.readOnly) {
        h += '<section class="panel dl-card"><div><h2>Download the results</h2><p>This is the CSV you opened, unchanged, with the submitted decisions added as extra columns at the end: the agreed answers, the outcome, what you discussed and the next steps. It also records how the experts agreed on each question. Open it in Excel or Google Sheets, or bring it back to this page to keep going.</p>';
        h += '<p class="dl-state">' + (sub.length ? (pending ? '<span class="draft">●</span> ' + plural(pending, 'submitted decision') + ' ' + (pending === 1 ? 'is' : 'are') + ' not in a downloaded file yet.' : '<span class="done">✓</span> Everything submitted is in your last download.') : 'Nothing submitted yet, so the download would only contain the original ratings.') + '</p></div>';
        h += '<div class="acts"><button class="btn primary" type="button" id="dl-csv">Download results (CSV)</button><button class="btn" type="button" id="dl-protect">Share a password-protected copy</button></div></section>';
        if (drafts.length) h += '<div class="banner warn" style="margin-bottom:18px"><span><b>' + plural(drafts.length, 'conversation') + ' ' + (drafts.length === 1 ? 'has' : 'have') + ' changes that are not submitted.</b> Only submitted decisions go into the download. Open ' + (drafts.length === 1 ? 'it' : 'them') + ' and press Submit, or keep working and submit later.</span><span class="sp"></span><button class="btn" type="button" id="show-drafts">Show ' + (drafts.length === 1 ? 'it' : 'them') + '</button></div>';
      }
      h += '<div class="kpis"><div class="kpi"><span class="k-label">Decisions submitted</span><span class="k-val">' + sub.length + ' <small>of ' + C.length + '</small></span><span class="k-sub">conversations</span></div>';
      h += '<div class="kpi"><span class="k-label">Conflicts with a decision</span><span class="k-val">' + (conflicted.length - open.length) + ' <small>of ' + conflicted.length + '</small></span><span class="k-sub">majority from ' + esc(refLabel()) + '</span></div>';
      K.STATUSES.filter(s => s.value).forEach(s => { h += '<div class="kpi"><span class="k-label">' + esc(s.name) + '</span><span class="k-val">' + byStatus(s.value) + '</span><span class="k-sub">' + esc(s.help) + '</span></div>'; });
      h += '</div>';
      h += '<section class="panel"><div class="panel-head"><h2>Everything submitted</h2>';
      const cur = state.cfilter === 'recorded' ? 'submitted' : (state.cfilter || 'submitted');
      const fopt = (v, label) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + label + '</option>';
      h += '<div class="tools"><label>Show <select id="cfilter" class="inp">' + fopt('submitted', 'Submitted decisions') + K.STATUSES.filter(s => s.value).map(s => fopt(s.value, 'Outcome: ' + s.name)).join('') + (X.readOnly ? '' : fopt('drafts', 'Not submitted yet')) + fopt('open', 'Conflicts without a decision') + fopt('all', 'All conversations') + '</select></label></div>';
      h += '<p class="desc">The decisions from the Review page in one table, for the end of the meeting. Click a chat to open it.</p></div>';
      if (!rows.length) h += '<p class="empty">' + (state.cfilter === 'open' ? 'Every conversation with a conflict has a submitted decision.' : showDrafts ? 'No unsubmitted changes.' : 'Nothing submitted yet. Open a conversation on the Review page, fill in the Consensus column and press Submit.') + '</p>';
      else {
        h += '<div class="tablewrap"><table class="ctab"><thead><tr class="groups"><th colspan="2"></th><th>A</th><th colspan="3">B · Follow-up</th></tr>';
        h += '<tr><th>#</th><th>Chat</th><th>Agreed answers</th><th>Outcome</th><th>What we discussed</th><th>Next steps</th></tr></thead><tbody>';
        rows.forEach(c => {
          const live = itemOf(c);
          const it = showDrafts ? K.fieldsOf(live) : (decided(c) || K.fieldsOf(K.empty()));
          const dec = Q.map(q => ({ q, x: (it.q || {})[q.key] })).filter(d => d.x && (d.x.agreed || d.x.note));
          h += '<tr><td class="num muted">' + c.idx + '</td><td><a href="' + esc(anchor(c)) + '" class="mono" data-open="' + c.idx + '">' + esc(c.id) + '</a>' + (showDrafts ? '<div class="muted" style="font-size:11.5px"><span class="draft">●</span> not submitted</div>' : dirty(c) ? '<div class="muted" style="font-size:11.5px"><span class="draft">●</span> changed since</div>' : '') + '</td>';
          h += '<td><div class="dec">' + (dec.length ? dec.map(d => '<div><span class="q">' + esc(d.q.short) + '</span> ' + (d.x.agreed === K.NO_CONSENSUS ? '<span class="chip sm c-nei">' + K.NO_CONSENSUS_LABEL + '</span>' : d.x.agreed ? chip(d.x.agreed, 'sm') : '') + (d.x.note ? ' <span class="muted">' + esc(d.x.note) + '</span>' : '') + '</div>').join('') : '<span class="muted">–</span>') + '</div></td>';
          h += '<td><span class="status-pill ' + esc(it.status) + '">' + esc(K.statusName(it.status)) + '</span></td>';
          h += '<td class="txt">' + (esc(it.comment) || '<span class="muted">–</span>') + '</td><td class="txt">' + (esc(it.next_steps) || '<span class="muted">–</span>') + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
      h += '</section>';
      el.innerHTML = h;
      $('cfilter').addEventListener('change', e => { state.cfilter = e.target.value; renderConsensus(); });
      const dl = $('dl-csv'); if (dl) dl.addEventListener('click', () => { X.download(); renderConsensus(); });
      const dp = $('dl-protect'); if (dp) dp.addEventListener('click', X.protect);
      const sd = $('show-drafts'); if (sd) sd.addEventListener('click', () => { state.cfilter = 'drafts'; renderConsensus(); });
      el.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', e => {
        e.preventDefault(); X.setTab('conversations'); selectConv(C.findIndex(c => c.idx === +a.dataset.open));
      }));
    }

    function renderAll() { m.clear(); renderOverview(); renderList(); renderDetail(); renderConsensus(); }
    return { renderAll, renderOverview, renderList, renderDetail, renderConsensus, selectConv, anchor, defHtml, submitCurrent: () => submitConv(C[state.sel]) };
  }

  const api = { create, esc };
  CD.dashboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
