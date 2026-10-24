import { describeInvalidTrapArgument, describeUnsupportedTrapTask } from './M68K-traps'

export function getM68kErrorMessage(error: unknown, lineNumber?: number): string {
    //"Error at line 3: Division by zero", or the message alone, which a caller's own sentence
    //follows with a space of its own ("Error executing code. Division by zero")
    const at = (message: string) =>
        lineNumber ? `Error at line ${lineNumber}: ${message}` : message
    if (!isRecord(error)) {
        return at(`${error}`)
    }
    switch (error.type) {
        case 'Raw':
            if (typeof error.value === 'string') return error.value
            break
        case 'Unimplemented':
            return at('Unimplemented')
        case 'DivisionByZero':
            return at('Division by zero')
        case 'ExecutionLimit':
            if (typeof error.value === 'number') {
                return at(
                    `Execution limit of ${error.value} instructions reached (maybe an infinite loop?), disable in the settings if needed`
                )
            }
            break
        case 'OutOfBounds':
            if (typeof error.value === 'string') {
                return at(`Memory read out of bounds: ${error.value}`)
            }
            break
        case 'IncorrectAddressingMode':
            if (typeof error.value === 'string') {
                return at(`Incorrect addressing mode: ${error.value}`)
            }
            break
        case 'AddressError':
            if (isRecord(error.value)) {
                return at(
                    `Address error: Tried to read/write to an odd memory address "${error.value.address}" using non-byte operation with size "${error.value.size}" `
                )
            }
            break
        case 'InstructionAccess':
            if (isRecord(error.value) && typeof error.value.address === 'number') {
                const address = `$${error.value.address.toString(16).toUpperCase()}`
                return error.value.write
                    ? at(
                          `Cannot write to an instruction: address ${address} is not available as it holds assembled instructions`
                      )
                    : at(
                          `Cannot read from an instruction: address ${address} is not available as it holds assembled instructions`
                      )
            }
            break
        case 'ChkOutOfBounds':
            if (isRecord(error.value)) {
                return at(`CHK exception: ${error.value.value} is outside 0..${error.value.bound}`)
            }
            break
        case 'OverflowException':
            return at('Overflow exception: TRAPV ran while the overflow flag was set')
        case 'IllegalInstruction':
            return at('Illegal instruction exception')
        //a `trap #15` task the Core does not carry out, or one given a value it cannot take: the
        //Core names the task and the register, the trap table says which task it is and why
        case 'UnsupportedTrapTask':
            if (isRecord(error.value) && typeof error.value.task === 'number') {
                return at(`${describeUnsupportedTrapTask(error.value.task)}`)
            }
            break
        case 'InvalidTrapArgument':
            if (
                isRecord(error.value) &&
                typeof error.value.task === 'number' &&
                typeof error.value.reason === 'string'
            ) {
                return at(`${describeInvalidTrapArgument(error.value.task, error.value.reason)}`)
            }
            break
        //the editor's own mistakes in answering the Core, never the program's
        case 'NoPendingInterrupt':
            return at('The editor answered a trap #15 task that was not waiting for an answer')
        case 'InvalidAnswer':
            if (isRecord(error.value)) {
                return at(
                    `The editor's answer to ${error.value.interrupt} was refused: ${error.value.reason}`
                )
            }
            break
        case 'InvalidArgument':
            if (typeof error.value === 'string') {
                return at(`Invalid argument: ${error.value}`)
            }
            break
    }
    if (typeof error.message === 'string') {
        if (error.message === 'unreachable') {
            return at('WASM panicked (unreachable)')
        }
        return at(`${error.message}`)
    }
    return at(`${JSON.stringify(error)}`)
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return typeof value === 'object' && value !== null
}
