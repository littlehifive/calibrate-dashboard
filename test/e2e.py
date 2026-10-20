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
    check('start page shows where Export CSV is', page.locator('.cal-win').is_visible() and 'Export CSV' in page.locator('.cal-win').inner_text())
    check('start page does not mention evaluators.json', 'evaluators.json' not in page.locator('#start').inner_text())
    check('start page explains where to open it and how to switch projects', 'Where do I open it?' in page.locator('.howto').inner_text() and 'Open a different file' in page.locator('.howto').inner_text())

    # 1. upload a W4-shaped synthetic export
    page.set_input_files('#file', OUT + '/Synthetic_Workshop-items.csv')
    expect(page.locator('#app')).to_be_visible()
    check('title from file name', page.locator('#title').inner_text() == 'Synthetic Workshop', page.locator('#title').inner_text())
    check('subtitle names newest AI version', 'AI evaluator (v2)' in page.locator('#subtitle').inner_text(), page.locator('#subtitle').inner_text())
    check('5 question rows in overview', page.locator('#view-overview table').first.locator('tbody tr').count() == 5)
    check('no setup needed (presets)', page.locator('#view-setup').is_hidden())
    page.screenshot(path=OUT + '/02-overview.png', full_page=True)
    check('five KPI tiles', page.locator('#view-overview .kpi').count() == 5)
    page.locator('.info[data-def="alpha"]').first.click()
    check('(i) opens the alpha formula', page.locator('#pop').is_visible() and 'α = 1 − D' in page.locator('#pop').inner_text())
    page.keyboard.press('Escape')
    check('Escape closes the popover', page.locator('#pop').is_hidden())
    page.locator('#view-overview table.heat').first.locator('.cellin').first.hover()
    check('off-majority tooltip explains the denominator', 'Counted' in page.locator('#tip').inner_text() and 'conversations' in page.locator('#tip').inner_text(), page.locator('#tip').inner_text())
    page.select_option('#matrix-m', 'kappa')
    check('pairwise switches to kappa', 'Cohen' in page.locator('#view-overview').inner_text() and page.locator('#view-overview .cellin[class*=" p"]').count() > 0)

    # 2. record consensus on the first conversation in the list
    page.click('#tab-conversations')
    check('list hidden by default at 1440px', page.locator('#convlist').is_hidden() and 'Show list' in page.locator('#list-toggle').inner_text())
    boxes = [page.locator(s).bounding_box() for s in ['#pane-transcript', '#pane-ratings', '#pane-consensus']]
    check('three panes side by side', boxes[0]['x'] < boxes[1]['x'] < boxes[2]['x'] and abs(boxes[0]['y'] - boxes[2]['y']) < 2, boxes)
    page.click('#list-toggle'); page.wait_for_timeout(400)
    check('list slides in and the button says Hide list', page.locator('#convlist').is_visible() and 'Hide list' in page.locator('#list-toggle').inner_text())
    cons = page.locator('#pane-consensus').bounding_box(); rat = page.locator('#pane-ratings').bounding_box()
    check('consensus keeps its own column with the list open', cons['x'] > rat['x'] and cons['y'] - rat['y'] < 2, (rat, cons))
    page.locator('.convrow').first.click()
    card = page.locator('#cons-card')
    expect(card).to_be_visible()
    first_sel = card.locator('select[data-f="agreed"]').first
    first_sel.select_option(index=2)
    agreed = first_sel.evaluate('s => s.value')
    card.locator('input[data-f="note"]').first.fill('Agreed after reading turn 3, "carefully", twice')
    card.locator('input[data-f="status"][value="follow_up"]').check()
    check('consensus pane has sections A and B', 'Agreed answers' in card.inner_text() and 'Follow-up for this conversation' in card.inner_text())
    card.locator('textarea[data-f="comment"]').fill('Line one\nLine two, with comma')
    card.locator('textarea[data-f="next_steps"]').fill('Clarify rubric for NEI')
    conv_id = page.locator('#dbar h2').inner_text().replace('Chat ', '')
    page.wait_for_timeout(400)
    check('Next becomes Submit and next', page.locator('#next').inner_text() == 'Submit and next →', page.locator('#next').inner_text())
    check('header counts the unsubmitted change', '1 not submitted' in page.locator('#changes').inner_text(), page.locator('#changes').inner_text())
    check('list row shows a draft mark', page.locator('.convrow[aria-current="true"] .draft').is_visible())
    page.click('#cons-submit')
    check('submit records it', 'Submitted at' in page.locator('#submit-state').inner_text() and page.locator('#cons-submit').is_disabled())
    check('header counts the submitted decision', '1 submitted' in page.locator('#changes').inner_text() and 'not submitted' not in page.locator('#changes').inner_text(), page.locator('#changes').inner_text())
    check('list row shows a check mark', page.locator('.convrow[aria-current="true"] .done').is_visible())
    check('Next is plain Next again', page.locator('#next').inner_text() == 'Next →')
    page.screenshot(path=OUT + '/03-conversation.png', full_page=True)

    # arrow keys must not navigate while typing
    card.locator('textarea[data-f="comment"]').press('ArrowRight')
    check('arrow key in textarea stays on conversation', page.locator('#dbar h2').inner_text() == 'Chat ' + conv_id)

    # a second conversation: a draft, then "Submit and next"
    page.click('#next')
    second = page.locator('#dbar h2').inner_text()
    page.locator('#cons-card textarea[data-f="comment"]').fill('Second draft')
    page.wait_for_timeout(100)
    page.click('#next')
    check('Submit and next submits and moves on', page.locator('#dbar h2').inner_text() != second and '2 submitted' in page.locator('#changes').inner_text(), page.locator('#changes').inner_text())
    # an unsubmitted draft on a third conversation stays out of the download
    page.locator('#cons-card textarea[data-f="next_steps"]').fill('Not submitted, must not be exported')
    page.wait_for_timeout(400)

    # 3. consensus tab
    page.click('#changes')
    check('the header pill opens step 3', page.locator('#view-consensus').is_visible())
    check('step 3 lists the submitted decisions', page.locator('#view-consensus .ctab tbody tr').count() == 2)
    check('step 3 warns about the unsubmitted draft', 'not submitted' in page.locator('#view-consensus .banner').inner_text())
    page.screenshot(path=OUT + '/04-consensus.png', full_page=True)

    # 4. download CSV
    with page.expect_download() as d:
        page.click('#dl-csv')
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
    check('unsubmitted draft is not in the download', 'Not submitted, must not be exported' not in exported)
    check('step 3 says everything submitted is downloaded', 'Everything submitted is in your last download' in page.locator('#view-consensus').inner_text())

    # 5. a fresh browser profile re-opens the downloaded CSV and gets the notes back from the file
    ctx2 = browser.new_context(accept_downloads=True)
    p2 = ctx2.new_page(); p2.goto(BASE)
    p2.set_input_files('#file', path)
    expect(p2.locator('#app')).to_be_visible()
    check('restore notice from file', 'from the file' in p2.locator('#banners').inner_text(), p2.locator('#banners').inner_text())
    p2.click('#tab-consensus')
    check('restored decisions listed', p2.locator('#view-consensus .ctab tbody tr').count() == 2)
    check('restored decisions count as submitted', '2 submitted' in p2.locator('#changes').inner_text(), p2.locator('#changes').inner_text())
    ctx2.close()

    # 6. protected copy
    page.click('#tab-overview')
    page.click('#menu-btn')
    check('menu lists the rare actions', page.locator('#menu').is_visible() and page.locator('#menu [role=menuitem]:visible').count() == 3)
    page.click('#menu [data-act="protect"]')
    page.fill('#pw1', 'correct horse battery'); page.fill('#pw2', 'correct horse battery')
    with page.expect_download(timeout=60000) as d:
        page.click('#protect-go')
    prot = OUT + '/' + d.value.suggested_filename; d.value.save_as(prot)
    html = open(prot, encoding='utf-8').read()
    check('protected file is ciphertext only', 'Enter the workshop password' in html and not any(m in html for m in ['id="data"', '"conversation_history"', '"transcript"', 'Line one']))

    # 7. unsupported: upload a file that is not an export
    page.click('#menu-btn'); page.click('#menu [data-act="open"]')
    open(OUT + '/bad.csv', 'w').write('chat_id,text\n1,hi\n')
    page.set_input_files('#file', OUT + '/bad.csv')
    expect(page.locator('#start-error')).to_contain_text('Calibrate ratings file')
    check('bad file error shown', True)

    # 8. no AI, no comments, unnamed options: setup opens and naming works
    page.set_input_files('#file', OUT + '/NoAI_Unnamed-items.csv')
    expect(page.locator('#view-setup')).to_be_visible()
    check('experts found from the column names', 'from the column names' in page.locator('#view-setup').inner_text())
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
    check('grouping option named after the first option', page.locator('#cat-yes-opt').inner_text() == 'Fits vs. anything else', page.locator('#cat-yes-opt').inner_text())

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
        check(name + ': unlocked read-only copy', pg.locator('#ro-tag').is_visible() and pg.locator('#changes').is_hidden() and pg.locator('#menu-btn').is_hidden())
        pg.click('#tab-consensus')
        check(name + ': submitted notes visible in copy', 'Clarify rubric for NEI' in pg.locator('#view-consensus').inner_text() and 'must not be exported' not in pg.locator('#view-consensus').inner_text())
        pg.locator('#view-consensus [data-open]').first.click()
        check(name + ': copy has no note inputs', pg.locator('#cons-card textarea').count() == 0 and 'Line two' in pg.locator('#cons-card').inner_text())
        if name == 'webkit': pg.screenshot(path=OUT + '/06-copy-webkit.png', full_page=True)
        check(name + ': no page errors', not errs, errs)
        b.close()
    browser.close()

srv.shutdown()
fails = [r for r in results if not r[1]]
print('\n%d checks, %d failed' % (len(results), len(fails)))
sys.exit(1 if fails else 0)
