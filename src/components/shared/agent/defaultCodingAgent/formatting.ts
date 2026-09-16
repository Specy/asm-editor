import type { Emulator } from '$lib/languages/Emulator'
import {
    defaultRegisterKind,
    RegisterSize,
    type Diagnostic,
    type ExecutionStep,
    type RegisterFile,
    formatDiagnostic,
    toHexString
} from '$lib/languages/commonLanguageFeatures.svelte'
import { renderRegister } from '$lib/languages/registerFormats'
import { sizeName } from '$lib/languages/sizeNames'
import type { AvailableLanguages } from '$lib/Project.svelte'
import { unsignedBigIntToSigned } from '$lib/utils'

export type FormattedNumber = {
    decimal: string
    hex: string
    display: string
    signedDecimal?: string
    unsignedDecimal?: string
}

function normalizeNumber(value: bigint | number) {
    return typeof value === 'bigint' ? value : BigInt(value)
}

export function formatNumber(value: bigint | number, size?: RegisterSize): FormattedNumber {
    const numericValue = normalizeNumber(value)

    if (size !== undefined) {
        const unsignedValue = numericValue & ((1n << BigInt(size * 8)) - 1n)
        const signedValue = unsignedBigIntToSigned(unsignedValue, size)
        const decimal = numericValue.toString()
        const unsignedDecimal = unsignedValue.toString()
        const signedDecimal = signedValue.toString()
        const hex = `0x${toHexString(unsignedValue, size)}`

        if (signedValue < 0n || numericValue < 0n) {
            return {
                decimal,
                hex,
                signedDecimal,
                unsignedDecimal,
                display: `signed decimal: ${signedDecimal} unsigned decimal: ${unsignedDecimal} hex: ${hex}`
            }
        }

        return {
            decimal,
            hex,
            unsignedDecimal,
            display: `decimal: ${decimal} hex: ${hex}`
        }
    }

    const sign = numericValue < 0n ? '-' : ''
    const magnitude = numericValue < 0n ? -numericValue : numericValue
    const hex = `${sign}0x${magnitude.toString(16)}`
    const decimal = numericValue.toString()
    return {
        decimal,
        hex,
        display: `decimal: ${decimal} hex: ${hex}`
    }
}

/**
 * A width written out as the Target names it (`sizeNames.ts`), so a report of what an instruction
 * wrote uses the same word the architecture's own manual does: four bytes are a `Long` to the
 * 68000, a `Word` to MIPS and a `Dword` to x86. Without a Target it stays the 68000's naming, which
 * is what this reported before the names were per-language.
 */
export function formatSize(size: RegisterSize, language?: AvailableLanguages | null) {
    return sizeName(size, language).long
}

export function formatSourceLine(editorCode: string, lineIndex: number, file?: string) {
    if (lineIndex < 0) {
        return {
            lineNumber: null,
            lineText: null,
            file: file ?? null,
            line: 'No current source line'
        }
    }

    const lineNumber = lineIndex + 1
    const lines = editorCode.split('\n')
    const lineText = lineNumber <= lines.length ? lines[lineNumber - 1] : null
    const prefix = file ? `${file}:${lineNumber}` : `${lineNumber}`
    return { lineNumber, lineText, file: file ?? null, line: `${prefix} | ${lineText ?? ''}` }
}

export function formatDiagnostics(diagnostics: Diagnostic[]) {
    return diagnostics.map(formatDiagnostic)
}

/**
 * Everything worth reporting to the model: diagnostics of every severity plus runtime errors.
 * Reporting only, never a pass/fail check.
 */
export function collectEmulatorDiagnostics(
    emulator: Emulator,
    checkDiagnostics: (Diagnostic | string)[] = []
) {
    return Array.from(
        new Set(
            [
                ...checkDiagnostics.map((d) => (typeof d === 'string' ? d : formatDiagnostic(d))),
                ...formatDiagnostics(emulator.compilerDiagnostics),
                ...emulator.errors
            ].filter((x): x is string => Boolean(x))
        )
    )
}

/**
 * The subset that means "this did not work": error-severity diagnostics plus runtime errors.
 * Warnings and suggestions must never turn a successful compile or run into a tool failure.
 */
export function collectEmulatorErrors(
    emulator: Emulator,
    checkDiagnostics: (Diagnostic | string)[] = []
) {
    return Array.from(
        new Set(
            [
                ...checkDiagnostics.map((d) =>
                    typeof d === 'string' ? d : d.severity === 'error' ? formatDiagnostic(d) : null
                ),
                ...formatDiagnostics(emulator.compilerErrors),
                ...emulator.errors
            ].filter((x): x is string => Boolean(x))
        )
    )
}

/** A run of memory bytes the way `read_memory` writes one: two hex digits a byte, space separated. */
export function formatHexBytes(bytes: number[]) {
    return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
}

/**
 * A Poke as its own row ([the design record](../../../../../docs/design/pokes.md)): no instruction
 * ran, so there is no source line and no pc to report, only which register or memory run was poked
 * and what it held before and after.
 */
function formatPokeStep(step: ExecutionStep) {
    return {
        kind: 'poke' as const,
        writes: (step.writes ?? []).map((write) =>
            write.type === 'register'
                ? {
                      type: write.type,
                      register: write.name,
                      old: formatNumber(write.old),
                      new: formatNumber(write.new)
                  }
                : {
                      type: write.type,
                      address: formatNumber(write.address),
                      old: formatHexBytes(write.old),
                      new: formatHexBytes(write.new)
                  }
        )
    }
}

export function formatLatestSteps(
    codeOrResolver: string | ((file?: string) => string),
    steps: ExecutionStep[],
    language?: AvailableLanguages | null,
    max = 10
) {
    const resolve = typeof codeOrResolver === 'function' ? codeOrResolver : () => codeOrResolver
    //`latestSteps` is newest first, so the newest `max` of them are its head: taking its tail would
    //hand the model the oldest steps whenever the history preference is set above `max`, and the
    //Poke or instruction it just made would not be in the list at all
    return steps.slice(0, max).map((step) => {
        //a Poke is a step of the same history as the instructions, so it is listed here too, and it
        //is told apart by its kind rather than by a missing line
        if (step.kind === 'poke') return formatPokeStep(step)
        const code = resolve(step.file)
        return {
            kind: step.kind,
            file: step.file ?? null,
            line: formatSourceLine(code, step.line, step.file).line,
            pc: formatNumber(step.pc),
            mutations: step.mutations.map((mutation) => {
                switch (mutation.type) {
                    //`old` and `new` are what the Core reports of a write and nothing is
                    //reconstructed: a side it does not hand over is null
                    case 'WriteRegister':
                        return {
                            type: mutation.type,
                            register: mutation.value.register,
                            old: formatOptionalNumber(mutation.value.old, mutation.value.size),
                            new: formatOptionalNumber(mutation.value.new, mutation.value.size),
                            size: formatSize(mutation.value.size, language)
                        }
                    case 'WriteMemory':
                        return {
                            type: mutation.type,
                            address: formatNumber(mutation.value.address),
                            old: formatOptionalNumber(mutation.value.old, mutation.value.size),
                            new: formatOptionalNumber(mutation.value.new, mutation.value.size),
                            size: formatSize(mutation.value.size, language)
                        }
                    case 'WriteMemoryBytes':
                        return {
                            type: mutation.type,
                            address: formatNumber(mutation.value.address),
                            old: mutation.value.old,
                            new: mutation.value.new ?? null
                        }
                    case 'PushCallStack':
                    case 'PopCallStack':
                        return {
                            type: mutation.type,
                            from: formatNumber(mutation.value.from),
                            to: formatNumber(mutation.value.to)
                        }
                    case 'Other':
                        return { type: mutation.type, value: mutation.value }
                }
            })
        }
    })
}

function formatOptionalNumber(value: bigint | undefined, size: RegisterSize) {
    return value === undefined ? null : formatNumber(value, size)
}

export function formatRegisters(emulator: Emulator) {
    return emulator.registers.map((register) => ({
        name: register.name,
        value: formatNumber(register.value, emulator.systemSize)
    }))
}

export type FormattedRegisterFileRegister = {
    name: string
    /**
     * A float register reads as a decimal number, an integer one keeps the `formatNumber` shape,
     * and a row the file blanks reads `empty`.
     */
    value: string | FormattedNumber
    /**
     * The readings the default Format does not show, the same lines the panel hovers: the raw hex
     * and the other precision. Absent on a register that has nothing else to say.
     */
    other?: string[]
}

export type FormattedRegisterFile = {
    id: string
    label: string
    registers: FormattedRegisterFileRegister[]
    flags?: { name: string; value: number }[]
}

/**
 * How much of a Register file to report: everything it holds, or only the registers that are not
 * still zero.
 */
export type RegisterFileDetail = 'full' | 'non-zero'

/**
 * One register in the Format its Register file is read in by default, which is the first Format the
 * file offers. A float register becomes the decimal number the panel shows, so the model reads
 * `3.5` instead of a bit pattern, and a register of integer kind (a control register such as
 * `mxcsr` inside a floating-point file, or a whole file like CP0) keeps the `formatNumber` shape
 * every other number in these tool results has. Whatever the default Format leaves unsaid follows
 * it in `other`, which is the panel's hover.
 */
function formatRegisterFileValue(
    file: RegisterFile,
    index: number
): Omit<FormattedRegisterFileRegister, 'name'> {
    const register = file.registers[index]
    const size = Number(register.size ?? file.layout[index]?.size ?? file.size) as RegisterSize
    const format = file.formats[0] ?? 'hex'
    const kind = file.layout[index]?.kind ?? defaultRegisterKind(file.formats)
    //an integer register, and a whole file whose default Format is hex, keeps the shape every other
    //number in these results has, and that shape already carries both the decimal and the hex
    if (format === 'hex' || kind === 'integer') return { value: formatNumber(register.value, size) }
    const rendered = renderRegister(file, file.registers, index, format)
    //a row a Format has nothing to show on is the odd half of a MIPS double pair, whose value lives
    //in its even neighbour; the raw pattern is still worth reporting rather than an empty string,
    //and the hex rendering is what knows the readings that row does have
    if (rendered.blank) {
        return withOtherReadings(
            `0x${toHexString(register.value, size)}`,
            renderRegister(file, file.registers, index, 'hex').hover
        )
    }
    //a wide register holds several lanes of the same Format, low lane first, as the panel shows
    //them. The default Format alone is not the whole truth: a double held in a file whose default
    //is single reads as a wrong number on MIPS and as NaN on RISC-V, so the hover lines the panel
    //would show, the raw pattern and the other precision, come along for the model to read too.
    return withOtherReadings(rendered.chunks.map((chunk) => chunk.text).join(', '), rendered.hover)
}

function withOtherReadings(
    value: string,
    other: string[]
): Omit<FormattedRegisterFileRegister, 'name'> {
    return other.length > 0 ? { value, other } : { value }
}

/**
 * A row the file blanks at this refresh, which is an x87 stack slot the tag word marks empty. It
 * reads `empty`, the word gdb's `info float` prints for one, because the bits underneath are
 * whatever the slot last held and no Format may read them as a number; they follow in `other`, the
 * same hover the panel keeps them behind, since the dash the panel draws says nothing in a tool
 * result.
 */
function formatBlankRegisterFileValue(
    file: RegisterFile,
    index: number
): Omit<FormattedRegisterFileRegister, 'name'> {
    const rendered = renderRegister(file, file.registers, index, file.formats[0] ?? 'hex')
    return withOtherReadings('empty', rendered.hover)
}

/**
 * Whether `non-zero` may leave a register out. A zero bit pattern is not enough on its own in a
 * `pairedDoubles` file: the even register of a pair holds the low word of a double, which is zero
 * for plenty of values (3.5 is `0x400c000000000000`), and the even row is the one the pair's double
 * reading is reported on, so dropping it would hide a value the odd half cannot show alone.
 */
function isStillZero(file: RegisterFile, index: number): boolean {
    if (file.registers[index].value !== 0n) return false
    if (!file.pairedDoubles || index % 2 === 1) return true
    return (file.registers[index + 1]?.value ?? 0n) === 0n
}

/**
 * Every Register file beyond the CPU one, which stays in `registers` where every caller already
 * reads it ([the design record](../../../../../docs/design/register-files.md)). `non-zero` drops
 * the registers whose bit pattern is still zero, which on a teaching program is most of a
 * floating-point file, bar the low half of a pair whose double is not (see `isStillZero`), and the
 * rows the file blanks, which hold nothing to report; the file is listed either way, with an empty
 * register array when nothing in it is set, so the model can see that it exists and ask for it in
 * full. A file's Status flags are a handful of bits and are always reported.
 */
export function formatRegisterFiles(
    emulator: Emulator,
    detail: RegisterFileDetail
): FormattedRegisterFile[] {
    //every emulator publishes its files, the fallback is for the bare object the agent tests build
    //as a mock emulator
    const files = emulator.registerFiles ?? []
    return files.slice(1).map((file) => {
        const registers: FormattedRegisterFileRegister[] = []
        file.registers.forEach((register, index) => {
            const blank = file.blanks?.[index] === true
            if (detail === 'non-zero' && (blank || isStillZero(file, index))) return
            const value = blank
                ? formatBlankRegisterFileValue(file, index)
                : formatRegisterFileValue(file, index)
            registers.push({ name: register.name, ...value })
        })
        const flags = file.flags.map((flag) => ({ name: flag.name, value: flag.value }))
        const formatted: FormattedRegisterFile = { id: file.id, label: file.label, registers }
        if (flags.length > 0) formatted.flags = flags
        return formatted
    })
}

export type FormatEmulatorStateOptions = {
    /** How much of every Register file beyond the CPU one to report. Defaults to `non-zero`. */
    registerFiles?: RegisterFileDetail
    /** The Target, which names the widths a reported mutation was written at. */
    language?: AvailableLanguages | null
}

export function formatEmulatorState(
    codeOrResolver: string | ((file?: string) => string),
    emulator: Emulator,
    options: FormatEmulatorStateOptions = {}
) {
    const resolve = typeof codeOrResolver === 'function' ? codeOrResolver : () => codeOrResolver
    const currentFile = emulator.currentFile ?? emulator.entry ?? ''
    const currentCode = resolve(currentFile)

    const rawStdout = emulator.stdOut ?? ''
    const stdoutLines = rawStdout.split('\n')
    const maxStdoutLines = 100
    const formattedStdout =
        stdoutLines.length > maxStdoutLines
            ? `[...${stdoutLines.length - maxStdoutLines} lines omitted...]\n` +
              stdoutLines.slice(-maxStdoutLines).join('\n')
            : rawStdout

    return {
        terminated: emulator.terminated,
        currentInterrupt: emulator.interrupt,
        currentFile: currentFile || undefined,
        stdOut: formattedStdout,
        breakpoints: emulator.breakpoints
            .filter((breakpoint) => !breakpoint.file || breakpoint.file === currentFile)
            .map((breakpoint) => breakpoint.line + 1),
        canExecute: emulator.canExecute,
        canUndo: emulator.canUndo,
        callStack: emulator.callStack.map((frame) => ({
            address: formatNumber(frame.address),
            name: frame.name,
            file: frame.file,
            line: frame.line + 1,
            color: frame.color,
            destinationAddress: formatNumber(frame.destination),
            stackPointer: formatNumber(frame.sp)
        })),
        currentLine: formatSourceLine(currentCode, emulator.line, currentFile).line,
        stackPointer: formatNumber(emulator.sp),
        programCounter: formatNumber(emulator.pc),
        statusRegisters: emulator.statusRegisters,
        registers: formatRegisters(emulator),
        registerFiles: formatRegisterFiles(emulator, options.registerFiles ?? 'non-zero'),
        latestSteps: formatLatestSteps(codeOrResolver, emulator.latestSteps, options.language)
    }
}
