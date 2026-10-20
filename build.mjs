// Builds index.html: one self-contained page (styles, scripts and the unlock page inlined) so it
// works from GitHub Pages, from a saved file, and as the base of password-protected copies.
//   node build.mjs           write index.html
//   node build.mjs --check   fail if index.html is not up to date (used in CI)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const src = f => readFileSync(join(root, 'src', f), 'utf8');
const MODULES = ['csv.js', 'parse.js', 'scales.js', 'metrics.js', 'consensus.js', 'snapshot.js', 'demo.js', 'dashboard.js', 'app.js'];

const js = MODULES.map(f => '// ---- ' + f + ' ----\n' + src(f)).join('\n');
if (/<\/script/i.test(js) || /<!--/.test(js)) throw new Error('A script contains "</script" or "<!--", which would break the inline <script> element.');
const unlock = src('unlock.html');
for (const marker of ['id="data"', '"conversation_history"', '"transcript"']) {
  // deploy_vercel.py in the calibrate-workshop skill refuses pages containing these.
  if (unlock.includes(marker)) throw new Error('unlock.html must not contain ' + marker);
}

const page = src('shell.html')
  .replace('/*__CSS__*/', () => src('styles.css'))
  .replace('"__UNLOCK__"', () => JSON.stringify(unlock).replace(/</g, '\\u003c'))
  .replace('/*__JS__*/', () => js);

const out = join(root, 'index.html');
if (process.argv.includes('--check')) {
  if (!existsSync(out) || readFileSync(out, 'utf8') !== page) {
    console.error('index.html is out of date: run `node build.mjs` and commit the result.');
    process.exit(1);
  }
  console.log('index.html is up to date.');
} else {
  writeFileSync(out, page);
  console.log('Wrote index.html (' + Math.round(page.length / 1024) + ' KB).');
}
