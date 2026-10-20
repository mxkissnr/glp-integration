// Minimal Playwright E2E smoke test (#48). Reuses the static-server/mock-API
// harness from scripts/e2e-harness.mts (shared with scripts/screenshot.mts)
// to render the real glp-order-card.js in a headless Chromium tab — not a
// vm sandbox — so it can exercise real DOM events and timing.
//
// Covers two things pure vm-sandboxed unit tests structurally cannot: (1)
// that an in-progress selection survives a concurrently-arriving `hass`
// update (Lit patches the existing DOM in place instead of rebuilding it),
// and (2) that a switch entity going 'unavailable' (_machineOff(),
// glp-order-card.js) actually renders the defined machine-off state
// end-to-end rather than throwing. Run via
// `npm test` (node --test auto-discovers test/**/*.test.mjs).
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer, mockApi } from '../../scripts/e2e-harness.mts';

function harnessHtml(switchState = 'on') {
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
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
  });
  el.hass = {
    states: { 'switch.espresso_plug': { state: '${switchState}', attributes: {} } },
    user: { id: 'demo-user', name: 'Max' },
    callService: () => {},
  };
  document.body.appendChild(el);
  window.__card = el;
</script>
</body></html>`;
}

const HARNESS_HTML = harnessHtml('on');

const MENU = [{ name: 'Flat White', variants: ['Single', 'Doppio'] }];

// The page.evaluate()/waitForFunction() callbacks below run inside the
// browser tab via Playwright, not in this Node process — `document`/`Event`
// are real globals there, even though ESLint's static analysis (correctly,
// for a Node test file) doesn't know that.
/* eslint-disable no-undef */

async function setUpCard() {
  const server = await startServer(HARNESS_HTML);
  const { port } = server.address();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await mockApi(page, { menu: MENU });
  await page.goto(`http://127.0.0.1:${port}/__harness.html`);
  await page.waitForFunction(() => {
    const el = document.querySelector('glp-order-card');
    return !!el?.shadowRoot?.querySelector('.menu-grid');
  }, { timeout: 10000 });
  return { server, browser, page };
}

async function tearDown({ server, browser }) {
  await browser.close();
  server.close();
}

test('order button becomes enabled after selecting an item + variant', async () => {
  const ctx = await setUpCard();
  const { page } = ctx;
  try {
    await page.evaluate(() => {
      document.querySelector('glp-order-card').shadowRoot
        .querySelector('.menu-item[data-item="Flat White"]').click();
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('glp-order-card');
      return !!el?.shadowRoot?.querySelector('.variant-chip');
    }, { timeout: 5000 });

    const submitDisabledBefore = await page.evaluate(() =>
      document.querySelector('glp-order-card').shadowRoot.getElementById('oc-submit').disabled);
    assert.equal(submitDisabledBefore, true, 'submit stays disabled until a variant is picked');

    await page.evaluate(() => {
      document.querySelector('glp-order-card').shadowRoot.querySelector('.variant-chip').click();
    });

    const submit = await page.evaluate(() => {
      const btn = document.querySelector('glp-order-card').shadowRoot.getElementById('oc-submit');
      return { disabled: btn.disabled, text: btn.textContent };
    });
    assert.equal(submit.disabled, false);
    assert.match(submit.text, /Single/);
  } finally {
    await tearDown(ctx);
  }
});

test('a concurrent hass update does not reset an in-progress variant selection', async () => {
  const ctx = await setUpCard();
  const { page } = ctx;
  try {
    await page.evaluate(() => {
      document.querySelector('glp-order-card').shadowRoot
        .querySelector('.menu-item[data-item="Flat White"]').click();
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('glp-order-card');
      return !!el?.shadowRoot?.querySelector('.variant-chip');
    }, { timeout: 5000 });

    // Simulate the race the old innerHTML rebuild used to lose: a `hass`
    // push arrives between the pointerdown and the click. With Lit's
    // in-place render the selection below must still survive.
    await page.evaluate(() => {
      const el = document.querySelector('glp-order-card');
      const chip = el.shadowRoot.querySelector('.variant-chip');
      chip.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      // Fresh object reference simulating a real hass push mid-interaction
      // (glp-order-card exposes `hass` as a setter only, so this can't read
      // back the current value — reconstruct it instead).
      el.hass = {
        states: { 'switch.espresso_plug': { state: 'on', attributes: {} } },
        user: { id: 'demo-user', name: 'Max' },
        callService: () => {},
      };
      chip.click();
    });

    // Wait past the 1s hass-render debounce so the deferred re-render has
    // had a chance to fire.
    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => {
      const el = document.querySelector('glp-order-card');
      const chip = el.shadowRoot.querySelector('.variant-chip');
      const btn = el.shadowRoot.getElementById('oc-submit');
      return { chipSelected: chip.classList.contains('selected'), selectedVariant: el._selectedVariant, btnDisabled: btn.disabled };
    });

    assert.equal(state.selectedVariant, 'Single');
    assert.equal(state.chipSelected, true);
    assert.equal(state.btnDisabled, false);
  } finally {
    await tearDown(ctx);
  }
});

test('switch entity going unavailable shows the machine-off state without throwing', async () => {
  const server = await startServer(harnessHtml('unavailable'));
  const { port } = server.address();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err));
  try {
    await mockApi(page, { menu: MENU });
    await page.goto(`http://127.0.0.1:${port}/__harness.html`);
    await page.waitForFunction(() => {
      const el = document.querySelector('glp-order-card');
      return !!el?.shadowRoot?.querySelector('.machine-off');
    }, { timeout: 10000 });

    const bodyText = await page.evaluate(() =>
      document.querySelector('glp-order-card').shadowRoot.querySelector('.machine-off').textContent);
    assert.match(bodyText, /\S/, 'machine-off state renders a non-empty message, not a blank card');
    assert.deepEqual(pageErrors, [], 'an unavailable switch entity must not throw during render');
  } finally {
    await browser.close();
    server.close();
  }
});
/* eslint-enable no-undef */
