import { prototypeOf, x86PrototypeOf } from './simHeader.mjs'
import { DEVICE_HELPERS, RGB_HELPER, SCREEN_MACRO } from './helpers.mjs'
import { parametersOf } from '../source-language-help/declarations.mjs'

const capital = (text) => text[0].toUpperCase() + text.slice(1)
const clean = (text) => text.replace(/\s+/g, ' ').trim()
const entry = (name, declaration, summary, href, kind = 'function') => ({
    name,
    kind,
    declaration,
    parameters: parametersOf(declaration, name),
    headers: ['sim.h'],
    summary: clean(summary),
    href,
    definition: 'documentation'
})

export function marsHelpCatalog(target, syscalls) {
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
    return { revision: 1, target: language, entries }
}

export function x86HelpCatalog(data) {
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
    return { revision: 1, target: 'X86', entries }
}
