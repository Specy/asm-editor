import type { EmulatorInterrupt } from '$lib/languages/commonLanguageFeatures.svelte'
import type { ExecutionController, ExecutionGeneration } from '$lib/languages/ExecutionController'
import { guestFileFailure, type FileSystemSession } from '$lib/languages/peripherals/FileSystem'
import type { EmulatorPeripherals } from '$lib/languages/peripherals/peripheralSet'
import type { MarsDevices } from './MarsDevices'

/**
 * The syscall handlers of the MARS and RARS derived Cores (MIPS and RISC-V): the program's reads,
 * prints, dialogs, Files, time and random seeds, served from the Emulator's peripherals. RARS's
 * services are ports of MARS's and both Cores take the same handlers, so both adapters register the
 * map made here, and a change to the handlers' shapes is made once.
 *
 * Pure transport ([ADR 0035](../../../../docs/adr/0035-environments-match-their-reference.md)):
 * the Cores format what they print and parse what they read, with their Reference environment's
 * rules and errors, so a handler only moves text and bytes between the Core and a Peripheral.
 *
 * Plain TypeScript, no runes, like the devices beside it. The adapter keeps its Core and what the
 * Core's run results mean; it hands over what the handlers read of it, and they read it at the
 * moment they need it, because the Emulator's state, its FileSystem session, its clock and its
 * Random source are all replaced while the Emulator lives.
 */

const READ_CHAR_QUESTION = 'Enter a character'
const READ_DOUBLE_QUESTION = 'Enter a double'
const READ_FLOAT_QUESTION = 'Enter a float'
const READ_INT_QUESTION = 'Enter an integer'
const READ_STRING_QUESTION = 'Enter a string'
const STANDARD_INPUT_QUESTION = 'Enter a line of input'

/**
 * The confirm dialog's answers as MARS and RARS hand them to the program, Swing's `JOptionPane`
 * options, which both Cores' `ConfirmResult` numbers alike. `registerHandlers` checks them against
 * the Core's own enum.
 */
const CONFIRM_RESULT = { YES: 0, NO: 1, CANCEL: 2 } as const

type MarsConfirmResult = (typeof CONFIRM_RESULT)[keyof typeof CONFIRM_RESULT]

/**
 * The handlers both Cores take, with the results the ones made here give. `@specy/mips` and
 * `@specy/risc-v` declare the same map (`HandlerMapFns`), each with its own enums, so it is declared
 * here, as `MarsCore` is, rather than taken from either package: each adapter's `registerHandlers`
 * call checks it against its own Core, so a Core release that changes a handler fails there.
 *
 * Reads answer with the text typed, which the service parses (an empty answer to read char is the
 * service's own error); an input dialog answers null for Cancel, which the program receives as
 * status -2. Bytes cross as plain arrays of numbers from 0 to 255, a count of -1 being a failed file
 * operation and 0 the end of the input.
 */
export type MarsHandlerMap = {
    readChar: () => Promise<string>
    readDouble: () => Promise<string>
    readFloat: () => Promise<string>
    readInt: () => Promise<string>
    readString: () => Promise<string>
    confirm: (message: string) => Promise<MarsConfirmResult>
    inputDialog: (message: string) => Promise<string | null>
    outputDialog: (message: string, type: number) => Promise<void>
    printString: (text: string) => void
    stdOut: (buffer: number[]) => void
    stdErr: (buffer: number[]) => void
    readFile: (descriptor: number, length: number) => [count: number, buffer: number[]]
    writeFile: (descriptor: number, buffer: number[]) => number
    openFile: (path: string, flags: number, append: boolean) => number
    closeFile: (descriptor: number) => void
    stdIn: (length: number) => Promise<[count: number, buffer: number[]]>
    seekFile: (descriptor: number, offset: number, whence: number) => number
    sleep: (milliseconds: number) => Promise<void>
    time: () => number
    randomSeed: (generator: number) => number
}

/** What the handlers read of the adapter that registers them. */
export type MarsHandlerHost = {
    /**
     * The Terminal, the program clock and the Random source. A Testcase swaps the clock for a
     * virtual one and the Random source for a seeded one, so both are read at the point of use.
     */
    peripherals: Pick<EmulatorPeripherals, 'terminal' | 'clock' | 'random'>
    /** What ties a wait or a read to the run that asked for it. */
    executionController: ExecutionController
    /** The bitmap display, whose picture catches up before the program sleeps. */
    devices: Pick<MarsDevices, 'flush'>
    /** Shows the read or dialog the program is waiting on (`state.interrupt`), or clears it. */
    setInterrupt(interrupt: EmulatorInterrupt | undefined): void
    /** The Build's FileSystem session, or null when none is running. */
    fileSystem(): FileSystemSession | null
    /** The active instruction's Core-owned identity, also attached to its Undo group. */
    instructionSerial(): string | null
}

export class MarsHandlers {
    private readonly host: MarsHandlerHost
    /**
     * The generation the currently running step, slice or Testcase belongs to. The handlers are
     * registered once (at `_initialize`) but every async read has to be tied to the execution that
     * is actually running, so they read this field instead of capturing a generation, and the
     * adapter renews it before each Core call (`beginExecution`).
     */
    private execution: ExecutionGeneration

    constructor(host: MarsHandlerHost) {
        this.host = host
        this.execution = host.executionController.capture()
    }

    /** Ties the handlers' waits and reads to the step, slice or Testcase about to start. */
    beginExecution(): void {
        this.execution = this.host.executionController.capture()
    }

    /** The handlers for a freshly assembled Core, which its adapter passes to `registerHandlers`. */
    makeHandlerMap(): MarsHandlerMap {
        const terminal = this.host.peripherals.terminal
        //The Core keeps this serial active while synchronous or async handlers run. Read it at
        //dispatch, so repeated PCs, Core-only services and Undo/replay never share a File frame.
        const instructionOperation = <T>(operation: () => T): T => {
            const serial = this.host.instructionSerial()
            if (serial === null) throw new Error('Core handler has no active instruction serial')
            return this.requireFileSystem().performInstruction(serial, operation)
        }
        const line = (type: string, question: string) => () =>
            this.waitOn(type, question, (execution) => terminal.readAsync(question, execution))
        const handlers: MarsHandlerMap = {
            //the line as typed: the service trims and parses it, and reports what it cannot parse
            readDouble: line('ReadDouble', READ_DOUBLE_QUESTION),
            readFloat: line('ReadFloat', READ_FLOAT_QUESTION),
            readInt: line('ReadInt', READ_INT_QUESTION),
            readString: line('ReadString', READ_STRING_QUESTION),
            //one keystroke, which the Terminal's Line discipline answers as soon as it is typed,
            //Enter being `\n` (MARS's and RARS's 10); the service takes its first UTF-16 unit
            readChar: () =>
                this.waitOn('ReadChar', READ_CHAR_QUESTION, (execution) =>
                    terminal.readCharAsync(READ_CHAR_QUESTION, execution)
                ),

            //the dialogs are modal in MARS and RARS too, and never echoed
            confirm: (message) =>
                this.waitOn('Confirm', message, async (execution) => {
                    const answer = await terminal.confirm(message, execution)
                    if (answer === 'yes') return CONFIRM_RESULT.YES
                    return answer === 'no' ? CONFIRM_RESULT.NO : CONFIRM_RESULT.CANCEL
                }),
            //null is Cancel, which the service reports to the program as -2
            inputDialog: (message) =>
                this.waitOn('InputDialog', message, (execution) =>
                    terminal.inputDialog(message, execution)
                ),
            //awaited: the Core suspends on the promise until the dialog is dismissed. A scripted
            //(testcase) run has nobody to dismiss it, so the Terminal fails it at once instead
            outputDialog: (message) =>
                this.waitOn('OutputDialog', message, (execution) =>
                    terminal.messageDialog(message, execution)
                ),

            //every print service, formatted by the Core as its Reference environment prints it
            printString: (text) => terminal.write(text),
            //bytes, decoded as UTF-8 as they stream, so a character split across two writes survives
            stdOut: (buffer) => terminal.writeBytes(buffer),
            stdErr: (buffer) => terminal.writeBytes(buffer),

            //MARS and RARS report a failed file operation through the syscall's return value so the
            //program can branch on it, -1 for every service that has a value to carry it, a full
            //FileSystem included; a stale `close` is ignored the way MARS and RARS ignore it. Letting
            //a FileSystem error reach the Core instead would end the run at the syscall, which no
            //program can handle
            readFile: (descriptor, length) => {
                try {
                    const bytes = this.requireFileSystem().read(descriptor, length)
                    //0 is end of file; -1 is reserved for a read that failed
                    return [bytes.length, Array.from(bytes)]
                } catch (error) {
                    return [guestFileFailure(error), []]
                }
            },
            writeFile: (descriptor, buffer) => {
                try {
                    return this.requireFileSystem().write(descriptor, Uint8Array.from(buffer))
                } catch (error) {
                    return guestFileFailure(error)
                }
            },
            openFile: (path, flags, append) => {
                try {
                    return this.requireFileSystem().open(
                        path,
                        flags === 2
                            ? { access: 'read-write' }
                            : flags === 3
                              ? { access: 'read-write', create: true, truncate: true }
                              : flags === 10
                                ? { access: 'read-write', create: true, append: true }
                                : flags === 0
                                  ? 'read'
                                  : append
                                    ? 'append'
                                    : 'write'
                    )
                } catch (error) {
                    return guestFileFailure(error)
                }
            },
            closeFile: (descriptor) => {
                try {
                    this.requireFileSystem().close(descriptor)
                } catch (error) {
                    //a descriptor the program never had, or closed already: not an error
                    guestFileFailure(error)
                }
            },
            stdIn: (length) =>
                this.waitOn('StandardInput', STANDARD_INPUT_QUESTION, async (execution) => {
                    //the Terminal's line buffer, a new line, or no bytes at End of input
                    const bytes = await terminal.readStandardInput(
                        length,
                        STANDARD_INPUT_QUESTION,
                        execution
                    )
                    return [bytes.length, Array.from(bytes)]
                }),
            seekFile: (descriptor, offset, whence) => {
                try {
                    return this.requireFileSystem().seek(descriptor, offset, whence)
                } catch (error) {
                    return guestFileFailure(error)
                }
            },

            sleep: (milliseconds) => this.sleep(milliseconds),
            //Service 30 and RISC-V time/timeh: Unix epoch milliseconds.
            //Testcases use the fixed Y2K epoch plus virtual waits (ADR 0040).
            time: () => this.host.peripherals.clock.calendarNow(),
            //the first seed of a generator the program did not seed with service 40: host randomness
            //interactively and the fixed seed in a Testcase, read at the point of use because a
            //Testcase swaps the Random source in (ADR 0037)
            randomSeed: (generator) => this.host.peripherals.random.seedFor(generator)
        }
        //Multiple handlers of one instruction share its File frame, including empty callbacks.
        return Object.fromEntries(
            Object.entries(handlers).map(([name, handler]) => [
                name,
                (...args: unknown[]) =>
                    instructionOperation(() =>
                        (handler as (...parameters: unknown[]) => unknown)(...args)
                    )
            ])
        ) as MarsHandlerMap
    }

    /** The Build's session, which every handler runs inside: none means no program is running. */
    private requireFileSystem(): FileSystemSession {
        const files = this.host.fileSystem()
        if (!files) throw new Error('FileSystem is not running')
        return files
    }

    /**
     * Syscall 32. Program time passes without the Core blocking the host: the handler's promise is
     * what suspends the pending `simulate` call, and the clock resolves it — immediately, on a
     * virtual clock, so a Testcase never sleeps
     * ([ADR 0010](../../../../docs/adr/0010-program-time-without-clock-pacing.md)).
     *
     * The Screen catches up first: an animation draws a frame and then sleeps, and the frame has to
     * be on screen while the program waits, not at the end of the slice several frames later.
     */
    private async sleep(milliseconds: number): Promise<void> {
        const execution = this.execution
        this.host.devices.flush()
        //read the clock at the point of use: a Testcase swaps a virtual one in and the injected one back
        const clock = this.host.peripherals.clock
        await this.host.executionController.waitFor(execution, () => clock.wait(milliseconds))
    }

    /**
     * Shows what the program waits on as the Emulator's interrupt while `answer` settles. The Core
     * suspends the pending `step`/`simulate*` call for as long as a handler's promise is unsettled,
     * and `type` mirrors the handler's name so the UI can tell which service is waiting.
     */
    private async waitOn<T>(
        type: string,
        message: string,
        answer: (execution: ExecutionGeneration) => Promise<T>
    ): Promise<T> {
        const execution = this.execution
        this.host.setInterrupt({ type, message })
        try {
            return await answer(execution)
        } finally {
            this.host.setInterrupt(undefined)
        }
    }
}

/**
 * The typed failure both Cores reject a run call with, `RuntimeError` in `@specy/mips` and
 * `@specy/risc-v`: declared here as `MarsHandlerMap` is, and checked against each Core's own type
 * where the adapter hands one over. `line` is one-based and, like `sourcePath`, null when the
 * failing address holds no statement.
 */
export type MarsRuntimeError = Error & {
    readonly kind: 'exception' | 'syscall' | 'handler' | 'internal'
    readonly address: number
    readonly sourcePath: string | null
    readonly line: number | null
    readonly cause?: unknown
}

/**
 * How a failed run reads in the editor, in MARS's and RARS's own words and with the location their
 * error report gives: `Error in main.s line 4: Runtime exception at 0x00400004: invalid integer
 * input (syscall 5)`. A handler or a device of the editor's that refused what the program asked for
 * explains itself, so its own message stands in for the Core's account of who threw it.
 */
export function marsRuntimeErrorMessage(error: MarsRuntimeError): string {
    const message =
        error.kind === 'handler' && error.cause instanceof Error
            ? error.cause.message
            : error.message
    if (error.sourcePath === null || error.line === null) return message
    return `Error in ${error.sourcePath} line ${error.line}: ${message}`
}

/**
 * How the History reads an exit, a back step of its own in both Cores (`EXIT_RESTORE`): Undo takes
 * it back and the program runs again from the syscall or ecall.
 */
export function exitStepText(code: number | string): string {
    return `Exited with code ${code}`
}

/**
 * How the History reads a random service (40 to 44) drawing from or seeding generator `generator`
 * (`RANDOM_STREAM_RESTORE`): Undo puts the generator back, so the next draw repeats. Its state is
 * the Core's own, so the entry names only which generator moved on.
 */
export function randomStreamStepText(generator: number): string {
    return `Random generator ${generator} advanced`
}

/**
 * The undo depth comes from a user setting, so it can be any number (or NaN). `0` means "no
 * history at all", which the core expresses as `setUndoEnabled(false)` rather than a zero sized
 * stack (a zero length backstep array makes the core throw on the first executed instruction).
 */
export function normalizeUndoSize(undoSize: number): number {
    return Number.isFinite(undoSize) ? Math.max(0, Math.floor(undoSize)) : 0
}

/** The Core's halt limit for a Testcase run: no limit, or one that is not positive, is unbounded. */
export function toHaltLimit(limit: number | undefined): number {
    return !limit || limit <= 0 ? Number.MAX_SAFE_INTEGER : limit
}
