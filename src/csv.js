// CSV reading and writing (RFC 4180). The reader records where every field sits in the source
// text, so an export can copy the original columns byte for byte and only append new ones.
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};

  // Pick the delimiter from the header line: whichever of , ; tab occurs most outside quotes.
  function sniff(text) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') quoted = !quoted;
      else if (!quoted && (ch === '\n' || ch === '\r')) break;
      else if (!quoted && ch in counts) counts[ch]++;
    }
    return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ',');
  }

  function parse(text, opts) {
    let bom = false;
    if (text.charCodeAt(0) === 0xfeff) { bom = true; text = text.slice(1); }
    const d = (opts && opts.delimiter) || sniff(text);
    const n = text.length;
    const rows = [], spans = [];
    let i = 0, crlf = 0, lf = 0;
    const scanPlain = j => { while (j < n && text[j] !== d && text[j] !== '\n' && text[j] !== '\r') j++; return j; };
    while (i < n) {
      const row = [], rowSpans = [];
      for (;;) {
        const start = i;
        let value;
        if (text[i] === '"') {
          let buf = '', seg = ++i;
          for (;;) {
            const q = text.indexOf('"', i);
            if (q === -1) throw new Error('The file seems to be cut off: it ends in the middle of a quoted cell (from character ' + start + '). Try downloading it again.');
            if (text[q + 1] === '"') { buf += text.slice(seg, q + 1); i = q + 2; seg = i; continue; }
            buf += text.slice(seg, q); i = q + 1; break;
          }
          const j = scanPlain(i); // tolerate stray text after a closing quote
          value = buf + text.slice(i, j); i = j;
        } else {
          const j = scanPlain(i);
          value = text.slice(i, j); i = j;
        }
        row.push(value); rowSpans.push([start, i]);
        if (i < n && text[i] === d) { i++; continue; }
        break;
      }
      if (text[i] === '\r') { if (text[i + 1] === '\n') { crlf++; i += 2; } else { lf++; i++; } }
      else if (text[i] === '\n') { lf++; i++; }
      if (row.length === 1 && row[0] === '') continue; // blank line
      rows.push(row); spans.push(rowSpans);
    }
    return { text, rows, spans, delimiter: d, bom, eol: crlf > lf ? '\r\n' : '\n', trailingEol: /[\r\n]$/.test(text) };
  }

  function field(v, d) {
    const s = v == null ? '' : String(v);
    return (s.includes(d) || s.includes('"') || s.includes('\n') || s.includes('\r')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function line(values, d) { return values.map(v => field(v, d)).join(d); }

  // Rebuild the file keeping the columns at `keep` (indices into the header) and appending
  // `extraHeader` with one array of values per data row in `extraRows`. When the kept columns are
  // the leading columns of every record, their original text is copied unchanged.
  function rebuild(parsed, keep, extraHeader, extraRows) {
    const { text, rows, spans, delimiter: d } = parsed;
    const prefix = keep.every((k, i) => k === i);
    const out = rows.map((row, r) => {
      let head;
      if (prefix && keep.length && row.length >= keep.length) head = text.slice(spans[r][0][0], spans[r][keep.length - 1][1]);
      else head = line(keep.map(k => row[k] == null ? '' : row[k]), d);
      const extra = r === 0 ? extraHeader : (extraRows[r - 1] || []);
      return extra.length ? head + d + line(extra, d) : head;
    });
    return (parsed.bom ? '﻿' : '') + out.join(parsed.eol) + (parsed.trailingEol ? parsed.eol : '');
  }

  const api = { parse, sniff, field, line, rebuild };
  CD.csv = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
