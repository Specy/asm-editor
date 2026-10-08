#!/usr/bin/env node
// Recaptures the editor's Compiler Explorer fixtures (src/lib/sourceCompilation/fixtures): the same
// request the editor sends, compiled against the Runtime library's headers, or for x86, which has
// no Runtime library yet, against its freestanding ones alone. Each fixture keeps its source,
// headers and expected result; only `response` changes.
//
//   node scripts/runtime/capture-compile-fixtures.mjs [--target MIPS,RISC-V,RISC-V-64,X86]
//
// Kept in step with createCompilerRequest in src/lib/sourceCompilation/compilerExplorer.ts.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GCC_INTEL_V1 } from '@specy/x86/compiler-output'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixtures = join(repository, 'src', 'lib', 'sourceCompilation', 'fixtures')
const include = join(repository, 'runtime', 'include')
const PRESETS = {
    'RISC-V': { c: 'rv32-cgcc1420', cpp: 'rv32-gcc1420', flags: '-march=rv32imfd -mabi=ilp32d' },
    'RISC-V-64': { c: 'rv64-cgcc1420', cpp: 'rv64-gcc1420', flags: '-march=rv64imfd -mabi=lp64d' },
    MIPS: {
        c: 'cmipsg1420',
        cpp: 'mipsg1420',
        flags: '-march=mips32 -mabi=32 -mno-abicalls -fno-pic -G0 -fno-delayed-branch -mfp32 -mhard-float -EL'
    },
    X86: { c: 'cg142', cpp: 'g142', flags: GCC_INTEL_V1.flags.target.join(' ') }
}
const X86_HEADERS = [
    'stddef.h',
    'stdint.h',
    'stdbool.h',
    'stdarg.h',
    'limits.h',
    'float.h',
    'iso646.h',
    'stdnoreturn.h',
    'cstddef',
    'cstdint',
    'climits',
    'cfloat',
    'cstdarg',
    'new'
]
/** The Environment library's header each Target's compile uploads as `sysroot/include/sim.h`. */
const SIM_HEADERS = {
    MIPS: 'mips.h',
    'RISC-V': 'riscv32.h',
    'RISC-V-64': 'riscv64.h',
    X86: 'x86_64.h'
}
const option = process.argv.indexOf('--target')
const targets = option === -1 ? Object.keys(PRESETS) : process.argv[option + 1].split(',')

function walk(directory) {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name)
        return statSync(path).isDirectory() ? walk(path) : [path]
    })
}
const sysroot = walk(include).map((path) => ({
    filename: `sysroot/include/${relative(include, path).split('\\').join('/')}`,
    contents: readFileSync(path, 'utf8')
}))

for (const name of readdirSync(fixtures)
    .filter((name) => name.endsWith('.json'))
    .sort()) {
    const path = join(fixtures, name)
    const fixture = JSON.parse(readFileSync(path, 'utf8'))
    if (!targets.includes(fixture.target)) continue
    const preset = PRESETS[fixture.target]
    const x86 = fixture.target === 'X86'
    const language = fixture.sourcePath.endsWith('.c') ? 'c' : 'cpp'
    const directory = fixture.sourcePath.includes('/') ? dirname(fixture.sourcePath) : '.'
    const profile = GCC_INTEL_V1.flags
    const common = x86
        ? [
              `-O${fixture.optimization}`,
              '-fdiagnostics-color=never',
              '-fno-section-anchors',
              '-ffreestanding',
              ...profile.translation,
              ...profile.locations
          ].join(' ')
        : `-O${fixture.optimization} -g1 -fdiagnostics-color=never -fno-verbose-asm -fno-stack-protector -fno-pie -fno-section-anchors`
    const standard = x86
        ? profile.language[language].join(' ')
        : language === 'cpp'
          ? '-std=c++17 -fno-exceptions -fno-rtti'
          : '-std=c17'
    //and the Target's own <sim.h>
    const headers = [
        ...(x86
            ? sysroot.filter(({ filename }) =>
                  X86_HEADERS.includes(filename.slice('sysroot/include/'.length))
              )
            : sysroot),
        {
            filename: 'sysroot/include/sim.h',
            contents: readFileSync(
                join(
                    repository,
                    'src/lib/sourceRuntime/generated/sim',
                    SIM_HEADERS[fixture.target]
                ),
                'utf8'
            )
        }
    ]
    const quoteDirectory = directory === '.' ? 'project' : `project/${directory}`
    const userArguments = `${common} -nostdinc -isystem sysroot/include ${preset.flags} -iquote '${quoteDirectory}' -iquote project -include 'project/${fixture.sourcePath}' ${standard}${language === 'cpp' ? ' -fno-threadsafe-statics -nostdinc++' : ''}`
    const body = {
        source: '/* The program is uploaded at its Project path and read through -include. */\n',
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
        files: [
            {
                filename: `project/${fixture.sourcePath}`,
                contents: `#line 1 ${JSON.stringify(fixture.sourcePath)}\n${fixture.source}`
            },
            ...Object.entries(fixture.headers).map(([filename, contents]) => ({
                filename: `project/${filename}`,
                contents: `#line 1 ${JSON.stringify(filename)}\n${contents}`
            })),
            ...headers
        ]
    }
    const reply = await fetch(`https://godbolt.org/api/compiler/${preset[language]}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
    })
    if (!reply.ok) throw new Error(`${name}: HTTP ${reply.status}`)
    const response = await reply.json()
    if (response.code !== 0) {
        const messages = [...(response.stderr ?? [])].map((line) => line.text).join('\n')
        throw new Error(`${name} does not compile:\n${messages}`)
    }
    fixture.response = { code: response.code, asm: response.asm, stderr: response.stderr ?? [] }
    fixture.captured = new Date().toISOString().slice(0, 10)
    //an x86 program links the editor's start unit rather than a Runtime library
    fixture.hosted = !x86
    writeFileSync(path, JSON.stringify(fixture, null, 4) + '\n')
    console.log(`captured ${name}`)
    await new Promise((resolve) => setTimeout(resolve, 300))
}
