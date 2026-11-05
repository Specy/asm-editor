// Checks the Markdown twins of a built site (ADR 0077), run after `vp build`:
// - every page that names a twin in its head (`<link rel="alternate" type="text/markdown">`) has
//   that file, and every page beside a twin of its own names it;
// - every link in a twin or an `llms` file is absolute and, when it is on this site, reaches a
//   built twin, page or file.
// Usage: node scripts/twins-check.mjs [build directory]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = 'https://asm-editor.specy.app'
const root = process.argv[2] ?? fileURLToPath(new URL('../../../build/', import.meta.url))

function walk(directory, out = []) {
    for (const name of readdirSync(directory)) {
        const path = join(directory, name)
        if (statSync(path).isDirectory()) walk(path, out)
        else out.push(path)
    }
    return out
}

/** The built file a pathname of this site is served from, as adapter-static writes it. */
function served(pathname) {
    const path = decodeURIComponent(pathname).replace(/\/+$/, '') || '/'
    const candidates =
        path === '/'
            ? ['index.html']
            : [path.slice(1), `${path.slice(1)}.html`, `${path.slice(1)}/index.html`]
    return candidates.some((candidate) => {
        const file = join(root, candidate)
        return existsSync(file) && statSync(file).isFile()
    })
}

/** The page's pathname of a built `.html` file. */
function pagePathname(file) {
    const path = `/${relative(root, file).split(sep).join('/')}`
    if (path === '/index.html') return '/'
    return path.replace(/\/index\.html$/, '').replace(/\.html$/, '')
}

/** Markdown without its code, where a `](` is an example rather than a link. */
function prose(markdown) {
    return markdown
        .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, '')
        .replace(/`[^`\n]*`/g, '')
}

const problems = []
const files = walk(root)
const twins = new Set(
    files
        .filter((file) => file.endsWith('.md'))
        .map((file) => `/${relative(root, file).split(sep).join('/')}`)
)
const texts = files.filter((file) => /(^|[/\\])llms(-full)?\.txt$/.test(file))

for (const file of files.filter((file) => file.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8')
    const pathname = pagePathname(file)
    const named = /<link rel="alternate" type="text\/markdown" href="([^"]+)"/.exec(html)?.[1]
    if (named) {
        if (!named.startsWith(`${SITE}/`))
            problems.push(`${pathname}: twin link ${named} is not on ${SITE}`)
        else if (!twins.has(named.slice(SITE.length)))
            problems.push(`${pathname}: names ${named}, which was not built`)
    } else if (twins.has(`${pathname}.md`) && !/http-equiv="refresh"/.test(html)) {
        problems.push(`${pathname}: has a twin but its head does not name it`)
    }
}

let links = 0
for (const file of [...files.filter((file) => file.endsWith('.md')), ...texts]) {
    const where = `/${relative(root, file).split(sep).join('/')}`
    const text = prose(readFileSync(file, 'utf8'))
    const urls = [
        ...[...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]),
        ...[...text.matchAll(/^\[[^\]]+\]:\s+(\S+)/gm)].map((match) => match[1]),
        ...[...text.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]),
        ...[...text.matchAll(/(?<![("])https:\/\/asm-editor\.specy\.app[^\s)>"'`]*/g)].map(
            (match) => match[0].replace(/[.,;:]+$/, '')
        )
    ]
    for (const url of urls) {
        links++
        if (/^(mailto|data|tel):/.test(url)) continue
        if (!/^https?:\/\//.test(url)) {
            problems.push(`${where}: relative link ${url}`)
            continue
        }
        if (!url.startsWith(`${SITE}/`) && url !== SITE) continue
        const { pathname } = new URL(url)
        if (!served(pathname)) problems.push(`${where}: ${url} reaches nothing that was built`)
    }
}

if (twins.size === 0) problems.push(`no twins in ${root}`)
for (const problem of problems.slice(0, 200)) console.error(problem)
if (problems.length > 200) console.error(`… and ${problems.length - 200} more`)
console.log(
    `${twins.size} twins, ${texts.length} llms files, ${links} links checked, ${problems.length} problems`
)
process.exit(problems.length ? 1 : 0)
