import { mergeConfig } from 'vitest/config'
import base from './vite.config.ts'

/**
 * The measurement harness of phase 8 (`docs/design/screen-peripherals-plan.md`): the same Vite
 * config the app and the test suite run on, pointed at `*.measure.ts` instead of `*.test.ts`.
 *
 * Measurements are timings, so they are kept out of `npm test` — they take minutes, they assert
 * almost nothing, and a suite running them in parallel would measure the parallelism. Run them with
 * `npm run measure`.
 */
export default mergeConfig(base, {
    test: {
        include: ['src/**/*.measure.ts'],
        testTimeout: 900_000,
        hookTimeout: 120_000,
        //one file at a time in one process: two Cores running at once would be measuring each other
        fileParallelism: false,
        pool: 'forks',
        maxWorkers: 1
    }
})
