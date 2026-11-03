#!/usr/bin/env node
// Builds the Runtime library for each Target through the Compiler driver's service (Compiler
// Explorer), so Library members come from the same compiler, version and flags as student code.
//
//   node scripts/build.mjs [--target riscv32,riscv64,mips,x86_64] [--update-abi] [--offline] [--plan]
//
// Every library source is compiled once per Target. Responses are cached under .cache by a hash of
// everything that affects them, so a rebuild only asks the service about changed sources; --offline
// fails instead of asking, and --plan lists what a build would ask, asking and writing nothing. A
// member is taken from the committed library instead when nothing it reads has changed since: its
// source and the headers it includes, against the copies the committed assets hold, with the flags,
// the compilers and everything else the assets do not hold checked by the library's digests. So a
// clone without the cache asks only about the members a change reaches; --rebuild compiles
// everything. The outputs are committed and the editor imports them:
//
//   generated/<abi>/<target>.json  members, index, member C line maps
//   generated/<abi>/functions.json public functions from the headers, posix/'s marked with targets
//   generated/<abi>/include.json   the headers, uploaded with every compile
//   generated/<abi>/sources.json   the C sources, for reading a member's origin
//
//   generated/<abi>/posix-include.json  MIPS and RISC-V's own headers, searched before the others
//
// MIPS and RISC-V also build posix/: their own headers (<dirent.h>, <sys/stat.h>, <unistd.h>, and
// the <errno.h> and <stdio.h> that add to the shared ones through #include_next) and the members
// over the folder calls. Only those members' requests upload posix/, so a change there leaves every
// other member's request, and its cached answer, as it was.
//
// The build fails when a member does not parse as GNU compiler assembly, when two members define
// the same strong global, when a documented function has no member, or when the ABI changes
// against abi/<abi>.json (exported names removed or struct layouts changed) unless
// --update-abi records the new baseline.
import {
    RUNTIME_TARGETS,
    compilerLanguageFlags,
    prepareCompilerLines
} from '../lib/compilerContract.mjs'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { includeClosure } from './includes.mjs'
import { analyzeX86, prepareX86 } from './x86.mjs'

const runtime = join(dirname(fileURLToPath(import.meta.url)), '..')
const ABI = 'v1'
const API = 'https://godbolt.org/api'
const output = join(runtime, 'generated', ABI)
const cacheDirectory = join(runtime, '.cache')

export const TARGETS = RUNTIME_TARGETS

const LIBRARY_FLAGS =
    '-Os -g1 -fdiagnostics-color=never -fno-verbose-asm -ffreestanding -fno-builtin -fno-tree-loop-distribute-patterns -fno-stack-protector -fno-pie -fno-section-anchors -nostdinc -isystem sysroot/include -I src/internal'
/** Where posix/include is uploaded: searched before the shared headers, as x86's own are. */
export const POSIX_SYSROOT_INCLUDE = 'sysroot/posix/include'
/** A posix/ member's flags: LIBRARY_FLAGS with its own headers first and its internal ones. */
const POSIX_LIBRARY_FLAGS = LIBRARY_FLAGS.replace(
    '-isystem sysroot/include',
    `-isystem ${POSIX_SYSROOT_INCLUDE} -isystem sysroot/include`
).replace('-I src/internal', '-I src/internal -I posix/src/internal')

const args = process.argv.slice(2)
const option = (name) => {
    const index = args.indexOf(name)
    return index === -1 ? undefined : args[index + 1]
}
const offline = args.includes('--offline')
// Development aids: build only the sources whose path contains this text, and write nothing.
const only = option('--only')
const dryRun = args.includes('--dry-run')
// Lists every request the build would send to the service, the probes' included, and stops there:
// nothing is sent and nothing is written.
const plan = args.includes('--plan')
// While the library is still changing: write the assets but neither check nor record the ABI.
const skipAbi = args.includes('--skip-abi')
const abiOnly = args.includes('--abi-only')
const checkAssets = args.includes('--check-assets')
const updateAbi = args.includes('--update-abi')
const abiReport = option('--abi-report')
// Compiles every member, where a member whose inputs have not changed since the committed library
// was built is otherwise taken from it.
const rebuild = args.includes('--rebuild')
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

/** Whether a Target builds posix/, the folder calls' headers and members: MIPS and RISC-V. */
const hasPosix = (target) => TARGETS[target].core !== 'x86'
const isPosixSource = (path) => posix(relative(runtime, path)).startsWith('posix/')
/** The Targets posix/'s functions exist on, as functions.json names them. */
const POSIX_TARGETS = Object.keys(TARGETS).filter(hasPosix)
/** Whether a documented function exists on a Target: posix/'s only on MIPS and RISC-V. */
const availableOn = (entry, target) => !entry.targets || entry.targets.includes(target)

/** posix/'s public headers, keyed by their path under its include directory. */
function posixHeaders() {
    const include = join(runtime, 'posix', 'include')
    return Object.fromEntries(
        walk(include, () => true).map((path) => [posix(relative(include, path)), read(path)])
    )
}

/** What a posix/ member's request uploads besides `headerFiles`: posix/'s headers, public and internal. */
function posixFiles() {
    return [
        ...Object.entries(posixHeaders()).map(([path, contents]) => ({
            filename: `${POSIX_SYSROOT_INCLUDE}/${path}`,
            contents
        })),
        ...walk(join(runtime, 'posix', 'src'), (path) => /\.(h|inc)$/.test(path)).map((path) => ({
            filename: posix(relative(runtime, path)),
            contents: read(path)
        }))
    ]
}

/**
 * What the library is built from, as the committed assets recorded it when they were written:
 * include.json, posix-include.json and sources.json hold the headers and sources as they were, and
 * the architecture headers, which no asset holds, are read from disk. The digests below, computed
 * over these copies, equal the committed library's only if every input really is what that library
 * was built from, the flags, compilers and architecture headers included. Undefined when an asset
 * is missing.
 */
function recordedInputs(target) {
    const asset = (name) =>
        existsSync(join(output, name)) ? JSON.parse(read(join(output, name))) : undefined
    const include = asset('include.json')
    const posixInclude = asset('posix-include.json')
    const recorded = asset('sources.json')
    if (!include || !posixInclude || !recorded) return undefined
    const arch = join(runtime, 'arch', TARGETS[target].arch)
    const entries = Object.entries(recorded)
    const internal = (prefix) =>
        entries
            .filter(([path]) => path.startsWith(prefix) && /\.(h|inc)$/.test(path))
            .map(([filename, contents]) => ({ filename, contents }))
    return {
        headers: [
            ...Object.entries(include).map(([path, contents]) => ({
                filename: `sysroot/include/${path}`,
                contents
            })),
            ...internal('src/'),
            ...walk(arch, (path) => /\.(h|inc)$/.test(path)).map((path) => ({
                filename: `arch/${posix(relative(arch, path))}`,
                contents: read(path)
            }))
        ],
        posix: [
            ...Object.entries(posixInclude).map(([path, contents]) => ({
                filename: `${POSIX_SYSROOT_INCLUDE}/${path}`,
                contents
            })),
            ...internal('posix/src/')
        ],
        sources: entries.filter(
            ([path]) => /\.(c|cpp)$/.test(path) && (!path.startsWith('posix/') || hasPosix(target))
        )
    }
}

/** The same inputs as they are on disk now. */
function diskInputs(target) {
    return {
        headers: headerFiles(target),
        posix: posixFiles(),
        sources: sources(target).map((path) => [posix(relative(runtime, path)), read(path)])
    }
}

/** Whether a member reads the same text in both sets of inputs: its source and every header it reaches. */
function readsTheSame(relativePath, before, now) {
    const own = relativePath.startsWith('posix/')
    const directories = [
        posix(dirname(relativePath)),
        ...(own ? [POSIX_SYSROOT_INCLUDE] : []),
        'sysroot/include',
        'src/internal',
        ...(own ? ['posix/src/internal'] : []),
        'arch'
    ]
    const closure = (inputs) => {
        const source = inputs.sources.find(([path]) => path === relativePath)?.[1]
        if (source === undefined) return undefined
        const files = new Map(
            [...inputs.headers, ...(own ? inputs.posix : [])].map((file) => [
                file.filename,
                file.contents
            ])
        )
        return includeClosure(relativePath, source, files, directories)
    }
    const a = closure(before)
    const b = closure(now)
    if (!a || !b || a.size !== b.size) return false
    for (const [name, text] of a) if (b.get(name) !== text) return false
    return true
}

/** A request the build would send, which --plan lists instead. */
class Planned extends Error {}
const planned = []

let lastRequest = 0
/**
 * Compiles one file for a Target, from the cache when it holds the answer. A posix/ source, or a
 * probe given `posix`, is compiled with posix/'s headers searched first; `source` replaces the
 * file's text, for a probe generated in memory.
 */
async function compile(target, path, files, options = {}) {
    const settings = TARGETS[target]
    const language = path.endsWith('.cpp') ? 'cpp' : 'c'
    const relativePath = posix(relative(runtime, path))
    const directory = posix(dirname(relativePath))
    //posix/ members alone see posix/, so no other member's request changes with it
    const own = options.posix ?? isPosixSource(path)
    if (own) files = [...files, ...posixFiles()]
    const userArguments = `${own ? POSIX_LIBRARY_FLAGS : LIBRARY_FLAGS} -iquote ${directory} -I arch ${settings.flags} ${compilerLanguageFlags(language)}`
    const body = {
        source: `#line 1 "${relativePath}"\n${options.source ?? read(path)}`,
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
    if (plan) {
        planned.push(`${target} ${relativePath}`)
        throw new Planned()
    }
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

/**
 * A member's text, and each of its lines' zero-based line in `sourceFile`. The compile names the
 * source with `#line 1 "<sourceFile>"`, so Compiler Explorer reports its lines under that name,
 * never as the main source; lines from a header (an inlined function) map to nothing.
 */
function prepare(lines, target, sourceFile) {
    if (TARGETS[target].core === 'x86') return prepareX86(lines, sourceFile)
    const prepared = prepareCompilerLines(lines, TARGETS[target].language)
    return {
        text: prepared.map((line) => line.text).join('\n') + '\n',
        map: prepared.map(({ index }) => {
            const source = lines[index].source
            return source?.file === sourceFile &&
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
        : relativePath.startsWith('posix/src/')
          ? relativePath.slice('posix/src/'.length)
          : relativePath.replace(/^arch\/[^/]+\//, '')
    return `@runtime/${ABI}/${inside.replace(/\.(c|cpp|s|S)$/, '.s')}`
}

/**
 * `/** doc *\/` immediately followed by a declaration: one entry per documented public function,
 * from the shared headers and from posix/'s, whose entries name the Targets they exist on.
 */
function documentedFunctions() {
    return [
        ...headerFunctions(join(runtime, 'include')),
        ...headerFunctions(join(runtime, 'posix', 'include')).map((entry) => ({
            ...entry,
            targets: POSIX_TARGETS
        }))
    ]
}

function headerFunctions(include) {
    const functions = []
    for (const path of walk(include, (path) => path.endsWith('.h'))) {
        const header = posix(relative(include, path))
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
    if (settings.core === 'x86') return analyzeX86
    if (settings.core === 'mips') {
        const { MIPS } = await import('@specy/mips/dist/index.mjs')
        return (path, text) => MIPS.analyzeGnuUnit(path, text)
    }
    const { RISCV } = await import('@specy/risc-v/dist/index.mjs')
    return (path, text) => {
        RISCV.setIs64Bit(settings.width === 64)
        return RISCV.analyzeGnuUnit(path, text)
    }
}

/** The library's sources, posix/'s included for a Target that builds it, or every Target's with none. */
function sources(target) {
    const accept = (path) => /\.(c|cpp)$/.test(path) && (!only || posix(path).includes(only))
    const files = [
        ...walk(join(runtime, 'src'), accept),
        ...(target === undefined || hasPosix(target)
            ? walk(join(runtime, 'posix', 'src'), accept)
            : [])
    ]
    if (files.length === 0) throw new Error('src has no sources')
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
    let reused = 0
    const all = sources(target)
    const builtPath = join(output, `${target}.json`)
    const built = existsSync(builtPath) ? JSON.parse(read(builtPath)) : undefined
    const unchanged = unchangedParts(built, target)
    const now = diskInputs(target)
    for (const path of all) {
        const relativePath = posix(relative(runtime, path))
        const member = memberPath(path)
        const before = unchanged[isPosixSource(path) ? 'posix' : 'shared'] ? built : undefined
        if (
            before?.members[member] !== undefined &&
            before.memberSources[member]?.source === relativePath &&
            readsTheSame(relativePath, unchanged.recorded, now)
        ) {
            if (members[member]) throw new Error(`Two sources make the member ${member}`)
            members[member] = before.members[member]
            memberSources[member] = before.memberSources[member]
            record(member, members[member])
            reused += 1
            continue
        }
        let response
        try {
            ;({ response } = await compile(target, path, files))
        } catch (error) {
            if (error instanceof Planned) continue
            throw error
        }
        if (response.code !== 0) {
            const messages = [...(response.stderr ?? []), ...(response.stdout ?? [])]
                .map((line) => line.text)
                .join('\n')
            problems.push(`${relativePath} (${target}) does not compile:\n${messages}`)
            continue
        }
        const prepared = prepare(response.asm, target, relativePath)
        if (members[member]) throw new Error(`Two sources make the member ${member}`)
        members[member] = prepared.text
        memberSources[member] = { source: relativePath, lines: prepared.map }
        record(member, prepared.text)
        done += 1
        if (done % 25 === 0) console.log(`  ${target}: ${done}/${all.length - reused}`)
    }
    if (reused) console.log(`  ${target}: ${reused} members unchanged since the last build`)
    if (plan) return undefined
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
            if (availableOn(entry, target) && !definitions.has(entry.name))
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
        inputsDigest: inputsDigest(target, now),
        ...(hasPosix(target) ? { sharedDigest: sharedDigest(target, now) } : {}),
        compiler: settings.compilers.c,
        members,
        index,
        resolveWeak,
        memberSources
    }
}

/**
 * The digest of everything src/'s members are built from, `inputs` (diskInputs or recordedInputs)
 * with the rest read from disk: the whole library's for x86, and what a MIPS or RISC-V library's was
 * before posix/ existed, so libraries built then still match it.
 */
function sharedDigest(target, inputs) {
    const settings = TARGETS[target]
    return sha(
        JSON.stringify({
            compilers: settings.compilers,
            flags: settings.flags,
            libraryFlags: LIBRARY_FLAGS,
            compilerContract: sha(read(join(runtime, 'lib', 'compilerContract.mjs'))),
            files: inputs.headers,
            sources: inputs.sources.filter(([path]) => !path.startsWith('posix/')),
            crt0: read(join(runtime, 'arch', settings.arch, 'crt0.s'))
        })
    )
}

/** The digest of what posix/'s members are built from, beside the shared one. */
function posixDigest(target, inputs) {
    return sha(
        JSON.stringify({
            shared: sharedDigest(target, inputs),
            libraryFlags: POSIX_LIBRARY_FLAGS,
            posix: inputs.posix,
            sources: inputs.sources.filter(([path]) => path.startsWith('posix/'))
        })
    )
}

/** Everything the library is built from: x86's is the shared digest alone. */
function inputsDigest(target, inputs) {
    return hasPosix(target) ? posixDigest(target, inputs) : sharedDigest(target, inputs)
}

/**
 * Which parts of the library built before, generated/<abi>/<target>.json, the committed assets
 * describe: when a part's digest over the assets' copies of the headers and sources equals the one
 * the library recorded, those copies are exactly what the part was built from, and every input the
 * assets do not hold is unchanged since. A member of such a part whose source and headers read the
 * same now (`readsTheSame`) is what compiling it again would give, so the build takes it from the
 * library instead of asking the service. A library built before posix/ existed has only the shared
 * digest, as its inputsDigest.
 */
function unchangedParts(built, target) {
    const recorded = built && !rebuild ? recordedInputs(target) : undefined
    if (!recorded) return { shared: false, posix: false }
    return {
        recorded,
        shared: (built.sharedDigest ?? built.inputsDigest) === sharedDigest(target, recorded),
        posix: hasPosix(target) && built.inputsDigest === posixDigest(target, recorded)
    }
}

/**
 * Sizes and offsets of the public structs, read back from compiled tables: abi/layout.c's for every
 * Target, and on MIPS and RISC-V abi/posix-layout.c's, over posix/'s headers. Both go in one table.
 */
async function layouts(target) {
    const shared = await layoutTable(target, 'layout.c', '__aed_layout')
    if (!hasPosix(target)) return shared
    const own = await layoutTable(target, 'posix-layout.c', '__aed_posix_layout', { posix: true })
    for (const name of Object.keys(own))
        if (name in shared) throw new Error(`abi/posix-layout.c repeats ${name} from layout.c`)
    return { ...shared, ...own }
}

async function layoutTable(target, file, label, options) {
    const path = join(runtime, 'abi', file)
    if (!existsSync(path)) return {}
    const { response } = await compile(target, path, headerFiles(target), options)
    if (response.code !== 0) throw new Error(`abi/${file} does not compile for ${target}`)
    // The table's own values: the lines after its label, up to the first that is not one.
    const values = []
    const start = response.asm.findIndex((line) => new RegExp(`^\\s*${label}:`).test(line.text))
    if (start === -1) throw new Error(`abi/${file} has no ${label} for ${target}`)
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
            `${file}: ${names.length} entries but ${values.length} values for ${target}`
        )
    return Object.fromEntries(names.map((name, i) => [name, values[i]]))
}

const COMPILER_SUPPORT =
    /^(?:_Z(?:n[aw]|d[la])|__cxa_|__dso_handle$|__(?:u?(?:div|mod)di3|(?:ashl|ashr|lshr)di3|(?:mul|div)(?:sc|dc)3|(?:clz|ctz|popcount|parity|cmp|ucmp)di2)$)/

async function requiredSymbols(target, library, functions) {
    const required = new Set([
        ...functions.filter((entry) => availableOn(entry, target)).map((entry) => entry.name),
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
        let text
        try {
            text = prepare(response.asm, target).text
        } catch {
            continue
        }
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

/**
 * The probe that pins each documented function's type: one file for every Target, posix/'s
 * functions and headers inside a guard that only MIPS and RISC-V compile.
 */
function signatureSource(functions) {
    const headers = (directory) =>
        walk(join(runtime, directory), (path) => path.endsWith('.h')).map(
            (path) => `#include <${posix(relative(join(runtime, directory), path))}>`
        )
    const probe = ({ name, prototype }) => {
        const type = prototype.replace(new RegExp(`\\b${name}\\s*\\(`), '(')
        const template = `__aed_sig_${name}`
        return `using __aed_type_${name} = ${type};\ntemplate<class T> __attribute__((used,noinline)) void ${template}(T *) {}\nvoid __aed_use_${name}() { ${template}(static_cast<__aed_type_${name} *>(&${name})); }`
    }
    const own = functions.filter((entry) => entry.targets)
    return [
        ...headers('include'),
        ...functions.filter((entry) => !entry.targets).map(probe),
        ...(own.length
            ? [
                  '#if defined(__mips__) || defined(__riscv)',
                  ...headers('posix/include'),
                  ...own.map(probe),
                  '#endif'
              ]
            : [])
    ].join('\n')
}

async function signatures(target, functions) {
    const path = join(runtime, 'abi', 'signatures.cpp')
    const source = signatureSource(functions) + '\n'
    if (!plan && (!existsSync(path) || read(path) !== source)) writeFileSync(path, source)
    const { response } = await compile(target, path, headerFiles(target), {
        posix: hasPosix(target),
        source
    })
    if (response.code !== 0)
        throw new Error(
            `${target}: signature probe failed:\n${(response.stderr ?? []).map((line) => line.text).join('\n')}`
        )
    const labels = response.asm
        .map((line) => /^\s*(_Z[^: ]+):/.exec(line.text)?.[1])
        .filter(Boolean)
    return Object.fromEntries(
        functions
            .filter((entry) => availableOn(entry, target))
            .map(({ name }) => {
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
        if (plan) {
            await buildTarget(target, functions)
            const probes = [
                () => layoutTable(target, 'layout.c', '__aed_layout'),
                ...(hasPosix(target)
                    ? [
                          () =>
                              layoutTable(target, 'posix-layout.c', '__aed_posix_layout', {
                                  posix: true
                              })
                      ]
                    : []),
                () => signatures(target, functions)
            ]
            for (const probe of probes)
                try {
                    await probe()
                } catch (error) {
                    if (!(error instanceof Planned)) throw error
                }
            continue
        }
        const library = abiOnly
            ? JSON.parse(read(join(output, `${target}.json`)))
            : await buildTarget(target, functions)
        if (checkAssets && library.inputsDigest !== inputsDigest(target, diskInputs(target)))
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
        if (!skipAbi) {
            layoutTables[target] = await layouts(target)
            exported[target] = await requiredSymbols(target, library, functions)
            signatureTables[target] = await signatures(target, functions)
        }
        console.log(
            `  ${Object.keys(library.members).length} members, ${Object.keys(library.index).length} indexed globals`
        )
    }
    if (plan) {
        console.log(`${planned.length} requests to Compiler Explorer:`)
        for (const request of planned) console.log(`  ${request}`)
        return
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
    writeFileSync(join(output, 'posix-include.json'), JSON.stringify(posixHeaders()))
    writeFileSync(
        join(output, 'functions.json'),
        JSON.stringify({
            abi: ABI,
            functions: functions.sort((a, b) => (a.name < b.name ? -1 : 1))
        })
    )
    const cSources = Object.fromEntries([
        ...sources().map((path) => [posix(relative(runtime, path)), read(path)]),
        ...[join(runtime, 'src'), join(runtime, 'posix', 'src')].flatMap((directory) =>
            walk(directory, (path) => /\.(h|inc)$/.test(path)).map((path) => [
                posix(relative(runtime, path)),
                read(path)
            ])
        )
    ])
    writeFileSync(join(output, 'sources.json'), JSON.stringify(cSources))
    if (skipAbi) return
    const baselinePath = join(runtime, 'abi', `${ABI}.json`)
    const baseline = existsSync(baselinePath) ? JSON.parse(read(baselinePath)) : {}
    // A targeted rebuild must still check its target without erasing the other ABI tables.
    const current = {
        abi: ABI,
        exported: { ...baseline.exported, ...exported },
        signatures: { ...baseline.signatures, ...signatureTables },
        layouts: { ...baseline.layouts, ...layoutTables }
    }
    if (abiReport) {
        writeFileSync(abiReport, JSON.stringify(current, null, 2) + '\n')
        return
    }
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
