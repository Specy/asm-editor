import { mdsvex } from 'mdsvex'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import wasm from 'vite-plugin-wasm'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite-plus'
import { searchModelPlugin } from './scripts/search-model-plugin.ts'

export default defineConfig({
    fmt: {
        singleQuote: true,
        tabWidth: 4,
        semi: false,
        trailingComma: 'none',
        bracketSpacing: true,
        printWidth: 100,
        // Off by default in Oxfmt; this is the `prettier-plugin-svelte` formatting the project had.
        svelte: {},
        sortPackageJson: false,
        ignorePatterns: [
            'build/',
            '.svelte-kit/',
            'package/',
            'package-lock.json',
            'static/native-apps/',
            '/examples/',
            '/emulators/',
            // Generated instruction tables: 1.2 MB of one-line records that the formatter would
            // explode into hundreds of thousands of lines. `scripts/x86-docs-generate.mjs`
            // writes them formatted.
            'src/lib/languages/X86/generated/',
            // The Runtime library's generated members, index and headers: megabytes of assembly
            // text that `scripts/runtime/build.mjs` writes; formatting them would only churn the
            // diff.
            'src/lib/sourceRuntime/generated/',
            // The Runtime library's C sources and headers, which follow their own (musl's) style.
            '/runtime/',
            // Compact, deterministic source-help catalogs; their generators own formatting.
            'src/lib/sourceLanguageHelp/generated/',
            // Generated libc++abi demangler; scripts/demangle/build.sh owns this module.
            'src/lib/languages/demangle/module.js'
        ]
    },
    // Oxlint lints everything except the Svelte files, which stay on ESLint (`eslint.config.js`)
    // for `eslint-plugin-svelte`. The rules are the ESLint and typescript-eslint recommended sets
    // the project had, plus the options it set on them.
    lint: {
        ignorePatterns: [
            'build/',
            '.svelte-kit/',
            'package/',
            'node_modules/',
            'emulators/',
            'examples/',
            'static/',
            '*.cjs',
            // Generated libc++abi demangler; scripts/demangle/build.sh owns this module.
            'src/lib/languages/demangle/module.js',
            '**/*.svelte',
            '**/*.svelte.ts',
            '**/*.svelte.js'
        ],
        plugins: ['typescript'],
        categories: { correctness: 'off' },
        env: { browser: true, node: true },
        rules: {
            // ESLint recommended
            'constructor-super': 'error',
            'for-direction': 'error',
            'getter-return': 'error',
            'no-async-promise-executor': 'error',
            'no-case-declarations': 'error',
            'no-class-assign': 'error',
            'no-compare-neg-zero': 'error',
            'no-cond-assign': 'error',
            'no-const-assign': 'error',
            'no-constant-binary-expression': 'error',
            'no-constant-condition': 'error',
            'no-control-regex': 'error',
            'no-debugger': 'error',
            'no-delete-var': 'error',
            'no-dupe-class-members': 'error',
            'no-dupe-else-if': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-empty-character-class': 'error',
            'no-empty-pattern': 'error',
            'no-empty-static-block': 'error',
            'no-ex-assign': 'error',
            'no-extra-boolean-cast': 'error',
            'no-fallthrough': 'error',
            'no-func-assign': 'error',
            'no-global-assign': 'error',
            'no-import-assign': 'error',
            'no-invalid-regexp': 'error',
            'no-irregular-whitespace': 'error',
            'no-loss-of-precision': 'error',
            'no-misleading-character-class': 'error',
            'no-new-native-nonconstructor': 'error',
            'no-nonoctal-decimal-escape': 'error',
            'no-obj-calls': 'error',
            'no-prototype-builtins': 'error',
            'no-redeclare': 'error',
            'no-regex-spaces': 'error',
            'no-self-assign': 'error',
            'no-setter-return': 'error',
            'no-shadow-restricted-names': 'error',
            'no-sparse-arrays': 'error',
            'no-this-before-super': 'error',
            'no-unassigned-vars': 'error',
            'no-unreachable': 'error',
            'no-unsafe-finally': 'error',
            'no-unsafe-negation': 'error',
            'no-unsafe-optional-chaining': 'error',
            'no-unused-labels': 'error',
            'no-unused-private-class-members': 'error',
            'no-useless-backreference': 'error',
            'no-useless-catch': 'error',
            'no-with': 'error',
            'preserve-caught-error': 'error',
            'require-yield': 'error',
            'use-isnan': 'error',
            'valid-typeof': 'error',
            // typescript-eslint recommended
            'no-array-constructor': 'error',
            'no-unused-expressions': 'error',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'typescript/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
            'typescript/no-duplicate-enum-values': 'error',
            'typescript/no-empty-object-type': 'error',
            'typescript/no-explicit-any': 'error',
            'typescript/no-extra-non-null-assertion': 'error',
            'typescript/no-misused-new': 'error',
            'typescript/no-namespace': 'error',
            'typescript/no-non-null-asserted-optional-chain': 'error',
            'typescript/no-require-imports': 'error',
            'typescript/no-this-alias': 'error',
            'typescript/no-unnecessary-type-constraint': 'error',
            'typescript/no-unsafe-declaration-merging': 'error',
            'typescript/no-unsafe-function-type': 'error',
            'typescript/no-wrapper-object-types': 'error',
            'typescript/prefer-as-const': 'error',
            'typescript/prefer-namespace-keyword': 'error',
            'typescript/triple-slash-reference': 'error'
        },
        overrides: [
            {
                // typescript-eslint's `eslint-recommended`: the compiler checks what these rules
                // would, and TypeScript code is held to the modern forms.
                files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
                rules: {
                    'constructor-super': 'off',
                    'getter-return': 'off',
                    'no-class-assign': 'off',
                    'no-const-assign': 'off',
                    'no-dupe-class-members': 'off',
                    'no-dupe-keys': 'off',
                    'no-func-assign': 'off',
                    'no-import-assign': 'off',
                    'no-new-native-nonconstructor': 'off',
                    'no-obj-calls': 'off',
                    'no-redeclare': 'off',
                    'no-setter-return': 'off',
                    'no-this-before-super': 'off',
                    'no-unreachable': 'off',
                    'no-unsafe-negation': 'off',
                    'no-with': 'off',
                    'no-var': 'error',
                    'prefer-const': 'error',
                    'prefer-rest-params': 'error',
                    'prefer-spread': 'error'
                }
            },
            {
                // The compiler covers undefined names in TypeScript.
                files: ['**/*.js', '**/*.mjs'],
                rules: { 'no-undef': 'error' }
            },
            {
                // The service worker runs off-main-thread and has its own global scope.
                files: ['src/service-worker/**/*.ts'],
                env: { serviceworker: true }
            }
        ]
    },
    server: {
        port: 4173,
        fs: {
            // `npm run emulators:local` points the `@specy/*` packages at their submodule
            // checkouts, so Vite resolves a linked Core's assets to their real path under
            // `emulators/` instead of `node_modules/`. Without this the `.wasm` files fall
            // outside the serving allow list and the 403 page itself reaches
            // `WebAssembly.instantiate`, which reports a bad magic word.
            allow: ['emulators']
        },
        watch: {
            // The search model and the vectors the index build caches; nothing imports them.
            ignored: ['**/.cache/**']
        }
    },
    optimizeDeps: {
        exclude: ['@specy/s68k', '@specy/x86']
    },
    build: {
        sourcemap: true
    },
    plugins: [
        sveltekit({
            preprocess: [vitePreprocess(), mdsvex()],
            extensions: ['.svelte', '.svx'],
            adapter: adapter({ fallback: '404.html' })
        }),

        Icons({
            compiler: 'svelte',
            // `scale: 0` drops the em-based width/height attributes
            scale: 0,
            defaultClass: 'unplugin-icon'
        }),
        wasm(),
        searchModelPlugin()
    ],
    worker: {
        format: 'es',
        plugins: () => [wasm()]
    },
    // The tests run on the app's own Vite config so a test resolves package subpath imports
    // exactly like the app does, and so the Svelte plugin compiles any `.svelte.ts`
    // module a test reaches. Peripheral logic itself stays plain TypeScript, which is why the
    // default environment is node.
    //
    // `*.dom.test.ts` is the exception. Mounting a component needs a DOM and Svelte's browser
    // build, so those files run in their own project.
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    environment: 'node',
                    include: ['src/**/*.test.ts'],
                    exclude: ['src/**/*.dom.test.ts']
                }
            },
            {
                extends: true,
                resolve: { conditions: ['browser'] },
                test: {
                    name: 'dom',
                    environment: 'jsdom',
                    include: ['src/**/*.dom.test.ts']
                }
            }
        ]
    }
})
