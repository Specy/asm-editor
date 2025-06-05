import type { RuntimeError } from '@specy/s68k'

export function parseCcr(value: number) {
    return [
        (value & 0x1) === 0x1,
        (value & 0x2) === 0x2,
        (value & 0x4) === 0x4,
        (value & 0x8) === 0x8,
        (value & 0x10) === 0x10
    ]
}

export function getM68kErrorMessage(error: unknown, lineNumber?: number): string {
    const prepend = lineNumber ? `Error at line ${lineNumber}:` : ''
    if (typeof error !== 'object') {
        return `${prepend}${error}`
    }
    const maybeError = error as RuntimeError
    if (maybeError) {
        switch (maybeError.type) {
            case 'Raw':
                return maybeError.value
            case 'Unimplemented':
                return `${prepend} Unimplemented`
            case 'DivisionByZero':
                return `${prepend} Division by zero`
            case 'ExecutionLimit':
                return `${prepend} Execution limit of ${maybeError.value} instructions reached (maybe an infinite loop?), disable in the settings if needed`
            case 'OutOfBounds':
                return `${prepend} Memory read out of bounds: ${maybeError.value}`
            case 'IncorrectAddressingMode':
                return `${prepend} Incorrect addressing mode: ${maybeError.value}`
            case 'AddressError':
                return `${prepend} Address error: Tried to read/write to an odd memory address "${maybeError.value.address}" using non-byte operation with size "${maybeError.value.size}" `
        }
    }
    if ('message' in error) {
        if (error.message === 'unreachable') {
            return `${prepend} WASM panicked (unreachable)`
        }
        return `${prepend} ${error.message}`
    }
    return `${prepend} ${JSON.stringify(error)}`
}
