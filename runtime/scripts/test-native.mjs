#!/usr/bin/env node
// Native test harness for the Runtime library (plain Node, no dependencies).
//
// It builds the whole library with the host GCC for x86-64 Linux, using the same freestanding flags as the Target
// builds plus the host syscall layer in arch/host-*, and checks it against the host's glibc:
//   1. every library source compiles without unexpected warnings, for LP64 (x86-64) and ILP32 (i386);
//   2. no object uses long double (no x87 extended loads or stores in the x86-64 objects);
//   3. the compiler support routines in src/libgcc match the host's native 64-bit arithmetic;
//   4. every program in tests/corpus is built against glibc (the oracle) and against the library, in several
//      variants, and run in a fresh directory with the same stdin and input Files; stdout, stderr, the exit
//      status and every File left in the directory must match. The oracle's results are stored in
//      tests/expected/<name>/ (written with --update-expected) so they can be reviewed and reused by the Cores;
//   5. every function listed in FUNCTIONS.md is called by at least one corpus program.
//
// Usage: node runtime/scripts/test-native.mjs [--update-expected] [--only name,...] [--variants list] [--jobs N] [--keep]
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CC = process.env.CC ?? 'gcc'
const CXX = process.env.CXX ?? 'g++'
const AR = process.env.AR ?? 'ar'
const OBJDUMP = process.env.OBJDUMP ?? 'objdump'
const NM = process.env.NM ?? 'nm'

const args = process.argv.slice(2)
const option = (name) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
}
const UPDATE = args.includes('--update-expected')
const KEEP = args.includes('--keep')
const ONLY = option('--only')?.split(',')
const JOBS = Number(option('--jobs') ?? Math.max(2, os.cpus().length))

// Library variants. Each builds every source and runs the corpus at -O0 and -O2.
const VARIANTS = {
    // LP64, like RISC-V-64.
    x86_64: { arch: 'host-x86_64', flags: [] },
    // ILP32, like RISC-V and MIPS: 32-bit long and pointers, and GCC calls the 64-bit helper routines.
    // SSE math gives FLT_EVAL_METHOD 0, as on the Targets.
    i386: { arch: 'host-i386', flags: ['-m32', '-msse2', '-mfpmath=sse'] },
    // char is unsigned on RISC-V.
    uchar: { arch: 'host-x86_64', flags: ['-funsigned-char'] }
}
const ENABLED = option('--variants')?.split(',') ?? Object.keys(VARIANTS)
const OPTS = ['-O0', '-O2']

// The library's flags from the build contract (README.md), plus warnings for this check.
const LIB_FLAGS = [
    '-Os', '-g1', '-ffreestanding', '-fno-builtin', '-fno-tree-loop-distribute-patterns', '-fno-stack-protector',
    '-fno-pie', '-fno-section-anchors', '-nostdinc', '-isystem', path.join(ROOT, 'include'),
    '-I', path.join(ROOT, 'src/internal')
]
const C_STD = ['-std=c17']
const CXX_STD = ['-std=c++17', '-fno-exceptions', '-fno-rtti', '-fno-threadsafe-statics', '-nostdinc++']
// Style warnings that musl's code triggers on purpose; anything else fails the build.
const WARNINGS = [
    '-Wall', '-Wextra', '-Wno-parentheses', '-Wno-sign-compare', '-Wno-implicit-fallthrough',
    '-Wno-unused-parameter', '-Wno-unused-but-set-variable'
]
// vfprintf's digit table is a char[16] without a terminating NUL on purpose.
const C_WARNINGS = ['-Wno-unterminated-string-initialization']
// The replaceable operator delete overloads live in separate files on purpose.
const CXX_WARNINGS = ['-Wno-sized-deallocation']
// Known false positives in specific musl files.
const FILE_WARNINGS = {
    'src/stdio/vfprintf.c': ['-Wno-maybe-uninitialized'],
    'src/stdlib/qsort.c': ['-Wno-dangling-pointer']
}

// User programs are compiled hosted, as on the Targets, with warnings that catch header mistakes.
const PROGRAM_FLAGS = ['-g1', '-fno-stack-protector', '-fno-pie', '-Wall', '-Wextra', '-Wno-unused-parameter']
const LINK_FLAGS = ['-nostdlib', '-static', '-no-pie']

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aed-runtime-'))
const failures = []
const fail = (what, detail = '') => failures.push(detail ? `${what}\n${indent(detail)}` : what)
const indent = (text) => String(text).trimEnd().split('\n').map((l) => `    ${l}`).join('\n')

function run(file, argv, options = {}) {
    return new Promise((resolve) => {
        execFile(file, argv, { maxBuffer: 64 << 20, encoding: 'utf8', ...options }, (error, stdout, stderr) =>
            resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr })
        )
    })
}

async function pool(items, worker) {
    const results = new Array(items.length)
    let next = 0
    await Promise.all(
        Array.from({ length: Math.min(JOBS, items.length) }, async () => {
            while (next < items.length) {
                const i = next++
                results[i] = await worker(items[i], i)
            }
        })
    )
    return results
}

function walk(dir, filter = () => true) {
    const out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) out.push(...walk(full, filter))
        else if (filter(full)) out.push(full)
    }
    return out
}

// ------------------------------------------------------------------------------------------------ library build
const SOURCES = walk(path.join(ROOT, 'src'), (f) => /\.(c|cpp)$/.test(f))

async function buildLibrary(name) {
    const variant = VARIANTS[name]
    const dir = path.join(work, name)
    fs.mkdirSync(path.join(dir, 'obj'), { recursive: true })
    const objects = await pool(SOURCES, async (source) => {
        const rel = path.relative(ROOT, source)
        const object = path.join(dir, 'obj', rel.replace(/[\\/]/g, '__').replace(/\.(c|cpp)$/, '.o'))
        const cpp = source.endsWith('.cpp')
        const argv = [
            ...variant.flags, ...LIB_FLAGS, ...(cpp ? CXX_STD : C_STD),
            '-iquote', path.dirname(source), '-I', path.join(ROOT, 'arch', variant.arch),
            ...WARNINGS, ...(cpp ? CXX_WARNINGS : C_WARNINGS), ...(FILE_WARNINGS[rel] ?? []), '-c', source, '-o', object
        ]
        const r = await run(cpp ? CXX : CC, argv)
        if (r.code !== 0 || r.stderr.trim()) fail(`[${name}] ${rel} does not compile cleanly`, r.stderr)
        return object
    })
    const archive = path.join(dir, 'libaed.a')
    const r = await run(AR, ['rcs', archive, ...objects])
    if (r.code !== 0) fail(`[${name}] ar failed`, r.stderr)
    const crt0 = path.join(dir, 'crt0.o')
    const c = await run(CC, [...variant.flags, '-c', path.join(ROOT, 'arch', variant.arch, 'crt0.s'), '-o', crt0])
    if (c.code !== 0) fail(`[${name}] crt0.s does not assemble`, c.stderr)
    // A start file that never runs .init_array or exit(): proves the library needs no initialization and that
    // output is written through before the program ends with a raw exit system call.
    const noinitSource = path.join(ROOT, 'tests/native', `crt0-noinit-${variant.arch}.s`)
    const noinit = path.join(dir, 'crt0-noinit.o')
    if (fs.existsSync(noinitSource)) {
        const n = await run(CC, [...variant.flags, '-c', noinitSource, '-o', noinit])
        if (n.code !== 0) fail(`[${name}] ${path.basename(noinitSource)} does not assemble`, n.stderr)
    }
    return { name, variant, dir, archive, crt0, noinit: fs.existsSync(noinit) ? noinit : null, objects }
}

async function checkNoLongDouble(lib) {
    const r = await run(OBJDUMP, ['-d', lib.archive])
    const hits = r.stdout.split('\n').filter((l) => /\t(fldt|fstpt)\b/.test(l))
    if (hits.length) fail(`[${lib.name}] long double (x87 extended) instructions found in the library`, hits.slice(0, 10).join('\n'))
}

// ------------------------------------------------------------------------------- compiler support routine test
async function checkHelpers(lib) {
    const dir = path.join(lib.dir, 'helpers')
    fs.mkdirSync(dir, { recursive: true })
    const helpers = lib.objects.filter((o) => o.includes('src__libgcc__'))
    const exe = path.join(dir, 'libgcc_test')
    const b = await run(CC, ['-O2', '-std=c17', '-Wall', path.join(ROOT, 'tests/native/libgcc_test.c'), ...helpers, '-o', exe])
    if (b.code !== 0) return fail('[helpers] libgcc_test does not build', b.stderr)
    const r = await run(exe, [])
    if (r.code !== 0) fail('[helpers] compiler support routines differ from native arithmetic', r.stdout + r.stderr)
    return r.stdout.trim()
}

// ---------------------------------------------------------------------------------------------- corpus programs
const CORPUS = path.join(ROOT, 'tests/corpus')
const EXPECTED = path.join(ROOT, 'tests/expected')

function corpusPrograms() {
    return fs
        .readdirSync(CORPUS)
        .filter((f) => /\.(c|cpp)$/.test(f))
        .sort()
        .map((file) => {
            const name = file.replace(/\.(c|cpp)$/, '')
            const source = path.join(CORPUS, file)
            const text = fs.readFileSync(source, 'utf8')
            const directives = (text.match(/runtime-test:([^\n*]*)/)?.[1] ?? '').trim().split(/\s+/).filter(Boolean)
            const stdin = path.join(CORPUS, `${name}.in`)
            const files = path.join(CORPUS, `${name}.files`)
            return {
                name,
                source,
                cpp: file.endsWith('.cpp'),
                directives,
                stdin: fs.existsSync(stdin) ? stdin : null,
                files: fs.existsSync(files) ? files : null,
                override: {
                    stdout: path.join(CORPUS, `${name}.expect.stdout`),
                    stderr: path.join(CORPUS, `${name}.expect.stderr`),
                    status: path.join(CORPUS, `${name}.expect.status`)
                }
            }
        })
        .filter((p) => !ONLY || ONLY.includes(p.name))
}

let runCounter = 0
async function execute(program, exe) {
    const dir = path.join(work, 'runs', String(runCounter++))
    fs.mkdirSync(dir, { recursive: true })
    if (program.files) fs.cpSync(program.files, dir, { recursive: true })
    const input = program.stdin ? fs.openSync(program.stdin, 'r') : 'ignore'
    const result = await new Promise((resolve) => {
        const child = spawn(exe, [], { cwd: dir, env: { TZ: 'UTC', LC_ALL: 'C' }, stdio: [input, 'pipe', 'pipe'] })
        const out = []
        const err = []
        child.stdout.on('data', (d) => out.push(d))
        child.stderr.on('data', (d) => err.push(d))
        const timer = setTimeout(() => child.kill('SIGKILL'), 30000)
        child.on('close', (code, signal) => {
            clearTimeout(timer)
            const signals = { SIGABRT: 6, SIGSEGV: 11, SIGKILL: 9, SIGFPE: 8, SIGILL: 4, SIGBUS: 7 }
            resolve({
                stdout: Buffer.concat(out),
                stderr: Buffer.concat(err),
                status: signal ? 128 + (signals[signal] ?? 0) : code,
                signal
            })
        })
    })
    if (typeof input === 'number') fs.closeSync(input)
    result.files = {}
    for (const f of walk(dir)) result.files[path.relative(dir, f).split(path.sep).join('/')] = fs.readFileSync(f)
    if (!KEEP) fs.rmSync(dir, { recursive: true, force: true })
    return result
}

async function buildOracle(program) {
    const exe = path.join(work, 'oracle', program.name)
    fs.mkdirSync(path.dirname(exe), { recursive: true })
    // Compiled from the corpus directory with a relative name, so __FILE__ is just the file name.
    const source = path.basename(program.source)
    // _DEFAULT_SOURCE makes glibc declare what the Runtime headers always declare (strdup, strnlen, ...) without
    // _GNU_SOURCE's C23 behaviour (glibc's strtol then accepts 0b prefixes). Tests calling GNU extensions such
    // as sincos define _GNU_SOURCE themselves.
    const argv = program.cpp
        ? ['-std=c++17', '-O2', '-D_DEFAULT_SOURCE', '-fno-exceptions', '-fno-rtti', '-fno-threadsafe-statics', '-w', source, '-o', exe]
        : ['-std=c17', '-O2', '-D_DEFAULT_SOURCE', '-w', source, '-o', exe, '-lm']
    const r = await run(program.cpp ? CXX : CC, argv, { cwd: CORPUS })
    if (r.code !== 0) return fail(`[oracle] ${program.name} does not build against glibc`, r.stderr), null
    return exe
}

async function buildProgram(program, lib, opt, start) {
    const exe = path.join(lib.dir, 'bin', `${program.name}${opt}${start === lib.noinit ? '-noinit' : ''}`)
    fs.mkdirSync(path.dirname(exe), { recursive: true })
    const object = `${exe}.o`
    const compile = [
        ...lib.variant.flags, opt, ...(program.cpp ? CXX_STD : C_STD), ...PROGRAM_FLAGS,
        '-nostdinc', '-isystem', path.join(ROOT, 'include'), '-c', path.basename(program.source), '-o', object
    ]
    const c = await run(program.cpp ? CXX : CC, compile, { cwd: CORPUS })
    if (c.code !== 0 || c.stderr.trim()) {
        fail(`[${lib.name} ${opt}] ${program.name} does not compile cleanly against the Runtime headers`, c.stderr)
        if (c.code !== 0) return null
    }
    // GCC references __cxa_pure_virtual and __cxa_deleted_virtual weakly from vtables, and a weak reference never pulls
    // an archive member. The Cores resolve them through the library's resolveWeak list (README.md, Linking); GNU ld
    // gets the same effect from -u.
    const symbols = (await run(NM, [object])).stdout
    const forced = ['__cxa_pure_virtual', '__cxa_deleted_virtual']
        .filter((name) => new RegExp(`\\s[wvU]\\s${name}$`, 'm').test(symbols))
        .flatMap((name) => ['-Wl,-u,' + name])
    const l = await run(CC, [...lib.variant.flags, ...LINK_FLAGS, ...forced, start, object, lib.archive, '-o', exe])
    if (l.code !== 0) return fail(`[${lib.name} ${opt}] ${program.name} does not link against the library`, l.stderr), null
    return exe
}

function expectedOf(oracle, program) {
    const exp = { stdout: oracle.stdout, stderr: oracle.stderr, status: oracle.status, files: oracle.files }
    if (fs.existsSync(program.override.stdout)) exp.stdout = fs.readFileSync(program.override.stdout)
    if (fs.existsSync(program.override.stderr)) exp.stderr = fs.readFileSync(program.override.stderr)
    if (fs.existsSync(program.override.status)) exp.status = Number(fs.readFileSync(program.override.status, 'utf8').trim())
    return exp
}

function readStored(name) {
    const dir = path.join(EXPECTED, name)
    if (!fs.existsSync(dir)) return null
    const files = {}
    const filesDir = path.join(dir, 'files')
    if (fs.existsSync(filesDir)) for (const f of walk(filesDir)) files[path.relative(filesDir, f).split(path.sep).join('/')] = fs.readFileSync(f)
    return {
        stdout: fs.readFileSync(path.join(dir, 'stdout')),
        stderr: fs.readFileSync(path.join(dir, 'stderr')),
        status: Number(fs.readFileSync(path.join(dir, 'status'), 'utf8').trim()),
        files
    }
}

function writeStored(name, exp) {
    const dir = path.join(EXPECTED, name)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'stdout'), exp.stdout)
    fs.writeFileSync(path.join(dir, 'stderr'), exp.stderr)
    fs.writeFileSync(path.join(dir, 'status'), `${exp.status}\n`)
    for (const [rel, data] of Object.entries(exp.files)) {
        const target = path.join(dir, 'files', rel)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, data)
    }
}

function differences(expected, actual) {
    const out = []
    const show = (b) => {
        const s = b.toString('latin1')
        return JSON.stringify(s.length > 400 ? `${s.slice(0, 400)}...` : s)
    }
    const firstDiff = (a, b) => {
        let i = 0
        while (i < a.length && i < b.length && a[i] === b[i]) i++
        const line = a.subarray(0, i).toString('latin1').split('\n').length
        return `first difference at byte ${i} (line ${line}): expected ${show(a.subarray(Math.max(0, i - 40), i + 80))}, got ${show(b.subarray(Math.max(0, i - 40), i + 80))}`
    }
    for (const stream of ['stdout', 'stderr']) {
        if (!expected[stream].equals(actual[stream])) out.push(`${stream}: ${firstDiff(expected[stream], actual[stream])}`)
    }
    if (expected.status !== actual.status) out.push(`exit status: expected ${expected.status}, got ${actual.status}`)
    const names = new Set([...Object.keys(expected.files), ...Object.keys(actual.files)])
    for (const f of names) {
        if (!expected.files[f]) out.push(`File ${f}: unexpected`)
        else if (!actual.files[f]) out.push(`File ${f}: missing`)
        else if (!expected.files[f].equals(actual.files[f])) out.push(`File ${f}: ${firstDiff(expected.files[f], actual.files[f])}`)
    }
    return out
}

// ------------------------------------------------------------------------------------------ header doc comments
// The editor's hover and completion metadata come from the one-line /** ... */ comment right before each public
// function declaration, so every declaration in include/ must have one. Macro-generated and template C++
// overloads in <math.h> are covered by the comments of the C functions they forward to.
function checkDocComments() {
    let count = 0
    for (const file of fs.readdirSync(path.join(ROOT, 'include')).sort()) {
        const lines = fs.readFileSync(path.join(ROOT, 'include', file), 'utf8').split('\n')
        let inComment = false
        let continued = false
        lines.forEach((line, i) => {
            const skip = inComment || continued
            if (!inComment && /\/\*/.test(line) && !/\*\//.test(line.slice(line.indexOf('/*')))) inComment = true
            else if (inComment && /\*\//.test(line)) inComment = false
            continued = /\\\s*$/.test(line)
            if (skip || /^\s*(#|\/\/|\/\*|typedef|using|template|struct|enum|namespace|extern "C|}|__AED_|return)/.test(line)) return
            const m = line.match(/^\s*(?:__attribute__\(\(.*?\)\)\s*)?(?:extern\s+)?(?:inline\s+)?(?:constexpr\s+)?[A-Za-z_][\w\s*&:<>]*?\b(operator\s*(?:new|delete)(?:\[\])?|[A-Za-z_]\w*)\s*\(/)
            if (!m || m[1] === '__attribute__') return
            count++
            if (!/^\s*\/\*\*\s.*\*\/\s*$/.test(lines[i - 1] ?? '')) fail(`include/${file}:${i + 1} declares ${m[1]} without a one-line /** ... */ comment`)
        })
    }
    return count
}

function headerBytes() {
    return walk(path.join(ROOT, 'include')).reduce((n, f) => n + fs.statSync(f).size, 0)
}

// ------------------------------------------------------------------------------------------- function coverage
function checkCoverage(programs) {
    const listed = new Set()
    const text = fs.readFileSync(path.join(ROOT, 'FUNCTIONS.md'), 'utf8')
    for (const line of text.split('\n')) {
        const m = line.match(/^\| `([A-Za-z_][A-Za-z0-9_]*)`/)
        if (m) listed.add(m[1])
    }
    const corpus = programs.map((p) => fs.readFileSync(p.source, 'utf8')).join('\n')
    // Names starting with __ are called by the compiler, not by programs.
    const missing = [...listed].filter((name) => !name.startsWith('__') && !new RegExp(`\\b${name}\\b`).test(corpus))
    if (missing.length) fail(`FUNCTIONS.md lists functions no corpus program uses: ${missing.join(', ')}`)
    return listed.size
}

// ------------------------------------------------------------------------------------------------------- main
async function main() {
    const started = Date.now()
    console.log(`Runtime library native tests (work directory ${work})`)
    for (const v of ENABLED) if (!VARIANTS[v]) throw new Error(`unknown variant ${v}`)

    const libs = []
    for (const v of ENABLED) {
        libs.push(await buildLibrary(v))
        console.log(`  built ${v}: ${SOURCES.length} sources`)
    }
    for (const lib of libs) if (lib.variant.arch === 'host-x86_64') await checkNoLongDouble(lib)

    const x86 = libs.find((l) => l.name === 'x86_64')
    if (x86) console.log(`  compiler support routines: ${(await checkHelpers(x86)) ?? 'not run'}`)

    console.log(`  headers: ${checkDocComments()} documented declarations, ${(headerBytes() / 1024).toFixed(1)} KB in include/`)
    const programs = corpusPrograms()
    const listed = ONLY ? 0 : checkCoverage(programs)
    if (!ONLY) console.log(`  FUNCTIONS.md: ${listed} functions, each used by the corpus`)
    for (const p of programs) {
        if (p.stdin) {
            const data = fs.readFileSync(p.stdin)
            if (data.length && data[data.length - 1] !== 10) fail(`${p.name}.in must end with a newline (the Terminal delivers whole lines)`)
        }
    }

    // Oracle: glibc results, compared with the reviewed expectations.
    const oracles = {}
    await pool(programs, async (p) => {
        const exe = await buildOracle(p)
        if (!exe) return
        const exp = expectedOf(await execute(p, exe), p)
        oracles[p.name] = exp
        if (UPDATE) writeStored(p.name, exp)
        else {
            const stored = readStored(p.name)
            if (!stored) fail(`[expected] ${p.name} has no stored expectation; run with --update-expected`)
            else {
                const d = differences(stored, exp)
                if (d.length) fail(`[expected] ${p.name}: glibc no longer matches tests/expected (rerun with --update-expected after review)`, d.join('\n'))
            }
        }
    })

    // The library, in every variant and at every optimization level.
    const jobs = []
    for (const lib of libs) {
        for (const p of programs) {
            if (p.directives.includes(`skip-${lib.name}`)) continue
            for (const opt of OPTS) jobs.push({ lib, p, opt, start: lib.crt0, mode: opt })
            if (lib.noinit && !p.cpp && !p.directives.includes('skip-noinit')) jobs.push({ lib, p, opt: '-O2', start: lib.noinit, mode: 'noinit' })
        }
    }
    const tally = {}
    await pool(jobs, async ({ lib, p, opt, start, mode }) => {
        const key = `${lib.name} ${mode}`
        tally[key] ??= { pass: 0, total: 0 }
        tally[key].total++
        const expected = oracles[p.name]
        if (!expected) return
        const exe = await buildProgram(p, lib, opt, start)
        if (!exe) return
        const d = differences(expected, await execute(p, exe))
        if (d.length) fail(`[${key}] ${p.name}`, d.join('\n'))
        else tally[key].pass++
    })

    console.log(`  corpus: ${programs.length} programs`)
    for (const key of Object.keys(tally).sort()) console.log(`    ${key.padEnd(16)} ${tally[key].pass}/${tally[key].total} pass`)
    if (!KEEP) fs.rmSync(work, { recursive: true, force: true })
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    if (failures.length) {
        console.log(`\nFAILED (${failures.length} problems, ${seconds}s):`)
        for (const f of failures) console.log(`  - ${f}`)
        process.exit(1)
    }
    console.log(`\nAll checks passed (${seconds}s).`)
}

main().catch((e) => {
    console.error(e)
    process.exit(2)
})
