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
- **Versions** live in `shot/src/glp-card.ts` (`GLP_CARD_VERSION`) and
  `order/src/glp-order-card.ts` (`GLP_ORDER_CARD_VERSION`). Never bump outside a release.
- **Shared code** (`GLP-TOKENS` CSS tokens, helpers, icons, colour contrast and machine lookups) lives in
  `shared/`; both cards import it from there instead of keeping duplicate copies.
- **XSS**: the cards render HA data into the DOM — always escape/`textContent`, never
  unsanitized `innerHTML` from entity attributes.
- **Screenshots**: `npm run screenshot:shot` / `npm run screenshot:order` regenerate `docs/screenshots`.
