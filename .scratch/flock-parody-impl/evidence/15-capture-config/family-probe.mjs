// Ticket 15 evidence probe: verify, in a real browser, that the interactions
// the sf-hidden-artifact runtime used to fake now work through the corrected
// capture's own state CSS. Runs inside the capsulecode/singlefile container
// (chromium at /usr/bin/chromium-browser); serves the built tree from the same
// process so no host networking is needed.
//
// Usage (inside the container):
//   node family-probe.mjs <servedDir> <outDir> [port]
// puppeteer-core is resolved from /rig (mounted from the host rig install).
//
// SPDX-License-Identifier: CC0-1.0
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire('/rig/');
const puppeteer = require('puppeteer-core');

const [servedDir, outDir, portArg] = process.argv.slice(2);
const PORT = Number(portArg || 8099);
mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '') + '.html';
      const file = path.join(servedDir, rel);
      if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One case per component family the ticket names; each asserts the visible
// state change the captured CSS must now produce.
const CASES = [
  {
    name: 'shared-header-menu',
    page: '/', width: 1440, height: 900,
    run: async (page) => {
      await page.hover('.nav__menu.cc-trust .nav__dd');
      await sleep(600);
      return page.evaluate(() => {
        const bg = document.querySelector('.header-wr .header__bg') || document.querySelector('.header__bg');
        return {
          menuOpen: document.querySelectorAll('.nav__dd.show').length,
          bgOpacity: bg ? getComputedStyle(bg).opacity : null,
          panelDisplay: (() => {
            const p = document.querySelector('.nav__menu.cc-trust .nav__dd.show .nav__dd-content');
            return p ? getComputedStyle(p).display : null;
          })(),
        };
      });
    },
  },
  {
    name: 'mobile-takeover',
    page: '/', width: 390, height: 844,
    run: async (page) => {
      await page.click('.nav__menu-button').catch(() => {});
      await sleep(700);
      return page.evaluate(() => {
        const bg = document.querySelector('.header__bg');
        const cta = document.querySelector('.is-cta-mobile');
        const list = document.querySelector('.nav__menu-list');
        return {
          bgOpen: bg ? bg.classList.contains('is-open') : null,
          ctaDisplay: cta ? getComputedStyle(cta).display : null,
          ctaText: cta ? cta.textContent.trim() : null,
          listDisplay: list ? getComputedStyle(list).display : null,
        };
      });
    },
  },
  {
    name: 'faq-dropdown',
    page: '/products/flock-os',
    run: async (page) => {
      const before = await page.evaluate(() => {
        const l = document.querySelector('.w-dropdown-list');
        return l ? { display: getComputedStyle(l).display, height: getComputedStyle(l).height } : null;
      });
      await page.click('.w-dropdown-toggle');
      await sleep(600);
      const after = await page.evaluate(() => {
        const t = document.querySelector('.w-dropdown-toggle');
        const l = document.querySelector('.w-dropdown-list');
        return {
          expanded: t ? t.getAttribute('aria-expanded') : null,
          listWOpen: l ? l.classList.contains('w--open') : null,
          height: l ? getComputedStyle(l).height : null,
        };
      });
      return { before, after };
    },
  },
  {
    name: 'filter-dropdown',
    page: '/press-center',
    run: async (page) => {
      const before = await page.evaluate(() => {
        const l = document.querySelector('.w-dropdown-list');
        return l ? getComputedStyle(l).display : null;
      });
      await page.click('.w-dropdown-toggle');
      await sleep(400);
      const after = await page.evaluate(() => {
        const l = document.querySelector('.w-dropdown-list');
        return l ? { listWOpen: l.classList.contains('w--open'), listDisplay: getComputedStyle(l).display } : null;
      });
      return { beforeDisplay: before, ...after };
    },
  },
  {
    name: 'accordion',
    page: '/trust',
    run: async (page) => {
      const before = await page.evaluate(() => {
        const i = document.querySelector('[data-accordion-status]');
        const r = i ? i.querySelector('[role=region]') : null;
        return { status: i ? i.getAttribute('data-accordion-status') : null, rows: r ? getComputedStyle(r).gridTemplateRows : null };
      });
      await page.click('[data-accordion-toggle]');
      await sleep(500);
      const after = await page.evaluate(() => {
        const i = document.querySelector('[data-accordion-status]');
        const r = i ? i.querySelector('[role=region]') : null;
        return { status: i ? i.getAttribute('data-accordion-status') : null, rows: r ? getComputedStyle(r).gridTemplateRows : null };
      });
      return { before, after };
    },
  },
  {
    name: 'webflow-tabs',
    page: '/products/video-cameras',
    run: async (page) => {
      const name = await page.evaluate(() => {
        const link = document.querySelector('.w-tab-link:not(.w--current)');
        if (!link) return null;
        const n = link.getAttribute('data-w-tab');
        link.click();
        return n;
      });
      if (!name) return { skipped: 'no non-current .w-tab-link' };
      await sleep(600);
      return page.evaluate((n) => {
        const pane = [...document.querySelectorAll('.w-tab-pane')].find((p) => p.getAttribute('data-w-tab') === n);
        const link = [...document.querySelectorAll('.w-tab-link')].find((l) => l.getAttribute('data-w-tab') === n);
        return {
          current: link ? link.classList.contains('w--current') : null,
          paneActive: pane ? pane.classList.contains('w--tab-active') : null,
          paneDisplay: pane ? getComputedStyle(pane).display : null,
        };
      }, name);
    },
  },
  {
    name: 'custom-tabs',
    page: '/flock-ecosystem',
    run: async (page) => {
      const btns = await page.$$('[data-tabs=home-menu-item]');
      if (btns.length < 2) return { skipped: 'fewer than 2 menu items' };
      const before = await page.evaluate(() => ({
        activeButtons: [...document.querySelectorAll('[data-tabs=home-menu-item]')].map((b) => b.classList.contains('is-active')),
        activePanes: [...document.querySelectorAll('[data-tabs=home-content-item]')].map((p) => p.classList.contains('is-active')),
      }));
      await btns[btns.length - 1].click();
      await sleep(500);
      const after = await page.evaluate(() => ({
        activeButtons: [...document.querySelectorAll('[data-tabs=home-menu-item]')].map((b) => b.classList.contains('is-active')),
        activePanes: [...document.querySelectorAll('[data-tabs=home-content-item]')].map((p) => ({ active: p.classList.contains('is-active'), opacity: getComputedStyle(p).opacity })),
      }));
      return { before, after };
    },
  },
  {
    name: 'slider',
    page: '/press-center',
    run: async (page) => {
      const control = await page.$('[data-slider=next], [data-swiper-next]');
      if (!control) return { skipped: 'no slider control' };
      const before = await page.evaluate(() => {
        const w = document.querySelector('.swiper-wrapper');
        return w ? w.style.transform || getComputedStyle(w).transform : null;
      });
      await control.click();
      await sleep(400);
      const after = await page.evaluate(() => {
        const w = document.querySelector('.swiper-wrapper');
        return { transform: w ? w.style.transform || getComputedStyle(w).transform : null, active: document.querySelectorAll('.swiper-slide-active').length };
      });
      return { before, after };
    },
  },
  {
    name: 'condition-hidden',
    page: '/resources',
    run: async (page) =>
      page.evaluate(() => {
        const el = document.querySelector('.w-condition-invisible');
        return { present: !!el, display: el ? getComputedStyle(el).display : null };
      }),
  },
];

async function main() {
  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });
  const results = [];
  for (const c of CASES) {
    const result = { name: c.name, page: c.page };
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: c.width || 1280, height: c.height || 900 });
      await page.goto(`http://127.0.0.1:${PORT}${c.page}`, { waitUntil: 'networkidle2', timeout: 120000 });
      await sleep(1200);
      result.measured = await c.run(page);
      await page.screenshot({ path: path.join(outDir, `${c.name}.png`) });
      await page.close();
    } catch (err) {
      result.error = String(err && err.message ? err.message : err);
    }
    results.push(result);
    console.log(JSON.stringify(result));
  }
  await browser.close();
  server.close();
  writeFileSync(path.join(outDir, 'family-results.json'), JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
