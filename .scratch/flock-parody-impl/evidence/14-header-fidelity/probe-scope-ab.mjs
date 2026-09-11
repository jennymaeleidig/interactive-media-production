// Scope A/B, second cut: exclude ancestors of the header (their computed
// style changes purely because the header's own box changed) and report WHAT
// changed, so the cross-page effect can be classified rather than just counted.
import puppeteer from 'puppeteer-core';

const base = process.argv[2];
const paths = process.argv.slice(3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});

for (const p of paths) {
  for (const width of [1440, 390]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    await page.goto(base + p, { waitUntil: 'networkidle2', timeout: 180000 });
    await sleep(1200);
    const out = await page.evaluate(() => {
      const style = document.querySelector('style[data-flock-parody="header-restore"]');
      if (!style) return { error: 'no restore style' };
      const props = new Set();
      const walk = (rules) => {
        for (const r of rules) {
          if (r.style) for (const prop of r.style) props.add(prop);
          if (r.cssRules) walk(r.cssRules);
        }
      };
      try { walk(style.sheet.cssRules); } catch (e) { /* ignore */ }
      const propsArr = [...props];
      const header = document.querySelector('.header-z');
      // outside the header AND not its ancestor: an ancestor's box moves with
      // the header, so its computed style is not evidence about our selectors
      const all = [...document.querySelectorAll('body *')].filter(
        (el) => (!header || !header.contains(el)) && (!header || !el.contains(header)),
      );
      const step = Math.max(1, Math.floor(all.length / 1500));
      const sample = all.filter((_, i) => i % step === 0);
      const snap = () => sample.map((el) => {
        const cs = getComputedStyle(el);
        const o = {};
        for (const prop of propsArr) o[prop] = cs.getPropertyValue(prop);
        return o;
      });
      const before = snap();
      style.disabled = true;
      void document.body.offsetWidth;
      const after = snap();
      style.disabled = false;
      const byProp = {};
      const examples = [];
      for (let i = 0; i < before.length; i++) {
        for (const prop of propsArr) {
          if (before[i][prop] !== after[i][prop]) {
            byProp[prop] = (byProp[prop] || 0) + 1;
            if (examples.length < 8) {
              const el = sample[i];
              examples.push(
                `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 34)} ${prop}: ${after[i][prop]} -> ${before[i][prop]}`,
              );
            }
          }
        }
      }
      return { sampled: sample.length, byProp, examples };
    });
    console.log(`\n${p} @${width}`);
    console.log(JSON.stringify(out, null, 1));
    await page.close();
  }
}
await browser.close();
