import globals from 'globals';
import tseslint from 'typescript-eslint';
import shotConfig from '../shot/eslint.config.mts';

// ESLint resolves `files` and `ignores` against the directory of the config
// file it loads, so the Shot Card's `src/**/*.ts` block never matches these
// files. Reuse that config as-is and re-apply its TypeScript source rules to
// the files in here.
export default [
  ...shotConfig,
  ...tseslint.config({
    files: ['**/*.ts'],
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
];
