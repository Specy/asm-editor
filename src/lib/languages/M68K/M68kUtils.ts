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
    if (!isRecord(error)) {
        return `${prepend}${error}`
    }
    switch (error.type) {
        case 'Raw':
            if (typeof error.value === 'string') return error.value
            break
        case 'Unimplemented':
            return `${prepend} Unimplemented`
        case 'DivisionByZero':
            return `${prepend} Division by zero`
        case 'ExecutionLimit':
            if (typeof error.value === 'number') {
                return `${prepend} Execution limit of ${error.value} instructions reached (maybe an infinite loop?), disable in the settings if needed`
            }
            break
        case 'OutOfBounds':
            if (typeof error.value === 'string') {
                return `${prepend} Memory read out of bounds: ${error.value}`
            }
            break
        case 'IncorrectAddressingMode':
            if (typeof error.value === 'string') {
                return `${prepend} Incorrect addressing mode: ${error.value}`
            }
            break
        case 'AddressError':
            if (isRecord(error.value)) {
                return `${prepend} Address error: Tried to read/write to an odd memory address "${error.value.address}" using non-byte operation with size "${error.value.size}" `
            }
            break
        case 'ChkOutOfBounds':
            if (isRecord(error.value)) {
                return `${prepend} CHK exception: ${error.value.value} is outside 0..${error.value.bound}`
            }
            break
        case 'OverflowException':
            return `${prepend} Overflow exception: TRAPV ran while the overflow flag was set`
        case 'IllegalInstruction':
            return `${prepend} Illegal instruction exception`
    }
    if (typeof error.message === 'string') {
        if (error.message === 'unreachable') {
            return `${prepend} WASM panicked (unreachable)`
        }
        return `${prepend} ${error.message}`
    }
    return `${prepend} ${JSON.stringify(error)}`
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return typeof value === 'object' && value !== null
}
