import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../../examples/', import.meta.url)
const index = JSON.parse(readFileSync(new URL('dist/index.json', root), 'utf8')) as {
    examples: Record<string, { path: string }>
}

/** Source locations for tests and measurements, including examples with several ports. */
export function exampleSourcePath(path: string): string {
    const [isa, first, ...rest] = path.split('/')
    if (isa === 'm68k' && first === 'easy68k') {
        return fileURLToPath(new URL(`./languages/M68K/easy68k/${rest.join('/')}`, import.meta.url))
    }
    const id = rest.length ? first : first.replace(/\.[^.]+$/, '')
    const example = index.examples[id]
    if (!example) throw new Error(`Unknown example source: ${path}`)
    const source = rest.length ? rest.join('/') : first
    const port = example.path.startsWith('shared/') ? `${isa}/` : ''
    return fileURLToPath(new URL(`${example.path}/${port}${source}`, root))
}

export function readExample(path: string): string {
    return readFileSync(exampleSourcePath(path), 'utf8')
}
