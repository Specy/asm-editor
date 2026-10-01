import { capitalize } from '$lib/utils'
import { summaryOf, type EntryField } from '../entries'

/**
 * A MARS or RARS service, as `MIPS-documentation.ts` and `RISC-V-documentation.ts` both describe
 * them: the same services under the same numbers, only the registers differ. Kept here rather than
 * in either adapter, so that neither language's pages load the other's Core.
 */
export type MarsSyscall = {
    name: string
    code: number
    arguments: { name: string; description: string }[]
    result: { arguments?: { name: string; description: string }[]; other?: string }
}

export function syscallFields(syscall: MarsSyscall): EntryField[] {
    const fields: EntryField[] = syscall.arguments.map((argument) => ({
        label: argument.name,
        value: capitalize(argument.description)
    }))
    for (const result of syscall.result.arguments ?? []) {
        fields.push({ label: `${result.name} after`, value: capitalize(result.description) })
    }
    if (syscall.result.other && syscall.result.other !== 'N/A') {
        fields.push({ label: 'Note', value: syscall.result.other })
    }
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
