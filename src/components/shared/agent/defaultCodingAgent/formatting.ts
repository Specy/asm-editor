import type { Emulator } from '$lib/languages/Emulator'
import {
    RegisterSize,
    type Diagnostic,
    type ExecutionStep,
    formatDiagnostic,
    toHexString
} from '$lib/languages/commonLanguageFeatures.svelte'
import { unsignedBigIntToSigned } from '$lib/utils'

export type FormattedNumber = {
    decimal: string
    hex: string
    display: string
    signedDecimal?: string
    unsignedDecimal?: string
}

const SIZE_NAMES = {
    [RegisterSize.Byte]: 'Byte',
    [RegisterSize.Word]: 'Word',
    [RegisterSize.Long]: 'Long',
    [RegisterSize.Double]: 'Double'
} satisfies Record<RegisterSize, string>

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

export function formatSize(size: RegisterSize) {
    return SIZE_NAMES[size] ?? String(size)
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

export function formatLatestSteps(
    codeOrResolver: string | ((file?: string) => string),
    steps: ExecutionStep[],
    max = 10
) {
    const resolve = typeof codeOrResolver === 'function' ? codeOrResolver : () => codeOrResolver
    return steps.slice(-max).map((step) => {
        const code = resolve(step.file)
        return {
            file: step.file ?? null,
            line: formatSourceLine(code, step.line, step.file).line,
            pc: formatNumber(step.pc),
            mutations: step.mutations.map((mutation) => {
                switch (mutation.type) {
                    case 'WriteRegister':
                        return {
                            type: mutation.type,
                            register: mutation.value.register,
                            old: formatNumber(mutation.value.old, mutation.value.size),
                            size: formatSize(mutation.value.size)
                        }
                    case 'WriteMemory':
                        return {
                            type: mutation.type,
                            address: formatNumber(mutation.value.address),
                            old: formatNumber(mutation.value.old, mutation.value.size),
                            size: formatSize(mutation.value.size)
                        }
                    case 'WriteMemoryBytes':
                        return {
                            type: mutation.type,
                            address: formatNumber(mutation.value.address),
                            old: mutation.value.old
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

export function formatRegisters(emulator: Emulator) {
    return emulator.registers.map((register) => ({
        name: register.name,
        value: formatNumber(register.value, emulator.systemSize)
    }))
}

export function formatEmulatorState(
    codeOrResolver: string | ((file?: string) => string),
    emulator: Emulator
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
        latestSteps: formatLatestSteps(codeOrResolver, emulator.latestSteps)
    }
}
