/**
 * The Environment library, `<sim.h>`, as text: one `static inline` function for each MARS or RARS
 * service a Target's Documentation lists, the keyboard and display registers, and `SIM_SCREEN` for
 * the bitmap display ([ADR 0034](../../docs/adr/0034-environment-library-is-header-only.md)); for
 * x86, one for each Linux system call its Documentation lists.
 *
 * Plain JavaScript and no imports, so `generate.mjs` runs it under Node and the editor's tests
 * regenerate the committed headers in memory from the same data. The data comes in as arguments:
 * the syscall entries of `src/lib/documentation/mars/{mips,riscv}Syscalls.ts`, the device
 * registers of `src/lib/languages/mars/MarsDevices.ts` and the display sizes and memory map of
 * `src/lib/languages/mars/marsDisplay.ts`, which the Documentation's Syscalls and Screen chapters
 * are built from too; for x86, the bindings of `src/lib/documentation/x86/syscallBinding.ts`, which
 * its Syscalls chapter shows.
 */
import { DEVICE_HELPERS, RGB_HELPER, SCREEN_MACRO } from './helpers.mjs'

/** Where the committed headers live, relative to the repository. */
export const SIM_HEADER_DIRECTORY = 'src/lib/sourceRuntime/generated/sim'

/**
 * The Targets with an Environment library on MARS's and RARS's services. x86's has a generator of
 * its own, `generateX86SimHeader`.
 */
export const SIM_HEADER_TARGETS = {
    mips: {
        language: 'MIPS',
        simulator: 'MARS',
        syscalls: 'mips',
        guard: 'defined(__mips__)',
        call: 'syscall',
        serviceRegister: '$v0'
    },
    riscv32: {
        language: 'RISC-V',
        simulator: 'RARS',
        syscalls: 'riscv',
        guard: 'defined(__riscv) && __riscv_xlen == 32',
        call: 'ecall',
        serviceRegister: 'a7'
    },
    riscv64: {
        language: 'RISC-V-64',
        simulator: 'RARS',
        syscalls: 'riscv',
        guard: 'defined(__riscv) && __riscv_xlen == 64',
        call: 'ecall',
        serviceRegister: 'a7'
    }
}

/** MIPS general registers by number: Clang and GCC both take `$4` in a register variable. */
const MIPS_GENERAL_REGISTERS = { $v0: 2, $v1: 3, $a0: 4, $a1: 5, $a2: 6, $a3: 7 }

/** The name a register variable is declared with in an `__asm__` label. */
function asmRegister(register) {
    if (register in MIPS_GENERAL_REGISTERS) return `$${MIPS_GENERAL_REGISTERS[register]}`
    if (/^\$f\d+$/.test(register) || /^(?:a\d|fa\d|f\d+)$/.test(register)) return register
    throw new Error(`<sim.h> has no spelling for the register ${register}`)
}

/** The C name of a register variable: the register as the Documentation spells it, `$` dropped. */
function variableName(register) {
    return register.replace(/^\$/, '')
}

function isFloatRegister(register) {
    return /^\$?f/.test(register)
}

/** `int x`, `const char *x`: how a prototype and a declaration spell a type before a name. */
function declare(type, name) {
    return type.endsWith('*') ? `${type}${name}` : `${type} ${name}`
}

/** `int sim_print_int(int value)`, as `simPrototype` in `syscallBinding.ts` writes it. */
export function prototypeOf(binding) {
    const parameters = binding.parameters.map((parameter) =>
        declare(parameter.type, parameter.name)
    )
    return `${declare(binding.returns.type, binding.name)}(${parameters.join(', ') || 'void'})`
}

function capitalize(text) {
    return text[0].toUpperCase() + text.slice(1)
}

/**
 * What a service takes and returns, in the words of its Documentation entry, whose summary is the
 * first sentence of the same text (`syscallSummary` in `src/lib/documentation/mars/syscalls.ts`):
 * `Takes $a0, integer to print.` Kept whole, as a doc comment has room for the results too.
 */
export function syscallDescription(syscall) {
    //the Documentation lists a register's values one to a line: `option\n0: Yes\n1: No`
    const line = (text) => text.replace(/([.:])?\n/g, (_, mark) => (mark ? `${mark} ` : ', '))
    const sentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`)
    const takes = syscall.arguments.map(
        (argument) => `${argument.name}, ${line(argument.description)}`
    )
    const gives = (syscall.result.arguments ?? []).map(
        (result) => `${result.name}, ${line(result.description)}`
    )
    return [
        takes.length > 0 ? sentence(`Takes ${takes.join('; ')}`) : '',
        gives.length > 0 ? sentence(`Returns ${gives.join('; ')}`) : ''
    ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
}

/** A doc comment of one line: `/** Print integer, service 1. Takes $a0, integer to print. *\/`. */
function docComment(syscall) {
    const description = syscallDescription(syscall)
    const text = `${capitalize(syscall.name)}, service ${syscall.code}.${description ? ` ${description}` : ''}`
    return `/** ${text.replace(/\*\//g, '* /')} */`
}

/**
 * One service's function: a register variable for each register it reads or writes, the service
 * number in the Target's service register, and one `syscall` or `ecall` that names them all as
 * operands, so the compiler places the values there and reads the results back from there.
 */
function serviceFunction(syscall, target) {
    const { binding } = syscall
    const label = `${syscall.code} ${binding.name}`
    /** @type {Map<string, { input?: { type: string, value: string }, output?: { type: string, use: string } }>} */
    const registers = new Map()
    const at = (register) => {
        let entry = registers.get(register)
        if (!entry) registers.set(register, (entry = {}))
        return entry
    }
    at(target.serviceRegister).input = { type: 'int', value: String(syscall.code) }
    for (const parameter of binding.parameters) {
        if (parameter.out) continue
        const entry = at(parameter.register)
        if (entry.input) throw new Error(`${label}: ${parameter.register} is passed twice`)
        entry.input = { type: parameter.type, value: parameter.name }
    }
    const returns = binding.returns
    if ('register' in returns) at(returns.register).output = { type: returns.type, use: 'return' }
    if ('low' in returns) {
        at(returns.low).output = { type: 'int', use: 'low' }
        at(returns.high).output = { type: 'int', use: 'high' }
    }
    for (const parameter of binding.parameters) {
        if (!parameter.out) continue
        if (parameter.type !== 'int *') throw new Error(`${label}: ${parameter.name} is no int *`)
        const entry = at(parameter.register)
        if (entry.output) throw new Error(`${label}: ${parameter.register} is read back twice`)
        entry.output = { type: 'int', use: parameter.name }
    }

    const declarations = []
    const outputs = []
    const inputs = []
    /** What each use of a result reads: the return value, a status, a half of a 64-bit value. */
    const reads = new Map()
    const constraint = (register) => (isFloatRegister(register) ? 'f' : 'r')
    //the arguments first, in the order the service reads them, then the results
    for (const [register, { input, output }] of registers) {
        if (!input) continue
        const name = variableName(register)
        declarations.push(
            `register ${declare(input.type, name)} __asm__("${asmRegister(register)}") = ${input.value};`
        )
        if (output && (output.use === 'low' || output.use === 'high'))
            throw new Error(`${label}: ${register} carries an argument and half of the result`)
        if (output && output.type === input.type) {
            //one variable both ways, as the service register is for the reads that answer in it
            outputs.push(`"+${constraint(register)}"(${name})`)
            reads.set(output.use, name)
        } else inputs.push(`"${constraint(register)}"(${name})`)
    }
    for (const [register, { input, output }] of registers) {
        if (!output || reads.has(output.use)) continue
        //a result that comes back where an argument of another type went in gets a variable of its
        //own in that register
        const name = input ? 'result' : variableName(register)
        if ([...reads.values(), ...binding.parameters.map((p) => p.name)].includes(name))
            throw new Error(`${label}: two variables would be named ${name}`)
        declarations.push(
            `register ${declare(output.type, name)} __asm__("${asmRegister(register)}");`
        )
        outputs.push(`"=${constraint(register)}"(${name})`)
        reads.set(output.use, name)
    }
    const clobbers = ['"memory"', ...(binding.clobbers ?? []).map((r) => `"${asmRegister(r)}"`)]
    const operands = (items) => (items.length ? ` ${items.join(', ')} ` : ' ')
    const statement = `__asm__ volatile("${target.call}" :${operands(outputs)}:${operands(inputs)}: ${clobbers.join(', ')});`
    const body = [...declarations, statement]
    for (const parameter of binding.parameters)
        if (parameter.out) body.push(`*${parameter.name} = ${reads.get(parameter.name)};`)
    if (binding.noreturn) body.push('__builtin_unreachable();')
    else if ('register' in returns) body.push(`return ${reads.get('return')};`)
    else if ('low' in returns)
        body.push(
            `return (long long)(((unsigned long long)(unsigned)${reads.get('high')} << 32) | (unsigned)${reads.get('low')});`
        )
    const attributes = binding.noreturn ? '__attribute__((__noreturn__)) ' : ''
    return [
        docComment(syscall),
        `static inline ${attributes}${prototypeOf(binding)} {`,
        ...body.map((line) => `    ${line}`),
        '}'
    ].join('\n')
}

function hex(value) {
    return `0x${(value >>> 0).toString(16)}`
}

/** `64, 128, 256, 512 or 1024` */
function listed(values) {
    const items = values.map(String)
    return items.length > 1 ? `${items.slice(0, -1).join(', ')} or ${items.at(-1)}` : items[0]
}

/** The keyboard and display registers, as volatile accesses at their addresses. */
function deviceFunctions(devices, simulator) {
    const address = (value) => `(volatile unsigned *)${hex(value)}ul`
    const ready = hex(devices.readyBit)
    return `/*
 * The keyboard and display: the four registers of ${simulator}'s Keyboard and Display MMIO
 * Simulator, read and written as memory. Typed characters wait in a queue, and the console never
 * makes a program wait to print.
 */

${DEVICE_HELPERS.map((helper) => `/** ${helper.headerDoc(devices, hex)} */\nstatic inline ${prototypeOf(helper)} {\n    ${helper.body(devices, address, ready)}\n}`).join('\n\n')}`
}

/** `sim_rgb` and `SIM_SCREEN`, whose grid may not take more than the static data the Core has room for. */
function screenSection(display, target) {
    const limit = display.staticDataEnd - display.staticData
    const size = (value) => display.sizes.map((choice) => `(${value}) == ${choice}`).join(' || ')
    const unit = display.units.map((choice) => `(unit) == ${choice}`).join(' || ')
    return `/*
 * The bitmap display: a grid of words, one color each, drawn on the Screen.
 *
 * SIM_SCREEN(name, width, height, unit) defines the grid as a global array,
 * unsigned name[(width / unit) * (height / unit)], and tells the Build to show it on a display of
 * width by height pixels, each word drawn unit pixels square, wherever the compiler puts it:
 *
 *     SIM_SCREEN(screen, 256, 128, 2);
 *     ...
 *     screen[y * (256 / 2) + x] = sim_rgb(255, 128, 0);
 *
 * Write it once, outside any function, with numbers ${target.simulator}'s display offers: width
 * and height ${listed(display.sizes)}, unit ${listed(display.units)}. The grid shares the
 * ${limit} bytes of static data, from ${hex(display.staticData)} to ${hex(display.staticDataEnd)}, with the program's
 * other global variables and constants. The heap starts on the first page after static data if
 * it passes the default heap base. A larger display needs a larger unit.
 */

/** A color for the bitmap display: red, green and blue from 0 to 255, in the low 24 bits. */
static inline ${prototypeOf(RGB_HELPER)} {
    return ((unsigned)(red & 0xff) << 16) | ((unsigned)(green & 0xff) << 8) | (unsigned)(blue & 0xff);
}

#ifdef __cplusplus
#define __SIM_STATIC_ASSERT static_assert
#else
#define __SIM_STATIC_ASSERT _Static_assert
#endif
#define __SIM_STRING(text) #text
#define __SIM_EXPANDED_STRING(text) __SIM_STRING(text)

#define ${SCREEN_MACRO.name}(${SCREEN_MACRO.parameters.join(', ')}) \\
    __SIM_STATIC_ASSERT((${size('width')}) && (${size('height')}) && (${unit}), \\
        "SIM_SCREEN: width and height must be ${listed(display.sizes)}, and unit ${listed(display.units)}, the sizes ${target.simulator}'s bitmap display offers"); \\
    __SIM_STATIC_ASSERT((width) / (unit) * ((height) / (unit)) * 4 <= ${limit}, \\
        "SIM_SCREEN: the grid does not fit in the ${limit} bytes of static data a ${target.language} program has, which its other global variables and constants share; use a larger unit or a smaller display"); \\
    __asm__("# @screen width=" __SIM_EXPANDED_STRING(width) " height=" __SIM_EXPANDED_STRING(height) " unit=" __SIM_EXPANDED_STRING(unit) " base=" #name); \\
    unsigned name[(width) / (unit) * ((height) / (unit))] __attribute__((__aligned__(4)))`
}

/**
 * The whole header for one Target. Services marked not implemented are left out, as the
 * Documentation leaves them out: their functions arrive with the Core release that offers them.
 */
export function generateSimHeader(targetName, data) {
    const target = SIM_HEADER_TARGETS[targetName]
    if (!target) throw new Error(`There is no <sim.h> for ${targetName}`)
    const services = Object.values(data.syscalls).filter((syscall) => syscall.implemented)
    const source =
        target.syscalls === 'mips'
            ? 'src/lib/documentation/mars/mipsSyscalls.ts'
            : 'src/lib/documentation/mars/riscvSyscalls.ts'
    return `/*
 * <sim.h>: the Environment library of ${target.language}, one function for each ${target.simulator} service the
 * Documentation lists, and the keyboard, display and bitmap display.
 *
 * Generated by scripts/sim-header/generate.mjs from ${source}
 * and ${target.simulator}'s device registers. Do not edit it: regenerate it.
 *
 * Every function is static inline, so the ${target.call} it issues is part of your own Generated
 * assembly: where you call it when optimizing, in a function of its own in your unit at -O0.
 *
 * Number and string sim_read_ functions take a whole line; sim_read_char takes one key.
 * stdio (scanf, getchar, fgets) reads standard input through a buffer of its own: do not mix
 * the two kinds of reads on one line of input.
 */
#ifndef SIM_H
#define SIM_H

#if !(${target.guard})
#error "This <sim.h> is the ${target.language} one, included in a compilation for another Target"
#endif

#ifdef __cplusplus
extern "C" {
#endif

${services.map((syscall) => serviceFunction(syscall, target)).join('\n\n')}

${deviceFunctions(data.devices, target.simulator)}

${screenSection(data.display, target)}

#ifdef __cplusplus
}
#endif

#endif
`
}

/** x86's header: its file under `SIM_HEADER_DIRECTORY`, and the compiler it belongs to. */
export const X86_SIM_HEADER = {
    file: 'x86_64',
    language: 'x86',
    guard: 'defined(__x86_64__)'
}

/** What `syscall` overwrites besides `rax`: `rcx` and `r11`, and memory the kernel writes. */
const SYSCALL_CLOBBERS = ['"rcx"', '"r11"', '"memory"']

/** `long sim_write(long fd, const void *buffer, long count)`, as `x86SimPrototype` writes it. */
export function x86PrototypeOf(binding) {
    const parameters = binding.parameters.map((parameter) =>
        declare(parameter.type, parameter.name)
    )
    return `${declare(binding.returns, binding.name)}(${parameters.join(', ') || 'void'})`
}

/** The words of `text` on comment lines of at most `width` columns. */
function commentLines(text, width = 100) {
    const lines = []
    let line = ' *'
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (line.length + 1 + word.length > width && line !== ' *') {
            lines.push(line)
            line = ' *'
        }
        line += ` ${word}`
    }
    return [...lines, line]
}

/**
 * One call's function: a register variable for `rax`, which holds the call's number, and one for
 * each argument register, then one `syscall` that names them all as operands, so the compiler places
 * the values there and reads the result back from `rax`. A call that ends the program reads `rax`
 * only as an input, and its function never returns.
 */
function linuxFunction(call) {
    const { binding } = call
    const declarations = [
        `register long rax __asm__("rax") = ${binding.number};`,
        ...binding.parameters.map(
            (parameter) =>
                `register ${declare(parameter.type, parameter.register)} __asm__("${parameter.register}") = ${parameter.name};`
        )
    ]
    const inputs = binding.parameters.map((parameter) => `"r"(${parameter.register})`)
    const operands = (items) => (items.length ? ` ${items.join(', ')} ` : ' ')
    const [outputs, reads] = binding.noreturn
        ? [[], ['"r"(rax)', ...inputs]]
        : [['"+r"(rax)'], inputs]
    const statement = `__asm__ volatile("syscall" :${operands(outputs)}:${operands(reads)}: ${SYSCALL_CLOBBERS.join(', ')});`
    const body = [
        ...declarations,
        statement,
        binding.noreturn ? '__builtin_unreachable();' : 'return rax;'
    ]
    const description = call.description.replace(/\s+/g, ' ').trim()
    const text = `${call.name}, syscall ${binding.number}.${description ? ` ${description}` : ''}`
    const attributes = binding.noreturn ? '__attribute__((__noreturn__)) ' : ''
    return [
        `/** ${text.replace(/\*\//g, '* /')} */`,
        `static inline ${attributes}${x86PrototypeOf(binding)} {`,
        ...body.map((line) => `    ${line}`),
        '}'
    ].join('\n')
}

/**
 * x86's whole header: one function for each Linux system call the Documentation lists, which are
 * the calls the Core implements, but for the exceptions the data names, which its preamble explains.
 */
export function generateX86SimHeader(data) {
    const exceptions = data.exceptions.flatMap((call) => [
        ' *',
        ...commentLines(`${call.name} (${call.number}) has no function: ${call.reason}.`)
    ])
    return `/*
 * <sim.h>: the Environment library of ${X86_SIM_HEADER.language}, one function for each Linux system call the
 * Documentation lists, which are the calls the Core implements.
 *
 * Generated by scripts/sim-header/generate.mjs from src/lib/languages/X86/generated/x86Syscalls.ts
 * through src/lib/documentation/x86/syscallBinding.ts. Do not edit it: regenerate it.
 *
 * Every function is static inline, so the syscall it issues is part of your own Generated
 * assembly: where you call it when optimizing, in a function of its own in your unit at -O0.
 *
 * A function makes its call as assembly does: the call's number in rax, its arguments in rdi, rsi,
 * rdx, r10, r8 and r9, then syscall, which also overwrites rcx and r11. It returns what rax holds
 * after the call, the kernel's own result: a failure is a negative error number from -4095 to -1,
 * such as -9 (EBADF) for a descriptor that is not open, not the C library's -1 and errno.
 *
 * A pointer the kernel only reads is a const void *, one it writes a void *, and every other
 * argument a long. Calls whose traced arguments are named only "value" use their Linux ABI
 * pointer types where appropriate; for example, sim_uname(&name) accepts a structure pointer.
${exceptions.join('\n')}
 */
#ifndef SIM_H
#define SIM_H

#if !(${X86_SIM_HEADER.guard})
#error "This <sim.h> is the ${X86_SIM_HEADER.language} one, included in a compilation for another Target"
#endif

#ifdef __cplusplus
extern "C" {
#endif

${data.calls.map(linuxFunction).join('\n\n')}

#ifdef __cplusplus
}
#endif

#endif
`
}
