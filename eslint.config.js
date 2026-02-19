import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { 
    ignores: [
      '**/dist/**', 
      '**/node_modules/**',
      'demos/**',
      'vendor/**',
      'tests/**',
      'friscy-bundle/friscy.js', 
      'friscy-bundle/rv2wasm_jit.js',
      'friscy-bundle/friscy.wasm',
      'friscy-bundle/*.wasm',
      'public/friscy-bundle/**'
    ] 
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}', 'friscy-bundle/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly'
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-constant-condition': 'warn',
      'no-undef': 'warn'
    },
  },
);
