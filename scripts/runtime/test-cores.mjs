#!/usr/bin/env node
// Runs the Runtime library's corpus on the editor's Cores, as a student's program runs: each program
// is compiled through Compiler Explorer the way the editor compiles it (hosted, against the
// library's headers), linked with the generated library by the Core, started at `_start`, and run
// with tty-style standard input and an in-memory FileSystem. Its standard output, standard error,
// exit status and Files must equal what the same program did against the host's glibc, which
// runtime/scripts/test-native.mjs stored under runtime/tests/expected/<name>/.
//
//   node scripts/runtime/test-cores.mjs [--target riscv32,riscv64,mips] [--only a,b] [--optimization 0,2] [--compiler gcc|clang] [--offline]
//
// Compiler Explorer responses are cached under runtime/.cache/corpus by a hash of the request, so a
// rerun needs no network unless a program, a header or the flags changed; --offline fails instead.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const runtime = join(repository, 'runtime')
const corpus = join(runtime, 'tests', 'corpus')
const expectedDirectory = join(runtime, 'tests', 'expected')
const generated = join(repository, 'src', 'lib', 'sourceRuntime', 'generated', 'v1')
const cache = join(runtime, '.cache', 'corpus')
const INSTRUCTION_LIMIT = Number(process.env.INSTRUCTION_LIMIT ?? 200_000_000)

/** Kept in step with compilerPreset in src/lib/sourceCompilation/compilerExplorer.ts. */
const TARGETS = {
    riscv32: {
        core: 'risc-v',
        width: 32,
        compilers: {
            gcc: { c: 'rv32-cgcc1420', cpp: 'rv32-gcc1420' },
            clang: { c: 'rv32-cclang2110', cpp: 'rv32-clang2110' }
        },
        flags: () => '-march=rv32imfd -mabi=ilp32d'
    },
    riscv64: {
        core: 'risc-v',
        width: 64,
        compilers: {
            gcc: { c: 'rv64-cgcc1420', cpp: 'rv64-gcc1420' },
            clang: { c: 'rv64-cclang2110', cpp: 'rv64-clang2110' }
        },
        flags: () => '-march=rv64imfd -mabi=lp64d'
    },
    mips: {
        core: 'mips',
        width: 32,
        compilers: {
            gcc: { c: 'cmipsg1420', cpp: 'mipsg1420' },
            clang: { c: 'mipsel-cclang2110', cpp: 'mipsel-clang2110' }
        },
        // MARS skips branch delay slots, so the compiler must leave a nop in each
        flags: (compiler) =>
            `-march=mips32 -mabi=32 -mno-abicalls -fno-pic -G0 ${compiler === 'clang' ? '-mllvm -disable-mips-delay-filler' : '-fno-delayed-branch'} -mfp32 -mhard-float -EL`
    }
}

const args = process.argv.slice(2)
const option = (name) => {
    const index = args.indexOf(name)
    return index === -1 ? undefined : args[index + 1]
}
const targets = (option('--target') ?? Object.keys(TARGETS).join(',')).split(',')
const only = option('--only')?.split(',')
const optimizations = (option('--optimization') ?? '0,2').split(',')
const offline = args.includes('--offline')
const fixtures = args.includes('--abi-fixtures')
const writeFixtures = args.includes('--write-abi-fixtures')
const fixtureNames = new Set([
    'printf_int',
    'scanf_int',
    'malloc_test',
    'allocation_alignment',
    'cpp_global_objects',
    'cpp_pure_virtual',
    'int64_arith',
    'time_test',
    'exit_status',
    'hosted_argv'
])
const fixtureRoot = join(runtime, 'abi', 'v1-fixtures')
const compiler = option('--compiler') ?? 'gcc'
if (compiler !== 'gcc' && compiler !== 'clang') throw new Error(`Unknown compiler ${compiler}`)

const read = (path) => readFileSync(path, 'utf8')
const sha = (text) => createHash('sha256').update(text).digest('hex')
function walk(directory) {
    if (!existsSync(directory)) return []
    return readdirSync(directory)
        .sort()
        .flatMap((name) => {
            const path = join(directory, name)
            return statSync(path).isDirectory() ? walk(path) : [path]
        })
}

/** The editor's compile request for a hosted program (createCompilerRequest in compilerExplorer.ts). */
function request(target, name, source, language, optimization, headers) {
    const settings = TARGETS[target]
    const compilerOptions = compiler === 'clang' ? '-fno-addrsig' : '-fno-section-anchors'
    const userArguments = `-O${optimization} -g1 -fdiagnostics-color=never -fno-verbose-asm -fno-stack-protector -fno-pie ${compilerOptions} -nostdinc -isystem sysroot/include ${settings.flags(compiler)} -iquote '.' -iquote . ${language === 'cpp' ? '-std=c++17 -fno-exceptions -fno-rtti -fno-threadsafe-statics -nostdinc++' : '-std=c17'}`
    return {
        compilerId: settings.compilers[compiler][language],
        body: {
            // Compiled under its bare name, as the native oracle is, so __FILE__ matches.
            source: `#line 1 ${JSON.stringify(name)}\n${source}`,
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
            files: Object.entries(headers).map(([path, contents]) => ({
                filename: `sysroot/include/${path}`,
                contents
            }))
        }
    }
}

let lastRequest = 0
async function compile(target, prepared) {
    const json = JSON.stringify(prepared.body)
    const cached = join(cache, target, `${sha(`${prepared.compilerId}\n${json}`)}.json`)
    if (existsSync(cached)) return JSON.parse(read(cached))
    if (offline) throw new Error('not cached and --offline was given')
    for (let attempt = 0; ; attempt++) {
        const wait = lastRequest + 250 - Date.now()
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
        lastRequest = Date.now()
        const reply = await fetch(
            `https://godbolt.org/api/compiler/${prepared.compilerId}/compile`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: json
            }
        )
        if ((reply.status === 429 || reply.status >= 500) && attempt < 6) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt))
            continue
        }
        if (!reply.ok) throw new Error(`HTTP ${reply.status}`)
        const response = await reply.json()
        mkdirSync(dirname(cached), { recursive: true })
        writeFileSync(cached, JSON.stringify(response))
        return response
    }
}

/** The editor's preparation of hosted output (prepareAssembly): debug material out, every other section kept. */
function prepare(lines, target) {
    const text = []
    let debug = false
    for (const { text: code } of lines) {
        const section = /^\s*\.section\s+(?:"([^"]+)"|([^\s,]+))/.exec(code)?.slice(1).find(Boolean)
        if (section) debug = /^\.(?:debug|zdebug|mdebug|note|comment|eh_frame)/.test(section)
        else if (/^\s*\.(?:text|data|bss|sdata|sbss|rodata|rdata)\b/.test(code)) debug = false
        else if (debug && /^\s*\.previous\b/.test(code)) {
            debug = false
            continue
        }
        if (
            debug ||
            /^\s*\.(?:file|loc|cfi_\w+|ident)\b/.test(code) ||
            /^\s*#/.test(code) ||
            !code.trim()
        )
            continue
        if (
            TARGETS[target].core === 'mips' &&
            /^\s*(?:\$L|\.L)(?:FB|FE|BB|BE|VL|text|etext|debug)\w*\s*(?::|=)/.test(code)
        )
            continue
        text.push(code)
    }
    return text.join('\n') + '\n'
}

/** A Core with the program and the library, started at the library's `_start`. */
function makeCore(cores, target, entry, text, library) {
    const options = {
        assemblerProfile: 'gnu-compiler-v1',
        libraries: [
            {
                members: library.members,
                index: library.index,
                resolveWeak: library.resolveWeak ?? []
            }
        ],
        entrySymbol: '_start'
    }
    if (TARGETS[target].core === 'mips')
        return cores.MIPS.makeMipsFromFiles({ [entry]: text }, entry, options)
    cores.RISCV.setIs64Bit(TARGETS[target].width === 64)
    return cores.RISCV.makeRiscVFromFiles({ [entry]: text }, entry, options)
}

/**
 * The editor's peripherals, reduced to what the library uses: the Terminal's standard input (a line
 * at a time, End of input when the lines run out), output collected, and a FileSystem in memory.
 */
function environment(stdinText, inputFiles) {
    const lines =
        stdinText === null
            ? []
            : stdinText
                  .split('\n')
                  .slice(0, -1)
                  .map((line) => `${line}\n`)
    let pending = new Uint8Array(0)
    const encoder = new TextEncoder()
    const stdout = [],
        stderr = []
    const files = new Map(Object.entries(inputFiles))
    const handles = new Map()
    let elapsed = 0
    const handlers = {
        stdIn: (length) => {
            if (pending.length === 0) {
                if (lines.length === 0) return [0, []]
                pending = encoder.encode(lines.shift())
            }
            const bytes = pending.slice(0, length)
            pending = pending.slice(bytes.length)
            return [bytes.length, Array.from(bytes)]
        },
        stdOut: (buffer) => stdout.push(...buffer),
        stdErr: (buffer) => stderr.push(...buffer),
        openFile: (path, flags, append) => {
            const mode =
                flags === 0
                    ? 'read'
                    : flags === 2 || flags === 3 || flags === 10
                      ? 'read-write'
                      : append
                        ? 'append'
                        : 'write'
            if ((flags === 0 || flags === 2) && !files.has(path)) return -1
            if (flags === 1 || flags === 3 || !files.has(path)) files.set(path, new Uint8Array(0))
            let fd = 3
            while (handles.has(fd)) fd++
            handles.set(fd, { path, offset: 0, mode, append: flags === 9 || flags === 10 })
            return fd
        },
        readFile: (fd, length) => {
            const handle = handles.get(fd)
            if (!handle || handle.mode === 'write' || handle.mode === 'append') return [-1, []]
            const bytes = files.get(handle.path).slice(handle.offset, handle.offset + length)
            handle.offset += bytes.length
            return [bytes.length, Array.from(bytes)]
        },
        writeFile: (fd, buffer) => {
            const handle = handles.get(fd)
            if (!handle || handle.mode === 'read') return -1
            const bytes = Uint8Array.from(buffer)
            const old = files.get(handle.path)
            const start = handle.append ? old.length : handle.offset
            const next = new Uint8Array(Math.max(old.length, start + bytes.length))
            next.set(old)
            next.set(bytes, start)
            files.set(handle.path, next)
            handle.offset = start + bytes.length
            return bytes.length
        },
        closeFile: (fd) => void handles.delete(fd),
        seekFile: (fd, offset, whence) => {
            const handle = handles.get(fd)
            if (!handle) return -1
            const base =
                whence === 0 ? 0 : whence === 1 ? handle.offset : files.get(handle.path).length
            if (base + offset < 0) return -1
            handle.offset = base + offset
            return handle.offset
        },
        time: () => 946684800000 + elapsed,
        sleep: (ms) => {
            elapsed += ms
        }
    }
    return { handlers, stdout, stderr, files }
}

function firstDifference(expected, actual) {
    const a = Buffer.from(expected),
        b = Buffer.from(actual)
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    const show = (buffer) =>
        JSON.stringify(buffer.subarray(Math.max(0, i - 20), i + 40).toString('utf8'))
    return `at byte ${i}: expected ${show(a)}, got ${show(b)}`
}

async function main() {
    const cores = {
        StopReason: (await import('@specy/mips')).StopReason,
        RISCV: (
            await import(
                join(repository, 'emulators', 'risc-v', 'rarsjs', 'ts', 'dist', 'index.mjs')
            )
        ).RISCV,
        MIPS: (
            await import(join(repository, 'emulators', 'mips', 'marsjs', 'ts', 'dist', 'index.mjs'))
        ).MIPS
    }
    // The headers as they are now, the same ones the build uploads as the sysroot.
    const include = join(runtime, 'include')
    const headers = Object.fromEntries(
        walk(include).map((path) => [relative(include, path).split('\\').join('/'), read(path)])
    )
    // Frozen programs remain runnable even if their original corpus sources are removed.
    const programs = fixtures
        ? [...fixtureNames].map((name) => ({ name, file: name, language: 'c' }))
        : readdirSync(corpus)
              .filter((name) => /\.(c|cpp)$/.test(name))
              .map((file) => ({
                  file,
                  name: file.replace(/\.(c|cpp)$/, ''),
                  language: file.endsWith('.cpp') ? 'cpp' : 'c'
              }))
              .filter((program) => !only || only.includes(program.name))
              .filter((program) => !(fixtures || writeFixtures) || fixtureNames.has(program.name))
    let passed = 0
    const failures = []
    for (const target of targets) {
        const library = JSON.parse(read(join(generated, `${target}.json`)))
        if (fixtures)
            for (const name of fixtureNames) {
                if (
                    !existsSync(join(fixtureRoot, target, `${name}.s`)) ||
                    !existsSync(join(fixtureRoot, target, `${name}.json`))
                )
                    throw new Error(`Missing frozen fixture ${target}/${name}`)
            }
        for (const optimization of optimizations) {
            if ((fixtures || writeFixtures) && optimization !== '2') continue
            for (const program of programs) {
                const label = `${target} ${compiler} -O${optimization} ${program.name}`
                try {
                    const frozen = fixtures
                        ? JSON.parse(read(join(fixtureRoot, target, `${program.name}.json`)))
                        : null
                    const source = frozen?.source ?? read(join(corpus, program.file))
                    const response = fixtures
                        ? null
                        : await compile(
                              target,
                              request(
                                  target,
                                  program.file,
                                  source,
                                  program.language,
                                  optimization,
                                  headers
                              )
                          )
                    if (response && response.code !== 0)
                        throw new Error(
                            `does not compile:\n${(response.stderr ?? []).map((line) => line.text).join('\n')}`
                        )
                    const entry = `${program.file}.s`
                    const core = makeCore(
                        cores,
                        target,
                        entry,
                        fixtures
                            ? read(join(fixtureRoot, target, `${program.name}.s`))
                            : prepare(response.asm, target),
                        library
                    )
                    core.setUndoSize(1)
                    const assembled = core.assemble()
                    const errors = assembled.errors.filter((error) => !error.isWarning)
                    if (errors.length)
                        throw new Error(
                            `does not assemble:\n${errors
                                .slice(0, 8)
                                .map(
                                    (error) =>
                                        `${error.sourcePath}:${error.sourceLine}: ${error.message}`
                                )
                                .join('\n')}`
                        )
                    core.setUndoEnabled(false)
                    core.initialize(true)
                    const stdinPath = join(corpus, `${program.name}.in`)
                    const inputFiles = Object.fromEntries(
                        walk(join(corpus, `${program.name}.files`)).map((path) => [
                            relative(join(corpus, `${program.name}.files`), path)
                                .split('\\')
                                .join('/'),
                            new Uint8Array(readFileSync(path))
                        ])
                    )
                    const world = environment(
                        frozen ? frozen.stdin : existsSync(stdinPath) ? read(stdinPath) : null,
                        frozen
                            ? Object.fromEntries(
                                  Object.entries(frozen.inputFiles).map(([name, bytes]) => [
                                      name,
                                      Uint8Array.from(Buffer.from(bytes, 'base64'))
                                  ])
                              )
                            : inputFiles
                    )
                    for (const [name, handler] of Object.entries(world.handlers))
                        core.registerHandler(name, handler)
                    // A stress program can ask for more: `core-instruction-limit: N` in a comment.
                    const limit = Number(
                        /core-instruction-limit:\s*(\d+)/.exec(source)?.[1] ?? INSTRUCTION_LIMIT
                    )
                    const reason = await core.simulateWithLimit(limit)
                    if (
                        !core.terminated ||
                        (reason !== cores.StopReason.NORMAL_TERMINATION &&
                            reason !== cores.StopReason.CLIFF_TERMINATION)
                    )
                        throw new Error(`did not finish (stop reason ${reason})`)
                    // The Core reports the exit service's status, separately from argument registers.
                    const status = core.exitCode & 0xff
                    const expected = join(expectedDirectory, program.name)
                    const problems = []
                    const expectedStdout = frozen
                        ? Buffer.from(frozen.stdout, 'base64')
                        : readFileSync(join(expected, 'stdout'))
                    const expectedStderr = frozen
                        ? Buffer.from(frozen.stderr, 'base64')
                        : readFileSync(join(expected, 'stderr'))
                    const expectedStatus = frozen
                        ? frozen.status
                        : Number(read(join(expected, 'status')).trim())
                    if (!expectedStdout.equals(Buffer.from(world.stdout)))
                        problems.push(`stdout ${firstDifference(expectedStdout, world.stdout)}`)
                    if (!expectedStderr.equals(Buffer.from(world.stderr)))
                        problems.push(`stderr ${firstDifference(expectedStderr, world.stderr)}`)
                    if (expectedStatus !== status)
                        problems.push(`exit status: expected ${expectedStatus}, got ${status}`)
                    const expectedFiles = frozen
                        ? Object.fromEntries(
                              Object.entries(frozen.files).map(([name, bytes]) => [
                                  name,
                                  Buffer.from(bytes, 'base64')
                              ])
                          )
                        : Object.fromEntries(
                              walk(join(expected, 'files')).map((path) => [
                                  relative(join(expected, 'files'), path).split('\\').join('/'),
                                  readFileSync(path)
                              ])
                          )
                    for (const path of new Set([
                        ...Object.keys(expectedFiles),
                        ...world.files.keys()
                    ])) {
                        if (!expectedFiles[path]) problems.push(`File ${path}: unexpected`)
                        else if (!world.files.has(path)) problems.push(`File ${path}: missing`)
                        else if (!expectedFiles[path].equals(Buffer.from(world.files.get(path))))
                            problems.push(
                                `File ${path}: ${firstDifference(expectedFiles[path], world.files.get(path))}`
                            )
                    }
                    if (problems.length) throw new Error(problems.join('\n'))
                    if (writeFixtures) {
                        if (compiler !== 'gcc')
                            throw new Error(
                                'Freeze fixtures once with GCC -O2; do not overwrite with Clang'
                            )
                        const directory = join(fixtureRoot, target)
                        mkdirSync(directory, { recursive: true })
                        writeFileSync(
                            join(directory, `${program.name}.s`),
                            prepare(response.asm, target)
                        )
                        const encode = (data) => Buffer.from(data).toString('base64')
                        writeFileSync(
                            join(directory, `${program.name}.json`),
                            JSON.stringify(
                                {
                                    source,
                                    stdin: existsSync(stdinPath) ? read(stdinPath) : null,
                                    inputFiles: Object.fromEntries(
                                        Object.entries(inputFiles).map(([path, bytes]) => [
                                            path,
                                            encode(bytes)
                                        ])
                                    ),
                                    stdout: encode(expectedStdout),
                                    stderr: encode(expectedStderr),
                                    status: expectedStatus,
                                    files: Object.fromEntries(
                                        Object.entries(expectedFiles).map(([path, bytes]) => [
                                            path,
                                            encode(bytes)
                                        ])
                                    )
                                },
                                null,
                                2
                            ) + '\n'
                        )
                    }
                    passed++
                } catch (error) {
                    failures.push(`${label}: ${error.message}`)
                    console.log(
                        `FAIL ${label}\n  ${String(error.message).split('\n').join('\n  ')}`
                    )
                }
            }
        }
    }
    console.log(`${passed} passed, ${failures.length} failed`)
    if (failures.length) process.exit(1)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
