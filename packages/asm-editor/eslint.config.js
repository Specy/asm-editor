import js from '@eslint/js'
import ts from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import { loadConfig } from '@sveltejs/load-config'

const svelteConfig = (await loadConfig('./', { traverse: false }))?.config

export default ts.config(
    {
        // Oxlint (`lint` in vite.config.ts) lints every other script. ESLint stays for what
        // eslint-plugin-svelte understands: components and the `.svelte.ts` / `.svelte.js`
        // modules that use runes.
        ignores: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}', '!**/*.svelte.{js,ts}']
    },
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
                svelteConfig,
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            'no-undef': 'off',
            'no-import-assign': 'off',
            // The typed rules Oxlint runs on every other script (`lint` in vite.config.ts).
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/switch-exhaustiveness-check': [
                'error',
                { considerDefaultExhaustiveForUnions: true }
            ]
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

            'svelte/no-navigation-without-resolve': 'error',
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
        ignores: ['.svelte-kit/', 'package/', 'node_modules/', 'examples/', 'static/']
    }
)
