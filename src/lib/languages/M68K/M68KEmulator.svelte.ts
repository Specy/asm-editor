import {
    ccrToFlagsArray,
    Interpreter,
    type Interrupt,
    type RegisterOperand,
    S68k
} from '@specy/s68k'
import { PAGE_ELEMENTS_PER_ROW, PAGE_SIZE } from '$lib/Config'
import { Prompt } from '$stores/promptStore.svelte'
import { settingsStore } from '$stores/settingsStore.svelte'
import { getM68kErrorMessage } from '$lib/languages/M68K/M68kUtils'
import type { Testcase, TestcaseResult, TestcaseValidationError } from '$lib/Project.svelte'
import {
    byteSliceToNum,
    isMemoryChunkEqual,
    numberToByteSlice
} from '$cmp/specific/project/memory/memoryTabUtils'
import {
    type BaseEmulatorActions,
    type BaseEmulatorState,
    createMemoryTab,
    type EmulatorSettings,
    InterpreterStatus,
    makeLabelColor,
    makeRegister,
    type MonacoError,
    type MutationOperation,
    numbersOfSizeToSlice,
    RegisterSize
} from '../commonLanguageFeatures.svelte'
import { createDebouncer, delay } from '$lib/utils'

export type M68KEmulatorState = BaseEmulatorState & {
    interrupt?: Interrupt
}

const defaultInterruptHandlers = {
    GetTime: async () => Math.round(Date.now() / 1000),
    ReadKeyboardString: async () => Prompt.askText('Enter a string') as Promise<string>,
    ReadNumber: async () => {
        return Prompt.askText('Enter a number') as Promise<string | number>
    },
    ReadChar: async () => {
        return ((await Prompt.askText('Enter a character')) as string)[0]
    },
    Delay: async (ms: number) => {
        await delay(ms)
    }
} as const

function registerNameToType(name: string) {
    return {
        value: Number(name[1]),
        type: name[0] === 'A' ? 'Address' : 'Data'
    } satisfies RegisterOperand
}

export const registerName = [
    'D0',
    'D1',
    'D2',
    'D3',
    'D4',
    'D5',
    'D6',
    'D7',
    'A0',
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
    'A7'
]

export function M68KEmulator(baseCode: string, options: EmulatorSettings = {}) {
    options = {
        globalPageSize: PAGE_SIZE,
        globalPageElementsPerRow: PAGE_ELEMENTS_PER_ROW,
        ...options
    }

    let code = $state(baseCode)
    let state = $state<Omit<M68KEmulatorState, 'code'>>({
        systemSize: RegisterSize.Long,
        registers: [],
        hiddenRegisters: [],
        decorations: [],
        terminated: false,
        pc: 0n,
        line: -1,
        statusRegisters: ['X', 'N', 'Z', 'V', 'C'].map((n) => ({ name: n, value: 0, prev: 0 })),
        compilerErrors: [],
        callStack: [],
        errors: [],
        sp: 0n,
        latestSteps: [],
        stdOut: '',
        executionTime: -1,
        canUndo: false,
        canExecute: false,
        breakpoints: [],
        memory: {
            global: createMemoryTab(
                options.globalPageSize,
                'Global',
                0x1000n,
                options.globalPageElementsPerRow,
                0xff,
                'big'
            ),
            tabs: [createMemoryTab(8 * 4, 'Stack', 0x2000n, 4, 0xff, 'big')]
        },
        interrupt: undefined
    })
    let s68k: S68k | null = null
    let interpreter: Interpreter | null = null
    const [debouncer, clearDebouncer] = createDebouncer(500)

    function setCode(c: string) {
        code = c
        debouncer(semanticCheck)
    }

    function compile(historySize: number, codeOverride?: string): Promise<void> {
        return new Promise((res, rej) => {
            try {
                clear()
                s68k = new S68k(codeOverride ?? code)
                const errors = s68k.semanticCheck().map((e) => {
                    const line = e.getLine()
                    return {
                        line: line,
                        column: line.line.length - line.line.trimStart().length + 1,
                        lineIndex: e.getLineIndex(),
                        message: e.getError(),
                        formatted: e.getMessage()
                    } as MonacoError
                })
                if (errors.length > 0) {
                    s68k = null
                    interpreter = null
                    state.compilerErrors = errors
                    return
                }
                interpreter = s68k.createInterpreter({
                    history_size: historySize,
                    keep_history: historySize > 0
                })
                const stackTab = state.memory.tabs.find((e) => e.name === 'Stack')
                if (stackTab) stackTab.address = BigInt(interpreter.getSp() - stackTab.pageSize)
                const next = interpreter.getNextInstruction()
                state.canExecute = true
                state.line = next ? next.parsed_line.line_index : -1
                state.terminated = interpreter.getStatus() !== InterpreterStatus.Running
                state.canUndo = false
                updateMemory()
                updateData()
                res()
            } catch (e) {
                addError(getM68kErrorMessage(e))
                clearDebouncer() //stop semantic checker from overriding errors
                rej(e)
            }
        })
    }

    function toggleBreakpoint(line: number) {
        const index = state.breakpoints.indexOf(line)
        if (index === -1) state.breakpoints.push(line)
        else state.breakpoints.splice(index, 1)
    }

    function resetSelectedLine() {
        state.line = -1
    }

    function semanticCheck() {
        try {
            const errors = S68k.semanticCheck(code).map((e) => {
                const line = e.getLine()
                return {
                    line,
                    column: line.line.length - line.line.trimStart().length + 1,
                    lineIndex: e.getLineIndex(),
                    message: e.getError(),
                    formatted: e.getMessage()
                } as MonacoError
            })
            state.compilerErrors = errors
            state.errors = []
        } catch (e) {
            console.error(e)
            addError(getM68kErrorMessage(e))
        }
    }

    function clear() {
        const current = state

        setRegisters(new Array(registerName.length).fill(0))
        updateStatusRegisters(new Array(5).fill(0))
        if (current.interrupt) Prompt.cancel()
        state = {
            ...state,
            terminated: false,
            pc: 0n,
            sp: 0n,
            line: -1,
            stdOut: '',
            interrupt: undefined,
            errors: [],
            canUndo: false,
            executionTime: -1,
            canExecute: false,
            latestSteps: [],
            callStack: [],
            compilerErrors: [],
            memory: {
                global: createMemoryTab(
                    options.globalPageSize,
                    'Global',
                    0x1000n,
                    options.globalPageElementsPerRow,
                    0xff,
                    'big'
                ),
                tabs: [createMemoryTab(8 * 4, 'Stack', 0x2000n, 4, 0xff, 'big')]
            }
        }
    }

    function getRegistersValue() {
        if (!interpreter) return []
        const cpu = interpreter.getCpuSnapshot()
        return cpu.getRegistersValues()
    }

    function scrollStackTab() {
        const settings = settingsStore
        const current = state

        if (!settings.values.autoScrollStackTab.value || !interpreter) return
        const stackTab = current.memory.tabs.find((e) => e.name === 'Stack')
        const sp = interpreter.getSp()
        if (!stackTab) return
        const newAddress = BigInt(sp - (sp % stackTab.pageSize))
        if (stackTab.address !== newAddress) {
            stackTab.address = newAddress
            updateMemory()
            //reset the prevState as we don't know what the previous state was
            stackTab.data.prevState = stackTab.data.current
        }
    }

    function updateStatusRegisters(override?: number[]) {
        const settings = settingsStore

        const flags = (
            override ??
            interpreter?.getFlagsAsArray().map((f) => (f ? 1 : 0)) ??
            new Array(5).fill(0)
        ).reverse()
        if (settings.values.maxVisibleHistoryModifications.value > 0 && interpreter && !override) {
            const last = interpreter.getUndoHistory(1)[0]
            if (last) {
                const old = ccrToFlagsArray(last.old_ccr.bits).reverse()
                state.statusRegisters = state.statusRegisters.map((s, i) => ({
                    ...s,
                    value: flags[i],
                    prev: Number(old[i])
                }))
                return
            }
        }
        state.statusRegisters = state.statusRegisters.map((s, i) => ({
            ...s,
            value: flags[i] ?? -1,
            prev: flags[i] ?? -1
        }))
    }

    function setRegisters(override?: number[]) {
        if (!interpreter && !override) {
            override = new Array(registerName.length).fill(0)
        }
        const registers = (override ?? getRegistersValue()).map((reg, i) => {
            return makeRegister(registerName[i], reg, RegisterSize.Long)
        })
        state.registers = registers
    }

    function updateRegisters() {
        if (state.registers.length === 0) return
        getRegistersValue().forEach((reg, i) => {
            state.registers[i].setValue(reg)
        })
        state.sp = state.registers[state.registers.length - 1].value
    }

    function updateMemory() {
        if (!interpreter) return
        const temp = state.memory.global.data.current
        const memory = interpreter.readMemoryBytes(
            Number(state.memory.global.address),
            state.memory.global.pageSize
        )
        state.memory.global.data.current = memory
        state.memory.global.data.prevState = temp
        state.memory.tabs.forEach((tab) => {
            const temp = tab.data.current
            const memory = interpreter.readMemoryBytes(Number(tab.address), tab.pageSize)
            tab.data.current = memory
            tab.data.prevState = temp
        })
    }

    function updateData() {
        const settings = settingsStore
        state.terminated = interpreter.hasReachedBottom()
        state.pc = BigInt(interpreter.getPc())
        state.callStack = interpreter.getCallStack().map((v, i) => {
            return {
                address: BigInt(v.address),
                name: v.label_name,
                line: v.label_line,
                sp: BigInt(v.registers[15]),
                destination: BigInt(v.source_address),
                color: makeLabelColor(i, v.address)
            }
        })
        const steps = interpreter.getUndoHistory(
            settings.values.maxVisibleHistoryModifications.value
        )
        const sizeMap = {
            Long: RegisterSize.Long,
            Word: RegisterSize.Word,
            Byte: RegisterSize.Byte
        }
        state.latestSteps = steps.map((s) => {
            return {
                ...s,
                mutations: s.mutations.map((m) => {
                    if (m.type === 'WriteRegister') {
                        return {
                            type: 'WriteRegister',
                            value: {
                                old: BigInt(m.value.old),
                                size: sizeMap[m.value.size] as RegisterSize,
                                register: registerOperandToString(m.value.register)
                            }
                        } satisfies MutationOperation
                    } else if (m.type === 'WriteMemoryBytes') {
                        return {
                            type: 'WriteMemoryBytes',
                            value: {
                                address: BigInt(m.value.address),
                                old: m.value.old
                            }
                        } satisfies MutationOperation
                    } else if (m.type === 'WriteMemory') {
                        return {
                            type: 'WriteMemory',
                            value: {
                                address: BigInt(m.value.address),
                                old: BigInt(m.value.old),
                                size: sizeMap[m.value.size] as RegisterSize
                            }
                        } satisfies MutationOperation
                    } else if (m.type === 'PushCall') {
                        return {
                            type: 'PushCallStack',
                            value: {
                                to: BigInt(m.value.to),
                                from: BigInt(m.value.from)
                            }
                        }
                    } else if (m.type === 'PopCall') {
                        return {
                            type: 'PopCallStack',
                            value: {
                                to: BigInt(m.value.to),
                                from: BigInt(m.value.from)
                            }
                        }
                    }
                })
            }
        })
    }

    function dispose() {
        clearDebouncer()
        interpreter = null
        s68k = null
        clear()
    }

    function addError(error: string) {
        state.errors.push(error)
    }

    async function step() {
        let lastLine = -1
        try {
            if (!interpreter) throw new Error('Interpreter not initialized')
            lastLine = interpreter.getCurrentLineIndex()
            interpreter.step()
            const ins = interpreter.getNextInstruction()
            switch (interpreter.getStatus()) {
                case InterpreterStatus.Interrupt: {
                    const interrupt = interpreter.getCurrentInterrupt()
                    state.interrupt = interrupt
                    await handleInterrupt(interrupt)
                    break
                }
            }
            state.line = ins?.parsed_line?.line_index ?? lastLine
            state.canUndo = interpreter?.canUndo() ?? false
        } catch (e) {
            console.error(e)
            addError(getM68kErrorMessage(e, lastLine + 1))
            state.terminated = true
            state.line = lastLine
            throw e
        }
        updateRegisters()
        updateStatusRegisters()
        updateMemory()
        updateData()
        scrollStackTab()
        return interpreter.getStatus() != InterpreterStatus.Running
    }

    function undo(amount = 1) {
        try {
            for (let i = 0; i < amount && interpreter?.canUndo(); i++) {
                interpreter?.undo()
            }
            const instruction = interpreter?.getNextInstruction()
            state.line = instruction?.parsed_line.line_index ?? -1
            state.canUndo = interpreter?.canUndo() ?? false
            updateRegisters()
            updateMemory()
            updateStatusRegisters()
            updateData()
            scrollStackTab()
        } catch (e) {
            addError(getM68kErrorMessage(e))
            state.terminated = true
            console.error(e)
            throw e
        }
    }

    async function handleInterrupt(
        interrupt: Interrupt | null,
        inputHandlers: Partial<typeof defaultInterruptHandlers> = {}
    ) {
        if (!interrupt || !interpreter) throw new Error('Expected interrupt')
        const handlers = {
            ...defaultInterruptHandlers,
            ...inputHandlers
        }
        state.interrupt = interrupt
        const { type } = interrupt
        switch (type) {
            case 'DisplayStringWithCRLF': {
                state.stdOut += `${interrupt.value}\n`
                interpreter.answerInterrupt({ type })
                break
            }
            case 'DisplayStringWithoutCRLF':
            case 'DisplayChar':
            case 'DisplayNumber': {
                state.stdOut += interrupt.value
                interpreter.answerInterrupt({ type })
                break
            }
            case 'DisplayNumberInBase': {
                const { value, base } = interrupt.value
                const str = value.toString(base)
                state.stdOut += str
                interpreter.answerInterrupt({ type })
                break
            }
            case 'ReadChar': {
                const char = await handlers.ReadChar()
                if (!char) throw new Error(`Expected a character, got "${char}"`)
                interpreter.answerInterrupt({ type, value: char })
                break
            }
            case 'ReadNumber': {
                const answer = await handlers.ReadNumber()
                const number = Number(answer)
                if (Number.isNaN(number) || answer === '')
                    throw new Error(`Expected a number, got "${answer === '' ? '' : number}"`)
                interpreter.answerInterrupt({ type, value: number })
                break
            }
            case 'ReadKeyboardString': {
                const string = await handlers.ReadKeyboardString()
                interpreter.answerInterrupt({ type, value: string })
                break
            }
            case 'GetTime': {
                interpreter.answerInterrupt({
                    type,
                    value: await handlers.GetTime()
                }) //unix seconds
                break
            }
            case 'Terminate': {
                interpreter.answerInterrupt({ type })
                break
            }
            case 'Delay': {
                await handlers.Delay(interrupt.value)
                interpreter.answerInterrupt({ type })
                break
            }
            default:
                throw new Error(`Unknown interrupt type "${type}"`)
        }
        state.interrupt = undefined
    }

    async function run(haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        const breakpoints = new Uint32Array(state.breakpoints)
        const hasBreakpoints = breakpoints.length > 0
        try {
            if (!interpreter) throw new Error('Interpreter not initialized')
            let status = interpreter.getStatus()
            while (!interpreter.hasTerminated()) {
                if (!hasBreakpoints) {
                    interpreter.runWithLimit(haltLimit)
                    status = interpreter.getStatus()
                } else {
                    interpreter.runWithBreakpoints(breakpoints, haltLimit)
                    status = interpreter.getStatus()
                    //here we might have reached a breakpoint. It is paused if the status is running
                    if (status === InterpreterStatus.Running) break
                }
                await handleInterpreterInterruption(interpreter)
            }
            const ins = interpreter.getNextInstruction()
            const last = interpreter.getLastInstruction()
            //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
            const line = ins?.parsed_line?.line_index ?? last?.parsed_line?.line_index
            state.line = line ?? -1
            state.canUndo = interpreter?.canUndo() ?? false

            updateRegisters()
            updateStatusRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
            return interpreter.getStatus()
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                line = interpreter?.getLastInstruction()?.parsed_line.line_index ?? -1
            } catch (e) {
                console.error(e)
            }
            addError(getM68kErrorMessage(e, line + 1))
            state.terminated = true
            state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    function setGlobalMemoryAddress(address: bigint) {
        try {
            state.memory.global.address = address
            state.memory.global.data.current =
                interpreter?.readMemoryBytes(Number(address), state.memory.global.pageSize) ??
                new Uint8Array(state.memory.global.pageSize).fill(0xff)
            state.memory.global.data.prevState = state.memory.global.data.current
        } catch (e) {
            addError(getM68kErrorMessage(e, e.message))
        }
    }

    function setTabMemoryAddress(address: bigint, tabId: number) {
        try {
            const tab = state.memory.tabs.find((e) => e.id == tabId)
            if (!tab) return
            tab.address = address
            tab.data.current =
                interpreter?.readMemoryBytes(Number(address), tab.pageSize) ??
                new Uint8Array(tab.pageSize).fill(0xff)
            tab.data.prevState = tab.data.current
        } catch (e) {
            addError(getM68kErrorMessage(e, e.message))
        }
    }

    async function handleInterpreterInterruption(
        int: Interpreter,
        inputHandlers: Partial<typeof defaultInterruptHandlers> = {}
    ) {
        const status = int.getStatus()
        const current = state
        switch (status) {
            case InterpreterStatus.Terminated: {
                const ins = int.getLastInstruction()
                state.terminated = true
                state.line = ins?.parsed_line?.line_index ?? -1
                break
            }
            case InterpreterStatus.TerminatedWithException: {
                const ins = int.getLastInstruction()
                state.terminated = true
                state.line = ins?.parsed_line?.line_index ?? -1
                state.canUndo = false
                state.errors.push('Program terminated with errors')
                break
            }
            case InterpreterStatus.Interrupt: {
                if (current.terminated || !current.canExecute) break
                const ins = int.getLastInstruction()
                state.line = ins.parsed_line.line_index
                updateRegisters()
                updateStatusRegisters()
                updateMemory()
                updateData()
                scrollStackTab()
                await handleInterrupt(int.getCurrentInterrupt(), inputHandlers)
                break
            }
        }
    }

    async function validateTestcase(testcase: Testcase) {
        const errors = [] as TestcaseValidationError[]
        if (!interpreter) throw new Error('Interpreter not initialized')
        const cpu = interpreter.getCpuSnapshot()
        const registers = cpu.getRegistersValues()
        for (const [register, value] of Object.entries(testcase.expectedRegisters)) {
            const registerIndex = registerName.indexOf(register.toUpperCase())
            if (registerIndex === -1) {
                console.error(`Register ${register} not found`)
                continue
            }
            const registerValue = BigInt(registers[registerIndex])
            if (registerValue !== value) {
                errors.push({
                    type: 'wrong-register',
                    register,
                    expected: value,
                    got: registerValue
                })
            }
        }
        const current = state
        if (current.stdOut !== testcase.expectedOutput) {
            errors.push({
                type: 'wrong-output',
                expected: testcase.expectedOutput,
                got: current.stdOut
            })
        }
        for (const value of testcase.expectedMemory) {
            if (value.type === 'number') {
                const bytes = interpreter.readMemoryBytes(Number(value.address), value.bytes)
                const num = byteSliceToNum(bytes, 'big')
                if (num !== value.expected) {
                    errors.push({
                        type: 'wrong-memory-number',
                        address: value.address,
                        bytes: value.bytes,
                        expected: value.expected,
                        got: num
                    })
                }
            } else if (value.type === 'number-chunk') {
                const bytes = interpreter.readMemoryBytes(
                    Number(value.address),
                    value.expected.length * value.bytes
                )
                const expected = numbersOfSizeToSlice(value.expected, value.bytes)
                if (!isMemoryChunkEqual(bytes, expected)) {
                    errors.push({
                        type: 'wrong-memory-chunk',
                        address: value.address,
                        expected: expected,
                        got: Array.from(bytes)
                    })
                }
            } else if (value.type === 'string-chunk') {
                const bytes = interpreter.readMemoryBytes(
                    Number(value.address),
                    value.expected.length
                )
                const str = new TextDecoder().decode(bytes)
                if (str !== value.expected) {
                    errors.push({
                        type: 'wrong-memory-string',
                        address: value.address,
                        expected: value.expected,
                        got: str
                    })
                }
            }
        }
        return errors
    }

    async function runTestcase(testcase: Testcase, haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        try {
            if (!interpreter) throw new Error('Interpreter not initialized')
            for (const [register, value] of Object.entries(testcase.startingRegisters)) {
                interpreter.setRegisterValue(registerNameToType(register), Number(value))
            }
            for (const value of testcase.startingMemory) {
                if (value.type === 'number') {
                    const slice = new Uint8Array(numberToByteSlice(value.expected, value.bytes))
                    interpreter.writeMemoryBytes(Number(value.address), slice)
                } else if (value.type === 'number-chunk') {
                    const expected = numbersOfSizeToSlice(value.expected, value.bytes)
                    interpreter.writeMemoryBytes(Number(value.address), new Uint8Array(expected))
                } else if (value.type === 'string-chunk') {
                    const encoded = new TextEncoder().encode(value.expected)
                    interpreter.writeMemoryBytes(Number(value.address), encoded)
                }
            }
            while (!interpreter.hasTerminated()) {
                interpreter.runWithLimit(haltLimit)
                await handleInterpreterInterruption(interpreter, {
                    ReadChar: async () => {
                        if (testcase.input.length === 0)
                            throw new Error('Input does not have any characters')
                        return testcase.input.shift()
                    },
                    ReadNumber: async () => {
                        if (testcase.input.length === 0)
                            throw new Error('Input does not have any numbers')
                        return testcase.input.shift()
                    },
                    ReadKeyboardString: async () => {
                        if (testcase.input.length === 0)
                            throw new Error('Input does not have any strings')
                        return testcase.input.shift()
                    }
                })
            }
            const ins = interpreter.getNextInstruction()
            const last = interpreter.getLastInstruction()
            //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
            const line = ins?.parsed_line?.line_index ?? last?.parsed_line?.line_index
            state.line = line ?? -1
            state.canUndo = interpreter?.canUndo() ?? false

            updateRegisters()
            updateStatusRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
            return interpreter.getStatus()
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                line = interpreter?.getLastInstruction()?.parsed_line.line_index ?? -1
            } catch (e) {
                console.error(e)
            }
            addError(getM68kErrorMessage(e, line + 1))
            state.terminated = true
            state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    async function test(code: string, testcases: Testcase[], haltLimit: number, historySize = 0) {
        const results = [] as TestcaseResult[]
        for (const testcase of testcases) {
            try {
                await compile(historySize, code)
                await runTestcase(testcase, haltLimit)
                const errors = await validateTestcase(testcase)
                results.push({
                    errors,
                    passed: errors.length === 0,
                    testcase
                })
            } catch (e) {
                console.error(e)
                state.errors.push(getM68kErrorMessage(e))
            }
        }
        const passedTests = results.filter((r) => r.passed)
        state.stdOut = '⏳ Running tests...\n ' + state.stdOut
        if (passedTests.length !== results.length) {
            state.stdOut += `\n❌ ${results.length - results.filter((r) => r.passed).length} testcases not passed\n`
        }
        if (passedTests.length > 0) {
            state.stdOut += `\n✅ ${passedTests.length} testcases passed \n`
        }
        return results
    }

    function getLineFromAddress(address: bigint) {
        if (!interpreter) return -1
        const line = interpreter.getInstructionAt(Number(address))
        return line?.parsed_line?.line_index ?? -1
    }

    clear()
    semanticCheck()

    return {
        get registers() {
            return state.registers
        },
        get hiddenRegisters() {
            return state.hiddenRegisters
        },
        get terminated() {
            return state.terminated
        },
        get line() {
            return state.line
        },
        get code() {
            return code
        },
        get compilerErrors() {
            return state.compilerErrors
        },
        get callStack() {
            return state.callStack
        },
        get errors() {
            return state.errors
        },
        get sp() {
            return state.sp
        },
        get latestSteps() {
            return state.latestSteps
        },
        get stdOut() {
            return state.stdOut
        },
        get executionTime() {
            return state.executionTime
        },
        get canUndo() {
            return state.canUndo
        },
        get canExecute() {
            return state.canExecute
        },
        get breakpoints() {
            return state.breakpoints
        },
        get memory() {
            return state.memory
        },
        get interrupt() {
            return state.interrupt
        },
        get statusRegisters() {
            return state.statusRegisters
        },
        compile,
        get decorations() {
            return state.decorations
        },
        get pc() {
            return state.pc
        },
        get systemSize() {
            return state.systemSize
        },
        step,
        run,
        setGlobalMemoryAddress,
        setCode,
        clear,
        setTabMemoryAddress,
        toggleBreakpoint,
        undo,
        resetSelectedLine,
        dispose,
        test,
        getLineFromAddress
    } satisfies M68KEmulatorState & BaseEmulatorActions
}

function registerOperandToString(op: RegisterOperand) {
    return op.type === 'Address' ? `a${op.value}` : `d${op.value}`
}
