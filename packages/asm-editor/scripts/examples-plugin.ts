import { createReadStream, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const directory = fileURLToPath(new URL('../../examples/dist/', import.meta.url))

/** The example archives ship with the editor that can run them. */
export function examplesPlugin(): Plugin {
    let serverBuild = false
    function files(): string[] {
        const index = JSON.parse(readFileSync(resolve(directory, 'index.json'), 'utf8')) as {
            examples: Record<string, { ports: { archive: string }[] }>
        }
        const archives = Object.values(index.examples).flatMap((example) =>
            example.ports.map((port) => port.archive)
        )
        if (archives.some((path) => !/^[a-z0-9-]+\/[a-z0-9-]+\.asmproj$/.test(path))) {
            throw new Error('Invalid archive path in the examples index')
        }
        return ['index.json', ...archives]
    }
    return {
        name: 'asm-editor:examples',
        configResolved(config) {
            serverBuild = !!config.build.ssr
        },
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const path = (request.url ?? '').split('?')[0]
                if (!path.startsWith('/examples/')) return next()
                const name = path.slice('/examples/'.length)
                if (name !== 'index.json' && !/^[a-z0-9-]+\/[a-z0-9-]+\.asmproj$/.test(name))
                    return next()
                try {
                    if (!files().includes(name)) {
                        response.statusCode = 404
                        response.end()
                        return
                    }
                    response.setHeader(
                        'Content-Type',
                        name === 'index.json' ? 'application/json' : 'application/zip'
                    )
                    response.setHeader('Cache-Control', 'no-cache')
                    const stream = createReadStream(resolve(directory, name))
                    stream.on('error', next)
                    stream.pipe(response)
                } catch (error) {
                    next(error)
                }
            })
        },
        generateBundle() {
            if (serverBuild) return
            for (const name of files()) {
                this.emitFile({
                    type: 'asset',
                    fileName: `examples/${name}`,
                    source: readFileSync(resolve(directory, name))
                })
            }
        }
    }
}
