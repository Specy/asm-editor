import { prototypeOf, x86PrototypeOf } from './simHeader.mjs'
import {
    DEVICE_HELPERS,
    INPUT_HELPERS,
    RGB_HELPER,
    SCREEN_MACRO,
    SYNTH_HELPERS
} from './helpers.mjs'
import { parametersOf } from '../source-language-help/declarations.mjs'

const capital = (text) => text[0].toUpperCase() + text.slice(1)
const clean = (text) => text.replace(/\s+/g, ' ').trim()
const entry = (name, declaration, summary, href, kind = 'function', headers = ['sim.h']) => ({
    name,
    kind,
    declaration,
    parameters: parametersOf(declaration, name),
    headers,
    summary: clean(summary),
    href,
    definition: 'documentation'
})

/**
 * The functions MIPS and RISC-V's own headers declare, the Runtime library's `posix/include/`
 * (`<dirent.h>`, `<sys/stat.h>`, ...), each from the one-line `/** ... *\/` comment right before
 * its declaration, as the library's build reads its shared headers.
 */
export function posixFunctions(headers) {
    const functions = []
    for (const [header, text] of Object.entries(headers).sort(([a], [b]) => (a < b ? -1 : 1))) {
        const pattern =
            /\/\*\*\s*([^\n]*?)\s*\*\/[ \t]*\n[ \t]*([^;{}#/]*?\b([A-Za-z_]\w*)\s*\([^;{}]*\))\s*;/g
        for (const match of text.matchAll(pattern))
            functions.push({
                name: match[3],
                header,
                declaration: clean(match[2])
                    .replace(/\s*\*\s*/g, ' *')
                    .replace(/\( /g, '('),
                doc: clean(match[1])
            })
    }
    return functions
}

export function marsHelpCatalog(target, syscalls, functions = []) {
    const language = target === 'mips' ? 'MIPS' : target === 'riscv32' ? 'RISC-V' : 'RISC-V-64'
    const route = target === 'mips' ? 'mips' : 'risc-v'
    const entries = Object.values(syscalls)
        .filter((call) => call.implemented)
        .map((call) => {
            const binding = call.binding
            const descriptions = binding.parameters
                .map((parameter) => {
                    const description = (
                        parameter.out &&
                        !call.arguments.some((argument) => argument.name === parameter.register)
                            ? call.result.arguments
                            : call.arguments
                    )?.find((argument) => argument.name === parameter.register)?.description
                    return description ? `${parameter.name}: ${clean(description)}.` : ''
                })
                .filter(Boolean)
            const result =
                'register' in binding.returns
                    ? call.result.arguments?.find(
                          (argument) => argument.name === binding.returns.register
                      )?.description
                    : undefined
            const summary = [
                capital(call.name) + '.',
                ...descriptions,
                result ? `Result: ${clean(result)}.` : ''
            ]
                .filter(Boolean)
                .join(' ')
            return entry(
                binding.name,
                prototypeOf(binding),
                summary,
                `/documentation/${route}/syscall#service-${call.code}`
            )
        })
    const helperHref = `/documentation/${route}/using-c#screen-and-devices`
    for (const helper of [...DEVICE_HELPERS, RGB_HELPER])
        entries.push(entry(helper.name, prototypeOf(helper), helper.summary, helperHref))
    const declaration = `${SCREEN_MACRO.name}(${SCREEN_MACRO.parameters.join(', ')})`
    entries.push(entry(SCREEN_MACRO.name, declaration, SCREEN_MACRO.summary, helperHref, 'macro'))
    for (const helper of SYNTH_HELPERS)
        entries.push(
            entry(
                helper.name,
                prototypeOf(helper),
                helper.summary,
                `/documentation/${route}/synth#from-c`
            )
        )
    for (const helper of INPUT_HELPERS)
        entries.push(
            entry(
                helper.name,
                prototypeOf(helper),
                helper.summary,
                `/documentation/${route}/input-controller#from-c`
            )
        )
    //the POSIX functions over the folder calls, which the Runtime library's posix/ implements
    for (const call of functions)
        entries.push(
            entry(
                call.name,
                call.declaration,
                call.doc,
                `/documentation/${route}/runtime-library#${call.name}`,
                'function',
                [call.header]
            )
        )
    return { revision: 1, target: language, entries }
}

/**
 * x86's catalog: a `sim_` function for each system call, and the POSIX calls of its device headers
 * (`deviceFunctions()` of `deviceHeaders.mjs`), each linked to the system call it makes.
 */
export function x86HelpCatalog(data, functions = []) {
    const entries = data.calls.map(({ name, description, binding }) => {
        let summary = description.replace(/`/g, '')
        for (const parameter of binding.parameters)
            summary = summary.replace(
                new RegExp(`\\b${parameter.register}\\b`, 'g'),
                parameter.name
            )
        summary = summary
            .replace(/\brax\b/g, 'the result')
            .replace(/\b(?:rdi|rsi|rdx|r10|r8|r9|rcx|r11)\b/g, 'the argument')
        return entry(
            binding.name,
            x86PrototypeOf(binding),
            summary || `Performs ${name}.`,
            `/documentation/x86/syscall#syscall-${name}`
        )
    })
    for (const call of functions)
        entries.push(
            entry(
                call.name,
                call.declaration,
                call.doc,
                `/documentation/x86/syscall#syscall-${call.documentation}`,
                'function',
                [call.header]
            )
        )
    return { revision: 1, target: 'X86', entries }
}
