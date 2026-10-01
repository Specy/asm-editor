import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import searchModel from '../src/lib/search/searchModel.json' with { type: 'json' }

/**
 * Serves the search model from our own origin ([ADR 0026](../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)).
 * `virtual:search-model` exports the URLs of the four model files that `scripts/search-model.mjs`
 * keeps in `.cache/`:
 *
 * - in a build, the files are emitted as content-hashed assets under `/_app/immutable/`, where the
 *   service worker caches them across deploys, and a missing file fails the build;
 * - on the dev server, a route streams them from `.cache/`, and when they are missing the module
 *   exports `null`, so search runs on words only;
 * - in the server build it exports `null`: search runs in the browser only.
 */

const VIRTUAL_ID = 'virtual:search-model'
const RESOLVED_ID = '\0' + VIRTUAL_ID
const DEV_ROUTE = '/@search-model/'

export function searchModelPlugin(): Plugin {
    const directory = resolve('.cache', 'search-model', searchModel.revision)
    const files = Object.entries(searchModel.files)
    let isBuild = false

    const missing = () => files.filter(([, file]) => !existsSync(join(directory, file.path)))

    return {
        name: 'asm-editor:search-model',
        configResolved(config) {
            isBuild = config.command === 'build'
        },
        resolveId(id) {
            return id === VIRTUAL_ID ? RESOLVED_ID : undefined
        },
        load(id, options) {
            if (id !== RESOLVED_ID) return
            if (options?.ssr) return 'export default null'
            const absent = missing()
            if (absent.length > 0) {
                const names = absent.map(([, file]) => file.path).join(', ')
                if (isBuild) {
                    this.error(`search model files missing (${names}); run npm run search:model`)
                }
                this.warn(`search model files missing (${names}); search will match words only`)
                return 'export default null'
            }
            if (!isBuild) {
                const urls = files.map(
                    ([key, file]) => `${key}: ${JSON.stringify(DEV_ROUTE + file.path)}`
                )
                return `export default { ${urls.join(', ')} }`
            }
            const urls = files.map(([key, file]) => {
                const reference = this.emitFile({
                    type: 'asset',
                    name: basename(file.path),
                    source: readFileSync(join(directory, file.path))
                })
                return `${key}: import.meta.ROLLUP_FILE_URL_${reference}`
            })
            return `export default { ${urls.join(', ')} }`
        },
        configureServer(server) {
            server.middlewares.use(DEV_ROUTE, (request, response, next) => {
                const path = decodeURIComponent((request.url ?? '').split('?')[0]).replace(
                    /^\//,
                    ''
                )
                const file = files.find(([, file]) => file.path === path)?.[1]
                const location = file ? join(directory, file.path) : null
                if (!location || !existsSync(location)) return next()
                response.setHeader('Content-Type', 'application/octet-stream')
                response.setHeader('Content-Length', String(file!.size))
                createReadStream(location).pipe(response)
            })
        }
    }
}
