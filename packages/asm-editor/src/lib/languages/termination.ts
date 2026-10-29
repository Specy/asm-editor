import { formatTime } from '#lib/utils.ts'
import { formatCycles } from './cycles'

/**
 * How a program ended, which every adapter reads from its Core when the program has terminated
 * (`BaseEmulator._getTermination`) and `GenericEmulator` keeps beside `terminated`:
 *
 * - `exit`: the program ended itself, through its environment's exit service (MARS and RARS exit
 *   and exit2, EASy68K's task 9, Linux `exit` and `exit_group`) or the Z80's `halt` or top-level
 *   `ret`. `code` is its status when the environment has one and the Core reports it: x86 does,
 *   MARS and RARS do from their 4.0.0 Cores.
 * - `end`: it ran past its last instruction (MARS's and RARS's "dropped off bottom", the Z80's
 *   cliff), or the Core says only that it is over. An M68K program ends where it runs into memory
 *   it never wrote, EASy68K's SIMHALT (`$FFFF $FFFF`) outside the bytes it placed, and
 *   `unwrittenMemory` says where, as the Target writes an address: one past its last instruction
 *   when nothing follows it, further on when it ran on through data first.
 * - `signal`: a Linux signal ended it, named as a shell names it: `Segmentation fault`. When the
 *   signal says only that the emulator cannot run what a real processor would, `unsupported` says
 *   that in its place: "stopped: AVX-512 isn't supported yet" for SIGILL on an AVX-512 (EVEX)
 *   instruction.
 * - `error`: a runtime error ended it. A Core reports one by throwing, so `GenericEmulator` records
 *   it from what was thrown, never an adapter.
 *
 * Plain data, no runes, so the Log, the agent and the tests can hold one.
 */
export type Termination =
    | { kind: 'exit'; code?: number }
    | { kind: 'end'; unwrittenMemory?: string }
    | {
          kind: 'signal'
          number: number
          name: string
          description: string
          unsupported?: string
      }
    | { kind: 'error'; message: string }

export type TerminationWordingOptions = {
    /**
     * Whether an error's message is part of the text. The Log keeps it, since it is the record; a
     * line beside the console leaves it out, since the console shows the error itself.
     */
    errorMessage?: boolean
    /**
     * The cycle counter as the program ended, for a Target that counts cycles: the Log's exit line
     * says it, "Ran 1,234 cycles in 12ms" (M68K, [m68k-machine.md](../../../../../docs/design/m68k-machine.md),
     * decision 30).
     */
    cycles?: bigint
    /** Whether `cycles` is an estimate, a 68020 program's: "Ran about 1,234 cycles in 12ms". */
    cyclesEstimate?: boolean
}

/**
 * How the program ended, as one clause the Log, the info lines and the coding agent share:
 * "exited with code 3", "exited", "ran past its last instruction", "ran into memory the program
 * never wrote, at $1012", "Segmentation fault (signal 11)", "stopped: AVX-512 isn't supported
 * yet", "stopped by an error: …".
 */
export function describeTermination(
    termination: Termination,
    options: TerminationWordingOptions = {}
): string {
    switch (termination.kind) {
        case 'exit':
            return termination.code === undefined
                ? 'exited'
                : `exited with code ${termination.code}`
        case 'end':
            return termination.unwrittenMemory === undefined
                ? 'ran past its last instruction'
                : `ran into memory the program never wrote, at ${termination.unwrittenMemory}`
        case 'signal':
            return (
                termination.unsupported ??
                `${termination.description} (signal ${termination.number})`
            )
        case 'error':
            return options.errorMessage === false
                ? 'stopped by an error'
                : `stopped by an error: ${termination.message}`
    }
}

/**
 * Whether the way the program ended says more than that it ended: a status, a signal, an error,
 * or the memory an M68K program ran into, which says where it got to when it did not end itself.
 * A plain end, or an exit with no status, is what every program that finishes does, and the
 * summary leaves it unsaid.
 */
function isNoteworthy(termination: Termination | undefined): termination is Termination {
    if (!termination) return false
    if (termination.kind === 'exit') return termination.code !== undefined
    if (termination.kind === 'end') return termination.unwrittenMemory !== undefined
    return true
}

/**
 * The sentence for a program that has ended, with its running time when a Run measured one (a
 * negative time is unknown, as after a Step): "Ran in 12ms, exited with code 3", "Ran in 12ms",
 * "Segmentation fault (signal 11)", "Program ended". With the cycles a Target counted, they come
 * first: "Ran 1,234 cycles in 12ms", "Ran 1,234 cycles, stopped by an error: …", and an estimate
 * says so, "Ran about 1,234 cycles in 12ms". The Log's exit
 * entry, the Workbench's and the Interactive editor's info lines and the coding agent's state all
 * say it this way.
 */
export function terminationSummary(
    termination: Termination | undefined,
    executionTimeMs: number,
    options: TerminationWordingOptions = {}
): string {
    const detail = isNoteworthy(termination) ? describeTermination(termination, options) : ''
    const time = executionTimeMs >= 0 ? `in ${formatTime(executionTimeMs)}` : ''
    const cycles =
        options.cycles === undefined
            ? ''
            : `${options.cyclesEstimate ? 'about ' : ''}${formatCycles(options.cycles)} ${options.cycles === 1n ? 'cycle' : 'cycles'}`
    if (time || cycles) {
        const ran = ['Ran', cycles, time].filter(Boolean).join(' ')
        return detail ? `${ran}, ${detail}` : ran
    }
    return detail ? detail[0].toUpperCase() + detail.slice(1) : 'Program ended'
}
