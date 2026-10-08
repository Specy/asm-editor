import { describeInvalidTrapArgument, describeUnsupportedTrapTask } from './M68K-traps'

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
        case 'InstructionAccess':
            if (isRecord(error.value) && typeof error.value.address === 'number') {
                const address = `$${error.value.address.toString(16).toUpperCase()}`
                return error.value.write
                    ? `${prepend} Cannot write to an instruction: address ${address} is not available as it holds assembled instructions`
                    : `${prepend} Cannot read from an instruction: address ${address} is not available as it holds assembled instructions`
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
        //a `trap #15` task the Core does not carry out, or one given a value it cannot take: the
        //Core names the task and the register, the trap table says which task it is and why
        case 'UnsupportedTrapTask':
            if (isRecord(error.value) && typeof error.value.task === 'number') {
                return `${prepend} ${describeUnsupportedTrapTask(error.value.task)}`
            }
            break
        case 'InvalidTrapArgument':
            if (
                isRecord(error.value) &&
                typeof error.value.task === 'number' &&
                typeof error.value.reason === 'string'
            ) {
                return `${prepend} ${describeInvalidTrapArgument(error.value.task, error.value.reason)}`
            }
            break
        //the editor's own mistakes in answering the Core, never the program's
        case 'NoPendingInterrupt':
            return `${prepend} The editor answered a trap #15 task that was not waiting for an answer`
        case 'InvalidAnswer':
            if (isRecord(error.value)) {
                return `${prepend} The editor's answer to ${error.value.interrupt} was refused: ${error.value.reason}`
            }
            break
        case 'InvalidArgument':
            if (typeof error.value === 'string') {
                return `${prepend} Invalid argument: ${error.value}`
            }
            break
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
