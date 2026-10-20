# CLAUDE.md — cards/

The Shot Card (`shot/`) and the Order Card (`order/`) are TypeScript sources; the
bundles in `../custom_components/gaggiuino_profiler/www/` are built from them
(`npm run build`) and committed — never edit a bundle by hand.

- **Gates**: `npm run lint`, `npm run typecheck`, `npm run test:coverage` and `npm run build`
  (then `git diff` on `www/` must be clean). A newly-failing test is a stop condition.
- **Versions** live in `shot/src/glp-card.ts` (`GLP_CARD_VERSION`) and
  `order/src/glp-order-card.ts` (`GLP_ORDER_CARD_VERSION`). Never bump outside a release.
- **Shared blocks** (`GLP-SHARED` / `GLP-TOKENS`) are still duplicated in both cards and must stay
  byte-identical; `test/token-sync.test.js` in each card compares against the sibling folder.
- **XSS**: the cards render HA data into the DOM — always escape/`textContent`, never
  unsanitized `innerHTML` from entity attributes.
- **Screenshots**: `npm run screenshot:shot` / `npm run screenshot:order` regenerate `docs/screenshots`.
