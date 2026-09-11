import js from '@eslint/js'
import ts from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import svelteConfig from './svelte.config.js'

export default ts.config(
    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs.recommended,
    prettier,
    ...svelte.configs.prettier,
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node }
        }
    },
    {
        files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
        languageOptions: {
            parserOptions: {
                parser: ts.parser,
                extraFileExtensions: ['.svelte'],
                svelteConfig
            }
        },
        rules: {
            'no-undef': 'off',
            'no-import-assign': 'off'
        }
    },
    {
        // The service worker runs off-main-thread and has its own global scope.
        files: ['src/service-worker.ts'],
        languageOptions: {
            globals: { ...globals.serviceworker }
        }
    },
    {
        rules: {
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            'no-useless-escape': 'off'
        }
    },
    {
        rules: {
            '@typescript-eslint/ban-ts-comment': [
                'error',
                { 'ts-ignore': 'allow-with-description' }
            ],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

            // Generic/external URLs need API changes, and resolve changes prerendered hrefs.
            'svelte/no-navigation-without-resolve': 'warn',
            // Keys change reconciliation, and several lists have no stable unique ID.
            'svelte/require-each-key': 'warn',

            'svelte/no-useless-mustaches': 'error',
            'svelte/prefer-svelte-reactivity': 'error',
            'svelte/prefer-writable-derived': 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
            '@typescript-eslint/no-unused-expressions': 'error',

            '@typescript-eslint/no-wrapper-object-types': 'error',
            'no-prototype-builtins': 'error'
        }
    },
    {
        ignores: [
            'build/',
            '.svelte-kit/',
            'package/',
            'node_modules/',
            'emulators/',
            'examples/',
            'static/',
            '*.cjs'
        ]
    }
)
