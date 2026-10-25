# CLAUDE.md — cards/

The Shot Card (`shot/`) and the Order Card (`order/`) are TypeScript sources; the
bundles in `../custom_components/gaggiuino_profiler/www/` are built from them
(`npm run build`) and committed — never edit a bundle by hand.

- **Gates**: `npm ci`, then `npm run lint`, `npm run typecheck`, `npm run test:coverage` and
  `npm run build` (then `git diff` on `www/` must be clean). A newly-failing test is a stop
  condition. The same steps run in the "Cards" job of `.github/workflows/validate.yml`.
- **Tests**: `test/helpers/load-card.cjs` imports `src/*.ts` directly (Node's native type
  stripping) and returns the class plus whatever its `expose` option names, so unit suites test
  the shipped code, not the bundle. `deferred-define.test.js` is the one suite that still loads
  the committed bundle in `node:vm`, because it must replace the registry the card reads at load
  time. `test/e2e/*.test.mjs` needs `npx playwright install chromium` and drives the real bundle
  in headless Chromium via `scripts/e2e-harness.mts`.
- **Test DOM**: the DOM suites build one `new Window()` per file from `happy-dom`, then pass its
  document and globals to `loadCard()`; nothing in them needs a real browser. happy-dom 21 turned
  external CSS and iframe loading off by default (SSRF hardening) and the suites load neither, so
  leave it off — do not re-enable it with `enableCSSFileLoading` / `enableIframePageLoading`.
- **Versions** live in `shot/src/glp-card.ts` (`GLP_CARD_VERSION`) and
  `order/src/glp-order-card.ts` (`GLP_ORDER_CARD_VERSION`). Never bump outside a release.
- **Shared code** (`GLP-TOKENS` CSS tokens, helpers, icons, colour contrast and machine lookups) lives in
  `shared/`; both cards import it from there instead of keeping duplicate copies.
- **`shared/sheet.ts`** is the bottom-sheet building block (`GlpSheet` plus `SHEET_STYLES`) for
  pickers, confirmations and details: a native `<dialog>` opened with `showModal()`, half/full drag
  detents on phones (under 900px) and a centred dialog above. Each card appends `SHEET_STYLES` to its
  own stylesheet so the sheet keeps that card's `--glp-*` tokens. Its drag maths is ported from the
  app's `public-src/components/sheet-swipe.ts`; keep the pure helpers in step when that file changes.
- **XSS**: the cards render HA data into the DOM — always escape/`textContent`, never
  unsanitized `innerHTML` from entity attributes.
- **Screenshots**: `npm run screenshot:shot` / `npm run screenshot:order` regenerate `docs/screenshots`.
