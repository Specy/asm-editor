import { defineConfig } from 'vite-plus'
import base from './vite.config.ts'

export default defineConfig({
    ...base,
    test: {
        include: ['scripts/examples/*.task.ts'],
        environment: 'node',
        testTimeout: 120_000,
        fileParallelism: false
    }
})
