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
            //TODO slowly try to switch these to errors and fix them
            '@typescript-eslint/ban-ts-comment': [
                'warn',
                { 'ts-ignore': 'allow-with-description' }
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn',
            'svelte/no-navigation-without-resolve': 'warn',
            'svelte/no-useless-mustaches': 'warn',
            'svelte/prefer-svelte-reactivity': 'warn',
            'svelte/prefer-writable-derived': 'warn',
            'svelte/require-each-key': 'warn',

            'no-empty': ['error', { allowEmptyCatch: true }],
            '@typescript-eslint/no-unused-expressions': 'warn',

            '@typescript-eslint/no-wrapper-object-types': 'warn',
            'no-prototype-builtins': 'warn'
        }
    },
    {
        ignores: [
            'build/',
            '.svelte-kit/',
            'package/',
            'node_modules/',
            'examples/',
            'static/',
            '*.cjs'
        ]
    }
)
