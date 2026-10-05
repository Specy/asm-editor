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

/** Kept in step with compilerPreset in src/lib/sourceCompilation/compilerExplorer.ts. */
export const TARGETS = {
    riscv32: {
        language: 'RISC-V',
        core: 'risc-v',
        width: 32,
        arch: 'riscv32',
        compilers: { c: 'rv32-cgcc1420', cpp: 'rv32-gcc1420' },
        flags: '-march=rv32imfd -mabi=ilp32d'
    },
    riscv64: {
        language: 'RISC-V-64',
        core: 'risc-v',
        width: 64,
        arch: 'riscv64',
        compilers: { c: 'rv64-cgcc1420', cpp: 'rv64-gcc1420' },
        flags: '-march=rv64imfd -mabi=lp64d'
    },
    mips: {
        language: 'MIPS',
        core: 'mips',
        width: 32,
        arch: 'mips',
        compilers: { c: 'cmipsg1420', cpp: 'mipsg1420' },
        // little-endian, as MARS memory is
        flags: '-march=mips32 -mabi=32 -mno-abicalls -fno-pic -G0 -fno-delayed-branch -mfp32 -mhard-float -EL'
    }
}

const LIBRARY_FLAGS =
    '-Os -g1 -fdiagnostics-color=never -fno-verbose-asm -ffreestanding -fno-builtin -fno-tree-loop-distribute-patterns -fno-stack-protector -fno-pie -fno-section-anchors -nostdinc -isystem sysroot/include -I src/internal'
const C_FLAGS = '-std=c17'
const CPP_FLAGS = '-std=c++17 -fno-exceptions -fno-rtti -fno-threadsafe-statics -nostdinc++'

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
const updateAbi = args.includes('--update-abi')
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
    const userArguments = `${LIBRARY_FLAGS} -iquote ${directory} -I arch ${settings.flags} ${language === 'cpp' ? CPP_FLAGS : C_FLAGS}`
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

const DEBUG_SECTION = /^\.(?:debug|zdebug|mdebug|note|comment|eh_frame)/
/** Labels GCC's MIPS output defines only for the debug sections, which are dropped. */
const MIPS_DEBUG_LABEL = /^\s*(?:\$L|\.L)(?:FB|FE|BB|BE|VL|text|etext|debug)\w*\s*(?::|=)/
/**
 * The editor's preparation of hosted compiler output (prepareAssembly in compilerExplorer.ts):
 * debug material out, every other section kept.
 */
function prepare(lines, target) {
    const text = []
    const map = []
    let debug = false
    for (const line of lines) {
        const code = line.text
        const section = /^\s*\.section\s+(?:"([^"]+)"|([^\s,]+))/.exec(code)?.slice(1).find(Boolean)
        if (section) debug = DEBUG_SECTION.test(section)
        else if (/^\s*\.(?:text|data|bss|sdata|sbss|rodata|rdata)\b/.test(code)) debug = false
        else if (debug && /^\s*\.previous\b/.test(code)) {
            // Back to the section before the debug one, which is where the lines after belong.
            debug = false
            continue
        }
        if (
            debug ||
            /^\s*\.(?:file|loc|cfi_\w+|ident)\b/.test(code) ||
            (TARGETS[target].core === 'mips' && MIPS_DEBUG_LABEL.test(code)) ||
            /^\s*#/.test(code) ||
            !code.trim()
        )
            continue
        text.push(code)
        const source = line.source
        map.push(
            source &&
                (source.file === null || source.file === undefined || source.mainsource) &&
                Number.isSafeInteger(source.line) &&
                source.line > 0
                ? source.line - 1
                : null
        )
    }
    return { text: text.join('\n') + '\n', map }
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
    const resolveWeak = ['__cxa_pure_virtual', '__cxa_deleted_virtual'].filter(
        (name) => index[name]
    )
    return {
        abi: ABI,
        target,
        compiler: settings.compilers.c,
        members,
        index,
        resolveWeak,
        memberSources
    }
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

function checkAbi(baseline, current) {
    const problems = []
    for (const name of baseline.exported ?? [])
        if (!current.exported.includes(name)) problems.push(`removed export ${name}`)
    for (const [target, table] of Object.entries(baseline.layouts ?? {}))
        for (const [name, value] of Object.entries(table))
            if (current.layouts[target]?.[name] !== value)
                problems.push(
                    `${target}: ${name} was ${value}, now ${current.layouts[target]?.[name]}`
                )
    return problems
}

async function main() {
    mkdirSync(output, { recursive: true })
    const functions = documentedFunctions()
    const exported = new Set(functions.map((entry) => entry.name))
    const layoutTables = {}
    for (const target of targets) {
        if (!TARGETS[target]) throw new Error(`Unknown target ${target}`)
        console.log(`Building ${target}`)
        const library = await buildTarget(target, functions)
        // Globals no header declares as a function but programs use: the streams and errno, and
        // bcmp, which Clang calls for memcmp
        for (const name of ['stdin', 'stdout', 'stderr', 'errno', 'bcmp'])
            if (library.index[name]) exported.add(name)
        if (dryRun) {
            console.log(`  ${Object.keys(library.members).length} members (dry run)`)
            for (const [path, text] of Object.entries(library.members))
                console.log(`  ${path}: ${text.split('\n').length} lines`)
            continue
        }
        writeFileSync(join(output, `${target}.json`), JSON.stringify(library))
        layoutTables[target] = await layouts(target)
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
    const current = { abi: ABI, exported: [...exported].sort(), layouts: layoutTables }
    const baselinePath = join(runtime, 'abi', `${ABI}.json`)
    if (existsSync(baselinePath) && !updateAbi) {
        const problems = checkAbi(JSON.parse(read(baselinePath)), current)
        if (problems.length)
            throw new Error(
                `Runtime ABI ${ABI} changed:\n  ${problems.join('\n  ')}\nA compatible change keeps every export and layout; record an intended new baseline with --update-abi only for additions.`
            )
    }
    if (!existsSync(baselinePath) || updateAbi) {
        const merged = existsSync(baselinePath)
            ? JSON.parse(read(baselinePath))
            : { abi: ABI, exported: [], layouts: {} }
        merged.exported = [...new Set([...merged.exported, ...current.exported])].sort()
        merged.layouts = { ...merged.layouts, ...current.layouts }
        mkdirSync(dirname(baselinePath), { recursive: true })
        writeFileSync(baselinePath, JSON.stringify(merged, null, 2) + '\n')
    }
    console.log(
        `Headers: ${Object.keys(headers).length} files, ${(headerBytes / 1024).toFixed(1)} KiB`
    )
}

main().catch((error) => {
    console.error(error.message ?? error)
    process.exit(1)
})
