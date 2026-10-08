#!/usr/bin/env node
// Builds the Runtime library for each Target through the Compiler driver's service (Compiler
// Explorer), so Library members come from the same compiler, version and flags as student code.
//
//   node scripts/runtime/build.mjs [--target riscv32,riscv64,mips] [--update-abi] [--offline]
//
// Every library source is compiled once per Target. Responses are cached under runtime/.cache by a
// hash of everything that affects them, so a rebuild only asks the service about changed sources;
// --offline fails instead of asking. The outputs are committed and the editor imports them:
//
//   src/lib/sourceRuntime/generated/<abi>/<target>.json  members, index, member C line maps
//   src/lib/sourceRuntime/generated/<abi>/functions.json public functions from the headers
//   src/lib/sourceRuntime/generated/<abi>/include.json   the headers, uploaded with every compile
//   src/lib/sourceRuntime/generated/<abi>/sources.json   the C sources, for reading a member's origin
//
// The build fails when a member does not parse as GNU compiler assembly, when two members define
// the same strong global, when a documented function has no member, or when the ABI changes
// against runtime/abi/<abi>.json (exported names removed or struct layouts changed) unless
// --update-abi records the new baseline.
import {
    RUNTIME_TARGETS,
    compilerLanguageFlags,
    prepareCompilerLines
} from '../../src/lib/sourceCompilation/compilerContract.mjs'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const runtime = join(repository, 'runtime')
const ABI = 'v1'
const API = 'https://godbolt.org/api'
const output = join(repository, 'src', 'lib', 'sourceRuntime', 'generated', ABI)
const cacheDirectory = join(runtime, '.cache')

export const TARGETS = RUNTIME_TARGETS

const LIBRARY_FLAGS =
    '-Os -g1 -fdiagnostics-color=never -fno-verbose-asm -ffreestanding -fno-builtin -fno-tree-loop-distribute-patterns -fno-stack-protector -fno-pie -fno-section-anchors -nostdinc -isystem sysroot/include -I src/internal'

const args = process.argv.slice(2)
const option = (name) => {
    const index = args.indexOf(name)
    return index === -1 ? undefined : args[index + 1]
}
const offline = args.includes('--offline')
// Development aids: build only the sources whose path contains this text, and write nothing.
const only = option('--only')
const dryRun = args.includes('--dry-run')
// While the library is still changing: write the assets but neither check nor record the ABI.
const skipAbi = args.includes('--skip-abi')
const abiOnly = args.includes('--abi-only')
const checkAssets = args.includes('--check-assets')
const updateAbi = args.includes('--update-abi')
const abiReport = option('--abi-report')
const targets = (option('--target') ?? Object.keys(TARGETS).join(',')).split(',')

function walk(directory, accept) {
    if (!existsSync(directory)) return []
    const found = []
    for (const name of readdirSync(directory).sort()) {
        const path = join(directory, name)
        if (statSync(path).isDirectory()) found.push(...walk(path, accept))
        else if (accept(path)) found.push(path)
    }
    return found
}
const posix = (path) => path.split('\\').join('/')
const read = (path) => readFileSync(path, 'utf8')
const sha = (text) => createHash('sha256').update(text).digest('hex')

/** Headers a compile can include: the public ones as system headers, the internal ones by name. */
function headerFiles(target) {
    const files = []
    for (const path of walk(join(runtime, 'include'), () => true))
        files.push({
            filename: `sysroot/include/${posix(relative(join(runtime, 'include'), path))}`,
            contents: read(path)
        })
    for (const path of walk(join(runtime, 'src'), (path) => /\.(h|inc)$/.test(path)))
        files.push({ filename: posix(relative(runtime, path)), contents: read(path) })
    const arch = join(runtime, 'arch', TARGETS[target].arch)
    for (const path of walk(arch, (path) => /\.(h|inc)$/.test(path)))
        files.push({ filename: `arch/${posix(relative(arch, path))}`, contents: read(path) })
    return files
}

let lastRequest = 0
async function compile(target, path, files) {
    const settings = TARGETS[target]
    const language = path.endsWith('.cpp') ? 'cpp' : 'c'
    const relativePath = posix(relative(runtime, path))
    const directory = posix(dirname(relativePath))
    const userArguments = `${LIBRARY_FLAGS} -iquote ${directory} -I arch ${settings.flags} ${compilerLanguageFlags(language)}`
    const body = {
        source: `#line 1 "${relativePath}"\n${read(path)}`,
        lang: language === 'cpp' ? 'c++' : 'c',
        options: {
            userArguments,
            filters: {
                binary: false,
                execute: false,
                labels: false,
                directives: false,
                commentOnly: false,
                trim: false,
                demangle: false,
                libraryCode: false
            }
        },
        files
    }
    const compilerId = settings.compilers[language]
    const json = JSON.stringify(body)
    const key = sha(`${compilerId}\n${json}`)
    const cached = join(cacheDirectory, target, `${key}.json`)
    if (existsSync(cached)) return { compilerId, response: JSON.parse(read(cached)) }
    if (offline)
        throw new Error(`${relativePath} is not cached for ${target} and --offline was given`)
    if (Buffer.byteLength(json) > 1024 * 1024)
        throw new Error(`${relativePath}: the request exceeds 1 MiB`)
    for (let attempt = 0; ; attempt++) {
        // One request at a time, a little apart: the service is shared and free.
        const wait = lastRequest + 250 - Date.now()
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
        lastRequest = Date.now()
        const reply = await fetch(`${API}/compiler/${compilerId}/compile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: json
        })
        if (reply.status === 429 || reply.status >= 500) {
            if (attempt >= 6) throw new Error(`${relativePath}: HTTP ${reply.status}`)
            await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt))
            continue
        }
        if (!reply.ok) throw new Error(`${relativePath}: HTTP ${reply.status}`)
        const response = await reply.json()
        mkdirSync(dirname(cached), { recursive: true })
        writeFileSync(cached, JSON.stringify(response))
        return { compilerId, response }
    }
}

function prepare(lines, target) {
    const prepared = prepareCompilerLines(lines, TARGETS[target].language)
    return {
        text: prepared.map((line) => line.text).join('\n') + '\n',
        map: prepared.map(({ index }) => {
            const source = lines[index].source
            return source &&
                (source.file == null || source.mainsource) &&
                Number.isSafeInteger(source.line) &&
                source.line > 0
                ? source.line - 1
                : null
        })
    }
}

function memberPath(path) {
    const relativePath = posix(relative(runtime, path))
    const inside = relativePath.startsWith('src/')
        ? relativePath.slice(4)
        : relativePath.replace(/^arch\/[^/]+\//, '')
    return `@runtime/${ABI}/${inside.replace(/\.(c|cpp|s|S)$/, '.s')}`
}

/** `/** doc *\/` immediately followed by a declaration: one entry per documented public function. */
function documentedFunctions() {
    const functions = []
    for (const path of walk(join(runtime, 'include'), (path) => path.endsWith('.h'))) {
        const header = posix(relative(join(runtime, 'include'), path))
        // Attributes are not part of what a declaration shows, and would read as its name.
        const text = read(path).replace(/__attribute__\s*\(\((?:[^()]|\([^()]*\))*\)\)\s*/g, '')
        const pattern =
            /\/\*\*\s*([^\n]*?)\s*\*\/[ \t]*\n[ \t]*((?:[^;{}#/]|\/(?!\*))*?\b([A-Za-z_]\w*)\s*\(([^;{}]*)\))[^;{}]*;/g
        for (const match of text.matchAll(pattern)) {
            const prototype = match[2]
                .replace(/\b__attribute__\s*\(\(.*?\)\)/g, '')
                // the headers' own attribute macros, such as __AED_PRINTF(1, 2)
                .replace(/\b__AED_[A-Z_]+\s*(?:\([^()]*\))?/g, '')
                .replace(/\b__builtin_va_list\b/g, 'va_list')
                .replace(/\b(?:_Noreturn|__restrict|restrict|extern)\b/g, '')
                .replace(/\s+/g, ' ')
                .replace(/\s*([(),*])\s*/g, (all, mark) =>
                    mark === ',' ? ', ' : mark === '*' ? ' *' : mark
                )
                .replace(/\( /g, '(')
                .replace(/ \*([A-Za-z_])/g, ' *$1')
                .trim()
            functions.push({
                name: match[3],
                header,
                prototype,
                doc: match[1].replace(/\s+/g, ' ').trim()
            })
        }
    }
    return functions
}

/** The Target's Core, reduced to reading a member's symbols the way a link will. */
async function analyzer(target) {
    const settings = TARGETS[target]
    if (settings.core === 'mips') {
        const dist = join(repository, 'emulators', 'mips', 'marsjs', 'ts', 'dist', 'index.mjs')
        const { MIPS } = await import(dist)
        return (path, text) => MIPS.analyzeGnuUnit(path, text)
    }
    const dist = join(repository, 'emulators', 'risc-v', 'rarsjs', 'ts', 'dist', 'index.mjs')
    const { RISCV } = await import(dist)
    return (path, text) => {
        RISCV.setIs64Bit(settings.width === 64)
        return RISCV.analyzeGnuUnit(path, text)
    }
}

function sources() {
    const files = walk(
        join(runtime, 'src'),
        (path) => /\.(c|cpp)$/.test(path) && (!only || posix(path).includes(only))
    )
    if (files.length === 0) throw new Error('runtime/src has no sources')
    return files
}

async function buildTarget(target, functions) {
    const settings = TARGETS[target]
    const files = headerFiles(target)
    const members = {}
    const memberSources = {}
    const definitions = new Map()
    const problems = []
    const analyze = await analyzer(target)
    const record = (path, text) => {
        const symbols = analyze(path, text)
        if (symbols.errors.length) problems.push(...symbols.errors)
        for (const name of symbols.defined) {
            const weak = symbols.weak.includes(name)
            const previous = definitions.get(name)
            if (previous && !previous.weak && !weak)
                problems.push(`${name} is defined by both ${previous.path} and ${path}`)
            if (!previous || (previous.weak && !weak)) definitions.set(name, { path, weak })
        }
    }
    let done = 0
    const all = sources()
    for (const path of all) {
        const { response } = await compile(target, path, files)
        const relativePath = posix(relative(runtime, path))
        if (response.code !== 0) {
            const messages = [...(response.stderr ?? []), ...(response.stdout ?? [])]
                .map((line) => line.text)
                .join('\n')
            problems.push(`${relativePath} (${target}) does not compile:\n${messages}`)
            continue
        }
        const prepared = prepare(response.asm, target)
        const member = memberPath(path)
        if (members[member]) throw new Error(`Two sources make the member ${member}`)
        members[member] = prepared.text
        memberSources[member] = { source: relativePath, lines: prepared.map }
        record(member, prepared.text)
        done += 1
        if (done % 25 === 0) console.log(`  ${target}: ${done}/${all.length}`)
    }
    // Startup code is written as GNU assembly for each Target.
    const crt0 = walk(join(runtime, 'arch', settings.arch), (path) => /crt0\.s$/.test(path))
    if (crt0.length !== 1) problems.push(`arch/${settings.arch} must have exactly one crt0.s`)
    for (const path of crt0) {
        const member = `@runtime/${ABI}/crt0.s`
        members[member] = read(path)
        record(member, members[member])
    }
    if (!only)
        for (const entry of functions)
            if (!definitions.has(entry.name))
                problems.push(`${entry.header} documents ${entry.name}, which no member defines`)
    if (problems.length) throw new Error(`${target}:\n  ${problems.join('\n  ')}`)
    const index = Object.fromEntries(
        [...definitions]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([name, { path }]) => [name, path])
    )
    // GCC refers to these weakly from vtables, so only the library saying it supplies them pulls
    // their member.
    const resolveWeak = ['__cxa_pure_virtual', '__cxa_deleted_virtual', '__stdio_exit'].filter(
        (name) => index[name]
    )
    return {
        abi: ABI,
        target,
        inputsDigest: inputsDigest(target),
        compiler: settings.compilers.c,
        members,
        index,
        resolveWeak,
        memberSources
    }
}

function inputsDigest(target) {
    const settings = TARGETS[target]
    return sha(
        JSON.stringify({
            compilers: settings.compilers,
            flags: settings.flags,
            libraryFlags: LIBRARY_FLAGS,
            compilerContract: sha(
                read(join(repository, 'src/lib/sourceCompilation/compilerContract.mjs'))
            ),
            files: headerFiles(target),
            sources: sources().map((path) => [posix(relative(runtime, path)), read(path)]),
            crt0: read(join(runtime, 'arch', settings.arch, 'crt0.s'))
        })
    )
}

/** Sizes and offsets of the public structs, read back from a compiled table. */
async function layouts(target) {
    const path = join(runtime, 'abi', 'layout.c')
    if (!existsSync(path)) return {}
    const { response } = await compile(target, path, headerFiles(target))
    if (response.code !== 0) throw new Error(`runtime/abi/layout.c does not compile for ${target}`)
    // The table's own values: the lines after its label, up to the first that is not one.
    const values = []
    const start = response.asm.findIndex((line) => /^\s*__aed_layout:/.test(line.text))
    for (const line of response.asm.slice(start + 1)) {
        const match = /^\s*\.(word|dword|quad|4byte|8byte)\s+(-?\d+)\s*$/.exec(line.text)
        if (!match) break
        values.push(Number(match[2]))
    }
    // Each LAYOUT(...) entry's text, with its parentheses balanced, names its value.
    const names = []
    const source = read(path)
    for (let at = source.indexOf('LAYOUT('); at !== -1; at = source.indexOf('LAYOUT(', at + 1)) {
        let depth = 0
        let end = at + 'LAYOUT'.length
        do {
            if (source[end] === '(') depth++
            if (source[end] === ')') depth--
            end++
        } while (depth > 0 && end < source.length)
        names.push(
            source
                .slice(at + 'LAYOUT('.length, end - 1)
                .replace(/\s+/g, ' ')
                .trim()
        )
    }
    if (names.length !== values.length)
        throw new Error(
            `layout.c: ${names.length} entries but ${values.length} values for ${target}`
        )
    return Object.fromEntries(names.map((name, i) => [name, values[i]]))
}

const COMPILER_SUPPORT =
    /^(?:_Z(?:n[aw]|d[la])|__cxa_|__dso_handle$|__(?:u?(?:div|mod)di3|(?:ashl|ashr|lshr)di3|(?:mul|div)(?:sc|dc)3|(?:clz|ctz|popcount|parity|cmp|ucmp)di2)$)/

async function requiredSymbols(target, library, functions) {
    const required = new Set([
        ...functions.map((entry) => entry.name),
        'stdin',
        'stdout',
        'stderr',
        'errno',
        'bcmp',
        '_start'
    ])
    // Corpus caches are optional in CI; previously protected names must still be provided.
    const baselinePath = join(runtime, 'abi', `${ABI}.json`)
    const protectedNames = existsSync(baselinePath)
        ? JSON.parse(read(baselinePath)).exported?.[target]
        : undefined
    if (Array.isArray(protectedNames)) for (const name of protectedNames) required.add(name)
    const support = new Set(JSON.parse(read(join(runtime, 'abi', 'compiler-support.json'))))
    for (const name of Object.keys(library.index))
        if (COMPILER_SUPPORT.test(name) || support.has(name)) required.add(name)
    const analyze = await analyzer(target)
    const seen = new Set()
    for (const path of walk(join(cacheDirectory, 'corpus', target), (path) =>
        path.endsWith('.json')
    )) {
        const response = JSON.parse(read(path))
        if (response.code !== 0 || !response.asm?.length) continue
        const text = prepare(response.asm, target).text
        const key = sha(text)
        if (seen.has(key)) continue
        seen.add(key)
        const symbols = analyze(path, text)
        if (symbols.errors.length) continue
        for (const name of symbols.references) {
            if (name.startsWith('__aed_')) continue
            // Corpus sources can deliberately reference symbols they define in another unit.
            if (library.index[name]) required.add(name)
        }
    }
    for (const name of required)
        if (!library.index[name])
            throw new Error(`${target}: required ABI symbol ${name} is not provided`)
    return [...required].sort()
}

async function signatures(target, functions) {
    const includes = walk(join(runtime, 'include'), (path) => path.endsWith('.h')).map((path) =>
        posix(relative(join(runtime, 'include'), path))
    )
    const source =
        includes.map((header) => `#include <${header}>`).join('\n') +
        '\n' +
        functions
            .map(({ name, prototype }) => {
                const type = prototype.replace(new RegExp(`\\b${name}\\s*\\(`), '(')
                const template = `__aed_sig_${name}`
                return `using __aed_type_${name} = ${type};\ntemplate<class T> __attribute__((used,noinline)) void ${template}(T *) {}\nvoid __aed_use_${name}() { ${template}(static_cast<__aed_type_${name} *>(&${name})); }`
            })
            .join('\n')
    const path = join(runtime, 'abi', 'signatures.cpp')
    writeFileSync(path, source + '\n')
    const { response } = await compile(target, path, headerFiles(target))
    if (response.code !== 0)
        throw new Error(
            `${target}: signature probe failed:\n${(response.stderr ?? []).map((line) => line.text).join('\n')}`
        )
    const labels = response.asm
        .map((line) => /^\s*(_Z[^: ]+):/.exec(line.text)?.[1])
        .filter(Boolean)
    return Object.fromEntries(
        functions.map(({ name }) => {
            const template = `__aed_sig_${name}`
            const prefix = `_Z${template.length}${template}I`
            const matches = labels.filter((label) => label.startsWith(prefix))
            if (matches.length !== 1)
                throw new Error(
                    `${target}: expected one signature for ${name}, found ${matches.length}`
                )
            return [name, matches[0]]
        })
    )
}

export function checkAbi(baseline, current) {
    const problems = []
    for (const [target, names] of Object.entries(baseline.exported ?? {}))
        for (const name of names)
            if (!current.exported[target]?.includes(name))
                problems.push(`${target}: removed export ${name}`)
    for (const section of ['layouts', 'signatures'])
        for (const [target, table] of Object.entries(baseline[section] ?? {}))
            for (const [name, value] of Object.entries(table))
                if (current[section][target]?.[name] !== value)
                    problems.push(
                        `${target}: ${section} ${name} was ${value}, now ${current[section][target]?.[name]}`
                    )
    return problems
}

async function main() {
    mkdirSync(output, { recursive: true })
    const functions = documentedFunctions()
    const exported = {}
    const signatureTables = {}
    const layoutTables = {}
    for (const target of targets) {
        if (!TARGETS[target]) throw new Error(`Unknown target ${target}`)
        console.log(`Building ${target}`)
        const library = abiOnly
            ? JSON.parse(read(join(output, `${target}.json`)))
            : await buildTarget(target, functions)
        if (checkAssets && library.inputsDigest !== inputsDigest(target))
            throw new Error(
                `${target}: generated library does not match runtime sources; rebuild it`
            )
        if (dryRun) {
            console.log(`  ${Object.keys(library.members).length} members (dry run)`)
            for (const [path, text] of Object.entries(library.members))
                console.log(`  ${path}: ${text.split('\n').length} lines`)
            continue
        }
        writeFileSync(join(output, `${target}.json`), JSON.stringify(library))
        layoutTables[target] = await layouts(target)
        if (!skipAbi) {
            exported[target] = await requiredSymbols(target, library, functions)
            signatureTables[target] = await signatures(target, functions)
        }
        console.log(
            `  ${Object.keys(library.members).length} members, ${Object.keys(library.index).length} indexed globals`
        )
    }
    if (dryRun) return
    const headers = Object.fromEntries(
        walk(join(runtime, 'include'), () => true).map((path) => [
            posix(relative(join(runtime, 'include'), path)),
            read(path)
        ])
    )
    const headerBytes = Object.values(headers).reduce(
        (sum, text) => sum + Buffer.byteLength(text),
        0
    )
    writeFileSync(join(output, 'include.json'), JSON.stringify(headers))
    writeFileSync(
        join(output, 'functions.json'),
        JSON.stringify({
            abi: ABI,
            functions: functions.sort((a, b) => (a.name < b.name ? -1 : 1))
        })
    )
    const cSources = Object.fromEntries([
        ...sources().map((path) => [posix(relative(runtime, path)), read(path)]),
        ...walk(join(runtime, 'src'), (path) => /\.(h|inc)$/.test(path)).map((path) => [
            posix(relative(runtime, path)),
            read(path)
        ])
    ])
    writeFileSync(join(output, 'sources.json'), JSON.stringify(cSources))
    if (skipAbi) return
    const current = { abi: ABI, exported, signatures: signatureTables, layouts: layoutTables }
    if (abiReport) {
        writeFileSync(abiReport, JSON.stringify(current, null, 2) + '\n')
        return
    }
    const baselinePath = join(runtime, 'abi', `${ABI}.json`)
    if (existsSync(baselinePath) && !updateAbi) {
        const problems = checkAbi(JSON.parse(read(baselinePath)), current)
        if (problems.length)
            throw new Error(
                `Runtime ABI ${ABI} changed:\n  ${problems.join('\n  ')}\nA compatible change keeps every export and layout; record an intended new baseline with --update-abi only for additions.`
            )
    }
    if (!existsSync(baselinePath) || updateAbi) {
        if (targets.length !== Object.keys(TARGETS).length)
            throw new Error('--update-abi must build every target')
        mkdirSync(dirname(baselinePath), { recursive: true })
        writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n')
    }
    console.log(
        `Headers: ${Object.keys(headers).length} files, ${(headerBytes / 1024).toFixed(1)} KiB`
    )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
    main().catch((error) => {
        console.error(error.message ?? error)
        process.exit(1)
    })
