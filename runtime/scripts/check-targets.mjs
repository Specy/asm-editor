#!/usr/bin/env node
// Target build check for the Runtime library through Compiler Explorer (network access required).
//
// For each Target it uploads include/, src/ and arch/<target>/ to Compiler Explorer's CMake endpoint and builds
// with the Target's GCC 14.2, the same compiler and flags the editor uses:
//   1. every library member, with the library flags and warnings, must compile without unexpected diagnostics;
//   2. all members are linked together with crt0.s and an empty main (-nostdlib -static), so any symbol a member
//      needs that no member defines (a missing helper routine, a long double routine, ...) fails the link;
//   3. with --corpus, every corpus program is compiled hosted at -O0 and -O2 and linked against the library as an
//      archive, which catches calls GCC itself introduces (sincos, __divdi3, memcpy, ...).
// Programs are not run: Compiler Explorer cannot execute these Targets. The native test runs them on the host.
//
// Usage: node runtime/scripts/check-targets.mjs [--corpus] [--targets riscv32,riscv64,mips]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API = process.env.CE_API ?? 'https://godbolt.org/api'
const args = process.argv.slice(2)
const CORPUS = args.includes('--corpus')
const ONLY = args.includes('--targets') ? args[args.indexOf('--targets') + 1].split(',') : null

const TARGETS = {
    riscv32: { compiler: 'rv32-cgcc1420', flags: '-march=rv32imfd -mabi=ilp32d' },
    riscv64: { compiler: 'rv64-cgcc1420', flags: '-march=rv64imfd -mabi=lp64d' },
    mips: {
        compiler: 'cmipsg1420',
        flags: '-march=mips32 -mabi=32 -mno-abicalls -fno-pic -G0 -fno-delayed-branch -mfp32 -mhard-float -EL'
    }
}

const LIB_FLAGS =
    '-Os -g1 -ffreestanding -fno-builtin -fno-tree-loop-distribute-patterns -fno-stack-protector -fno-pie -fno-section-anchors'
const WARNINGS =
    '-Wall -Wextra -Wno-parentheses -Wno-sign-compare -Wno-implicit-fallthrough -Wno-unused-parameter -Wno-unused-but-set-variable -Wno-maybe-uninitialized -Wno-dangling-pointer'
const CXX = '-x;c++;-std=c++17;-fno-exceptions;-fno-rtti;-fno-threadsafe-statics;-nostdinc++;-Wno-sized-deallocation'
const PROGRAM_FLAGS = '-g1 -fno-stack-protector -fno-pie -Wall'

function walk(dir) {
    const out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) out.push(...walk(full))
        else out.push(full)
    }
    return out.sort()
}

function cmakeLists(target, programs) {
    const t = TARGETS[target]
    const lines = [
        'cmake_minimum_required(VERSION 3.10)',
        'project(aed C ASM)',
        `separate_arguments(TARGET_FLAGS UNIX_COMMAND "${t.flags}")`,
        `separate_arguments(LIB_FLAGS UNIX_COMMAND "${LIB_FLAGS} ${WARNINGS}")`,
        `separate_arguments(PROGRAM_FLAGS UNIX_COMMAND "${PROGRAM_FLAGS}")`,
        'set(SYSROOT -nostdinc -isystem ${CMAKE_SOURCE_DIR}/include)',
        'file(GLOB_RECURSE C_SOURCES ${CMAKE_SOURCE_DIR}/src/*.c)',
        'file(GLOB_RECURSE CXX_SOURCES ${CMAKE_SOURCE_DIR}/src/*.cpp)',
        'set_source_files_properties(${CXX_SOURCES} PROPERTIES LANGUAGE C)',
        'foreach(f ${C_SOURCES} ${CXX_SOURCES})',
        '  get_filename_component(d ${f} DIRECTORY)',
        '  set_property(SOURCE ${f} APPEND PROPERTY COMPILE_OPTIONS -iquote ${d})',
        'endforeach()',
        'set_property(SOURCE ${C_SOURCES} APPEND PROPERTY COMPILE_OPTIONS -std=c17 -Wno-unterminated-string-initialization)',
        `set_property(SOURCE \${CXX_SOURCES} APPEND PROPERTY COMPILE_OPTIONS "${CXX}")`,
        'add_library(aedobj OBJECT ${C_SOURCES} ${CXX_SOURCES})',
        'target_compile_options(aedobj PRIVATE ${TARGET_FLAGS} ${LIB_FLAGS} ${SYSROOT})',
        // CMake would de-duplicate a repeated -I option, so the include paths go through include_directories.
        'target_include_directories(aedobj PRIVATE ${CMAKE_SOURCE_DIR}/src/internal ${CMAKE_SOURCE_DIR}/arch)',
        'add_library(aed STATIC $<TARGET_OBJECTS:aedobj>)',
        'set_source_files_properties(${CMAKE_SOURCE_DIR}/arch/crt0.s PROPERTIES COMPILE_OPTIONS "${TARGET_FLAGS}")',
        'add_executable(closure ${CMAKE_SOURCE_DIR}/arch/crt0.s ${CMAKE_SOURCE_DIR}/check/main.c $<TARGET_OBJECTS:aedobj>)',
        'target_compile_options(closure PRIVATE ${TARGET_FLAGS} -O2 ${SYSROOT} ${PROGRAM_FLAGS})',
        // The entry is _start on every Target (GNU ld's MIPS default would be __start).
        'target_link_options(closure PRIVATE ${TARGET_FLAGS} -nostdlib -static -Wl,-e,_start)'
    ]
    for (const program of programs) {
        const name = program.replace(/\.(c|cpp)$/, '')
        const cpp = program.endsWith('.cpp')
        for (const opt of ['-O0', '-O2']) {
            const exe = `${name}${opt.replace('-', '_')}`
            lines.push(`add_executable(${exe} \${CMAKE_SOURCE_DIR}/arch/crt0.s \${CMAKE_SOURCE_DIR}/corpus/${program})`)
            if (cpp) lines.push(`set_source_files_properties(\${CMAKE_SOURCE_DIR}/corpus/${program} PROPERTIES LANGUAGE C COMPILE_OPTIONS "${CXX}")`)
            lines.push(`target_compile_options(${exe} PRIVATE \${TARGET_FLAGS} ${opt} \${SYSROOT} \${PROGRAM_FLAGS} ${cpp ? '' : '-std=c17'})`)
            lines.push(`target_link_options(${exe} PRIVATE \${TARGET_FLAGS} -nostdlib -static -Wl,-e,_start${cpp ? ' -Wl,-u,__cxa_pure_virtual' : ''})`)
            lines.push(`target_link_libraries(${exe} aed)`)
        }
    }
    return lines.join('\n') + '\n'
}

async function check(target, programs) {
    const files = []
    const add = (rel, abs) => files.push({ filename: rel, contents: fs.readFileSync(abs, 'utf8') })
    for (const f of walk(path.join(ROOT, 'include'))) add(path.relative(ROOT, f), f)
    for (const f of walk(path.join(ROOT, 'src'))) add(path.relative(ROOT, f), f)
    for (const f of walk(path.join(ROOT, 'arch', target))) add(`arch/${path.basename(f)}`, f)
    files.push({ filename: 'check/main.c', contents: 'int main(void) { return 0; }\n' })
    for (const p of programs) add(`corpus/${p}`, path.join(ROOT, 'tests/corpus', p))
    const body = {
        source: cmakeLists(target, programs),
        lang: 'cmake',
        files,
        options: { userArguments: '', compilerOptions: { executorRequest: false }, filters: { binary: false, execute: false } }
    }
    const started = Date.now()
    const response = await fetch(`${API}/compiler/${TARGETS[target].compiler}/cmake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
    })
    const text = await response.text()
    let json
    try {
        json = JSON.parse(text)
    } catch {
        return { target, ok: false, report: `HTTP ${response.status}: ${text.slice(0, 500)}` }
    }
    // Compiler Explorer colours its build output; strip the ANSI escape codes.
    // eslint-disable-next-line no-control-regex
    const strip = (lines) => (lines ?? []).map((l) => l.text.replace(/\x1b\[[0-9;]*[mK]/g, '')).join('\n')
    const steps = json.buildsteps ?? []
    const failed = steps.filter((s) => s.code !== 0)
    const diagnostics = steps.map((s) => strip(s.stderr)).join('\n').trim()
    const built = steps.map((s) => strip(s.stdout)).join('\n').match(/Built target \S+/g) ?? []
    const seconds = ((Date.now() - started) / 1000).toFixed(0)
    const kb = (JSON.stringify(body).length / 1024).toFixed(0)
    return {
        target,
        timedOut: /processing time exceeded/.test(diagnostics),
        ok: failed.length === 0 && !diagnostics,
        report: `${built.length} targets built in ${seconds}s (request ${kb} KB)${diagnostics ? `\n${diagnostics}` : ''}${failed.length ? `\nfailed steps: ${failed.map((s) => s.step).join(', ')}` : ''}`
    }
}

// Compiler Explorer limits the processing time of one request, so a corpus that takes too long is split in halves
// (each request builds the library again).
async function checkSplit(target, programs, label) {
    const r = await check(target, programs)
    if (r.timedOut && programs.length > 1) {
        const half = Math.ceil(programs.length / 2)
        return (await checkSplit(target, programs.slice(0, half), `${label}a`)) & (await checkSplit(target, programs.slice(half), `${label}b`))
    }
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${target}${label ? ` part ${label}` : ''} (${TARGETS[target].compiler}, ${programs.length} programs): ${r.report}`)
    return r.ok ? 1 : 0
}

const corpus = CORPUS ? fs.readdirSync(path.join(ROOT, 'tests/corpus')).filter((f) => /\.(c|cpp)$/.test(f)).sort() : []
let failures = 0
for (const target of Object.keys(TARGETS).filter((t) => !ONLY || ONLY.includes(t))) {
    if (!(await checkSplit(target, corpus, ''))) failures++
}
process.exit(failures ? 1 : 0)
