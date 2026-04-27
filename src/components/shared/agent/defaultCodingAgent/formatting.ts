import type { Emulator } from '$lib/languages/Emulator'
import {
    RegisterSize,
    type ExecutionStep,
    type MonacoError
} from '$lib/languages/commonLanguageFeatures.svelte'

export type FormattedNumber = {
    decimal: string
    hex: string
    display: string
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

export function formatNumber(value: bigint | number): FormattedNumber {
    const numericValue = normalizeNumber(value)
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

export function formatSourceLine(editorCode: string, lineIndex: number) {
    if (lineIndex < 0) {
        return { lineNumber: null, lineText: null, line: 'No current source line' }
    }

    const lineNumber = lineIndex + 1
    const lines = editorCode.split('\n')
    const lineText = lineNumber <= lines.length ? lines[lineNumber - 1] : null
    return { lineNumber, lineText, line: `${lineNumber} | ${lineText ?? ''}` }
}

export function formatCompilerErrors(errors: MonacoError[]) {
    return errors.map((error) => error.formatted)
}

export function collectEmulatorErrors(emulator: Emulator, checkErrors: MonacoError[] = []) {
    return Array.from(
        new Set(
            [
                ...formatCompilerErrors(checkErrors),
                ...formatCompilerErrors(emulator.compilerErrors),
                ...emulator.errors
            ].filter(Boolean)
        )
    )
}

export function formatLatestSteps(editorCode: string, steps: ExecutionStep[], max = 10) {
    return steps.slice(-max).map((step) => ({
        line: formatSourceLine(editorCode, step.line).line,
        pc: formatNumber(step.pc),
        mutations: step.mutations.map((mutation) => {
            switch (mutation.type) {
                case 'WriteRegister':
                    return {
                        type: mutation.type,
                        register: mutation.value.register,
                        old: formatNumber(mutation.value.old),
                        size: formatSize(mutation.value.size)
                    }
                case 'WriteMemory':
                    return {
                        type: mutation.type,
                        address: formatNumber(mutation.value.address),
                        old: formatNumber(mutation.value.old),
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
    }))
}

export function formatRegisters(emulator: Emulator) {
    return emulator.registers.map((register) => ({
        name: register.name,
        value: formatNumber(register.value)
    }))
}

export function formatEmulatorState(editorCode: string, emulator: Emulator) {
    return {
        terminated: emulator.terminated,
        currentInterrupt: emulator.interrupt,
        stdOut: emulator.stdOut,
        breakpoints: emulator.breakpoints.map((breakpoint: number) => breakpoint + 1),
        canExecute: emulator.canExecute,
        canUndo: emulator.canUndo,
        callStack: emulator.callStack.map((frame) => ({
            address: formatNumber(frame.address),
            name: frame.name,
            line: frame.line + 1,
            color: frame.color,
            destinationAddress: formatNumber(frame.destination),
            stackPointer: formatNumber(frame.sp)
        })),
        currentLine: formatSourceLine(editorCode, emulator.line).line,
        stackPointer: formatNumber(emulator.sp),
        programCounter: formatNumber(emulator.pc),
        statusRegisters: emulator.statusRegisters,
        registers: formatRegisters(emulator),
        latestSteps: formatLatestSteps(editorCode, emulator.latestSteps)
    }
}
