const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CD = require('./load.js');

const unlock = fs.readFileSync(path.join(__dirname, '..', 'src', 'unlock.html'), 'utf8');
const shell = '<!doctype html><html><head></head><body>\n<' + '!--__PRELOAD__-->\n<p>app</p></body></html>';

test('protected copy round-trips and reveals nothing without the password', async () => {
  const preload = { v: 1, model: { meta: { title: 'T' } }, items: { 'id:1': { comment: 'secret note' } } };
  const page = await CD.snapshot.makeProtectedCopy(shell, unlock, preload, 'a long passphrase', { title: 'Cost $& review <x>' });
  assert.ok(page.includes('Enter the workshop password'));
  assert.ok(page.includes('Cost $&amp; review &lt;x&gt;'));
  assert.ok(!page.includes('secret note'));
  // The calibrate-workshop skill's deploy_vercel.py refuses pages that contain any of these.
  for (const marker of ['id="data"', '"conversation_history"', '"transcript"']) assert.ok(!page.includes(marker), marker);
  const payload = JSON.parse(/<script type="application\/json" id="payload">([\s\S]*?)<\/script>/.exec(page)[1]);
  assert.equal(payload.iterations, 600000);
  assert.equal(payload.kdf, 'PBKDF2-SHA256');
  const html = await CD.snapshot.decrypt(payload, 'a long passphrase');
  const pre = JSON.parse(/<script type="application\/json" id="preload">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.deepEqual(pre, preload);
  await assert.rejects(CD.snapshot.decrypt(payload, 'the wrong passphrase'));
});

test('short passwords are refused', async () => {
  await assert.rejects(CD.snapshot.encrypt('x', 'short'), /at least 10/);
});

test('a copy cannot be made from a page without the preload marker', () => {
  assert.throws(() => CD.snapshot.snapshotHtml('<html></html>', {}), /already a locked copy/);
});
