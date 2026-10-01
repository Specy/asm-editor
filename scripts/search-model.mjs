#!/usr/bin/env node
/**
 * Fetches the search model ([ADR 0026](../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md))
 * into `.cache/search-model/<revision>/`, which is not committed: the files named in
 * `src/lib/search/searchModel.json`, at the pinned revision, each checked against its sha256.
 *
 * A file already there with the right hash is kept, so this runs before every dev server, build and
 * test run at the cost of hashing 23 MB. A download goes to a temporary name and is renamed only
 * once its hash matches, so an interrupted run never leaves a file that looks complete.
 *
 * `--optional` (the dev server and the tests) turns a failed download into a warning: search then
 * runs on words only. A build runs without it, because a deployed page without the model files
 * would ask for URLs that do not exist. A hash mismatch fails either way.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const model = JSON.parse(readFileSync(join(projectRoot, 'src/lib/search/searchModel.json'), 'utf8'))
export const modelDir = join(projectRoot, '.cache', 'search-model', model.revision)

const optional = process.argv.includes('--optional')

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex')
}

function isComplete(path, file) {
    if (!existsSync(path)) return false
    return sha256(readFileSync(path)) === file.sha256
}

async function download(file, path) {
    const url = `https://huggingface.co/${model.id}/resolve/${model.revision}/${file.path}`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const actual = sha256(bytes)
    if (actual !== file.sha256) {
        // Not a network problem: the pinned revision no longer serves these bytes.
        console.error(`search model: ${file.path} has sha256 ${actual}, expected ${file.sha256}`)
        process.exit(1)
    }
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.download`
    writeFileSync(temporary, bytes)
    renameSync(temporary, path)
}

let fetched = 0
for (const file of Object.values(model.files)) {
    const path = join(modelDir, file.path)
    if (isComplete(path, file)) continue
    rmSync(path, { force: true })
    try {
        await download(file, path)
        fetched++
    } catch (error) {
        const message = `search model: could not download ${file.path} (${error.message})`
        if (!optional) {
            console.error(message)
            process.exit(1)
        }
        console.warn(`${message}; search will match words only until it is fetched`)
        process.exit(0)
    }
}
if (fetched > 0) console.log(`search model: fetched ${fetched} file(s) into ${modelDir}`)
