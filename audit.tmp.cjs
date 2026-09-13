const { chromium } = require('playwright');

const BASE = 'http://localhost:8080';
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;

function box(el) { return el ? el.boundingBox() : null; }

(async () => {
  const browser = await chromium.launch({ executablePath: '/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();

  // Seed auth in localStorage before app scripts read it
  await page.addInitScript(([key, val]) => {
    try { window.localStorage.setItem(key, val); } catch(e) {}
  }, [STORAGE_KEY, SESSION_JSON]);

  const results = [];

  async function checkTapTargets(label, selector) {
    const els = await page.$$(selector);
    for (const el of els) {
      const bb = await el.boundingBox();
      const text = (await el.innerText().catch(()=> '')).trim().slice(0,30);
      if (bb && (bb.width < 44 || bb.height < 44)) {
        results.push(`SMALL TARGET [${label}] "${text}" ${Math.round(bb.width)}x${Math.round(bb.height)} at (${Math.round(bb.x)},${Math.round(bb.y)})`);
      }
    }
  }

  async function checkOverflow(label) {
    const info = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (info.scrollWidth > info.clientWidth + 2) {
      results.push(`OVERFLOW [${label}] scrollWidth=${info.scrollWidth} clientWidth=${info.clientWidth}`);
    }
  }

  // ---------- 1. Event create flow ----------
  await page.goto(`${BASE}/events/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/browser/p2-audit/1-new-event-empty.png', fullPage: true });
  await checkOverflow('events.new empty');
  await checkTapTargets('events.new buttons', 'button, a.rounded-full');

  // fill form
  await page.fill('input[placeholder="A Midsummer Night"]', 'My Test Event').catch(()=>{});
  await page.fill('input[placeholder="The Glass Conservatory"]', 'Test Venue').catch(()=>{});
  await page.screenshot({ path: '/tmp/browser/p2-audit/2-new-event-filled.png', fullPage: true });

  // scroll to bottom - check submit buttons visible / not obscured
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/browser/p2-audit/3-new-event-scrolled-bottom.png', fullPage: false });

  // Try to focus title input with keyboard simulation viewport check
  await page.evaluate(() => window.scrollTo(0,0));
  await page.focus('input[placeholder="A Midsummer Night"]').catch(()=>{});
  await page.screenshot({ path: '/tmp/browser/p2-audit/4-new-event-input-focus.png', fullPage: false });

  console.log('SECTION1 done');
  console.log(JSON.stringify(results, null, 2));
})();
