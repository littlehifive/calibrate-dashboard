"""Browser test of the whole flow, in Chromium and WebKit, on invented data only.

    pip install playwright && python -m playwright install chromium webkit
    node build.mjs && python test/e2e.py            # screenshots go to a temporary folder

Checks: upload, presets, consensus notes, CSV download and re-upload, the protected copy opened
from file:// (wrong and right password, read-only), setup for unnamed options, and that the page
makes no network request beyond loading itself.
"""
import sys, os, json, csv, io, threading, http.server, functools, re, subprocess, tempfile
from playwright.sync_api import sync_playwright, expect

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='cd-e2e-')
subprocess.run(['node', '-e', """
const CD = require('./test/load.js'); const fs = require('fs'); const out = process.argv[1];
fs.writeFileSync(out + '/Synthetic_Workshop-items.csv', CD.demo.makeCsv({ conversations: 20, raters: ['ana', 'bo', 'chen', 'dara', 'eli'], prefix: 'TW9', aiVersions: [1, 2] }));
fs.writeFileSync(out + '/NoAI_Unnamed-items.csv', CD.demo.makeCsv({ conversations: 8, aiVersions: [], comments: false, prefix: '', questions: [{ name: 'Tone fits' }, { name: 'Flagged', binary: true, names: { false: 'No', true: 'Yes' } }] }));
""", OUT], cwd=REPO, check=True)
print('Output:', OUT)
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail)); print(('PASS ' if cond else 'FAIL ') + name + (' :: ' + str(detail) if detail and not cond else ''))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=REPO))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(accept_downloads=True, viewport={'width': 1440, 'height': 1000})
    page = ctx.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('request', lambda r: requests.append(r.url))
    page.goto(BASE)
    page.screenshot(path=OUT + '/01-start.png')

    # 1. upload a W4-shaped synthetic export
    page.set_input_files('#file', OUT + '/Synthetic_Workshop-items.csv')
    expect(page.locator('#app')).to_be_visible()
    check('title from file name', page.locator('#title').inner_text() == 'Synthetic Workshop', page.locator('#title').inner_text())
    check('subtitle names newest AI version', 'AI evaluator (v2)' in page.locator('#subtitle').inner_text(), page.locator('#subtitle').inner_text())
    check('5 question rows in overview', page.locator('#view-overview table').first.locator('tbody tr').count() == 5)
    check('no setup needed (presets)', page.locator('#view-setup').is_hidden())
    page.screenshot(path=OUT + '/02-overview.png', full_page=True)

    # 2. record consensus on the first conversation in the list
    page.click('#tab-conversations')
    page.locator('.convrow').first.click()
    card = page.locator('#cons-card')
    expect(card).to_be_visible()
    first_sel = card.locator('select[data-f="agreed"]').first
    first_sel.select_option(index=2)
    agreed = first_sel.evaluate('s => s.value')
    card.locator('input[data-f="note"]').first.fill('Agreed after reading turn 3, "carefully", twice')
    card.locator('select[data-f="status"]').select_option('follow_up')
    card.locator('textarea[data-f="comment"]').fill('Line one\nLine two, with comma')
    card.locator('textarea[data-f="next_steps"]').fill('Clarify rubric for NEI')
    conv_id = page.locator('#detail h2').inner_text().replace('Chat ', '')
    page.wait_for_timeout(400)
    check('pending badge shows 1', page.locator('#pending').inner_text() == '1')
    check('list row shows a check mark', page.locator('.convrow[aria-current="true"] .done').is_visible())
    page.screenshot(path=OUT + '/03-conversation.png', full_page=True)

    # arrow keys must not navigate while typing
    card.locator('textarea[data-f="comment"]').press('ArrowRight')
    check('arrow key in textarea stays on conversation', page.locator('#detail h2').inner_text() == 'Chat ' + conv_id)

    # 3. consensus tab
    page.click('#tab-consensus')
    check('consensus tab lists the record', page.locator('#view-consensus .ctab tbody tr').count() == 1)
    page.screenshot(path=OUT + '/04-consensus.png', full_page=True)

    # 4. download CSV
    with page.expect_download() as d:
        page.click('#act-download')
    dl = d.value; path = OUT + '/' + dl.suggested_filename; dl.save_as(path)
    check('download name', re.match(r'Synthetic_Workshop-items-consensus-\d{4}-\d\d-\d\d\.csv$', dl.suggested_filename), dl.suggested_filename)
    original = open(OUT + '/Synthetic_Workshop-items.csv', encoding='utf-8').read()
    exported = open(path, encoding='utf-8').read()
    rows = list(csv.reader(io.StringIO(exported)))
    orows = list(csv.reader(io.StringIO(original)))
    n = len(orows[0])
    check('original cells unchanged', [r[:n] for r in rows] == orows)
    hdr = rows[0]
    rec = next(r for r in rows[1:] if r[0].lstrip("'") == conv_id)
    get = dict(zip(hdr, rec))
    qkey = 'TW9_-_Easy_to_understand'
    check('consensus status column', get.get('consensus/status') == 'Needs follow-up', get.get('consensus/status'))
    check('consensus comment keeps newline', get.get('consensus/comment') == 'Line one\nLine two, with comma')
    agreed_cols = [h for h in hdr if h.endswith('/label') and get[h]]
    check('one agreed answer exported', len(agreed_cols) == 1 and get[agreed_cols[0]] == agreed, (agreed_cols, agreed))
    check('pending badge cleared after download', page.locator('#pending').is_hidden())

    # 5. a fresh browser profile re-opens the downloaded CSV and gets the notes back from the file
    ctx2 = browser.new_context(accept_downloads=True)
    p2 = ctx2.new_page(); p2.goto(BASE)
    p2.set_input_files('#file', path)
    expect(p2.locator('#app')).to_be_visible()
    check('restore notice from file', 'from the file' in p2.locator('#banners').inner_text(), p2.locator('#banners').inner_text())
    p2.click('#tab-consensus')
    check('restored record listed', p2.locator('#view-consensus .ctab tbody tr').count() == 1)
    check('restored file shows no pending', p2.locator('#pending').is_hidden())
    ctx2.close()

    # 6. protected copy
    page.click('#tab-overview')
    page.click('#act-protect')
    page.fill('#pw1', 'correct horse battery'); page.fill('#pw2', 'correct horse battery')
    with page.expect_download(timeout=60000) as d:
        page.click('#protect-go')
    prot = OUT + '/' + d.value.suggested_filename; d.value.save_as(prot)
    html = open(prot, encoding='utf-8').read()
    check('protected file is ciphertext only', 'Enter the workshop password' in html and not any(m in html for m in ['id="data"', '"conversation_history"', '"transcript"', 'Line one']))

    # 7. unsupported: upload a file that is not an export
    page.click('#act-open')
    open(OUT + '/bad.csv', 'w').write('chat_id,text\n1,hi\n')
    page.set_input_files('#file', OUT + '/bad.csv')
    expect(page.locator('#start-error')).to_contain_text('items export')
    check('bad file error shown', True)

    # 8. no AI, no comments, unnamed options: setup opens and naming works
    page.set_input_files('#file', OUT + '/NoAI_Unnamed-items.csv')
    expect(page.locator('#view-setup')).to_be_visible()
    check('raters from column pattern', 'column pattern' in page.locator('#view-setup').inner_text())
    check('majority switch hidden without AI', page.locator('#ref-control').is_hidden())
    page.screenshot(path=OUT + '/05-setup.png', full_page=True)
    qc = page.locator('.qcard').first
    names = ['Fits', 'Partly', 'Does not fit', 'Cannot tell']
    for i, nm in enumerate(names):
        qc.locator('input[data-oname]').nth(i).fill(nm)
    page.click('#s-apply')
    expect(page.locator('#view-overview')).to_be_visible()
    check('named options appear in legend', all(x in page.locator('#view-overview .legend').first.inner_text() for x in names))
    check('applying setup confirms every mapping (no banner left)', 'not named' not in page.locator('#banners').inner_text(), page.locator('#banners').inner_text())
    check('grouping switch label is generic', page.locator('#cat-yes-btn').inner_text() == 'Fits vs. not Fits', page.locator('#cat-yes-btn').inner_text())

    check('no page errors', not errors, errors)
    external = [u for u in requests if not u.startswith(BASE.rsplit('/', 1)[0]) and not u.startswith('blob:') and not u.startswith('data:')]
    check('no requests beyond the page itself', not external and len([u for u in requests if u.startswith('http')]) == 1, requests)
    ctx.close()

    # 9. open the protected copy from file:// in Chromium and WebKit
    for name in ['chromium', 'webkit']:
        b = getattr(p, name).launch()
        c = b.new_context(); pg = c.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file://' + prot)
        pg.fill('#pw', 'wrong password!!')
        pg.click('#go')
        expect(pg.locator('#status')).to_contain_text('did not work', timeout=30000)
        check(name + ': wrong password rejected', True)
        pg.fill('#pw', 'correct horse battery')
        pg.click('#go')
        expect(pg.locator('#app')).to_be_visible(timeout=30000)
        check(name + ': unlocked read-only copy', pg.locator('#ro-tag').is_visible() and pg.locator('#act-download').is_hidden())
        pg.click('#tab-consensus')
        check(name + ': notes visible in copy', 'Clarify rubric for NEI' in pg.locator('#view-consensus').inner_text())
        pg.click('#tab-conversations')
        pg.locator('.convrow .done:visible').first.locator('xpath=..').click()
        check(name + ': copy has no note inputs', pg.locator('#cons-card textarea').count() == 0 and 'Line two' in pg.locator('#cons-card').inner_text())
        if name == 'webkit': pg.screenshot(path=OUT + '/06-copy-webkit.png', full_page=True)
        check(name + ': no page errors', not errs, errs)
        b.close()
    browser.close()

srv.shutdown()
fails = [r for r in results if not r[1]]
print('\n%d checks, %d failed' % (len(results), len(fails)))
sys.exit(1 if fails else 0)
