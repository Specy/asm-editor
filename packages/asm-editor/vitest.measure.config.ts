import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite-plus'
import base from './vite.config.ts'

/** A Core's ES module build, the one the app loads, which is also the only one that loads wasm. */
const esmBuild = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default mergeConfig(base, {
    resolve: {
        //Node resolves the MIPS and RISC-V packages to their CommonJS build, which runs on
        //JavaScript whatever `useWebAssembly` is asked: CORE_BACKEND=webassembly needs the other
        alias: {
            '@specy/mips': esmBuild('../mips/marsjs/ts/dist/index.mjs'),
            '@specy/risc-v': esmBuild('../risc-v/rarsjs/ts/dist/index.mjs')
        }
    },
    test: {
        include: ['src/**/*.measure.ts'],
        testTimeout: 900_000,
        hookTimeout: 120_000,
        //one file at a time in one process: two Cores running at once would be measuring each other
        fileParallelism: false,
        pool: 'forks',
        maxWorkers: 1,
        //the WebAssembly build needs exception handling with exnref, behind a flag in Node 24
        execArgv: ['--experimental-wasm-exnref'],
        //imported as they are rather than through Vite's transform, which slows a TeaVM bundle down
        server: { deps: { external: [/\/(marsjs|rarsjs)\/ts\/dist\//] } }
    }
})
