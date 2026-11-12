// #391: a hass push just before the card is removed armed the 1 s render
// timer, which then rendered a card that was no longer on the page.
// disconnectedCallback has to clear it. Drives the real element in a
// happy-dom window (same setup as test/order-polish.test.js) with node:test's
// fake timers, like the shot card's test/timers-cleanup.test.js.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');
const { loadCard } = require('./helpers/load-card.cjs');

const window = new Window();
// Publish `home-assistant` first so the card's deferred define (#145) fires
// synchronously and registers `glp-order-card` in this window's registry.
window.customElements.define('home-assistant', class extends window.HTMLElement {});
loadCard({
  context: {
    document: window.document,
    window,
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    navigator: window.navigator,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
  },
});

const hass = () => ({ language: 'en', states: {} });

// A card whose own data loads are stubbed out: this suite only cares about
// the render timer the hass setter arms.
function makeCard() {
  const card = window.document.createElement('glp-order-card');
  card._config = {};
  card._lang = 'en';
  card._load = async () => {};
  card._startPoll = () => {};
  window.document.body.appendChild(card);
  return card;
}

test('removing the card clears the pending hass render timer (#391)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const card = makeCard();
  let renders = 0;
  card._render = () => { renders += 1; };

  card.hass = hass();   // first push: loads, no timer
  card.hass = hass();   // later push: debounced render
  assert.notEqual(card._hassRenderTimer, null, 'the second push arms the render timer');

  card.remove();
  assert.equal(card._hassRenderTimer, null, 'removal drops the timer');

  t.mock.timers.tick(2000);
  assert.equal(renders, 0, 'and no render runs for the detached card');
});
