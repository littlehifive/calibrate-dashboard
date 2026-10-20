const test = require('node:test');
const assert = require('node:assert/strict');
const CD = require('./load.js');

test('parses quotes, escaped quotes, embedded newlines and commas', () => {
  const text = 'a,b,c\n1,"x, ""y""\nz",\n"",plain,"last"';
  const p = CD.csv.parse(text);
  assert.deepEqual(p.rows, [['a', 'b', 'c'], ['1', 'x, "y"\nz', ''], ['', 'plain', 'last']]);
  assert.equal(p.eol, '\n');
  assert.equal(p.trailingEol, false);
});

test('handles CRLF, BOM, trailing newline and blank lines', () => {
  const p = CD.csv.parse('﻿a,b\r\n1,2\r\n\r\n3,4\r\n');
  assert.equal(p.bom, true);
  assert.equal(p.eol, '\r\n');
  assert.deepEqual(p.rows, [['a', 'b'], ['1', '2'], ['3', '4']]);
});

test('sniffs semicolon and tab delimiters', () => {
  assert.equal(CD.csv.parse('a;b;c\n1;2;3').delimiter, ';');
  assert.equal(CD.csv.parse('a\tb\n1\t2').delimiter, '\t');
  assert.equal(CD.csv.parse('"a;b",c\n1,2').delimiter, ',');
});

test('rejects an unterminated quote', () => {
  assert.throws(() => CD.csv.parse('a,b\n"1,2\n'), /middle of a quoted cell/);
});

test('rebuild copies the original text and appends columns', () => {
  const text = '﻿name,"quoted ""h"""\r\n1,"x\r\ny"\r\n2,""';
  const p = CD.csv.parse(text);
  const out = CD.csv.rebuild(p, [0, 1], ['new/col'], [['a,b'], ['']]);
  assert.equal(out, '﻿name,"quoted ""h""",new/col\r\n1,"x\r\ny","a,b"\r\n2,"",');
});

test('rebuild drops non-leading columns by re-serialising', () => {
  const p = CD.csv.parse('a,x,b\n1,9,"2,3"\n');
  assert.equal(CD.csv.rebuild(p, [0, 2], ['c'], [['z']]), 'a,b,c\n1,"2,3",z\n');
});
