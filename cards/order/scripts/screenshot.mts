#!/usr/bin/env node
// Regenerates docs/screenshots/card.png for the README. Boots a throwaway
// http.createServer serving this repo's root (so glp-order-card.js can be
// loaded without file:// CORS issues) plus a harness page, spins up a
// headless Chromium via Playwright, mocks every api/orders/* endpoint the
// card fetches on load with realistic demo data (a 5-item menu incl. a
// bean-library drink, trending/NEW badges, an empty order queue), drives
// the card into a populated "variant selected + bean info shown" state,
// and screenshots just the <glp-order-card> element.
//
// Two independent axes (deliberately decoupled — the card's contrast fix for
// --glp-ok/--glp-warn/--glp-err keys off the ACTUAL resolved --glp-bg via
// getComputedStyle, not off prefers-color-scheme, precisely because HA theme
// choice and OS/browser color-scheme preference can disagree):
//   --ha-theme=light|dark   (or GLP_HA_THEME env) — which HA theme CSS
//                           variables (glp-ha-theme.yaml values) the mock
//                           page exposes to the card. Default: dark.
//   --os-scheme=light|dark (or GLP_OS_SCHEME env) — Playwright's emulated
//                           prefers-color-scheme. Default: mirrors --ha-theme
//                           (the common case). Set it independently to
//                           reproduce a mismatch, e.g. dark OS + light HA
//                           theme.
// `--light` is shorthand for `--ha-theme=light --os-scheme=light`.
// `--out=<path>` overrides the output file (default docs/screenshots/card.png,
// or card-light.png when --ha-theme=light).
//
// Run: node scripts/screenshot.mts
// Requires: npm install --save-dev playwright && npx playwright install chromium

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { repoRoot, startServer, mockApi } from './e2e-harness.mts';

function flag(name: string, envVar: string, fallback: string): string {
  const eq = process.argv.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(eq.indexOf('=') + 1);
  const value = process.env[envVar];
  if (value) return value;
  return fallback;
}

const outDir    = path.join(repoRoot, 'docs', 'screenshots');
const LIGHT_SHORTHAND = process.argv.includes('--light');
const HA_THEME  = flag('ha-theme', 'GLP_HA_THEME', LIGHT_SHORTHAND ? 'light' : 'dark');
const OS_SCHEME = flag('os-scheme', 'GLP_OS_SCHEME', LIGHT_SHORTHAND ? 'light' : HA_THEME);
const outFile   = flag('out', '', path.join(outDir, HA_THEME === 'light' ? 'card-light.png' : 'card.png'));
// Independent override for just --primary-color (drives --glp-accent) — lets
// a screenshot prove the --glp-accent-text fix against a dark theme primary
// (e.g. a common "Indigo 900"-style theme) without needing a whole separate
// dark/light theme preset for it.
const PRIMARY_COLOR_OVERRIDE = flag('primary-color', 'GLP_PRIMARY_COLOR', '');

// HA theme CSS variables the card reads via the GLP-TOKENS fallback chain.
// Values match the "GLP Light"/"GLP Dark" themes in glp-ha-theme.yaml (from
// the gaggiuino-local-profiler repo).
const THEME_VARS = (HA_THEME === 'light' ? `
    --card-background-color: #ffffff;
    --primary-text-color: #18181b;
    --secondary-text-color: #52525b;
    --divider-color: #f4f4f5;
    --primary-color: ${PRIMARY_COLOR_OVERRIDE || '#d97706'};
    --secondary-background-color: #ffffff;
` : `
    --card-background-color: #18181b;
    --primary-text-color: #e4e4e7;
    --secondary-text-color: #a1a1aa;
    --divider-color: #27272a;
    --primary-color: ${PRIMARY_COLOR_OVERRIDE || '#f59e0b'};
    --secondary-background-color: #18181b;
`);

const HARNESS_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: ${HA_THEME === 'light' ? '#fafafa' : '#000'}; }
  body {
    display: flex; padding: 40px;
${THEME_VARS}  }
  glp-order-card { display: block; width: 360px; }
</style>
</head>
<body>
<!-- Stands in for HA's frontend so the card's deferred define (#145) fires. -->
<script>customElements.define('home-assistant', class extends HTMLElement {});</script>
<script src="/glp-order-card.js"></script>
<script>
  const el = document.createElement('glp-order-card');
  el.setConfig({
    glp_url: window.location.origin,
    glp_token: 'dummy-token',
    switch_entity: 'switch.espresso_plug',
    title: 'Bestellen',
  });
  el.hass = {
    states: {
      'switch.espresso_plug': { state: 'on', attributes: {} },
    },
    user: { id: 'demo-user', name: 'Max' },
    callService: () => {},
  };
  document.body.appendChild(el);
  window.__card = el;
</script>
</body>
</html>`;

// ── Demo data ──────────────────────────────────────────────────────────
const now = Date.now();

// #90: entries carry the `id` the app's DEFAULT_MENU actually assigns them.
// Without it this fixture silently exercised only the custom-entry fallback
// path (ICONS.of(undefined) -> ''), so the screenshot showed stored emoji for
// every tile and documented the opposite of what the card does out of the box.
// 'Filterkaffee' deliberately keeps no id and a stored emoji: it stands for a
// user-created entry, whose character is a persisted data field the card must
// keep rendering. Both paths are visible in one image on purpose.
const MENU = [
  { id: 'espresso',   name: 'Espresso',        emoji: '☕', trending: true, createdAt: now - 90 * 86400000 },
  { id: 'cappuccino', name: 'Cappuccino',      emoji: '🥛', createdAt: now - 3 * 86400000 }, // < 7d -> NEW badge
  { id: 'flat_white', name: 'Flat White',      emoji: '☁️', variants: ['Single', 'Doppio'], createdAt: now - 60 * 86400000 },
  { id: 'latte',      name: 'Latte Macchiato', emoji: '🍮', createdAt: now - 120 * 86400000 },
  { name: 'Filterkaffee',    emoji: '🫖', useBeans: true, createdAt: now - 45 * 86400000 },
];

const SETTINGS   = { enabled: true };
const QUEUE_ETA  = { positions: {} };

const ACTIVE_BEANS = [
  { name: 'Yirgacheffe Chelelektu', origin: 'ET', variety: 'Heirloom', process: 'Washed', notes: 'Blumig, Zitrone, Bergamotte', decaf: false, category: 'speciality' },
  { name: 'Bombe', origin: 'BR', variety: 'Bourbon, Catuai', process: 'Natural', notes: 'Schokolade, Nougat, Karamell', decaf: false },
];

async function main(): Promise<void> {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const server = await startServer(HARNESS_HTML);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('screenshot: server has no TCP address');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const browser = await chromium.launch();
  // colorScheme is intentionally independent from HA_THEME/THEME_VARS — the
  // card's --glp-ok/--glp-warn/--glp-err fix keys off the card's own
  // resolved --glp-bg (getComputedStyle), not prefers-color-scheme, so this
  // axis exists here only to prove that OS/HA-theme mismatches (e.g. dark OS
  // + light HA theme) render correctly too.
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width: 500, height: 700 },
    colorScheme: OS_SCHEME === 'light' ? 'light' : 'dark',
  });
  await mockApi(page, { menu: MENU, settings: SETTINGS, queueEta: QUEUE_ETA, activeBeans: ACTIVE_BEANS });
  await page.goto(`${baseUrl}/__harness.html`);

  // The page.evaluate()/waitForFunction() callbacks below run inside the
  // browser tab via Playwright, not in this Node process — `document` is a
  // real global there, even though ESLint's static analysis (correctly, for
  // a .mts Node script) doesn't know that.
  /* eslint-disable no-undef */

  // Wait for the menu grid to actually render inside the shadow DOM.
  await page.waitForFunction(() => {
    const el = document.querySelector('glp-order-card');
    return !!el?.shadowRoot?.querySelector('.menu-grid');
  }, { timeout: 10000 });

  // ha-card is a real HA-provided custom element inside Lovelace; here it's
  // undefined (inline by default), which pads the screenshot — force block
  // layout inside the shadow root to match production sizing.
  await page.evaluate(() => {
    const el = document.querySelector('glp-order-card');
    const root = el?.shadowRoot;
    if (!root) return;
    const style = document.createElement('style');
    style.textContent = 'ha-card { display: block; }';
    root.appendChild(style);
  });

  // Select the bean-library item + a variant so the demo shows off the
  // richer UI (variant chips, bean info box, enabled order button) rather
  // than just the bare menu grid.
  await page.evaluate(() => {
    const el = document.querySelector('glp-order-card');
    const items = el?.shadowRoot?.querySelectorAll<HTMLElement>('.menu-item');
    const item = items && [...items].find(m => m.dataset.item === 'Filterkaffee');
    item?.click();
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('glp-order-card');
    return !!el?.shadowRoot?.querySelector('.variant-chip');
  }, { timeout: 5000 });
  await page.evaluate(() => {
    const el = document.querySelector('glp-order-card');
    const chip = el?.shadowRoot?.querySelector<HTMLElement>('.variant-chip');
    chip?.click();
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('glp-order-card');
    return !!el?.shadowRoot?.querySelector('#oc-bean-info');
  }, { timeout: 5000 });

  /* eslint-enable no-undef */

  await page.waitForTimeout(300); // let hover/transition state settle

  const card = page.locator('glp-order-card');
  await card.screenshot({ path: outFile });

  await browser.close();
  server.close();
  console.log(`Screenshot written to ${outFile} (ha-theme=${HA_THEME}, os-scheme=${OS_SCHEME})`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
