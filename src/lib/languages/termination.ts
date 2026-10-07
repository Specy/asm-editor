import { formatTime } from '$lib/utils'

/**
 * How a program ended, which every adapter reads from its Core when the program has terminated
 * (`BaseEmulator._getTermination`) and `GenericEmulator` keeps beside `terminated`:
 *
 * - `exit`: the program ended itself, through its environment's exit service (MARS and RARS exit
 *   and exit2, EASy68K's task 9, Linux `exit` and `exit_group`) or the Z80's `halt` or top-level
 *   `ret`. `code` is its status when the environment has one and the Core reports it: x86 does,
 *   MARS and RARS do from their 4.0.0 Cores.
 * - `end`: it ran past its last instruction (MARS's and RARS's "dropped off bottom", the Z80's
 *   cliff), or the Core says only that it is over.
 * - `signal`: a Linux signal ended it, named as a shell names it: `Segmentation fault`.
 * - `error`: a runtime error ended it. A Core reports one by throwing, so `GenericEmulator` records
 *   it from what was thrown, never an adapter.
 *
 * Plain data, no runes, so the Log, the agent and the tests can hold one.
 */
export type Termination =
    | { kind: 'exit'; code?: number }
    | { kind: 'end' }
    | { kind: 'signal'; number: number; name: string; description: string }
    | { kind: 'error'; message: string }

export type TerminationWordingOptions = {
    /**
     * Whether an error's message is part of the text. The Log keeps it, since it is the record; a
     * line beside the console leaves it out, since the console shows the error itself.
     */
    errorMessage?: boolean
}

/**
 * How the program ended, as one clause the Log, the info lines and the coding agent share:
 * "exited with code 3", "exited", "ran past its last instruction", "Segmentation fault (signal
 * 11)", "stopped by an error: …".
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
            return 'ran past its last instruction'
        case 'signal':
            return `${termination.description} (signal ${termination.number})`
        case 'error':
            return options.errorMessage === false
                ? 'stopped by an error'
                : `stopped by an error: ${termination.message}`
    }
}

/**
 * Whether the way the program ended says more than that it ended: a status, a signal or an error.
 * A plain end, or an exit with no status, is what every program that finishes does, and the
 * summary leaves it unsaid.
 */
function isNoteworthy(termination: Termination | undefined): termination is Termination {
    if (!termination) return false
    if (termination.kind === 'exit') return termination.code !== undefined
    return termination.kind !== 'end'
}

/**
 * The sentence for a program that has ended, with its running time when a Run measured one (a
 * negative time is unknown, as after a Step): "Ran in 12ms, exited with code 3", "Ran in 12ms",
 * "Segmentation fault (signal 11)", "Program ended". The Log's exit entry, the Workbench's and the
 * Interactive editor's info lines and the coding agent's state all say it this way.
 */
export function terminationSummary(
    termination: Termination | undefined,
    executionTimeMs: number,
    options: TerminationWordingOptions = {}
): string {
    const detail = isNoteworthy(termination) ? describeTermination(termination, options) : ''
    if (executionTimeMs >= 0) {
        const ran = `Ran in ${formatTime(executionTimeMs)}`
        return detail ? `${ran}, ${detail}` : ran
    }
    return detail ? detail[0].toUpperCase() + detail.slice(1) : 'Program ended'
}
