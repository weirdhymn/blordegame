import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    // Never lint the vendored engine or prototype art data — they are kept
    // byte-for-byte and intentionally not idiomatic TS (BLORSE_PLAN.md §5.1).
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      'js/**',
      'assets/horse/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Disable stylistic rules that conflict with Prettier — keep this last.
  prettier,
);
