import { syscallDocumentation } from '#lib/documentation/x86/executableSections.ts'
import { describeX86Syscall, x86SyscallMap } from '#lib/languages/X86/x86SyscallDescriptions.ts'
import { PSEUDOCODE_LINK } from './pseudocodeHovers'

/**
 * The hover of a system call the decompiler writes as a call, which names no address of the
 * program. It reads the Syscalls Chapter's descriptions, so the Pseudocode's hover provider loads
 * it only when one is hovered, keeping that table out of every editor page.
 */

/** The registers a system call reads its arguments from, in order. */
const SYSCALL_ARGUMENTS = '`rdi`, `rsi`, `rdx`, `r10`, `r8` and `r9`'

/** The system calls that never return to the instruction after them, as the decompiler marks them. */
const SYSCALLS_NOT_RETURNING = new Set(['exit', 'exit_group', 'rt_sigreturn'])

/**
 * A system call the decompiler writes as a call, which names no address of the program: `sys_`
 * and the Linux call's name for a `syscall` instruction whose number it found in `rax`, with what
 * the call does and a link to its entry in the Syscalls Chapter when the Core implements it; and
 * `syscall` for one whose number it did not find or Linux does not have, its argument the number.
 */
export function systemCallMarkdown(word: string): string {
    if (word === 'syscall')
        return `**syscall**: a system call whose number the decompiler could not work out, or that Linux does not have. The program makes it with the \`syscall\` instruction. The argument shown is the number, held in \`rax\`. The call's own arguments, in ${SYSCALL_ARGUMENTS}, are left out.\n\n${PSEUDOCODE_LINK}`
    const name = word.slice('sys_'.length)
    const syscall = x86SyscallMap.get(name)
    const result = SYSCALLS_NOT_RETURNING.has(name)
        ? ''
        : ' Its result is what `rax` holds afterwards.'
    const made = `The program makes it with the \`syscall\` instruction, with its number in \`rax\`. The decompiler writes it as a call whose arguments are the values in ${SYSCALL_ARGUMENTS}, in that order.${result}`
    if (!syscall)
        return [
            `**${word}**: the Linux system call \`${name}\`. ${made}`,
            'The simulator does not implement it. If a run makes this call, it returns `-ENOSYS` (-38), and the **Log** names the call.',
            PSEUDOCODE_LINK
        ].join('\n\n')
    const description = describeX86Syscall(name)
    return [
        `**${word}**: the Linux system call \`${name}\`, number ${syscall.number}. ${made}`,
        ...(description ? [description] : []),
        `[Read about \`${name}\` in the Syscalls chapter](${globalThis.location?.origin ?? ''}${syscallDocumentation(name)})`
    ].join('\n\n')
}
