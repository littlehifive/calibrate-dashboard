// The password-protected copy: the page itself with the data and notes baked in (read-only),
// encrypted in the browser and wrapped in a small unlock page. Same scheme and payload as the
// calibrate-workshop skill's encrypt_dashboard.py: PBKDF2-SHA256 (600k iterations) -> AES-256-GCM.
(function (root) {
  'use strict';
  const CD = root.CD = root.CD || {};
  const ITERATIONS = 600000;
  const MIN_PASSWORD = 10;
  const PRELOAD_MARK = '<' + '!--__PRELOAD__-->'; // split so the inline script never holds an HTML comment opener

  function toB64(buf) {
    const bytes = new Uint8Array(buf); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const subtle = () => {
    const c = root.crypto;
    if (!c || !c.subtle) throw new Error('This browser cannot lock files here. Open the page from its https address or from a saved copy.');
    return c.subtle;
  };

  async function deriveKey(password, salt, iterations, usage) {
    const material = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
  }
  async function encrypt(plaintext, password) {
    if (String(password).length < MIN_PASSWORD) throw new Error('Use a password of at least ' + MIN_PASSWORD + ' characters. A short phrase is easiest to remember.');
    const salt = root.crypto.getRandomValues(new Uint8Array(16));
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, ITERATIONS, 'encrypt');
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    return { v: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  }
  async function decrypt(payload, password) {
    const key = await deriveKey(password, fromB64(payload.salt), payload.iterations, 'decrypt');
    return new TextDecoder().decode(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) }, key, fromB64(payload.ct)));
  }

  const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // The page as captured at startup, with the data embedded so it opens straight into the dashboard.
  function snapshotHtml(appHtml, preload) {
    if (!appHtml.includes(PRELOAD_MARK)) throw new Error('This is already a locked copy, so it cannot make another one.');
    const json = JSON.stringify(preload).replace(/</g, '\\u003c');
    return appHtml.replace(PRELOAD_MARK, () => '<script type="application/json" id="preload">' + json + '<\/script>');
  }
  function protectedPage(unlockTemplate, payload, opts) {
    // Function replacements: a "$" in a title must not be read as a replacement pattern.
    const page = unlockTemplate
      .replace(/__TITLE__/g, () => escHtml(opts.title))
      .replace(/__EYEBROW__/g, () => escHtml(opts.eyebrow || 'Calibrate review'))
      .replace(/__STORE__/g, () => opts.store)
      .replace('/*__PAYLOAD__*/', () => JSON.stringify(payload));
    if (!page.includes('Enter the workshop password')) throw new Error('The unlock page lost its password prompt.');
    return page;
  }
  async function makeProtectedCopy(appHtml, unlockTemplate, preload, password, opts) {
    const payload = await encrypt(snapshotHtml(appHtml, preload), password);
    const store = 'cd-copy-' + toB64(root.crypto.getRandomValues(new Uint8Array(6))).replace(/[^a-z0-9]/gi, '');
    return protectedPage(unlockTemplate, payload, Object.assign({ store }, opts));
  }

  const api = { encrypt, decrypt, snapshotHtml, protectedPage, makeProtectedCopy, ITERATIONS, MIN_PASSWORD, PRELOAD_MARK };
  CD.snapshot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
