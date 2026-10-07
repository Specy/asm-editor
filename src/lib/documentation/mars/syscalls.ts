import { capitalize } from '$lib/utils'
import { summaryOf, type EntryField } from '../entries'
import { simPrototype, type MarsSyscall } from './syscallBinding'

/**
 * How a MARS or RARS service reads on its Documentation entry. The services themselves are data in
 * `mipsSyscalls.ts` and `riscvSyscalls.ts`, kept out of the adapters so that neither language's
 * pages load the other's Core.
 */
export type { MarsSyscall }

/** The services a Documentation lists: those its Core offers, in the order of their numbers. */
export function documented(syscalls: Record<number, MarsSyscall>): MarsSyscall[] {
    return Object.values(syscalls).filter((syscall) => syscall.implemented)
}

export function syscallFields(syscall: MarsSyscall): EntryField[] {
    const fields: EntryField[] = []
    if (syscall.arguments.length > 0) {
        fields.push({
            label: 'In',
            value: syscall.arguments
                .map((argument) => `\`${argument.name}\` = ${capitalize(argument.description)}`)
                .join('; ')
        })
    }
    const outputs = syscall.result.arguments ?? []
    const outputMemory = syscall.binding.parameters.filter(
        (parameter) =>
            parameter.out && syscall.arguments.some((argument) => argument.name === parameter.register)
    )
    if (outputs.length > 0 || outputMemory.length > 0) {
        fields.push({
            label: 'Out',
            value: [
                ...outputs.map(
                    (result) => `\`${result.name}\` = ${capitalize(result.description)}`
                ),
                ...outputMemory.map(
                    (parameter) =>
                        `Memory at the address passed in \`${parameter.register}\` is written through the \`${parameter.name}\` pointer.`
                )
            ].join('; ')
        })
    }
    if (syscall.result.other && syscall.result.other !== 'N/A') {
        fields.push({ label: 'Note', value: syscall.result.other })
    }
    //the Environment library's function for the service, as `<sim.h>` declares it
    fields.push({ label: 'From C', value: `\`${simPrototype(syscall.binding)}\`` })
    return fields
}

export function syscallSummary(syscall: MarsSyscall): string {
    const takes = syscall.arguments.map((argument) => `${argument.name}, ${argument.description}`)
    const gives = (syscall.result.arguments ?? []).map(
        (result) => `${result.name}, ${result.description}`
    )
    const parts = [
        takes.length > 0 ? `Takes ${takes.join('; ')}.` : '',
        gives.length > 0 ? `Returns ${gives.join('; ')}.` : ''
    ].filter(Boolean)
    if (parts.length > 0) return summaryOf(parts.join(' '))
    return summaryOf(syscall.result.other ?? capitalize(syscall.name))
}
