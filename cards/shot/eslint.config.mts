import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Core rules for the plain-JavaScript test files; the TypeScript blocks below
// use the typescript-eslint equivalents instead.
const commonRules = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-undef': 'error',
  'require-atomic-updates': 'error',
  'no-implicit-globals': 'error',
  'no-restricted-properties': [
    'warn',
    { property: 'innerHTML', message: 'innerHTML use flagged for review (XSS risk) — warning only, not blocking.' },
  ],
};

export default [
  {
    // glp-card.js is generated from src/ by `npm run build` and committed, so
    // lint the sources, not the bundle. docs/ and graphify-out/ are generated.
    ignores: ['node_modules/**', 'docs/**', 'graphify-out/**'],
  },
  js.configs.recommended,
  ...tseslint.config({
    // Node-run TypeScript tooling: this config file and the scripts.
    files: ['eslint.config.mts', 'scripts/**/*.mts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  }),
  ...tseslint.config({
    // The card's TypeScript sources (#180): fully typed, so the non-type-checked
    // recommended set stays enough (no parser project). cards/shared/ has its
    // own eslint.config.mts, which reuses this config for shared/ files. The
    // remaining GLP-SHARED blocks still have to stay byte-identical with the
    // Order Card, checked by test/token-sync.test.js.
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'require-atomic-updates': 'error',
      'no-implicit-globals': 'error',
      'no-restricted-properties': [
        'warn',
        { property: 'innerHTML', message: 'innerHTML use flagged for review (XSS risk) — warning only, not blocking.' },
      ],
    },
  }),
  {
    // Tests stay CommonJS/JavaScript under node --test.
    files: ['test/**/*.js', 'test/**/*.mjs', 'test/helpers/**/*.cjs'],
    languageOptions: {
      globals: globals.node,
    },
    rules: commonRules,
  },
];
