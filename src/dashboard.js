// Rendering: agreement overview, conversations (list, detail, consensus card) and the consensus
// tab. The overview and conversation views are the W3/W4 template's, made re-initialisable and
// tolerant of exports without an AI judge or with unnamed answer options.
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = v => (v == null ? '–' : Math.round(v * 100) + '%');
  const fmtAlpha = v => (v == null ? '–' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2));

  // X: { model, metrics, state, draft, readOnly, onNote(key), persist() }
  function create(X) {
    const D = X.model, Q = D.questions, R = D.raters, C = D.conversations, m = X.metrics, state = X.state;
    const HUMANS = m.HUMANS, AI = m.AI;
    const BY_KEY = Object.fromEntries(R.map(r => [r.key, r]));
    const K = CD.consensus;
    const raw = m.raw, cell = m.cell, groupable = m.groupable, notLabel = m.notLabel;
    const lab = (q, l) => m.lab(q, l);
    const itemOf = c => X.draft.items[K.keyOf(D, c)];
    const recorded = c => K.isRecorded(itemOf(c));
    const qByKey = k => Q.find(q => q.key === k);

    function chip(label, extra) {
      if (label == null) return '<span class="chip c-none ' + (extra || '') + '">no answer</span>';
      return '<span class="chip opt ' + (extra || '') + '" style="--c:' + esc(scaleColor(label)) + '">' + esc(label) + '</span>';
    }
    function scaleColor(name) {
      for (const q of Q) { const o = q.scale.find(s => s.name === name); if (o && o.color) return o.color; }
      return /^Not /.test(name) ? '#475569' : '#6b7280';
    }
    function bar(v, tip) {
      if (v == null) return '<span class="muted">–</span>';
      return '<span class="bar" data-tip="' + esc(tip || '') + '"><span class="track"><span class="fill" style="width:' + Math.round(v * 100) + '%"></span></span><span class="val">' + pct(v) + '</span></span>';
    }
    function heatClass(frac) {
      if (frac == null) return 'blank';
      if (frac === 0) return 'h0';
      if (frac <= .15) return 'h1'; if (frac <= .3) return 'h2'; if (frac <= .5) return 'h3'; if (frac <= .7) return 'h4'; return 'h5';
    }
    function fact(c, label) { const f = c.description.find(d => d.label.toLowerCase() === label.toLowerCase()); return f ? f.value : null; }
    function convHint(c) { return (D.meta.hint_fields || []).map(l => fact(c, l)).filter(Boolean).join(' · '); }
    function refLabel() { return state.ref === 'all' && AI ? 'humans + AI' : 'humans only'; }
    const anchor = c => '#c-' + encodeURIComponent(c.id);

    // ---------- overview ----------
    function renderOverview() {
      const el = $('view-overview');
      const stats = Q.map(q => ({ q, s: m.qStats(q) }));
      const unnamed = Q.filter(q => q.source === 'unnamed');
      let h = '';

      h += '<section class="panel"><div class="panel-head"><h2>Answer options</h2><p>The options raters chose from. Human answers are stored in the export as option values and mapped back to these names; the AI evaluator’s answers arrive as names.</p></div>';
      h += '<div class="legend">';
      const seen = new Set();
      Q.forEach(q => q.scale.forEach(o => { const k = o.name; if (!seen.has(k)) { seen.add(k); h += chip(k) + '<span class="muted" style="margin-right:6px">' + esc(o.description) + '</span>'; } }));
      h += '</div>';
      if (unnamed.length) h += '<div class="note"><p><b>Not named yet:</b> ' + esc(unnamed.map(q => q.short).join(', ')) + '. Their answers show as stored values' + (AI ? ' and the AI evaluator is left out of every comparison for them' : '') + ' until you name the options in Setup.</p></div>';
      h += '<div class="note"><p><b>Majority</b> = the most common answer among the reference raters (currently <b>' + refLabel() + '</b>) who answered; the tally next to it (e.g. 2/' + HUMANS.length + ') shows how strong it is, so a 2–1–1 pattern still yields a majority of 2. A tie for the most common answer is a <b>split</b> (no majority). Any rater whose answer differs from the majority is flagged like this: <span class="chip opt sm dis" style="--c:#6b7280">answer</span>.' + (AI ? ' The AI evaluator is always compared against the majority even when it is not part of it.' : '') + '</p>';
      if (state.cat === 'yes') h += '<p><b>Options are grouped</b>: for questions with more than two options, every answer other than the first option counts as “Not &lt;first option&gt;”. Two-option questions are left as they are.</p>';
      h += '</div></section>';

      h += '<section class="panel"><div class="panel-head"><h2>Agreement by question</h2><p>How often the ' + HUMANS.length + ' human raters agreed with each other' + (AI ? ', and how often the AI evaluator landed on the human majority answer' : '') + '. Krippendorff’s α corrects for chance agreement (1 = perfect, 0 = chance, negative = worse than chance); percentages are raw.</p></div>';
      h += '<div class="tablewrap"><table><thead><tr><th>Question</th><th class="num">Humans unanimous</th><th class="num">Human pairwise agreement</th><th class="num">α humans</th>' + (AI ? '<th class="num">AI = human majority</th><th class="num">α humans + AI</th>' : '') + '<th class="num">Splits (' + esc(refLabel()) + ')</th><th class="num">Answers per rater</th></tr></thead><tbody>';
      stats.forEach(({ q, s }) => {
        h += '<tr><th title="' + esc([q.description, q.rubric].filter(Boolean).join(' — ')) + '">' + esc(q.short) + (q.optional ? ' <span class="muted">(optional)</span>' : '') + '</th>';
        h += '<td class="num">' + bar(s.unanimous, s.uY + ' of ' + s.uN + ' conversations with ≥2 human answers') + '</td>';
        h += '<td class="num">' + bar(s.pairH, 'mean over the ' + (HUMANS.length * (HUMANS.length - 1) / 2) + ' pairs of human raters, conversations both answered') + '</td>';
        h += '<td class="num" data-tip="Krippendorff’s alpha (nominal) over the ' + HUMANS.length + ' human raters">' + fmtAlpha(s.alphaH) + '</td>';
        if (AI) {
          if (!q.hasAI) h += '<td class="num muted">not run</td><td class="num muted">–</td>';
          else if (!q.aiMapped) h += '<td class="num muted" data-tip="Name this question’s answer options in Setup to compare the AI">options not named</td><td class="num muted">–</td>';
          else {
            h += '<td class="num">' + bar(s.aiMaj, s.aY + ' of ' + s.aN + ' conversations with a human majority') + '</td>';
            h += '<td class="num" data-tip="Krippendorff’s alpha (nominal) over the ' + HUMANS.length + ' human raters plus the AI evaluator">' + fmtAlpha(s.alphaAll) + '</td>';
          }
        }
        h += '<td class="num">' + s.splits + (s.thin ? ' <span class="muted" data-tip="' + s.thin + ' conversations had fewer than 2 reference answers">(+' + s.thin + ' too few)</span>' : '') + '</td>';
        h += '<td class="num mono muted" data-tip="' + esc(R.map((r, i) => r.short + ': ' + s.answered[i]).join('\n')) + '">' + s.answered.join(' / ') + '</td></tr>';
      });
      h += '</tbody></table></div>';
      h += '<div class="note"><p>' + (AI ? '“AI = human majority” always uses the human majority, regardless of the switch. ' : '') + 'The last column lists answers per rater in the order ' + esc(R.map(r => r.short).join(' / ')) + '.</p></div></section>';

      h += '<div class="grid-2">';
      h += '<section class="panel"><div class="panel-head"><h2>Who disagrees with the majority</h2><p>Conversations where the rater’s answer differed from the majority (' + esc(refLabel()) + '), out of the conversations where a majority existed and the rater answered.</p></div>';
      h += '<div class="tablewrap"><table class="heat"><thead><tr><th>Rater</th>' + Q.map(q => '<th class="rot">' + esc(q.short) + '</th>').join('') + '<th class="rot">All questions</th></tr></thead><tbody>';
      R.forEach(r => {
        let Ks = 0, N = 0;
        h += '<tr><th' + (r.kind === 'ai' ? ' class="aihead"' : '') + '>' + esc(r.name) + '</th>';
        Q.forEach(q => {
          const d = m.raterDisagreements(r, q); Ks += d.k; N += d.n;
          const frac = d.n ? d.k / d.n : null;
          h += '<td class="cell"><div class="cellin ' + heatClass(frac) + '" data-tip="' + esc(r.name + ' · ' + q.short + '\n' + d.k + ' of ' + d.n + ' off the majority' + (frac == null ? '' : ' (' + pct(frac) + ')')) + '">' + (d.n ? d.k + '<span class="muted" style="font-size:10.5px">/' + d.n + '</span>' : '–') + '</div></td>';
        });
        const fr = N ? Ks / N : null;
        h += '<td class="cell"><div class="cellin ' + heatClass(fr) + '" data-tip="' + esc(r.name + ': ' + Ks + ' of ' + N + ' (' + pct(fr) + ')') + '"><b>' + Ks + '</b><span style="font-size:10.5px">/' + N + '</span></div></td></tr>';
      });
      h += '</tbody></table></div><div class="note"><p>Darker = larger share of that rater’s answers off the majority.' + (AI ? ' In “Humans only” mode each human rater is compared against a majority that includes their own vote, which makes a lone dissent harder to reach than for the AI; switch to “Humans + AI” for a symmetric comparison.' : '') + '</p></div></section>';

      h += '<section class="panel"><div class="panel-head"><h2>Pairwise agreement</h2><p>Share of conversations where two raters gave the same answer (only conversations both answered).</p>';
      h += '<label class="control" style="margin-left:auto">Question <select id="matrix-q">' + ['<option value="all"' + (state.matrixQ === 'all' ? ' selected' : '') + '>All questions pooled</option>'].concat(Q.map(q => '<option value="' + esc(q.key) + '"' + (state.matrixQ === q.key ? ' selected' : '') + '>' + esc(q.short) + '</option>')).join('') + '</select></label></div>';
      const mq = qByKey(state.matrixQ);
      const units = mq ? m.unitsFor(mq) : Q.flatMap(q => m.unitsFor(q));
      h += '<div class="tablewrap"><table class="heat"><thead><tr><th></th>' + R.map(r => '<th class="rot' + (r.kind === 'ai' ? ' aihead' : '') + '">' + esc(r.short) + '</th>').join('') + '</tr></thead><tbody>';
      R.forEach(a => {
        h += '<tr><th' + (a.kind === 'ai' ? ' class="aihead"' : '') + '>' + esc(a.short) + '</th>';
        R.forEach(b => {
          if (a.key === b.key) { h += '<td class="cell"><div class="cellin blank">·</div></td>'; return; }
          const p = m.pairRate(units, a.key, b.key);
          const frac = p ? 1 - p.rate : null; // darker = more disagreement, consistent with the other heatmap
          h += '<td class="cell"><div class="cellin ' + heatClass(frac) + '" data-tip="' + esc(a.short + ' × ' + b.short + '\n' + (p ? p.same + ' of ' + p.both + ' same answer' : 'no overlap')) + '">' + (p ? pct(p.rate) : '–') + '</div></td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table></div><div class="note"><p>Darker = lower agreement.' + (AI ? ' The AI row shows whether it agrees with each rater about as often as the raters agree with each other.' : '') + '</p></div></section>';
      h += '</div>';

      h += '<section class="panel"><div class="panel-head"><h2>How each rater used the options</h2><p>Share of the ' + C.length + ' conversations rated with each option. A rater who never uses “No” or always says “Yes” shows up here immediately.</p>';
      h += '<button class="linkbtn" id="dist-toggle" style="margin-left:auto">' + (state.distCounts ? 'Show bars' : 'Show counts') + '</button></div>';
      h += '<div class="legend" style="margin-bottom:10px">' + [...seen].map(k => '<span><i class="sw" style="background:' + esc(scaleColor(k)) + '"></i>' + esc(k) + '</span>').join('') + (state.cat === 'yes' ? [...new Set(Q.filter(groupable).map(notLabel))].map(n => '<span><i class="sw" style="background:var(--cal-not)"></i>' + esc(n) + '</span>').join('') : '') + '</div>';
      h += '<div class="tablewrap"><table><thead><tr><th>Question</th>' + R.map(r => '<th' + (r.kind === 'ai' ? ' class="aihead"' : '') + '>' + esc(r.short) + '</th>').join('') + '</tr></thead><tbody>';
      Q.forEach(q => {
        const opts = state.cat === 'yes' && groupable(q) ? [q.scale[0].name, notLabel(q)] : q.scale.map(o => o.name);
        h += '<tr><th>' + esc(q.short) + '</th>';
        R.forEach(r => {
          const counts = {}; let n = 0;
          C.forEach(c => { const l = lab(q, raw(c, q, r).label); if (l != null) { counts[l] = (counts[l] || 0) + 1; n++; } });
          if (!n) { h += '<td class="muted">' + (r.kind === 'ai' && q.hasAI && !q.aiMapped ? 'not named' : 'no answers') + '</td>'; return; }
          const extra = Object.keys(counts).filter(k => !opts.includes(k));
          const all = opts.concat(extra);
          const tip = all.map(o => o + ': ' + (counts[o] || 0)).join('\n') + '\n(' + n + ' answered)';
          if (state.distCounts) {
            h += '<td class="stackcount" data-tip="' + esc(tip) + '">' + all.map(o => '<span style="color:' + esc(scaleColor(o)) + '">■</span> ' + (counts[o] || 0)).join('  ') + '</td>';
          } else {
            h += '<td><div class="stack" data-tip="' + esc(tip) + '">' + all.filter(o => counts[o]).map(o => '<span style="--w:' + counts[o] + ';background:' + esc(scaleColor(o)) + '"></span>').join('') + '</div></td>';
          }
        });
        h += '</tr>';
      });
      h += '</tbody></table></div></section>';

      el.innerHTML = h;
      const sel = $('matrix-q'); if (sel) sel.addEventListener('change', e => { state.matrixQ = e.target.value; renderOverview(); });
      const dt = $('dist-toggle'); if (dt) dt.addEventListener('click', () => { state.distCounts = !state.distCounts; renderOverview(); });
    }

    // ---------- conversations ----------
    function orderedConvs() {
      let list = C.map(c => ({ c, s: m.convScore(c) }));
      if (state.show === 'open') list = list.filter(x => m.hasConflict(x.c) && !recorded(x.c));
      else if (state.show === 'done') list = list.filter(x => recorded(x.c));
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
      let h = '<div class="tools"><span class="eyebrow">' + (list.length === C.length ? C.length + ' conversations' : list.length + ' of ' + C.length) + '</span>';
      h += '<label>Sort <select id="sort-sel">' + opt('disagree', state.sort, 'Most disagreement') + (AI ? opt('ai', state.sort, 'AI off majority') : '') + opt('order', state.sort, 'Original order') + '</select></label>';
      h += '<label>Focus <select id="focus-sel"><option value="">All questions</option>' + Q.map(q => '<option value="' + esc(q.key) + '"' + (state.qFocus === q.key ? ' selected' : '') + '>' + esc(q.short) + '</option>').join('') + '</select></label>';
      h += '<label>Show <select id="show-sel">' + opt('all', state.show, 'All') + opt('open', state.show, 'Conflicts not yet discussed') + opt('done', state.show, 'Consensus recorded') + '</select></label></div>';
      if (!list.length) h += '<p class="empty" style="padding:6px 8px">Nothing here. ' + (state.show === 'open' ? 'Every conversation with a conflict has consensus recorded.' : 'No consensus recorded yet.') + '</p>';
      const cur = C[state.sel];
      list.forEach(({ c, s }) => {
        h += '<button class="convrow" data-idx="' + c.idx + '" aria-current="' + (cur && cur.idx === c.idx) + '">';
        h += '<span class="ix num">' + c.idx + '</span><span class="id">' + esc(c.id) + '<span class="done"' + (recorded(c) ? '' : ' hidden') + ' title="Consensus recorded">✓</span></span>';
        h += '<span class="mini">' + Q.map(q => {
          const a = cell(c, q);
          let cls = a.status === 'split' ? 'split' : a.status === 'thin' ? 'thin' : a.dis.length ? 'd' + Math.min(4, a.dis.length) : '';
          if (a.aiDis) cls += ' ai';
          if (state.qFocus && q.key !== state.qFocus) cls += ' dim';
          if (state.qFocus && q.key === state.qFocus) cls += ' focus';
          const tip = q.short + ': ' + (a.status === 'split' ? 'split ' + a.sorted.map(x => x[0] + ' ' + x[1]).join(' · ') : a.status === 'thin' ? 'too few answers' : a.dis.length ? a.dis.map(k => BY_KEY[k].short).join(', ') + ' off the majority (' + a.majority + ')' : 'unanimous ' + a.majority);
          return '<i class="' + cls + '" data-tip="' + esc(tip) + '">' + (a.dis.length || '') + '</i>';
        }).join('') + '</span>';
        h += '<span class="hint">' + esc(convHint(c) || '') + '</span>';
        h += '<span class="badge">' + (s.dis ? s.dis + ' off' : '') + (s.splits ? (s.dis ? ' · ' : '') + s.splits + ' split' : '') + (!s.dis && !s.splits ? 'unanimous' : '') + '</span>';
        h += '</button>';
      });
      h += '<div class="minilegend"><span><i></i>unanimous</span><span><i class="d2"></i>n raters off the majority (darker = more)</span><span><i class="split"></i>split, no majority</span>' + (AI ? '<span><i class="ai"></i>AI off the majority</span>' : '') + '<span><i class="thin"></i>too few answers</span><span><b class="done" style="color:var(--accent-ink)">✓</b> consensus recorded</span></div>';
      el.innerHTML = h;
      el.querySelectorAll('.convrow').forEach(b => b.addEventListener('click', () => { selectConv(C.findIndex(c => c.idx === +b.dataset.idx)); }));
      $('sort-sel').addEventListener('change', e => { state.sort = e.target.value; X.persist(); renderList(); });
      $('focus-sel').addEventListener('change', e => { state.qFocus = e.target.value; renderList(); renderDetail(); });
      $('show-sel').addEventListener('change', e => { state.show = e.target.value; renderList(); });
    }
    function selectConv(i) {
      state.sel = Math.max(0, Math.min(C.length - 1, i));
      history.replaceState(null, '', anchor(C[state.sel]));
      renderList(); renderDetail();
      const cur = document.querySelector('.convrow[aria-current="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
      $('detail').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    function majorityCell(a) {
      if (a.status === 'split') return '<span class="chip c-nei">Split</span><span class="tally">' + esc(a.sorted.map(x => x[0] + ' ' + x[1]).join(' · ')) + '</span>';
      if (a.status === 'thin') return '<span class="muted">too few answers</span>';
      return chip(a.majority) + '<span class="tally num">' + a.majCount + '/' + a.n + '</span>';
    }
    function ratingsCard(c) {
      let h = '<div class="card"><div class="card-head"><h3>Ratings</h3><span class="sp"></span><span class="muted" style="font-size:12px">majority from ' + esc(refLabel()) + '</span></div>';
      h += '<div class="tablewrap"><table class="rgrid"><thead><tr><th class="q">Question</th>' + R.map(r => '<th' + (r.kind === 'ai' ? ' class="aihead"' : '') + '>' + esc(r.short) + '</th>').join('') + '<th class="maj">Majority</th></tr></thead><tbody>';
      Q.forEach(q => {
        const a = cell(c, q);
        h += '<tr class="' + a.status + '"><th class="q"><span class="qname" title="' + esc(q.rubric) + '">' + esc(q.short) + '</span><span class="qhelp">' + esc(q.description) + '</span></th>';
        R.forEach(r => {
          const x = raw(c, q, r), l = a.labels[r.key];
          if (r.kind === 'ai' && q.hasAI && !q.aiMapped && x.raw != null) {
            h += '<td><span class="chipwrap" data-tip="' + esc('AI answered “' + x.raw + '”. Name this question’s options in Setup to compare it.' + (x.reasoning ? '\n' + x.reasoning : '')) + '"><span class="chip c-none">' + esc(x.raw) + ' ?</span></span></td>';
            return;
          }
          h += '<td><span class="chipwrap" data-tip="' + esc(r.name + (x.reasoning ? '\n' + x.reasoning : '\n(no reasoning given)')) + '">' + chip(l, a.dis.includes(r.key) ? 'dis' : '') + '</span></td>';
        });
        h += '<td class="maj">' + majorityCell(a) + '</td></tr>';
      });
      h += '</tbody></table></div></div>';
      return h;
    }

    // ---------- consensus card ----------
    function strictMajority(c, q) { return m.analyze(c, q, m.refRaters(), 'strict').majority; }
    function consensusCard(c) {
      const key = K.keyOf(D, c);
      const it = X.draft.items[key] || K.empty();
      const conflicts = Q.filter(q => m.isConflict(cell(c, q)));
      const shown = state.allQs || !conflicts.length ? Q : conflicts;
      const ro = X.readOnly;
      let h = '<div class="card cons' + (K.isRecorded(it) ? ' recorded' : '') + '" id="cons-card" data-key="' + esc(key) + '">';
      h += '<div class="card-head"><h3>Consensus</h3><span class="sp"></span><span class="muted" style="font-size:12px">' + (conflicts.length ? conflicts.length + ' of ' + Q.length + ' questions in conflict (' + esc(refLabel()) + ')' : 'no conflicts') + '</span></div>';
      if (!ro && !conflicts.length && !state.allQs) h += '<p class="muted" style="margin:0 0 6px;font-size:12.5px">Every rater who answered agreed. You can still record a decision or a note.</p>';
      shown.forEach(q => {
        const a = cell(c, q), x = (it.q || {})[q.key] || {};
        h += '<div class="crow" data-q="' + esc(q.key) + '"><span class="qn">' + esc(q.short) + '</span><span class="maj">' + majorityCell(a) + '</span>';
        if (ro) {
          h += '<span>' + (x.agreed === K.NO_CONSENSUS ? '<span class="chip c-nei">' + K.NO_CONSENSUS_LABEL + '</span>' : x.agreed ? chip(x.agreed) : '<span class="muted">–</span>') + '</span><span class="ro">' + esc(x.note || '') + '</span>';
        } else {
          const maj = strictMajority(c, q);
          h += '<span class="pickwrap"><select data-f="agreed" aria-label="Agreed answer for ' + esc(q.short) + '"><option value="">Agreed answer…</option>' + q.scale.map(o => '<option' + (x.agreed === o.name ? ' selected' : '') + '>' + esc(o.name) + '</option>').join('') + (x.agreed && x.agreed !== K.NO_CONSENSUS && !q.scale.some(o => o.name === x.agreed) ? '<option selected>' + esc(x.agreed) + '</option>' : '') + '<option value="' + K.NO_CONSENSUS + '"' + (x.agreed === K.NO_CONSENSUS ? ' selected' : '') + '>' + K.NO_CONSENSUS_LABEL + '</option></select>';
          if (maj) h += '<button class="linkbtn" type="button" data-majority="' + esc(maj) + '" title="Set the agreed answer to the majority">= majority</button>';
          h += '</span><input type="text" data-f="note" value="' + esc(x.note || '') + '" placeholder="Why, or what changes" aria-label="Note for ' + esc(q.short) + '">';
        }
        h += '</div>';
      });
      if (conflicts.length && conflicts.length < Q.length) h += '<div class="more"><button class="linkbtn" type="button" id="cons-all">' + (state.allQs ? 'Show only questions in conflict' : 'Show all ' + Q.length + ' questions') + '</button></div>';
      const st = K.STATUSES;
      if (ro) {
        h += '<div class="convfields"><div><div class="eyebrow">Status</div><span class="status-pill ' + esc(it.status) + '">' + esc(K.statusName(it.status)) + '</span></div>';
        h += '<div><div class="eyebrow">Discussion notes</div><div class="ro">' + (esc(it.comment) || '<span class="muted">–</span>') + '</div></div>';
        h += '<div><div class="eyebrow">Next steps</div><div class="ro">' + (esc(it.next_steps) || '<span class="muted">–</span>') + '</div></div></div>';
      } else {
        h += '<div class="convfields"><label class="f">Status<select data-f="status">' + st.map(s => '<option value="' + s.value + '"' + (it.status === s.value ? ' selected' : '') + '>' + s.name + '</option>').join('') + '</select><span class="saved" id="cons-saved">' + savedText(it) + '</span></label>';
        h += '<label class="f">Discussion notes<textarea data-f="comment" placeholder="What the group concluded, and why">' + esc(it.comment || '') + '</textarea></label>';
        h += '<label class="f">Next steps<textarea data-f="next_steps" placeholder="Who does what (rubric edit, re-rating, ask a clinician…)">' + esc(it.next_steps || '') + '</textarea></label></div>';
      }
      h += '</div>';
      return h;
    }
    function savedText(it) {
      if (!it || !it.updated_at || !K.isRecorded(it)) return '';
      const d = new Date(it.updated_at);
      return isNaN(d) ? '' : 'Saved in this browser ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    function wireConsensus(c) {
      const card = $('cons-card'); if (!card) return;
      const all = $('cons-all'); if (all) all.addEventListener('click', () => { state.allQs = !state.allQs; renderDetail(); });
      if (X.readOnly) return;
      const key = card.dataset.key;
      const touch = mutate => {
        const it = X.draft.items[key] ? JSON.parse(JSON.stringify(X.draft.items[key])) : K.empty();
        it.q = it.q || {};
        mutate(it);
        it.updated_at = new Date().toISOString();
        X.draft.items[key] = it;
        card.classList.toggle('recorded', K.isRecorded(it));
        const s = $('cons-saved'); if (s) s.textContent = savedText(it);
        const row = document.querySelector('.convrow[data-idx="' + c.idx + '"] .done'); if (row) row.hidden = !K.isRecorded(it);
        X.onNote(key);
      };
      const onField = e => {
        const t = e.target, f = t.dataset && t.dataset.f; if (!f) return;
        const row = t.closest('.crow');
        touch(it => {
          if (row) { const qk = row.dataset.q; it.q[qk] = Object.assign({ agreed: '', note: '' }, it.q[qk]); it.q[qk][f === 'agreed' ? 'agreed' : 'note'] = t.value; }
          else it[f] = t.value;
        });
      };
      card.addEventListener('input', onField);
      card.addEventListener('change', e => { if (e.target.tagName === 'SELECT') onField(e); });
      card.addEventListener('click', e => {
        const b = e.target.closest('[data-majority]'); if (!b) return;
        const sel = b.closest('.crow').querySelector('select[data-f="agreed"]');
        sel.value = b.dataset.majority; sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    function renderDetail() {
      const c = C[state.sel];
      const el = $('detail');
      if (!c) { el.innerHTML = ''; return; }
      const s = m.convScore(c);
      let h = '';
      h += '<section class="panel"><div class="detail-head"><span class="eyebrow">Conversation ' + c.idx + ' of ' + C.length + '</span><h2 class="mono">Chat ' + esc(c.id) + '</h2>';
      h += '<span class="muted">' + (s.dis ? s.dis + ' rating' + (s.dis > 1 ? 's' : '') + ' off the majority' : 'no rating off the majority') + (s.splits ? ' · ' + s.splits + ' split question' + (s.splits > 1 ? 's' : '') : '') + '</span>';
      h += '<div class="nav"><button id="prev" ' + (state.sel === 0 ? 'disabled' : '') + '>← Previous</button><button id="next" ' + (state.sel === C.length - 1 ? 'disabled' : '') + '>Next →</button></div></div>';
      h += '<div class="facts" style="margin-top:8px">' + c.description.filter(d => !/^(chat id|conversation id)$/i.test(d.label)).map(d => '<span class="f' + (d.value.length > 60 ? ' long' : '') + '">' + esc(d.label) + ': <b>' + esc(d.value) + '</b></span>').join('') + '</div>';
      h += '</section>';

      h += ratingsCard(c);
      h += consensusCard(c);
      h += '<div class="two">';
      const hasOriginal = c.transcript.some(t => t.original);
      h += '<div class="card"><div class="card-head"><h3>Transcript</h3><span class="sp"></span>' + (hasOriginal ? '<button class="linkbtn" id="orig-toggle">' + (state.showOriginal ? 'Hide original text' : 'Show original text') + '</button>' : '') + '</div><div class="transcript">';
      c.transcript.forEach(t => {
        h += '<div class="msg ' + (t.role === 'assistant' ? 'assistant' : 'user') + '"><div class="who"><b>' + esc(t.speaker) + '</b><span class="mono">' + esc(t.time || '') + '</span></div>';
        h += '<div class="bubble">' + esc(t.translation) + (state.showOriginal && t.original ? '<div class="orig">' + esc(t.original) + '</div>' : '') + '</div>';
        if (t.meta && t.meta.length) h += '<div class="metaline">' + t.meta.map(x => esc(x.label) + ' ' + esc(x.value)).join(' · ') + '</div>';
        h += '</div>';
      });
      h += '</div></div>';

      h += '<div style="display:flex;flex-direction:column;gap:16px;min-width:0">';
      const points = Q.map(q => ({ q, a: cell(c, q) })).filter(x => x.a.status === 'split' || x.a.status === 'disagree');
      points.sort((x, y) => (y.a.status === 'split') - (x.a.status === 'split') || y.a.dis.length - x.a.dis.length);
      h += '<div class="card"><div class="card-head"><h3>Where raters part ways</h3><span class="sp"></span><span class="muted" style="font-size:12px">' + points.length + ' of ' + Q.length + ' questions</span></div>';
      if (!points.length) h += '<p class="empty">Every rater who answered agreed on every question.</p>';
      h += '<div class="points">';
      points.forEach(({ q, a }) => {
        h += '<div class="point ' + a.status + '"><div class="ph"><span class="qn">' + esc(q.short) + '</span>';
        if (a.status === 'split') h += '<span class="chip c-nei">Split</span><span class="muted">' + esc(a.sorted.map(x => x[0] + ' × ' + x[1]).join(' · ')) + '</span>';
        else h += '<span class="muted">majority</span>' + chip(a.majority) + '<span class="muted num">' + a.majCount + ' of ' + a.n + '</span>';
        h += '</div>';
        const withReason = r => { const rs = raw(c, q, r).reasoning; return '<li><span><span class="who">' + esc(r.short) + (r.kind === 'ai' ? ' <span class="ai-tag">AI</span>' : '') + '</span> ' + chip(a.labels[r.key], 'sm') + '</span><span class="rs' + (rs ? '' : ' none') + '">' + esc(rs || 'no reasoning given') + '</span></li>'; };
        if (a.status === 'split') h += '<ul>' + R.filter(r => a.labels[r.key] != null).map(withReason).join('') + '</ul>';
        else {
          h += '<ul>' + a.dis.map(k => withReason(BY_KEY[k])).join('') + '</ul>';
          const agreeing = R.filter(r => a.labels[r.key] === a.majority && raw(c, q, r).reasoning && r.kind !== 'ai');
          if (agreeing.length) h += '<div class="sub">Agreed with the majority, and noted</div><ul>' + agreeing.map(withReason).join('') + '</ul>';
        }
        h += '</div>';
      });
      h += '</div>';
      const comments = Object.entries(c.comments || {});
      if (comments.length) h += '<h3 style="margin-top:14px">Rater comments on this conversation</h3><div class="comments" style="margin-top:6px">' + comments.map(([k, v]) => '<div><b>' + esc(BY_KEY[k] ? BY_KEY[k].short : k) + '</b><span>' + esc(v) + '</span></div>').join('') + '</div>';
      h += '<details class="all"><summary>All ratings and reasoning for this conversation</summary><div class="tablewrap"><table class="alltab"><thead><tr><th>Question</th>' + R.map(r => '<th>' + esc(r.short) + '</th>').join('') + '</tr></thead><tbody>';
      Q.forEach(q => {
        const a = cell(c, q);
        h += '<tr><th>' + esc(q.short) + '</th>' + R.map(r => { const x = raw(c, q, r); const l = a.labels[r.key] != null ? a.labels[r.key] : (r.kind === 'ai' && x.raw != null ? x.raw + ' ?' : null); return '<td>' + chip(l, 'sm' + (a.dis.includes(r.key) ? ' dis' : '')) + '<br>' + (x.reasoning ? esc(x.reasoning) : '<span class="muted">–</span>') + '</td>'; }).join('') + '</tr>';
      });
      h += '</tbody></table></div></details>';
      h += '</div></div>';
      h += '</div>';
      h += '<p class="note">Use <span class="kbd">←</span> <span class="kbd">→</span> to move between conversations (not while typing in a note).</p>';
      el.innerHTML = h;
      $('prev').addEventListener('click', () => selectConv(state.sel - 1));
      $('next').addEventListener('click', () => selectConv(state.sel + 1));
      const ot = $('orig-toggle'); if (ot) ot.addEventListener('click', () => { state.showOriginal = !state.showOriginal; X.persist(); renderDetail(); });
      wireConsensus(c);
    }

    // ---------- consensus tab ----------
    function renderConsensus() {
      const el = $('view-consensus');
      const conflicted = C.filter(c => m.hasConflict(c));
      const rec = C.filter(recorded);
      const byStatus = s => C.filter(c => recorded(c) && (itemOf(c).status || '') === s).length;
      const open = conflicted.filter(c => !recorded(c));
      let rows;
      if (state.cfilter === 'open') rows = open;
      else if (state.cfilter === 'all') rows = C;
      else if (state.cfilter && state.cfilter !== 'recorded') rows = rec.filter(c => (itemOf(c).status || '') === state.cfilter);
      else rows = rec;
      let h = '<section class="panel"><div class="panel-head"><h2>Consensus record</h2><p>Everything recorded in the conversation view, in one place for the wrap-up. ' + (X.readOnly ? 'This is a read-only copy.' : 'It is what “Download CSV” writes into the consensus columns.') + '</p></div>';
      h += '<div class="summary"><span><b>' + rec.length + '</b>conversations with consensus recorded</span><span><b>' + (conflicted.length - open.length) + '/' + conflicted.length + '</b>conversations with a conflict discussed (' + esc(refLabel()) + ')</span>';
      K.STATUSES.filter(s => s.value).forEach(s => { h += '<span><b>' + byStatus(s.value) + '</b>' + esc(s.name.toLowerCase()) + '</span>'; });
      h += '</div>';
      const fopt = (v, label) => '<option value="' + v + '"' + ((state.cfilter || 'recorded') === v ? ' selected' : '') + '>' + label + '</option>';
      h += '<div class="tools" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;font-size:12.5px;color:var(--ink-2)"><label>Show <select id="cfilter" class="inp">' + fopt('recorded', 'Consensus recorded') + K.STATUSES.filter(s => s.value).map(s => fopt(s.value, s.name)).join('') + fopt('open', 'Conflicts not yet discussed') + fopt('all', 'All conversations') + '</select></label></div>';
      if (!rows.length) h += '<p class="empty">' + (state.cfilter === 'open' ? 'Every conversation with a conflict has consensus recorded.' : 'Nothing recorded yet. Open a conversation and use the Consensus card under the ratings.') + '</p>';
      else {
        h += '<div class="tablewrap"><table class="ctab"><thead><tr><th>#</th><th>Chat</th><th>Status</th><th>Decisions</th><th>Discussion notes</th><th>Next steps</th></tr></thead><tbody>';
        rows.forEach(c => {
          const it = itemOf(c) || K.empty();
          const dec = Q.map(q => ({ q, x: (it.q || {})[q.key] })).filter(d => d.x && (d.x.agreed || d.x.note));
          h += '<tr><td class="num muted">' + c.idx + '</td><td><a href="' + esc(anchor(c)) + '" class="mono" data-open="' + c.idx + '">' + esc(c.id) + '</a></td>';
          h += '<td><span class="status-pill ' + esc(it.status) + '">' + esc(K.statusName(it.status)) + '</span></td>';
          h += '<td><div class="dec">' + (dec.length ? dec.map(d => '<div><span class="q">' + esc(d.q.short) + '</span> ' + (d.x.agreed === K.NO_CONSENSUS ? '<span class="chip sm c-nei">' + K.NO_CONSENSUS_LABEL + '</span>' : d.x.agreed ? chip(d.x.agreed, 'sm') : '') + (d.x.note ? ' <span class="muted">' + esc(d.x.note) + '</span>' : '') + '</div>').join('') : '<span class="muted">–</span>') + '</div></td>';
          h += '<td class="txt">' + (esc(it.comment) || '<span class="muted">–</span>') + '</td><td class="txt">' + (esc(it.next_steps) || '<span class="muted">–</span>') + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }
      h += '</section>';
      el.innerHTML = h;
      $('cfilter').addEventListener('change', e => { state.cfilter = e.target.value; renderConsensus(); });
      el.querySelectorAll('[data-open]').forEach(a => a.addEventListener('click', e => {
        e.preventDefault(); X.setTab('conversations'); selectConv(C.findIndex(c => c.idx === +a.dataset.open));
      }));
    }

    function renderAll() { m.clear(); renderOverview(); renderList(); renderDetail(); renderConsensus(); }
    return { renderAll, renderOverview, renderList, renderDetail, renderConsensus, selectConv, anchor };
  }

  const api = { create, esc };
  CD.dashboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
