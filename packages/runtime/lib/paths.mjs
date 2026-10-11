import { fileURLToPath } from 'node:url'

/** This package's directory, for the Node tools and tests that read its sources and outputs. */
export const runtimeRoot = fileURLToPath(new URL('..', import.meta.url))
