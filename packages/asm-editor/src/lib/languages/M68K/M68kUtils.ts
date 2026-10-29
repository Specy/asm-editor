import type { Termination as CoreTermination, MemoryRange } from '@specy/s68k'
import { describeInvalidTrapArgument, describeUnsupportedTrapTask } from './M68K-traps'
import { m68kVectorAddress, m68kVectorName } from './M68K-vectors'

/**
 * A Core error as the Log says it. `lineNumber` (1-based) is the line of the instruction that
 * raised it; `address` stands in for it where no line was laid out, as when the program ran into
 * its data, whose words decode as instructions too. `memoryMap`, the Program's, gives a bus error
 * the bounds of the range that refused it.
 */
export function getM68kErrorMessage(
    error: unknown,
    lineNumber?: number,
    address?: number,
    memoryMap?: readonly MemoryRange[]
): string {
    //"Error at line 3: Division by zero", or the message alone, which a caller's own sentence
    //follows with a space of its own ("Error executing code. Division by zero")
    const at = (message: string) =>
        lineNumber
            ? `Error at line ${lineNumber}: ${message}`
            : address !== undefined
              ? `Error at $${hex(address)}: ${message}`
              : message
    if (!isRecord(error)) {
        return at(`${error}`)
    }
    if (error.type === 'Raw' && typeof error.value === 'string') return error.value
    const parts = errorParts(error, memoryMap)
    if (parts) return at(parts.detail ? `${parts.headline}: ${parts.detail}` : parts.headline)
    if (typeof error.message === 'string') {
        if (error.message === 'unreachable') {
            return at('WASM panicked (unreachable)')
        }
        return at(`${error.message}`)
    }
    return at(`${JSON.stringify(error)}`)
}

/**
 * How a program the 68000's exception machinery ended reads in the Log: an exception whose vector
 * held no handler, "Division by zero at line 12: vector 5 at $000014 holds no handler", or a
 * double fault, "The CPU halted at line 4: a double bus fault while taking TRAP #0 (vector 32) …"
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decisions 9 and 10). An
 * exception with no vector, such as a `trap #15` task s68k does not carry out, reads as any other
 * error. `lineNumber`, `address` and `memoryMap` are as for `getM68kErrorMessage`.
 */
export function getM68kTerminationMessage(
    termination: Extract<CoreTermination, { type: 'Exception' | 'Halted' }>,
    lineNumber?: number,
    address?: number,
    memoryMap?: readonly MemoryRange[]
): string {
    const where = lineNumber
        ? ` at line ${lineNumber}`
        : address !== undefined
          ? ` at $${hex(address)}`
          : ''
    const parts = errorParts(termination.value.cause, memoryMap)
    if (termination.type === 'Halted') {
        const { cause, vector } = termination.value
        const halted = `The CPU halted${where}: a double bus fault while taking ${m68kVectorName(vector)} (vector ${vector})`
        //the vector itself, read from a range the memory map makes invalid: the bus error is at
        //the vector's own address, where the frame's are writes below the stack pointer
        const refused = cause.type === 'BusError' ? cause.value : undefined
        if (refused && refused.access === 'Read' && refused.address >>> 0 === vector * 4) {
            return `${halted}, as reading its vector at ${m68kVectorAddress(vector)} raised a bus error, ${refusal(refused.range, memoryMap)}`
        }
        //what pushing the frame raised: an address error, on an odd supervisor stack pointer, or a
        //bus error, where the memory map refuses the frame
        const raised = parts
            ? `${article(parts.headline)} ${parts.headline[0].toLowerCase()}${parts.headline.slice(1)}${parts.detail ? `, ${parts.detail}` : ''}`
            : getM68kErrorMessage(cause)
        return `${halted}, as pushing its frame raised ${raised}`
    }
    const { cause, vector } = termination.value
    if (vector === undefined) return getM68kErrorMessage(cause, lineNumber, address, memoryMap)
    const headline = parts?.headline ?? getM68kErrorMessage(cause)
    const detail = parts?.detail ? ` (${parts.detail})` : ''
    return `${headline}${where}: vector ${vector} at ${m68kVectorAddress(vector)} holds no handler${detail}`
}

/**
 * An error the Core names, as two parts: what happened, "Address error", and what about it, "reading
 * a word at the odd address $1", which the Log writes after a colon or, when a vector is named in
 * between, in parentheses. Undefined for what the Core does not name, a plain `Error` included.
 */
function errorParts(
    error: Record<PropertyKey, unknown>,
    memoryMap?: readonly MemoryRange[]
): { headline: string; detail?: string } | undefined {
    const value = error.value
    switch (error.type) {
        case 'DivisionByZero':
            return { headline: 'Division by zero' }
        case 'ExecutionLimit':
            if (typeof value !== 'number') return undefined
            return {
                headline: `Execution limit of ${value} instructions reached (maybe an infinite loop?), disable in the settings if needed`
            }
        case 'OutOfBounds':
            if (typeof value !== 'string') return undefined
            return { headline: 'Memory read out of bounds', detail: value }
        case 'IncorrectAddressingMode':
            if (typeof value !== 'string') return undefined
            return { headline: 'Incorrect addressing mode', detail: value }
        case 'AddressError':
            if (!isRecord(value) || typeof value.address !== 'number') return undefined
            return { headline: 'Address error', detail: addressErrorDetail(value) }
        case 'BusError':
            if (!isRecord(value) || typeof value.address !== 'number') return undefined
            return { headline: 'Bus error', detail: busErrorDetail(value, memoryMap) }
        case 'ChkOutOfBounds':
            if (!isRecord(value)) return undefined
            return {
                headline: 'CHK exception',
                detail: `${value.value} is outside 0..${value.bound}`
            }
        case 'OverflowException':
            return {
                headline: 'Overflow exception',
                detail: 'TRAPV ran while the overflow flag was set'
            }
        case 'IllegalInstruction':
            return { headline: 'Illegal instruction' }
        case 'PrivilegeViolation':
            return {
                headline: 'Privilege violation',
                detail: 'the instruction runs only in supervisor mode, and the program is in user mode'
            }
        case 'Trace':
            return {
                headline: 'Trace exception',
                detail: 'the T bit of SR is set, so the processor stops after every instruction'
            }
        //a word no instruction of the processor starts with, kept by the Core
        case 'LineA':
        case 'LineF': {
            const line = error.type === 'LineA' ? 'A' : 'F'
            return {
                headline: `Line ${line} instruction`,
                detail:
                    typeof value === 'number'
                        ? `$${hex(value).padStart(4, '0')}: the processor has no instruction starting with $${line}`
                        : undefined
            }
        }
        case 'UnhandledTrap':
            if (!isRecord(value) || typeof value.vector !== 'number') return undefined
            return { headline: m68kVectorName(value.vector) }
        //an interrupt request taken through an autovector that holds no handler: "IRQ 2 at line
        //4: vector 26 at $000068 holds no handler"
        case 'Irq':
            if (!isRecord(value) || typeof value.level !== 'number') return undefined
            return { headline: `IRQ ${value.level}` }
        //a `trap #15` task the Core does not carry out, or one given a value it cannot take: the
        //Core names the task and the register, the trap table says which task it is and why
        case 'UnsupportedTrapTask':
            if (!isRecord(value) || typeof value.task !== 'number') return undefined
            return { headline: describeUnsupportedTrapTask(value.task) }
        case 'InvalidTrapArgument':
            if (!isRecord(value) || typeof value.task !== 'number') return undefined
            if (typeof value.reason !== 'string') return undefined
            return { headline: describeInvalidTrapArgument(value.task, value.reason) }
        //the editor's own mistakes in answering the Core, never the program's
        case 'NoPendingInterrupt':
            return {
                headline: 'The editor answered a trap #15 task that was not waiting for an answer'
            }
        case 'InvalidAnswer':
            if (!isRecord(value)) return undefined
            return {
                headline: `The editor's answer to ${value.interrupt} was refused`,
                detail: `${value.reason}`
            }
        case 'InvalidArgument':
            if (typeof value !== 'string') return undefined
            return { headline: 'Invalid argument', detail: value }
    }
    return undefined
}

/**
 * What an address error tried, from the Core's access and width: "reading a word at the odd address
 * $1", "writing a long word at the odd address $4FFD", or, for an instruction's own words and a
 * jump's target, "fetching code at the odd address $1001".
 */
function addressErrorDetail(value: Record<PropertyKey, unknown>): string {
    return accessText(value, `at the odd address $${hex(value.address as number)}`)
}

/**
 * What a bus error tried, and which `memory` line refused it: "writing a word at $8000, where the
 * program's memory read line makes $8000-$8FFF read only", or, from user mode, "reading a word at
 * $2000 in user mode, where the program's memory protected line keeps $2000-$2FFF for supervisor
 * mode" ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 15).
 */
function busErrorDetail(
    value: Record<PropertyKey, unknown>,
    memoryMap?: readonly MemoryRange[]
): string {
    const mode = value.range === 'protected' ? ' in user mode' : ''
    const what = accessText(value, `at $${hex(value.address as number)}${mode}`)
    return `${what}, ${refusal(value.range, memoryMap)}`
}

/**
 * Why the memory map refused an access to a range of `kind`, with the range's bounds when the
 * Program's map is at hand, which holds one range of each kind: "where the program's memory invalid
 * line makes $9000-$9FFF invalid", or without it "which the program's memory invalid line makes
 * invalid". ROM refuses nothing: a write there is ignored.
 */
function refusal(kind: unknown, memoryMap?: readonly MemoryRange[]): string {
    const range = memoryMap?.find((candidate) => candidate.kind === kind)
    const span = range ? `$${hex(range.start)}-$${hex(range.end)} ` : ''
    const which = range ? 'where' : 'which'
    switch (kind) {
        case 'read':
            return `${which} the program's memory read line makes ${span}read only`
        case 'protected':
            return `${which} the program's memory protected line keeps ${span}for supervisor mode`
        default:
            return `${which} the program's memory invalid line makes ${span}invalid`
    }
}

/**
 * An access as the Core reports it, `where` being its address: "reading a word at $1", "writing a
 * long word at $4FFD", or, for an instruction's own words and a jump's target, "fetching code at
 * $1001".
 */
function accessText(value: Record<PropertyKey, unknown>, where: string): string {
    if (value.access === 'Program') return `fetching code ${where}`
    //serde spells the width by its variant's name, as it does in a mutation, where the types
    //declare the enum's number, `Size.Long` being 4
    const width =
        value.size === 'Long' || value.size === 4
            ? 'a long word'
            : value.size === 'Byte' || value.size === 1
              ? 'a byte'
              : 'a word'
    return value.access === 'Write' ? `writing ${width} ${where}` : `reading ${width} ${where}`
}

/** `a` or `an`, for the name of an error: "an address error", "a bus error". */
function article(word: string): string {
    return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

/** An address as EASy68K writes one, without its `$`: `1012`, all 32 bits of it. */
function hex(value: number): string {
    return (value >>> 0).toString(16).toUpperCase()
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return typeof value === 'object' && value !== null
}
