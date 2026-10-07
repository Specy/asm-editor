#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { runtimeHelpCatalog } from './runtimeCatalog.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = join(root, 'src/lib/sourceRuntime/generated/v1')
const headers = JSON.parse(readFileSync(join(directory, 'include.json'), 'utf8'))
const functions = JSON.parse(readFileSync(join(directory, 'functions.json'), 'utf8'))
// The committed runtime artifacts remain the authority. Never contact a compiler to generate help.
const actualHeaders = readdirSync(join(root, 'runtime/include')).sort()
if (JSON.stringify(actualHeaders) !== JSON.stringify(Object.keys(headers).sort()))
    throw new Error('Runtime header list has drifted; regenerate the Runtime library artifacts.')
for (const header of actualHeaders)
    if (readFileSync(join(root, 'runtime/include', header), 'utf8') !== headers[header])
        throw new Error(`Runtime artifact differs from runtime/include/${header}`)

const catalog = runtimeHelpCatalog(headers, functions)
const path = join(root, 'src/lib/sourceLanguageHelp/generated/runtime-v1.json')
const text = JSON.stringify(catalog) + '\n'
if (process.argv.includes('--check')) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
        console.error('Source help catalog is out of date. Run npm run source:help:generate.')
        process.exitCode = 1
    }
} else {
    mkdirSync(join(root, 'src/lib/sourceLanguageHelp/generated'), { recursive: true })
    writeFileSync(path, text)
    console.log(
        `wrote runtime-v1.json (${catalog.entries.length} entries, ${Buffer.byteLength(text)} bytes)`
    )
}
