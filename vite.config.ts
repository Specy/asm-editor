import { defineConfig } from 'vite-plus'

/**
 * The Cores, and the decompiler beside them, are submodules with their own repositories,
 * formatting and lint rules; nothing here formats or lints them.
 */
const CORES = [
    '/packages/mips/',
    '/packages/risc-v/',
    '/packages/m68k/',
    '/packages/x86/',
    '/packages/z80/',
    '/packages/decompiler/'
]

/**
 * A Core's full build, from its native sources to the `dist` the editor imports. Each runs in the
 * Core's npm package with the build script the Core's own CD runs; the input globs leave out
 * what the build writes (`dist`, Maven's `target/`, the TeaVM and wasm-pack output under `src/`),
 * so a repeated build with unchanged sources is a cache hit that restores only `dist`.
 * `mise.toml` is an input, since it pins the JDK, Rust and wasm-pack. The shared `pnpm-lock.yaml`
 * is not, or every change to the app's dependencies would rebuild every Core; a Core's own
 * `package.json` is.
 */
function coreBuild(cwd: string, command: string, input: string[], output: string[]) {
    return {
        command,
        cwd,
        cache: {
            input: ['mise.toml', ...input, '!**/node_modules/**', '!**/target/**', '!**/dist/**'],
            output,
            // The toolchains the Core builds call find their installs through these, and mise
            // picks the Rust toolchain with RUSTUP_TOOLCHAIN. Their versions are in mise.toml.
            untrackedEnv: ['JAVA_HOME', 'MAVEN_*', 'M2_HOME', 'CARGO_*', 'RUSTUP_*']
        }
    }
}

export default defineConfig({
    // `vp dev`, `vp build` and `vp preview` at the root are the editor's.
    defaultPackage: './packages/asm-editor',
    run: {
        tasks: {
            'build:mips': coreBuild(
                'packages/mips/marsjs/ts',
                'pnpm run build:all',
                ['packages/mips/**', '!packages/mips/marsjs/ts/src/generated/**'],
                ['packages/mips/marsjs/ts/dist/**']
            ),
            'build:risc-v': coreBuild(
                'packages/risc-v/rarsjs/ts',
                'pnpm run build:all',
                ['packages/risc-v/**', '!packages/risc-v/rarsjs/ts/src/generated/**'],
                ['packages/risc-v/rarsjs/ts/dist/**']
            ),
            'build:m68k': coreBuild(
                'packages/m68k/ts-lib',
                'pnpm run build-all',
                ['packages/m68k/**', '!packages/m68k/ts-lib/src/pkg/**', '!packages/m68k/pkg/**'],
                ['packages/m68k/ts-lib/dist/**']
            ),
            'build:x86': coreBuild(
                'packages/x86/blink-js',
                'pnpm run build',
                ['packages/x86/blink-js/**'],
                ['packages/x86/blink-js/dist/**']
            ),
            // The decompiler is not a Core, but a submodule built the same way. Its wasm and
            // processor descriptions are committed (emsdk is not in mise.toml), so its build only
            // bundles the wrapper and copies them, the specs and Ghidra's licences into `dist`;
            // `build/` holds its native and Emscripten build trees, which the build never reads.
            'build:decompiler': coreBuild(
                'packages/decompiler/js',
                'pnpm run build',
                ['packages/decompiler/**', '!packages/decompiler/build/**'],
                ['packages/decompiler/js/dist/**']
            ),
            // trs80 is an npm workspace of its own (see pnpm-workspace.yaml): it installs from its
            // lockfile and builds @specy/z80, which bundles the other packages from source, as its
            // CD does.
            'build:z80': coreBuild(
                'packages/z80',
                'npm ci && npm run build -w packages/z80-machine',
                ['packages/z80/**'],
                ['packages/z80/packages/z80-machine/dist/**']
            ),
            'build:cores': {
                command: 'node -e ""',
                cache: false,
                dependsOn: [
                    'build:mips',
                    'build:risc-v',
                    'build:m68k',
                    'build:x86',
                    'build:z80',
                    'build:decompiler'
                ]
            }
        }
    },
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
            '/build/',
            '.svelte-kit/',
            'package/',
            'pnpm-lock.yaml',
            ...CORES,
            '/packages/asm-editor/static/native-apps/',
            '/packages/asm-editor/examples/',
            // Generated instruction tables: 1.2 MB of one-line records that the formatter would
            // explode into hundreds of thousands of lines. `scripts/x86-docs-generate.mjs`
            // writes them formatted.
            '/packages/asm-editor/src/lib/languages/X86/generated/',
            // The Environment library's generated headers, which `scripts/sim-header` writes.
            '/packages/asm-editor/src/lib/sourceRuntime/generated/',
            // Compact, deterministic source-help catalogs; their generators own formatting.
            '/packages/asm-editor/src/lib/sourceLanguageHelp/generated/',
            // Generated libc++abi demangler; scripts/demangle/build.sh owns this module.
            '/packages/asm-editor/src/lib/languages/demangle/module.js',
            // The Runtime library's C sources and headers follow their own (musl's) style, and its
            // generated members, index and headers are megabytes of assembly text that
            // `scripts/build.mjs` writes; formatting them would only churn the diff. Its scripts
            // and modules are formatted like everything else.
            '/packages/runtime/*',
            '!/packages/runtime/lib/',
            '!/packages/runtime/scripts/',
            '!/packages/runtime/package.json',
            '!/packages/runtime/vite.config.ts',
            // The native harnesses, written in the library's own compact style.
            '/packages/runtime/scripts/check-targets.mjs',
            '/packages/runtime/scripts/test-native.mjs'
        ]
    },
    // Oxlint lints everything except the Svelte files, which stay on ESLint (`eslint.config.js`)
    // for `eslint-plugin-svelte`. The rules are the ESLint and typescript-eslint recommended sets
    // the project had, plus the options it set on them.
    lint: {
        ignorePatterns: [
            '/build/',
            '.svelte-kit/',
            'package/',
            'node_modules/',
            ...CORES,
            '/packages/asm-editor/examples/',
            '/packages/asm-editor/static/',
            '*.cjs',
            // Generated libc++abi demangler; scripts/demangle/build.sh owns this module.
            '/packages/asm-editor/src/lib/languages/demangle/module.js',
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
                files: ['packages/asm-editor/src/service-worker/**/*.ts'],
                env: { serviceworker: true }
            }
        ]
    }
})
