import { mergeConfig } from 'vitest/config'
import base from './vite.config.ts'

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
