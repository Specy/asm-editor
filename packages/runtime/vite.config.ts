import { defineConfig } from 'vite-plus'

/** The Cores the library's tools link and run members on, built from their checkouts. */
const CORES = [
    'asm-editor-monorepo#build:mips',
    'asm-editor-monorepo#build:risc-v',
    'asm-editor-monorepo#build:x86'
]

export default defineConfig({
    run: {
        tasks: {
            // The ABI guard's unit test; `scripts/build.mjs` loads the x86 Core when imported.
            test: {
                command: 'node --test scripts/abi-check.test.mjs',
                dependsOn: ['asm-editor-monorepo#build:x86'],
                cache: false
            },
            // Compiles the library through Compiler Explorer and writes `generated/`.
            generate: { command: 'node scripts/build.mjs', dependsOn: CORES, cache: false },
            // Fails when `generated/` no longer matches the sources or the ABI baseline.
            'generate:check': {
                command: 'node scripts/build.mjs --abi-only --check-assets',
                dependsOn: CORES,
                cache: false
            },
            // The corpus on the Cores, compared with glibc's results in `tests/expected`.
            'test:cores': { command: 'node scripts/test-cores.mjs', dependsOn: CORES, cache: false }
        }
    }
})
