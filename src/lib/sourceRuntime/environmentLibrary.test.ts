import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RISCV } from '@specy/risc-v'
import {
    generateSimHeader,
    generateX86SimHeader,
    SIM_HEADER_DIRECTORY,
    SIM_HEADER_TARGETS,
    X86_SIM_HEADER,
    type SimHeaderData,
    type SimHeaderTargetName
} from '../../../scripts/sim-header/simHeader.mjs'
import { mipsSyscalls } from '$lib/documentation/mars/mipsSyscalls'
import { riscvSyscalls } from '$lib/documentation/mars/riscvSyscalls'
import { simPrototype, type MarsSyscall } from '$lib/documentation/mars/syscallBinding'
import {
    x86SimBinding,
    x86SimHeaderData,
    x86SimPrototype,
    X86_SYSCALL_ARGUMENT_REGISTERS
} from '$lib/documentation/x86/syscallBinding'
import { describeX86Syscall, X86_SYSCALLS } from '$lib/languages/X86/X86-documentation'
import {
    MARS_READY_BIT,
    MARS_RECEIVER_CONTROL,
    MARS_RECEIVER_DATA,
    MARS_TRANSMITTER_CONTROL,
    MARS_TRANSMITTER_DATA
} from '$lib/languages/mars/MarsDevices'
import {
    MARS_BASE_ADDRESS_CHOICES,
    MARS_DISPLAY_SIZE_CHOICES,
    MARS_UNIT_SIZE_CHOICES
} from '$lib/languages/mars/marsDisplay'
import { makeMipsCore } from '$lib/languages/MIPS/MIPS-core'
import { makeRiscVCore } from '$lib/languages/RISC-V/RISC-V-core'
import { compileSource, prepareAssembly } from '$lib/sourceCompilation/compilerExplorer'
import { fileFingerprint } from '$lib/sourceCompilation/records'
import {
    ENVIRONMENT_HEADER_PATH,
    hasEnvironmentLibrary,
    loadedEnvironmentHeader,
    loadEnvironmentHeader
} from './environmentLibrary'
import { parseRuntimeSourcePath } from './runtimeLibrary'

/**
 * `<sim.h>` is generated from the Documentation's data and committed per Target (the plan's
 * decision 11): these tests regenerate it and compare, and check what it promises against the data,
 * the device constants and the Cores.
 */

const address = (label: string) =>
    MARS_BASE_ADDRESS_CHOICES.find((choice) => choice.label === label)!.address
const DATA: Omit<SimHeaderData, 'syscalls'> = {
    devices: {
        receiverControl: MARS_RECEIVER_CONTROL,
        receiverData: MARS_RECEIVER_DATA,
        transmitterControl: MARS_TRANSMITTER_CONTROL,
        transmitterData: MARS_TRANSMITTER_DATA,
        readyBit: MARS_READY_BIT
    },
    display: {
        sizes: MARS_DISPLAY_SIZE_CHOICES,
        units: MARS_UNIT_SIZE_CHOICES,
        staticData: address('static data'),
        staticDataEnd: 0x10400000
    }
}
const TARGETS = Object.keys(SIM_HEADER_TARGETS) as SimHeaderTargetName[]
const syscallsOf = (target: SimHeaderTargetName): Record<number, MarsSyscall> =>
    SIM_HEADER_TARGETS[target].syscalls === 'mips' ? mipsSyscalls : riscvSyscalls
const committed = (target: SimHeaderTargetName | 'x86_64') =>
    readFileSync(`${SIM_HEADER_DIRECTORY}/${target}.h`, 'utf8')
const LANGUAGES = { mips: 'MIPS', riscv32: 'RISC-V', riscv64: 'RISC-V-64' } as const

describe('the committed headers', () => {
    it.each(TARGETS)('%s.h is what the data generates', (target) => {
        const text = generateSimHeader(target, { ...DATA, syscalls: syscallsOf(target) })
        expect(committed(target), `run node scripts/sim-header/generate.mjs`).toBe(text)
        //uploaded with every compile, whose request may not pass 1 MiB
        expect(new TextEncoder().encode(text).length).toBeLessThan(32 * 1024)
    })

    it('x86_64.h is what the x86 syscall table generates', () => {
        const text = generateX86SimHeader(x86SimHeaderData())
        expect(committed(X86_SIM_HEADER.file), `run node scripts/sim-header/generate.mjs`).toBe(
            text
        )
        //about 110 functions, uploaded with every x86 compile beside the freestanding headers
        const size = new TextEncoder().encode(text).length
        expect(size, `x86_64.h is ${size} bytes`).toBeLessThan(64 * 1024)
    })

    it('are what the generator writes under plain Node', () => {
        //--check fails when a header differs from what the data generates
        execFileSync(process.execPath, ['scripts/sim-header/generate.mjs', '--check'], {
            encoding: 'utf8',
            stdio: 'pipe'
        })
    })
})

describe.each(TARGETS)('<sim.h> for %s', (target) => {
    const text = committed(target)
    const lines = text.split('\n')
    const syscalls = Object.values(syscallsOf(target))

    it('defines each service the Documentation lists, once, with its prototype', () => {
        for (const syscall of syscalls) {
            const { binding } = syscall
            const definitions = lines.flatMap((line, index) =>
                line.startsWith('static inline ') && new RegExp(`[ *]${binding.name}\\(`).test(line)
                    ? [index]
                    : []
            )
            if (!syscall.implemented) {
                //services the Core does not implement are excluded
                expect(definitions, binding.name).toEqual([])
                continue
            }
            expect(definitions, binding.name).toHaveLength(1)
            const [index] = definitions
            const attribute = binding.noreturn ? '__attribute__((__noreturn__)) ' : ''
            expect(lines[index]).toBe(`static inline ${attribute}${simPrototype(binding)} {`)
            //its one-line doc comment says which service it is and where its arguments go
            const comment = lines[index - 1]
            expect(comment).toMatch(/^\/\*\* .* \*\/$/)
            expect(comment).toContain(`, service ${syscall.code}.`)
            for (const argument of syscall.arguments) expect(comment).toContain(argument.name)
            //and its body issues the service in the service register, and nothing else
            const body = lines.slice(index + 1, lines.indexOf('}', index))
            const call = SIM_HEADER_TARGETS[target].call
            expect(body.filter((line) => line.includes(`__asm__ volatile("${call}"`))).toHaveLength(
                1
            )
            expect(body.join('\n')).toContain(`= ${syscall.code};`)
            expect(body.join('\n')).toContain('"memory"')
            if (binding.noreturn)
                expect(body[body.length - 1]?.trim()).toBe('__builtin_unreachable();')
        }
        expect(text).toContain('sim_random_seed')
        expect(text.includes('sim_get_cwd')).toBe(target !== 'mips')
    })

    it('binds the registers the Documentation names, by number on MIPS', () => {
        if (target === 'mips') {
            expect(text).toContain('register int v0 __asm__("$2") = 1;')
            expect(text).toContain('register int a0 __asm__("$4") = value;')
            expect(text).toContain('register float f12 __asm__("$f12") = value;')
            expect(text).not.toMatch(/__asm__\("\$[av]\d"\)/)
        } else {
            expect(text).toContain('register int a7 __asm__("a7") = 1;')
            expect(text).toContain('register double fa0 __asm__("fa0") = value;')
            //RARS returns this dialog's float in f0, and 53 zeroes f0 before writing fa0
            expect(text).toContain('register float f0 __asm__("f0");')
            expect(text).toMatch(/"ecall" : "=f"\(fa0\), "=r"\(a1\) : .* : "memory", "f0"\);/)
        }
        //time's halves make one value, the low one read unsigned
        expect(text).toContain(
            'return (long long)(((unsigned long long)(unsigned)a1 << 32) | (unsigned)a0);'
        )
    })

    it('reaches the devices at the addresses the editor serves them from', () => {
        const hex = (value: number) => `0x${(value >>> 0).toString(16)}ul`
        expect(text).toContain(
            `return (*(volatile unsigned *)${hex(MARS_RECEIVER_CONTROL)} & 0x1u) != 0;`
        )
        expect(text).toContain(`return (int)*(volatile unsigned *)${hex(MARS_RECEIVER_DATA)};`)
        expect(text).toContain(
            `return (*(volatile unsigned *)${hex(MARS_TRANSMITTER_CONTROL)} & 0x1u) != 0;`
        )
        expect(text).toContain(
            `*(volatile unsigned *)${hex(MARS_TRANSMITTER_DATA)} = (unsigned)character;`
        )
    })

    it('caps SIM_SCREEN at the static data the Cores have room for', () => {
        expect(text).toContain('* 4 <= 4128768, \\')
        expect(text).toContain('# @screen width=')
        expect(text).toContain('#ifdef __cplusplus\n#define __SIM_STATIC_ASSERT static_assert')
    })
})

/** Whether a host GCC compiles for x86-64, which the x86 header is written for. */
const HOST_X86_GCC = (() => {
    try {
        return /^x86_64-/.test(execFileSync('gcc', ['-dumpmachine'], { encoding: 'utf8' }))
    } catch {
        return false
    }
})()

describe('<sim.h> for x86_64', () => {
    const text = committed('x86_64')
    const lines = text.split('\n')
    const declare = (type: string, name: string) =>
        type.endsWith('*') ? `${type}${name}` : `${type} ${name}`

    it('defines each call the Documentation lists but rt_sigreturn, once, with its prototype', () => {
        for (const syscall of X86_SYSCALLS) {
            const definitions = lines.flatMap((line, index) =>
                line.startsWith('static inline ') && line.includes(` sim_${syscall.name}(`)
                    ? [index]
                    : []
            )
            const binding = x86SimBinding(syscall)
            if (!binding) {
                //the one-to-one rule's single exception: a signal trampoline, not a call to make
                expect(syscall.name).toBe('rt_sigreturn')
                expect(definitions).toEqual([])
                continue
            }
            expect(definitions, syscall.name).toHaveLength(1)
            const [index] = definitions
            const attribute = binding.noreturn ? '__attribute__((__noreturn__)) ' : ''
            expect(lines[index]).toBe(`static inline ${attribute}${x86SimPrototype(binding)} {`)
            //its doc comment names the call and its number, then the Documentation's description
            const comment = lines[index - 1]
            expect(comment).toMatch(/^\/\*\* .* \*\/$/)
            expect(comment).toContain(`/** ${syscall.name}, syscall ${syscall.number}.`)
            expect(comment).toContain(describeX86Syscall(syscall.name))
            //the number in rax, each argument in its register, one syscall naming them all
            const body = lines.slice(index + 1, lines.indexOf('}', index))
            expect(body[0]).toBe(`    register long rax __asm__("rax") = ${syscall.number};`)
            binding.parameters.forEach((parameter, position) => {
                expect(parameter.register).toBe(X86_SYSCALL_ARGUMENT_REGISTERS[position])
                expect(body[position + 1]).toBe(
                    `    register ${declare(parameter.type, parameter.register)} __asm__("${parameter.register}") = ${parameter.name};`
                )
            })
            const inputs = binding.parameters.map((parameter) => `"r"(${parameter.register})`)
            const operands = (items: string[]) => (items.length ? ` ${items.join(', ')} ` : ' ')
            expect(body[binding.parameters.length + 1]).toBe(
                binding.noreturn
                    ? `    __asm__ volatile("syscall" : :${operands(['"r"(rax)', ...inputs])}: "rcx", "r11", "memory");`
                    : `    __asm__ volatile("syscall" : "+r"(rax) :${operands(inputs)}: "rcx", "r11", "memory");`
            )
            //the raw result, a negative errno on failure, or nothing after the end of the program
            expect(body.slice(binding.parameters.length + 2)).toEqual([
                binding.noreturn ? '    __builtin_unreachable();' : '    return rax;'
            ])
        }
        expect(lines.filter((line) => line.startsWith('static inline '))).toHaveLength(
            X86_SYSCALLS.length - 1
        )
        expect(text).toContain(' * rt_sigreturn (15) has no function: only the restorer')
    })

    it('ends the program from exit and exit_group only', () => {
        const noreturn = lines.filter((line) => line.includes('__noreturn__'))
        expect(noreturn).toEqual([
            'static inline __attribute__((__noreturn__)) void sim_exit(long status) {',
            'static inline __attribute__((__noreturn__)) void sim_exit_group(long status) {'
        ])
    })

    it('belongs to an x86-64 compilation, in C or C++, and spells asm as C17 has it', () => {
        expect(text).toContain('#ifndef SIM_H\n#define SIM_H\n')
        expect(text).toContain(
            '#if !(defined(__x86_64__))\n#error "This <sim.h> is the x86 one, included in a compilation for another Target"\n#endif'
        )
        expect(text).toContain('#ifdef __cplusplus\nextern "C" {\n#endif')
        expect(text.trimEnd().endsWith('#ifdef __cplusplus\n}\n#endif\n\n#endif')).toBe(true)
        //-std=c17 has no `asm` keyword, only GCC's `__asm__`
        expect(text).not.toMatch(/\basm\b/)
    })

    it.skipIf(!HOST_X86_GCC)(
        'compiles every function in C17 and C++17, warning about nothing',
        () => {
            const { calls } = x86SimHeaderData()
            const argument = (type: string, position: number) =>
                type === 'long' ? String(position + 1) : 'buffer'
            const call = (binding: (typeof calls)[number]['binding']) =>
                `${binding.name}(${binding.parameters.map((p, i) => argument(p.type, i)).join(', ')})`
            const returning = calls.filter((item) => !item.binding.noreturn)
            const program = [
                '#include <sim.h>',
                'static char buffer[64];',
                'long total;',
                'void every(int which) {',
                '    switch (which) {',
                ...returning.map(
                    (item, index) => `    case ${index}: total += ${call(item.binding)}; break;`
                ),
                '    case -1: sim_exit(1);',
                '    default: sim_exit_group(2);',
                '    }',
                '}'
            ].join('\n')
            const directory = mkdtempSync(join(tmpdir(), 'sim-x86-'))
            try {
                writeFileSync(join(directory, 'sim.h'), text)
                writeFileSync(join(directory, 'every.c'), program)
                for (const [compiler, standard] of [
                    ['gcc', '-std=c17'],
                    ['g++', '-std=c++17']
                ]) {
                    const output = execFileSync(
                        compiler,
                        [
                            ...(compiler === 'g++' ? ['-x', 'c++'] : []),
                            standard,
                            '-O2',
                            '-ffreestanding',
                            '-nostdinc',
                            '-isystem',
                            directory,
                            '-masm=intel',
                            '-Wall',
                            '-Wextra',
                            '-Werror',
                            '-S',
                            '-o',
                            '-',
                            join(directory, 'every.c')
                        ],
                        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
                    )
                    //one call site each, inlined
                    const syscalls = output.split('\n').filter((line) => /^\s*syscall\b/.test(line))
                    expect(syscalls, compiler).toHaveLength(calls.length)
                }
            } finally {
                rmSync(directory, { recursive: true, force: true })
            }
        },
        30_000
    )

    it.skipIf(!HOST_X86_GCC)('accepts Linux ABI pointer arguments in real C and C++ calls', () => {
        // This source describes the caller's types independently of the generated binding table.
        // In particular, GCC rejects passing a pointer to an old bare "long value" parameter.
        const program = `#include <sim.h>
struct data { long words[64]; };
struct pollfd { int fd; short events, revents; };
long pointer_calls(void) {
    struct data data = {{0}}, old = {{0}};
    struct pollfd fds[2] = {{0, 0, 0}, {0, 0, 0}};
    unsigned groups[2] = {0}, ruid = 0, euid = 0, suid = 0;
    char path[] = "file", dirents[128] = {0};
    long offset = 0, tid = 0;
    long result = 0;
    result += sim_poll(fds, 2, 0);
    result += sim_brk(&data);
    result += sim_ioctl(0, 0, &data);
    result += sim_mremap(&data, sizeof data, sizeof data, 0, &old);
    result += sim_msync(&data, sizeof data, 0);
    result += sim_madvise(&data, sizeof data, 0);
    result += sim_getitimer(0, &data);
    result += sim_setitimer(0, &data, &old);
    result += sim_sendfile(1, 0, &offset, 1);
    result += sim_uname(&data);
    result += sim_gettimeofday(&data, &old);
    result += sim_getrusage(0, &data);
    result += sim_sysinfo(&data);
    result += sim_times(&data);
    result += sim_getgroups(2, groups);
    result += sim_setgroups(2, groups);
    result += sim_getresuid(&ruid, &euid, &suid);
    result += sim_getresgid(&ruid, &euid, &suid);
    result += sim_rt_sigpending(&data);
    result += sim_sigaltstack(&data, &old);
    result += sim_utime(path, &data);
    result += sim_statfs(path, &data);
    result += sim_fstatfs(0, &data);
    result += sim_arch_prctl(0, &data);
    result += sim_sched_getaffinity(0, sizeof data, &data);
    result += sim_getdents64(0, dirents, sizeof dirents);
    result += sim_set_tid_address(&tid);
    result += sim_clock_getres(0, &data);
    result += sim_utimes(path, &data);
    result += sim_futimesat(0, path, &data);
    result += sim_pselect6(2, &data, &old, &data, &data, &old);
    result += sim_ppoll(fds, 2, &data, &old, sizeof old);
    result += sim_fcntl(0, 0, 0);
    result += sim_prctl(0, 0, 0, 0, 0);
    return result;
}`
        const directory = mkdtempSync(join(tmpdir(), 'sim-x86-pointers-'))
        try {
            writeFileSync(join(directory, 'sim.h'), text)
            writeFileSync(join(directory, 'calls.c'), program)
            for (const [compiler, standard] of [
                ['gcc', '-std=c17'],
                ['g++', '-std=c++17']
            ])
                execFileSync(
                    compiler,
                    [
                        ...(compiler === 'g++' ? ['-x', 'c++'] : []),
                        standard,
                        '-ffreestanding',
                        '-nostdinc',
                        '-isystem',
                        directory,
                        '-Wall',
                        '-Wextra',
                        '-Werror',
                        '-fsyntax-only',
                        join(directory, 'calls.c')
                    ],
                    { stdio: ['ignore', 'pipe', 'pipe'] }
                )
        } finally {
            rmSync(directory, { recursive: true, force: true })
        }
    })
})

describe('the static-data cap', () => {
    afterEach(() => RISCV.setIs64Bit(false))

    /** A GNU-profile program whose `.bss` holds `bytes`, as a compiled grid would. */
    const program = (bytes: number, riscv: boolean) =>
        `        .text\n        .globl  main\nmain:\n        ${riscv ? 'ret' : 'jr $31'}\n        .bss\n        .globl  grid\n        .p2align 2\ngrid:\n        .space  ${bytes}\n`
    const errors = (target: SimHeaderTargetName, bytes: number) => {
        const files = { 'main.s': program(bytes, target !== 'mips') }
        RISCV.setIs64Bit(target === 'riscv64')
        const core =
            target === 'mips'
                ? makeMipsCore(files, 'main.s', 'gnu-compiler-v1')
                : makeRiscVCore(files, 'main.s', 'gnu-compiler-v1')
        return core
            .assemble()
            .errors.filter((error) => !error.isWarning)
            .map((error) => error.message)
    }

    it.each(TARGETS)('moves the %s heap after a 512 KiB grid', (target) => {
        const bytes = 512 * 256 * 4
        const files = { 'main.s': program(bytes, target !== 'mips') }
        RISCV.setIs64Bit(target === 'riscv64')
        const core =
            target === 'mips'
                ? makeMipsCore(files, 'main.s', 'gnu-compiler-v1')
                : makeRiscVCore(files, 'main.s', 'gnu-compiler-v1')
        expect(core.assemble().errors.filter((error) => !error.isWarning)).toEqual([])
        expect(core.getHeapStart()).toBeGreaterThanOrEqual(address('static data') + bytes)
        expect(core.getHeapStart() % 4096).toBe(0)
    })

    it.each(TARGETS)('bounds %s GNU-profile static data', (target) => {
        const limit = 0x10400000 - address('static data')
        expect(limit).toBe(4128768)
        expect(errors(target, limit)).toEqual([])
        expect(errors(target, limit + 4).join('\n')).toContain('past the end of the data segment')
    })
})

describe('loading <sim.h>', () => {
    it('gives each Target with source compilation its own text', async () => {
        const headers = [
            ...TARGETS.map((target) => [LANGUAGES[target], target] as const),
            ['X86', X86_SIM_HEADER.file] as const
        ]
        for (const [language, file] of headers) {
            expect(hasEnvironmentLibrary(language)).toBe(true)
            expect(await loadEnvironmentHeader(language)).toBe(committed(file))
            expect(loadedEnvironmentHeader(language)).toBe(committed(file))
        }
        for (const language of ['M68K', 'Z80'] as const) {
            expect(hasEnvironmentLibrary(language)).toBe(false)
            expect(await loadEnvironmentHeader(language)).toBeUndefined()
        }
    })

    it('is a read-only source under @runtime/ with no Runtime ABI', () => {
        expect(parseRuntimeSourcePath(ENVIRONMENT_HEADER_PATH)).toEqual({ kind: 'environment' })
        expect(parseRuntimeSourcePath('@runtime/v1/src/stdio/puts.c')).toEqual({
            kind: 'library',
            abi: 'v1',
            source: 'src/stdio/puts.c'
        })
        expect(parseRuntimeSourcePath('@runtime/v1/stdio/puts.s')).toBeUndefined()
    })

    it('is uploaded for x86 too, beside the freestanding headers', async () => {
        const fetcher = vi.fn(
            async () => new Response(JSON.stringify({ code: 1, stderr: [], asm: [] }))
        )
        await compileSource(
            {
                sourcePath: 'main.c',
                outputPath: 'main.c.asm',
                files: { 'main.c': { encoding: 'plain', content: 'int main(void) { return 0; }' } },
                target: 'X86',
                optimization: '0'
            },
            undefined,
            fetcher
        ).catch(() => undefined)
        const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
        const files = JSON.parse(String(init.body)).files as {
            filename: string
            contents: string
        }[]
        expect(files.find((file) => file.filename === 'sysroot/include/sim.h')?.contents).toBe(
            committed('x86_64')
        )
        //and no header of the C library x86 does not have yet
        expect(files.map((file) => file.filename)).not.toContain('sysroot/include/stdio.h')
    })
})

describe('the Source map of a compilation that uploaded <sim.h>', () => {
    const request = {
        sourcePath: 'main.c',
        outputPath: 'main.c.s',
        files: {
            'main.c': { encoding: 'plain' as const, content: '#include <sim.h>\nint main(void) {}' }
        },
        target: 'RISC-V' as const,
        optimization: '2' as const,
        compiler: 'gcc' as const
    }
    const lines = [
        { text: 'main:', source: null },
        { text: '        li      a7,1', source: { file: 'sysroot/include/sim.h', line: 3 } },
        { text: '        ecall', source: { file: '/app/sysroot/include/sim.h', line: 4 } },
        { text: '        li      a0,0', source: { file: 'main.c', line: 2 } },
        { text: '        nop', source: { file: 'sysroot/include/stdio.h', line: 1 } },
        { text: '        nop', source: { file: 'sysroot/include/sim.h', line: 6 } }
    ]

    it('maps the header lines to @runtime/include/sim.h, counted on its own text', () => {
        const readOnly = { [ENVIRONMENT_HEADER_PATH]: 'a\nb\nc\nd\ne' }
        expect(prepareAssembly(lines, request, readOnly).lines).toEqual([
            null,
            { path: ENVIRONMENT_HEADER_PATH, line: 2 },
            { path: ENVIRONMENT_HEADER_PATH, line: 3 },
            { path: 'main.c', line: 1 },
            //the Runtime library's headers still map to no line
            null,
            //past the header's end
            null,
            null
        ])
    })

    it("drops a code line's trailing @screen comment, as Clang's source annotations write", () => {
        const annotated = [
            { text: '        .text', source: null },
            { text: '        # @screen width=64 height=64 unit=1 base=screen', source: null },
            { text: 'main:                                   # @main', source: null },
            { text: '        .type   screen,@object                  # @screen', source: null },
            { text: 'screen:', source: null },
            { text: '        .asciz  "# @screen stays"', source: null }
        ]
        const prepared = prepareAssembly(annotated, {
            ...request,
            compiler: 'clang',
            sourceAnnotations: true
        })
        expect(prepared.assembly.split('\n')).toEqual([
            '        .text',
            '        # @screen width=64 height=64 unit=1 base=screen',
            'main:                                   # @main',
            '        .type   screen,@object',
            'screen:',
            '        .asciz  "# @screen stays"',
            ''
        ])
    })

    it('maps nothing to the header when it was not uploaded', () => {
        expect(prepareAssembly(lines, request).lines.slice(1, 3)).toEqual([null, null])
    })
})

describe('the Source map of an x86 compilation', () => {
    it("maps the header's lines to @runtime/include/sim.h through the translator's locations", async () => {
        const source = '#include <sim.h>\nint main(void) {\n    return (int)sim_getpid();\n}\n'
        const request = {
            sourcePath: 'src/main.c',
            outputPath: 'src/main.c.asm',
            files: { 'src/main.c': { encoding: 'plain' as const, content: source } },
            target: 'X86' as const,
            optimization: '2' as const
        }
        const header = committed('x86_64').split('\n')
        const getpid = header.findIndex((line) => line.includes(' sim_getpid(void) {'))
        //GCC's output with sim_getpid inlined, the `syscall` itself left out so that it translates
        //on a Core whose translator rejects inline assembly
        const lines = [
            '\t.file\t"example.c"',
            '\t.intel_syntax noprefix',
            '\t.text',
            '\t.globl\tmain',
            '\t.type\tmain, @function',
            'main:',
            '\t.file 0 "/app" "/app/example.c"',
            '\t.file 1 "src/main.c"',
            '\t.loc 1 2 16',
            '\t.file 2 "sysroot/include/sim.h"',
            `\t.loc 2 ${getpid + 2} 19`,
            '\tmov\teax, 39',
            '\t.loc 1 4 1',
            '\tret',
            '\t.ident\t"GCC: (Compiler-Explorer-Build-gcc--binutils-2.42) 14.2.0"',
            '\t.section\t.note.GNU-stack,"",@progbits'
        ].map((text) => ({ text }))
        const result = await compileSource(
            request,
            undefined,
            async () => new Response(JSON.stringify({ code: 0, asm: lines }))
        )
        const assembly = result.assembly.split('\n')
        expect(result.map.lines[assembly.indexOf('    mov eax, 39')]).toEqual({
            path: ENVIRONMENT_HEADER_PATH,
            line: getpid + 1
        })
        expect(header[getpid + 1]).toBe('    register long rax __asm__("rax") = 39;')
        expect(result.map.lines[assembly.indexOf('    ret')]).toEqual({
            path: 'src/main.c',
            line: 3
        })
        //the header is the editor's, so the record names the source alone
        expect(result.record.inputs).toEqual({
            'src/main.c': fileFingerprint(request.files['src/main.c'])
        })
    })
})
