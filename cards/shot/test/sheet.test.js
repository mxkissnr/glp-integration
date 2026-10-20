// Shared bottom sheet (#266, building block for #275). Two halves:
//
//  1. the pure drag maths ported from the app's sheet-swipe.ts plus the new
//     half/full `sheetSnap()` decision — no DOM, plain numbers;
//  2. the GlpSheet controller in happy-dom: it must render a native <dialog>,
//     call showModal(), close exactly once from each path (X, Escape, backdrop,
//     popstate), trim its history entry exactly once, and re-render on refresh.
//
// The sheet lives in cards/shared/, but the Shot Card's runner covers shared
// code too (#256), so the suite sits next to the card that will use it first.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Window } = require('happy-dom');

// happy-dom must be installed as the globals before Lit is imported: Lit binds
// to whatever global document exists when it is first evaluated.
const window = new Window();
Object.defineProperty(globalThis, 'document', {
  value: window.document, configurable: true, writable: true,
});
Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true });
Object.defineProperty(globalThis, 'HTMLElement', {
  value: window.HTMLElement, configurable: true, writable: true,
});
Object.defineProperty(globalThis, 'customElements', {
  value: window.customElements, configurable: true, writable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator, configurable: true, writable: true,
});
// Pin the phone/desktop breakpoint off: these tests cover the controller's
// state machine, not the drag gesture, and a non-phone window keeps every
// close synchronous (no slide-out timer between the call and its assertions).
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }),
});

// Lit's `html` must come from the same module instance the sheet imported, so
// it is loaded with a dynamic import (the ESM cache is shared with the sheet's
// own `import 'lit'`); a second copy would fail Lit's TemplateResult check.
let html = null;
test.before(async () => { ({ html } = await import('lit')); });

const {
  dismissDistance,
  recentVelocity,
  shouldDismissSheet,
  rubberBand,
  allowsBodyDrag,
  snapDistance,
  sheetSnap,
  GlpSheet,
  SHEET_STYLES,
} = require('../../shared/sheet.ts');

// happy-dom's <dialog> may not implement the modal parts; a stub keeps the
// controller's showModal()/close() path exercised either way.
const dialogProto = window.HTMLDialogElement && window.HTMLDialogElement.prototype;
if (dialogProto && typeof dialogProto.showModal !== 'function') {
  dialogProto.showModal = function showModal() { this.setAttribute('open', ''); };
}
if (dialogProto && typeof dialogProto.close !== 'function') {
  dialogProto.close = function close() { this.removeAttribute('open'); };
}

// ─── pure functions ──────────────────────────────────────────────────────────

test('dismissDistance is a quarter of the height, capped at 80px', () => {
  assert.equal(dismissDistance(100), 25);
  assert.equal(dismissDistance(400), 80);
  assert.equal(dismissDistance(1000), 80, 'a tall sheet must not become hard to close');
  assert.equal(dismissDistance(0), 80, 'a not-yet-measured sheet falls back to the cap');
  assert.equal(dismissDistance(NaN), 80);
});

test('recentVelocity measures only the last 100ms of samples', () => {
  // A slow start then a fast flick: total-over-total (~0.5) understates it.
  assert.equal(
    recentVelocity([{ t: 0, y: 0 }, { t: 400, y: 40 }, { t: 450, y: 70 }, { t: 500, y: 100 }]),
    0.6,
  );
  // Everything older than the window is ignored; the last sample alone is 0.
  assert.equal(recentVelocity([{ t: 0, y: 0 }, { t: 50, y: 90 }], 10), 0);
  assert.equal(recentVelocity([{ t: 0, y: 0 }]), 0);
  assert.equal(recentVelocity([]), 0);
  // Upward movement is negative, not clamped to zero here.
  assert.equal(recentVelocity([{ t: 0, y: 0 }, { t: 50, y: -25 }]), -0.5);
});

test('shouldDismissSheet: long drag, flick yes; upward or tiny moves no', () => {
  assert.equal(shouldDismissSheet(80, 400, 0), true, 'a long drag dismisses');
  assert.equal(shouldDismissSheet(20, 400, 0.6), true, 'a short flick dismisses');
  assert.equal(shouldDismissSheet(-40, 400, 0), false, 'upward never dismisses');
  assert.equal(shouldDismissSheet(10, 400, 0.1), false, 'a tiny slow move springs back');
  assert.equal(shouldDismissSheet(0, 400, 0), false);
});

test('rubberBand caps and damps an upward pull', () => {
  assert.equal(rubberBand(0), 0);
  assert.equal(rubberBand(-10), 0);
  assert.equal(rubberBand(10), -5);
  assert.equal(rubberBand(1000), -24);
});

test('allowsBodyDrag only from the top, downward, off interactive targets', () => {
  assert.equal(allowsBodyDrag(0, 10, false), true);
  assert.equal(allowsBodyDrag(20, 10, false), false, 'scrolled content scrolls instead');
  assert.equal(allowsBodyDrag(0, -10, false), false);
  assert.equal(allowsBodyDrag(0, 10, true), false, 'a control keeps its own gesture');
});

test('snapDistance is a clamped fraction of the height', () => {
  assert.equal(snapDistance(400), 48);
  assert.equal(snapDistance(100), 40, 'too short a sheet still needs a real pull');
  assert.equal(snapDistance(2000), 72);
});

test('sheetSnap: half expands on a deliberate upward pull only', () => {
  assert.equal(sheetSnap(-60, 400, 0, false), 'full');
  assert.equal(sheetSnap(-10, 400, 0, false), 'half', 'a small upward move stays at half');
  assert.equal(sheetSnap(-10, 400, -0.6, false), 'full', 'an upward flick expands');
  assert.equal(sheetSnap(-10, 400, -0.1, false), 'half');
});

test('sheetSnap: full stays full on upward moves and shrinks on downward ones', () => {
  assert.equal(sheetSnap(-100, 400, 0, true), 'full', 'a full sheet never over-expands');
  assert.equal(sheetSnap(20, 400, 0, true), 'half', 'a short downward drag goes back to half');
});

test('sheetSnap: closing needs the dismiss distance or a flick, from either detent', () => {
  assert.equal(sheetSnap(70, 1000, 0, false), 'half', 'below the 80px cap: stay at half');
  assert.equal(sheetSnap(90, 1000, 0, false), 'close');
  assert.equal(sheetSnap(70, 1000, 0, true), 'half', 'a full sheet also shrinks before closing');
  assert.equal(sheetSnap(90, 1000, 0, true), 'close');
  assert.equal(sheetSnap(20, 1000, 0.6, false), 'close', 'a flick closes from half');
  assert.equal(sheetSnap(20, 1000, 0.6, true), 'close', 'a flick closes from full');
});

test('sheetSnap: no movement settles on the current detent', () => {
  assert.equal(sheetSnap(0, 400, 0, false), 'half');
  assert.equal(sheetSnap(0, 400, 0, true), 'full');
  assert.equal(sheetSnap(3, 400, 0, false), 'half');
});

test('SHEET_STYLES uses the shared tokens and keeps reduced motion static', () => {
  assert.match(SHEET_STYLES, /--glp-surface/);
  assert.match(SHEET_STYLES, /--glp-text/);
  assert.match(SHEET_STYLES, /prefers-reduced-motion: no-preference/,
    'the slide-in animation must be opt-in, so reduce gets no motion');
  assert.match(SHEET_STYLES, /min-width: 900px/, 'the desktop breakpoint matches the drag breakpoint');
});

// ─── controller ──────────────────────────────────────────────────────────────

function newRoot(t) {
  const root = window.document.createElement('div');
  window.document.body.appendChild(root);
  // Leave no open sheet behind: a stale popstate listener would otherwise
  // close it during a later test and skew that test's history counters.
  t.after(() => { root.remove(); });
  return root;
}

function makeSheet(t, root, options) {
  const sheet = new GlpSheet(root, options);
  t.after(() => { if (sheet.isOpen) sheet.close(); });
  return sheet;
}

// Replaces `window.history` with counters. The controller re-reads it on every
// call, so installing this before open() is enough; replacing the whole object
// (rather than its methods) also works if happy-dom hands out a fresh History
// instance per access.
function spyHistory() {
  const calls = { push: 0, back: 0 };
  const fake = {
    pushState: () => { calls.push += 1; },
    back: () => { calls.back += 1; },
  };
  try {
    Object.defineProperty(window, 'history', { configurable: true, writable: true, value: fake });
  } catch {
    // happy-dom may expose history as a non-configurable own property; patch
    // the method slots instead.
    const hist = window.history;
    hist.pushState = () => { calls.push += 1; };
    hist.back = () => { calls.back += 1; };
  }
  return calls;
}

function spyShowModal() {
  const calls = { show: 0, close: 0 };
  const proto = window.HTMLDialogElement && window.HTMLDialogElement.prototype;
  if (!proto) return calls;
  const show = proto.showModal;
  const close = proto.close;
  Object.defineProperty(proto, 'showModal', {
    configurable: true,
    writable: true,
    value: function showModalStub() { calls.show += 1; return show.call(this); },
  });
  Object.defineProperty(proto, 'close', {
    configurable: true,
    writable: true,
    value: function closeStub() { calls.close += 1; return close.call(this); },
  });
  return calls;
}

function content(title = 'Shot details', bodyText = 'Body text') {
  return { title, body: () => htmlText(bodyText), actions: () => htmlText('Action') };
}

function htmlText(text) {
  return html`<span class="test-probe">${text}</span>`;
}

test('open renders title and body into a <dialog> and opens it modally', (t) => {
  const history = spyHistory();
  const modal = spyShowModal();
  const root = newRoot(t);
  const sheet = makeSheet(t, root);

  sheet.open(content());

  assert.equal(sheet.isOpen, true);
  const dialog = root.querySelector('dialog');
  assert.ok(dialog, 'a native <dialog> is rendered into the root');
  assert.equal(root.querySelector('.glp-sheet-title').textContent, 'Shot details');
  assert.equal(root.querySelector('.glp-sheet-body').textContent.trim(), 'Body text');
  assert.equal(root.querySelector('.glp-sheet-actions').textContent.trim(), 'Action');
  assert.equal(modal.show, 1);
  assert.equal(dialog.hasAttribute('open'), true);
  assert.equal(history.push, 1, 'one history entry per open');
});

test('the close button closes once, removes the history entry and reports once', (t) => {
  const history = spyHistory();
  spyShowModal();
  const root = newRoot(t);
  let closed = 0;
  const sheet = makeSheet(t, root, { onClose: () => { closed += 1; } });
  sheet.open(content());

  root.querySelector('.glp-sheet-close').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(sheet.isOpen, false);
  assert.equal(closed, 1);
  assert.equal(history.back, 1, 'the pushed entry is removed exactly once');
  assert.equal(root.querySelector('dialog').hasAttribute('open'), false);

  // A second close is a no-op: no second back(), no second onClose.
  sheet.close();
  assert.equal(closed, 1);
  assert.equal(history.back, 1);
});

test('Escape (the cancel event) closes the sheet', (t) => {
  const history = spyHistory();
  spyShowModal();
  const root = newRoot(t);
  let closed = 0;
  const sheet = makeSheet(t, root, { onClose: () => { closed += 1; } });
  sheet.open(content());

  root.querySelector('dialog').dispatchEvent(new window.Event('cancel'));

  assert.equal(sheet.isOpen, false);
  assert.equal(closed, 1);
  assert.equal(history.back, 1);
});

test('a backdrop click closes the sheet', (t) => {
  const history = spyHistory();
  spyShowModal();
  const root = newRoot(t);
  let closed = 0;
  const sheet = makeSheet(t, root, { onClose: () => { closed += 1; } });
  sheet.open(content());

  root.querySelector('.glp-sheet-backdrop')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(sheet.isOpen, false);
  assert.equal(closed, 1);
  assert.equal(history.back, 1);
});

test('the phone back gesture closes the sheet without calling back() again', (t) => {
  const history = spyHistory();
  spyShowModal();
  const root = newRoot(t);
  let closed = 0;
  const sheet = makeSheet(t, root, { onClose: () => { closed += 1; } });
  sheet.open(content());

  window.dispatchEvent(new window.Event('popstate'));

  assert.equal(sheet.isOpen, false);
  assert.equal(closed, 1);
  assert.equal(history.back, 0, 'popstate already consumed the entry');

  // The listener is gone with the sheet: a stray popstate must not re-fire.
  window.dispatchEvent(new window.Event('popstate'));
  assert.equal(closed, 1);
});

test('refresh() re-renders the body while open', (t) => {
  spyHistory();
  spyShowModal();
  const root = newRoot(t);
  const sheet = makeSheet(t, root);
  let text = 'first';
  sheet.open({ title: 'Live', body: () => htmlText(text) });
  const dialog = root.querySelector('dialog');

  assert.equal(root.querySelector('.glp-sheet-body').textContent.trim(), 'first');
  text = 'second';
  sheet.refresh();

  assert.equal(root.querySelector('.glp-sheet-body').textContent.trim(), 'second');
  assert.equal(sheet.isOpen, true);
  // Lit patches the existing tree, so the modal dialog must survive a refresh
  // (a recreated <dialog> would silently drop out of the top layer).
  assert.equal(root.querySelector('dialog'), dialog, 'the dialog node is reused');
  assert.equal(dialog.hasAttribute('open'), true);
});

test('reopening works, keeps one history entry and does not double listeners', (t) => {
  const history = spyHistory();
  const modal = spyShowModal();
  const root = newRoot(t);
  let closed = 0;
  const sheet = makeSheet(t, root, { onClose: () => { closed += 1; } });

  sheet.open(content('First'));
  sheet.close();
  assert.equal(closed, 1);
  assert.equal(history.push, 1);
  assert.equal(history.back, 1);

  sheet.open(content('Second'));
  assert.equal(sheet.isOpen, true);
  assert.equal(root.querySelector('.glp-sheet-title').textContent, 'Second');
  assert.equal(history.push, 2, 'each open pushes exactly one entry');
  assert.equal(modal.show, 2, 'the dialog is re-opened modally');
  assert.equal(root.querySelectorAll('dialog').length, 1, 'no duplicate dialog nodes');

  // One popstate closes the reopened sheet once — a leftover listener from the
  // first open would fire a second close and a second onClose.
  window.dispatchEvent(new window.Event('popstate'));
  assert.equal(closed, 2);
  assert.equal(sheet.isOpen, false);
  assert.equal(history.back, 1, 'reopen must not add a back() of its own here');
});

test('opening while open refreshes instead of stacking a second entry', (t) => {
  const history = spyHistory();
  spyShowModal();
  const root = newRoot(t);
  const sheet = makeSheet(t, root);

  sheet.open(content('One', 'a'));
  sheet.open(content('Two', 'b'));

  assert.equal(root.querySelector('.glp-sheet-title').textContent, 'Two');
  assert.equal(root.querySelectorAll('dialog').length, 1);
  assert.equal(history.push, 1);
});
