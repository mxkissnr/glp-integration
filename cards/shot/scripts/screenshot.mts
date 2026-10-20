#!/usr/bin/env node
// Regenerates docs/screenshots/card.png for the README. Boots a throwaway
// static file server for this repo's root (an ES module <script src="...">
// needs http:// — file:// is blocked by module CORS rules in headless
// Chromium), loads a minimal page that mounts <glp-card> with a realistic
// mock `hass` object (machine on, profile selected, preheat ready, a recent
// shot with a full pressure/flow/temp/weight curve, maintenance rows), waits
// for the card's shadow DOM to render, then screenshots just the card
// element at 2x scale. Run on demand: `node scripts/screenshot.mts`.
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
// `--machine-off` flips the mock switch entity to `state: 'off'` (the only
// thing _render() actually keys the machine-off branch off of — see
// glp-card.js's `machineOff` check against the switch entity, not
// machine_status, which per README only ever reports online/error) so the
// off-state ready-by time picker/countdown (#61, only rendered while off)
// shows up instead of the normal hero view. Default output then becomes
// docs/screenshots/card-ready-by.png instead of card.png so it doesn't
// clobber the hero shot.
// `--out=<path>` overrides the output file (default docs/screenshots/card.png,
// or card-light.png when --ha-theme=light, or card-ready-by.png when
// --machine-off).
// Requires `npx playwright install chromium` once beforehand.

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { repoRoot, startServer } from './e2e-harness.mts';

function flag(name: string, envVar: string, fallback: string): string {
    const eq = process.argv.find(a => a.startsWith(`--${name}=`));
    if (eq) return eq.split('=')[1] ?? fallback;
    if (process.env[envVar]) return process.env[envVar];
    return fallback;
}

const outDir    = path.join(repoRoot, 'docs', 'screenshots');
const LIGHT_SHORTHAND = process.argv.includes('--light');
const MACHINE_OFF = process.argv.includes('--machine-off');
const HA_THEME  = flag('ha-theme', 'GLP_HA_THEME', LIGHT_SHORTHAND ? 'light' : 'dark');
const OS_SCHEME = flag('os-scheme', 'GLP_OS_SCHEME', LIGHT_SHORTHAND ? 'light' : HA_THEME);
const defaultOutName = MACHINE_OFF
  ? 'card-ready-by.png'
  : (HA_THEME === 'light' ? 'card-light.png' : 'card.png');
const outFile   = flag('out', '', path.join(outDir, defaultOutName));

// HA theme CSS variables the card reads via the GLP-TOKENS fallback chain.
// Values match the "GLP Light"/"GLP Dark" themes in glp-ha-theme.yaml.
const THEME_VARS = HA_THEME === 'light' ? `
    --card-background-color: #ffffff;
    --primary-text-color: #18181b;
    --secondary-text-color: #52525b;
    --divider-color: #f4f4f5;
    --primary-color: #d97706;
    --secondary-background-color: #ffffff;
` : `
    --card-background-color: #18181b;
    --primary-text-color: #e4e4e7;
    --secondary-text-color: #a1a1aa;
    --divider-color: #27272a;
    --primary-color: #f59e0b;
    --secondary-background-color: #18181b;
`;

mkdirSync(outDir, { recursive: true });

// ── Synthetic espresso shot curve (28s, 0.1s resolution, x10-scaled like real datapoints) ──
function makeShotDp(): { p: number[]; t: number[]; w: number[]; f: number[] } {
    const t = [], p = [], f = [], w = [];
    for (let i = 0; i <= 280; i++) {
        const s = i / 10; // seconds
        const pres = s < 5 ? (s / 5) * 3 : s < 8 ? 3 + ((s - 5) / 3) * 6 : 9 - Math.max(0, s - 20) * 0.15;
        p.push(Math.round(pres * 10));
        f.push(Math.round((s < 8 ? 1.5 : 2.2 + Math.sin(s) * 0.2) * 10));
        w.push(Math.round(Math.max(0, (s - 8) / 20 * 36) * 10));
        t.push(Math.round((93 + Math.sin(s / 3)) * 10));
    }
    return { p, t, w, f };
}

const PREFIX = 'sensor.gaggiuino_local_profiler_';
const bsPrefix  = 'binary_sensor.gaggiuino_local_profiler_';
const selPrefix = 'select.gaggiuino_local_profiler_';
const now = Date.now();

const recentShot = {
    id: 42,
    ts: new Date(now - 18 * 60 * 1000).toISOString(),
    profile: 'Standard Espresso',
    coffee: 'Bombe',
    drink_type: 'Espresso',
    grinder: 'Niche Zero',
    grind: '23 Klicks',
    duration: 28.4,
    yield_g: 36.2,
    ratio: 2.07,
    pressure: 9.1,
    rating: 4,
    score: 87,
    dp: makeShotDp(),
};

const mockStates = {
    [PREFIX + 'machine_status']: {
        state: 'online',
        attributes: {
            friendly_name: 'Gaggiuino Machine Status',
            switch_entity: 'switch.gaggiuino_local_profiler_machine',
            recent_shots: [recentShot],
        },
    },
    'switch.gaggiuino_local_profiler_machine': {
        state: MACHINE_OFF ? 'off' : 'on',
        last_changed: new Date(now - 2 * 3600 * 1000).toISOString(),
        attributes: { friendly_name: 'Gaggiuino Machine' },
    },
    [bsPrefix + 'brewing']:       { state: 'off', attributes: {} },
    [bsPrefix + 'steam_switch']:  { state: 'off', attributes: {} },
    [bsPrefix + 'preheat_ready']: { state: 'on',  attributes: {} },
    [PREFIX + 'preheat_remaining']: { state: '0', attributes: {} },
    [PREFIX + 'preheat_elapsed']:   { state: '420', attributes: {} },
    [PREFIX + 'machine_temperature']:        { state: '93.4', attributes: {} },
    [PREFIX + 'machine_target_temperature']: { state: '93.0', attributes: {} },
    [PREFIX + 'machine_live_pressure']: { state: '0.0', attributes: {} },
    [PREFIX + 'machine_live_weight']:   { state: '0.0', attributes: {} },
    [PREFIX + 'machine_water_level']:   { state: '82', attributes: {} },
    [selPrefix + 'profile']: {
        state: 'Standard Espresso',
        attributes: { friendly_name: 'Gaggiuino Profile', options: ['Standard Espresso', 'Blooming Shot', 'Ristretto', 'Filter'] },
    },
    [PREFIX + 'shots_today']: { state: '7', attributes: {} },
    [PREFIX + 'last_sync']:   { state: new Date(now - 3 * 60 * 1000).toISOString(), attributes: {} },
    [PREFIX + 'maintenance_descaling']: {
        state: 'ok', attributes: { pct: 0.32, days_since: 14, shots_since: 41 },
    },
    [PREFIX + 'maintenance_backflush']: {
        state: 'soon', attributes: { pct: 0.78, days_since: 5, shots_since: 22 },
    },
    [PREFIX + 'maintenance_group_head']: {
        state: 'ok', attributes: { pct: 0.15, days_since: 2, shots_since: 6 },
    },
    [PREFIX + 'maintenance_gaskets']: {
        state: 'due', attributes: { pct: 1, days_since: 210, shots_since: 640 },
    },
    [PREFIX + 'maintenance_water_filter']: {
        state: 'ok', attributes: { pct: 0.4, days_since: 30, shots_since: 90 },
    },
    [PREFIX + 'maintenance_grinders']: {
        state: 'ok',
        attributes: {
            'Niche Zero': { status: 'ok', pct: 0.2, days_since: 3, shots_since: 12, task: 'grinder-niche-zero' },
        },
    },
};

const PAGE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: ${HA_THEME === 'light' ? '#fafafa' : '#0b0b0d'}; }
  #wrap {
    max-width: 420px; margin: 0 auto; padding: 32px 20px;
${THEME_VARS}  }
</style>
<!-- Stands in for HA's frontend so the card's deferred define (#184) fires. -->
<script>customElements.define('home-assistant', class extends HTMLElement {});</script>
<script type="module" src="/glp-card.js"></script>
</head>
<body>
  <div id="wrap"><glp-card id="card"></glp-card></div>
  <script type="module">
    const mockStates = ${JSON.stringify(mockStates)};
    const card = document.getElementById('card');
    card.setConfig({ title: 'Gaggiuino', entity_prefix: '${PREFIX}' });
    card.hass = {
      language: 'de',
      states: mockStates,
      callService: () => {},
    };
  </script>
</body>
</html>`;

async function main() {
    const server = await startServer(PAGE_HTML);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('screenshot: server has no TCP address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const browser = await chromium.launch();
    try {
        // colorScheme is intentionally independent from HA_THEME/THEME_VARS —
        // the card's --glp-ok/--glp-warn/--glp-err fix keys off the card's own
        // resolved --glp-bg (getComputedStyle), not prefers-color-scheme, so
        // this axis exists here only to prove that OS/HA-theme mismatches
        // (e.g. dark OS + light HA theme) render correctly too.
        const page = await browser.newPage({
            deviceScaleFactor: 2,
            viewport: { width: 460, height: 900 },
            colorScheme: OS_SCHEME === 'light' ? 'light' : 'dark',
        });
        await page.goto(`${baseUrl}/__harness.html`, { waitUntil: 'load' });
        await page.waitForTimeout(500);
        const card = page.locator('#card');
        await card.waitFor({ state: 'attached' });
        await page.waitForTimeout(300);
        await card.screenshot({ path: outFile });
        console.log(`Saved screenshot to ${path.relative(repoRoot, outFile)} (ha-theme=${HA_THEME}, os-scheme=${OS_SCHEME})`);
    } finally {
        await browser.close();
        server.close();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
