// Minimal Playwright E2E smoke test. Reuses the static-server harness from
// scripts/e2e-harness.mts (shared with scripts/screenshot.mts) to render the
// real glp-card.js in a headless Chromium tab -- unlike the unit suites, which
// import src/ into the Node process -- so it can exercise real custom-element
// lifecycle, shadow DOM and click event wiring that imported-source unit tests
// structurally can't reach. Mirrors the Order Card's test/e2e/smoke.test.mjs
// (same harness shape, same npm test auto-discovery via test/**/*.test.mjs).
//
// Covers three things pure unit tests can't: (1) the card actually mounts
// and renders real DOM in a browser, (2) a switch entity going
// 'unavailable' collapses to the defined off-card branch instead of
// throwing, and (3) the ready-by optimistic-UI guard (_pendingReadyByTargetAt,
// see glp-card.js's _readReadyBy()) survives a concurrently-arriving `hass`
// push wired through the *real* click handler and _render() -- the
// exact bug class (#66/#68/#70) that ready-by.test.js covers in isolation
// on the pure _readReadyBy()/_resolveReadyByTarget() functions, but can't
// prove is actually connected end-to-end.
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from '../../scripts/e2e-harness.mts';

const PREFIX = 'sensor.gaggiuino_local_profiler_';

function buildMockStates({ switchState = 'on', readyByTarget = 'unknown', readyByPlanned = 'unknown', isDescaling = false, preheatElapsed = null, probeTick = 0 } = {}) {
  const now = Date.now();
  return {
    [PREFIX + 'machine_status']: {
      state: 'online',
      attributes: {
        switch_entity: 'switch.gaggiuino_local_profiler_machine',
        recent_shots: [{ id: 1, profile: 'Standard Espresso', coffee: 'Bombe', drink_type: 'Espresso' }],
      },
    },
    'switch.gaggiuino_local_profiler_machine': {
      state: switchState,
      last_changed: new Date(now - 3600 * 1000).toISOString(),
      attributes: {},
    },
    // #170: is_descaling lives on the Brewing binary sensor (glp-integration#186),
    // always present regardless of the brew (is_on) state itself.
    'binary_sensor.gaggiuino_local_profiler_brewing': {
      state: 'off',
      attributes: { is_descaling: isDescaling },
    },
    [PREFIX + 'preheat_ready_by_target_at']:      { state: readyByTarget, attributes: {} },
    [PREFIX + 'preheat_planned_switch_on_at']:    { state: readyByPlanned, attributes: {} },
    // Restart-safe power-on timestamp (_machineOnSince, #158) -- only present
    // when a test explicitly wants the uptime badge to render.
    ...(preheatElapsed !== null
      ? { [PREFIX + 'preheat_elapsed']: { state: String(preheatElapsed), attributes: {} } }
      : {}),
    // A sensor the card never renders: varying it across pushes proves a real
    // hass update re-renders without changing the structure under assertion.
    [PREFIX + 'e2e_probe']:                       { state: String(probeTick), attributes: {} },
  };
}

function harnessHtml(mockStates) {
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
<div id="wrap"><glp-card id="card"></glp-card></div>
<!-- Stands in for HA's frontend so the card's deferred define (#184) fires. -->
<script>customElements.define('home-assistant', class extends HTMLElement {});</script>
<script type="module" src="/glp-card.js"></script>
<script type="module">
  const mockStates = ${JSON.stringify(mockStates)};
  const card = document.getElementById('card');
  card.setConfig({ title: 'Gaggiuino', entity_prefix: '${PREFIX}' });
  card.hass = { language: 'de', states: mockStates, callService: () => {} };
</script>
</body></html>`;
}

// The page.evaluate()/waitForFunction() callbacks below run inside the
// browser tab via Playwright, not in this Node process -- `document` is a
// real global there, even though ESLint's static analysis (correctly, for
// a .mjs Node test file) doesn't know that.
/* eslint-disable no-undef */

async function setUpCard(mockStates, readySelector) {
  const server = await startServer(harnessHtml(mockStates));
  // A browser that cannot launch (or a page that never becomes ready) must not
  // leak the listening server: node --test would then wait forever, because a
  // live handle keeps the process alive. Close both and rethrow the original
  // error so the failing test reports why it could not set up.
  let browser;
  try {
    const { port } = server.address();
    browser = await chromium.launch();
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err));
    await page.goto(`http://127.0.0.1:${port}/__harness.html`);
    await page.waitForFunction(sel => {
      const el = document.querySelector('glp-card');
      return !!el?.shadowRoot?.querySelector(sel);
    }, readySelector, { timeout: 10000 });
    return { server, browser, page, pageErrors };
  } catch (err) {
    await browser?.close();
    server.close();
    throw err;
  }
}

async function tearDown({ server, browser }) {
  await browser.close();
  server.close();
}

test('card renders the hero view with a realistic mocked hass', async () => {
  const ctx = await setUpCard(buildMockStates(), '.shot-profile');
  const { page, pageErrors } = ctx;
  try {
    const profileText = await page.evaluate(() =>
      document.querySelector('glp-card').shadowRoot.querySelector('.shot-profile').textContent);
    assert.equal(profileText, 'Standard Espresso');
    assert.deepEqual(pageErrors, []);
  } finally {
    await tearDown(ctx);
  }
});

test('switch entity going unavailable collapses to the off-card without throwing', async () => {
  const ctx = await setUpCard(buildMockStates({ switchState: 'unavailable' }), '.card.collapsed');
  const { page, pageErrors } = ctx;
  try {
    const offLabelShown = await page.evaluate(() =>
      !!document.querySelector('glp-card').shadowRoot.querySelector('.off-label'));
    assert.equal(offLabelShown, true);
    assert.deepEqual(pageErrors, [], 'an unavailable switch entity must not throw during render');
  } finally {
    await tearDown(ctx);
  }
});

test('a concurrent hass update does not clobber an in-progress ready-by pick', async () => {
  const ctx = await setUpCard(buildMockStates({ switchState: 'off' }), '.ready-by-picker');
  const { page, pageErrors } = ctx;
  try {
    await page.locator('#glp-readyby-input').fill('07:30');
    // A real click on the set-ready-by button -- the card binds its action
    // handlers on 'click' now, so a page.evaluate(() => el.click()) would work
    // too; Playwright's .click() drives an actual user-style click.
    await page.locator('[data-action="set-ready-by"]').click();

    await page.waitForFunction(() => {
      const el = document.querySelector('glp-card');
      return !!el?.shadowRoot?.querySelector('.ready-by-set');
    }, { timeout: 5000 });

    const pendingAfterClick = await page.evaluate(() =>
      !!document.querySelector('glp-card')._pendingReadyByTargetAt);
    assert.equal(pendingAfterClick, true, 'optimistic target is set right after the click');

    // Simulate a hass push landing before the backend has confirmed the new
    // schedule (preheat_ready_by_target_at still 'unknown') -- the exact
    // race #66/#70 guard against: a concurrently-arriving hass update must
    // not wipe the just-picked, still-unconfirmed target.
    await page.evaluate(mockStates => {
      const el = document.querySelector('glp-card');
      el.hass = { language: 'de', states: mockStates, callService: () => {} };
    }, buildMockStates({ switchState: 'off' }));

    const state = await page.evaluate(() => {
      const el = document.querySelector('glp-card');
      return {
        pendingTargetAt: !!el._pendingReadyByTargetAt,
        readySetShown: !!el.shadowRoot.querySelector('.ready-by-set'),
        pickerShown: !!el.shadowRoot.querySelector('.ready-by-picker'),
      };
    });
    assert.equal(state.pendingTargetAt, true, 'pending target survives the concurrent hass push');
    assert.equal(state.readySetShown, true, 'still shows the set/cancel view, not reverted to the picker');
    assert.equal(state.pickerShown, false);
    assert.deepEqual(pageErrors, []);
  } finally {
    await tearDown(ctx);
  }
});

// #170: the Brewing binary sensor's `is_descaling` attribute (glp-integration#186)
// drives a dedicated banner, same shape as the existing steam-mode banner but
// its own class/icon/copy.
test('is_descaling on the Brewing entity shows the descaling banner', async () => {
  const ctx = await setUpCard(buildMockStates({ isDescaling: true }), '.descaling-banner');
  const { page, pageErrors } = ctx;
  try {
    const bannerText = await page.evaluate(() =>
      document.querySelector('glp-card').shadowRoot.querySelector('.descaling-banner').textContent.trim());
    assert.equal(bannerText, 'Entkalkung läuft');
    assert.deepEqual(pageErrors, []);
  } finally {
    await tearDown(ctx);
  }
});

test('the descaling banner is absent when is_descaling is false', async () => {
  const ctx = await setUpCard(buildMockStates({ isDescaling: false }), '.shot-profile');
  const { page, pageErrors } = ctx;
  try {
    const bannerShown = await page.evaluate(() =>
      !!document.querySelector('glp-card').shadowRoot.querySelector('.descaling-banner'));
    assert.equal(bannerShown, false);
    assert.deepEqual(pageErrors, []);
  } finally {
    await tearDown(ctx);
  }
});

// #180: the uptime ticker overwrites `#glp-uptime-text`'s textContent every
// second. The template must bind that text as a property (`.textContent=`),
// never a Lit child part (`>${...}<`): overwriting textContent deletes the
// child part's marker comments, so the next hass push crashes Lit's render
// with `this._$AA.nextSibling is null` and HA swaps in its "Configuration
// error" card.
test('the per-second uptime ticker does not break the next render after a hass push', async () => {
  const ctx = await setUpCard(buildMockStates({ switchState: 'on', preheatElapsed: 3600 }), '#glp-uptime-text');
  const { page, pageErrors } = ctx;
  try {
    // Let the 1 s uptime ticker fire at least once, deleting the marker
    // comments a child-part binding would have left behind.
    await page.waitForTimeout(1600);

    const beforeText = await page.evaluate(() =>
      document.querySelector('glp-card').shadowRoot.querySelector('#glp-uptime-text')?.textContent);
    assert.ok(beforeText && beforeText.trim().length > 0, 'uptime text is present before the push');

    // Push a fresh hass object the way HA does, with a *different* elapsed
    // value (3725 s -> "1:02:05", not "1:00:00"). Lit skips writing an
    // unchanged property value, so a same-value push would leave the
    // destroyed child-part marker untouched and never exercise the bug. The
    // assignment runs from a timer so a render crash surfaces as an uncaught
    // pageerror, exactly as it does in HA, instead of rejecting evaluate().
    await page.evaluate(mockStates => {
      const el = document.querySelector('glp-card');
      setTimeout(() => { el.hass = { language: 'de', states: mockStates, callService: () => {} }; }, 0);
    }, buildMockStates({ switchState: 'on', preheatElapsed: 3725, probeTick: 1 }));
    await page.waitForTimeout(500);

    assert.deepEqual(pageErrors, [], 'the uptime ticker must not crash the next Lit render');
    const afterText = await page.evaluate(() =>
      document.querySelector('glp-card').shadowRoot.querySelector('#glp-uptime-text')?.textContent);
    assert.ok(afterText && afterText.trim().length > 0, '#glp-uptime-text still shows text after the push');
    assert.notStrictEqual(afterText, beforeText, 'the pushed uptime value is re-rendered');
  } finally {
    await tearDown(ctx);
  }
});

// Same bug, machine-off branch: `_startReadyByTicker()` rewrites
// `#glp-readyby-countdown`'s textContent every second, so that span's text
// must also be a property binding rather than a Lit child part.
test('the per-second ready-by countdown does not break the next render after a hass push', async () => {
  const now = Date.now();
  const readyByTarget  = new Date(now + 30 * 60 * 1000).toISOString();
  const readyByPlanned = new Date(now + 25 * 60 * 1000).toISOString();
  // The push below moves both timestamps on, so the countdown text changes
  // from "in 25m" to "in 40m" and the render actually writes it: Lit skips an
  // unchanged value, which would leave the destroyed marker untouched.
  const readyByTarget2  = new Date(now + 45 * 60 * 1000).toISOString();
  const readyByPlanned2 = new Date(now + 40 * 60 * 1000).toISOString();
  const ctx = await setUpCard(
    buildMockStates({ switchState: 'off', readyByTarget, readyByPlanned }),
    '#glp-readyby-countdown');
  const { page, pageErrors } = ctx;
  try {
    await page.waitForTimeout(1600);

    const beforeText = await page.evaluate(() =>
      document.querySelector('glp-card').shadowRoot.querySelector('#glp-readyby-countdown')?.textContent);
    assert.ok(beforeText && beforeText.trim().length > 0, 'countdown text is present before the push');

    await page.evaluate(mockStates => {
      const el = document.querySelector('glp-card');
      setTimeout(() => { el.hass = { language: 'de', states: mockStates, callService: () => {} }; }, 0);
    }, buildMockStates({ switchState: 'off', readyByTarget: readyByTarget2, readyByPlanned: readyByPlanned2, probeTick: 1 }));
    await page.waitForTimeout(500);

    assert.deepEqual(pageErrors, [], 'the ready-by ticker must not crash the next Lit render');
    const afterText = await page.evaluate(() =>
      document.querySelector('glp-card').shadowRoot.querySelector('#glp-readyby-countdown')?.textContent);
    assert.ok(afterText && afterText.trim().length > 0, '#glp-readyby-countdown still shows text after the push');
    assert.notStrictEqual(afterText, beforeText, 'the pushed countdown value is re-rendered');
  } finally {
    await tearDown(ctx);
  }
});
/* eslint-enable no-undef */
