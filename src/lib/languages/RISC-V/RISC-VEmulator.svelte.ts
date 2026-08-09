import { PAGE_ELEMENTS_PER_ROW, PAGE_SIZE } from '$lib/Config'
import {
    BackStepAction,
    bigintToHighLow,
    ConfirmResult,
    type HandlerMapFns,
    type JsBackStep,
    type JsProgramStatement,
    type JsRiscV,
    registerHandlers,
    type RegisterName,
    RISCV,
    RISCV_REGISTERS,
    type RISCVAssembleError,
    StopReason,
    unimplementedHandler
} from '@specy/risc-v'
import {
    type BaseEmulatorActions,
    type BaseEmulatorState,
    createMemoryTab,
    type EmulatorDecoration,
    type EmulatorSettings,
    InterpreterStatus,
    makeGenericMonacoError,
    makeLabelColor,
    makeRegister,
    type MonacoError,
    type MutationOperation,
    numbersOfSizeToSlice,
    RegisterSize
} from '../commonLanguageFeatures.svelte'
import { createDebouncer } from '$lib/utils'
import { settingsStore } from '$stores/settingsStore.svelte'
import type { Testcase, TestcaseResult, TestcaseValidationError } from '$lib/Project.svelte'
import {
    byteSliceToNum,
    isMemoryChunkEqual,
    numberToByteSlice
} from '$cmp/specific/project/memory/memoryTabUtils'

export type RISCVEmulatorState = BaseEmulatorState & {}

function getRISCVErrorMessage(e: unknown) {
    return String(e)
}

function sourceLineToIndex(sourceLine: number) {
    return sourceLine - 1
}

function findRegisterName(register: string): RegisterName | undefined {
    const normalized = register.toLowerCase()
    return RISCV_REGISTERS.find((candidate) => candidate.toLowerCase() === normalized)
}

export const RISCVRegisterNames = [...RISCV_REGISTERS, 'pc']

export const ALTERNATIVE_RISCVRegister_NAMES = new Array(RISCV_REGISTERS.length)
    .fill(0)
    .map((_, i) => `x${i}`)

function assembleErrorToMonacoError(error: RISCVAssembleError): MonacoError {
    const lineIndex = sourceLineToIndex(error.lineNumber)
    return {
        lineIndex,
        column: error.columnNumber,
        line: {
            line: '',
            line_index: lineIndex
        },
        message: error.message,
        formatted: error.message
    }
}

function formatStatement(statement: string) {
    statement = statement.replace(/,/g, ', ')
    RISCV_REGISTERS.forEach((register, index) => {
        statement = statement.replace(new RegExp(`\\bx${index}\\b`, 'g'), register)
    })
    //replaces all empty hex like 0x0000ffff with 0xffff
    statement = statement.replace(/0x0*(?=[0-9a-fA-F])/g, '0x')
    return statement
}

export function RISCVEmulator(baseCode: string, options: EmulatorSettings = {}) {
    const globalPageSize = options.globalPageSize ?? PAGE_SIZE
    const globalPageElementsPerRow = options.globalPageElementsPerRow ?? PAGE_ELEMENTS_PER_ROW
    RISCV.setIs64Bit(options.language === 'RISC-V-64')
    let code = $state(baseCode)
    let state = $state<Omit<RISCVEmulatorState, 'code'>>({
        systemSize: options.language === 'RISC-V-64' ? RegisterSize.Double : RegisterSize.Long,
        registers: [],
        hiddenRegisters: ['zero'],
        startingRegisterNames: [...RISCV_REGISTERS],
        pc: 0n,
        terminated: false,
        line: -1,
        decorations: [],
        statusRegisters: [],
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
                globalPageSize,
                'Global',
                0x10010000n,
                globalPageElementsPerRow,
                0x0,
                'little'
            ),
            tabs: [createMemoryTab(8 * 4, 'Stack', 0x7ffffffcn, 4, 0x0, 'little')]
        },
        isExamMode: false
    })

    let riscv: JsRiscV | null = null
    const [debouncer, clearDebouncer] = createDebouncer(500)

    function setCode(c: string) {
        code = c
        debouncer(semanticCheck)
    }

    function addDecorations() {
        if (!riscv) return
        const statements = riscv.getCompiledStatements()
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch map is populated and read locally with no tracked consumer.
        const joined = new Map<number, JsProgramStatement[]>()
        for (const statement of statements) {
            const arr = joined.get(statement.sourceLine)
            if (arr) {
                arr.push(statement)
            } else {
                joined.set(statement.sourceLine, [statement])
            }
        }
        const values = [...joined.values()]
        const nonBasic = values
            .filter((v) => v.length > 1)
            .map((v) => {
                const source = v[0].source
                const indent = source.length - source.trimStart().length
                const lines = v.map(
                    (s) => `${' '.repeat(indent)}${formatStatement(s.assemblyStatement)}`
                )
                return {
                    type: 'below-line',
                    note: 'Assembled instructions',
                    belowLine: v[0].sourceLine,
                    md: `\`\`\`riscv\n${lines.join('\n')}\n\`\`\``
                } satisfies EmulatorDecoration
            })
        state.decorations = nonBasic
    }

    function compile(historySize: number, codeOverride?: string): Promise<void> {
        return new Promise((res, rej) => {
            try {
                const normalizedHistorySize = Number.isFinite(historySize)
                    ? Math.max(0, Math.floor(historySize))
                    : 0
                clear()
                riscv = RISCV.makeRiscVFromSource(codeOverride ?? code)
                riscv.setUndoSize(Math.max(1, normalizedHistorySize))
                const result = riscv.assemble()
                state.compilerErrors = result.errors.map(assembleErrorToMonacoError)
                state.canExecute = !result.hasErrors
                if (result.hasErrors) {
                    return rej(result.report)
                }
                addDecorations()
                riscv.setUndoEnabled(normalizedHistorySize > 0)
                riscv.initialize(true)
                registerHandlers(riscv, getHandlers())

                //TODO add interrupts
                const stackTab = state.memory.tabs.find((e) => e.name === 'Stack')
                if (stackTab)
                    stackTab.address =
                        options.language === 'RISC-V-64'
                            ? BigInt(riscv.stackPointerLong) - BigInt(stackTab.pageSize)
                            : BigInt(riscv.stackPointer - stackTab.pageSize)
                const next = riscv.getNextStatement()
                state.canExecute = true
                state.line = sourceLineToIndex(next.sourceLine)
                state.terminated = hasTerminated(riscv) //TODO check this
                state.canUndo = false
                updateMemory()
                updateData()
                res()
            } catch (e) {
                addError(getRISCVErrorMessage(e))
                clearDebouncer()
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
            const riscv = RISCV.makeRiscVFromSource(code)
            const result = riscv.assemble()
            const errors = result.errors.map(assembleErrorToMonacoError)
            state.compilerErrors = errors
            state.errors = []
            return errors
        } catch (e) {
            console.error(e)
            const error = getRISCVErrorMessage(e)
            addError(error)
            return [makeGenericMonacoError(error)]
        }
    }

    function clear() {
        state = {
            ...state,
            terminated: false,
            pc: 0n,
            sp: 0n,
            decorations: [],
            line: -1,
            stdOut: '',
            errors: [],
            canUndo: false,
            executionTime: -1,
            canExecute: false,
            latestSteps: [],
            callStack: [],
            compilerErrors: [],
            memory: {
                global: createMemoryTab(
                    globalPageSize,
                    'Global',
                    0x10010000n,
                    globalPageElementsPerRow,
                    0x0,
                    'little'
                ),
                tabs: [createMemoryTab(8 * 4, 'Stack', 0x7ffffffcn, 4, 0x0, 'little')]
            }
        }
        setRegisters(new Array(RISCVRegisterNames.length).fill(0))
    }

    function getRegistersValue(currentRiscv: JsRiscV | null = riscv) {
        if (!currentRiscv) return []

        if (options.language === 'RISC-V-64') {
            return [
                ...currentRiscv.getRegistersValuesLong().map(BigInt),
                BigInt(currentRiscv.programCounterLong)
            ]
        } else {
            return [
                ...currentRiscv.getRegistersValues().map(BigInt),
                BigInt(currentRiscv.programCounter)
            ]
        }
    }

    function scrollStackTab() {
        const settings = settingsStore
        const current = state
        if (!settings.values.autoScrollStackTab.value || !riscv) return
        const stackTab = current.memory.tabs.find((e) => e.name === 'Stack')
        const sp =
            options.language === 'RISC-V-64'
                ? BigInt(riscv.stackPointerLong)
                : BigInt(riscv.stackPointer)
        if (!stackTab) return
        const newAddress = sp - (sp % BigInt(stackTab.pageSize))
        if (stackTab.address !== newAddress) {
            stackTab.address = newAddress
            updateMemory()
            //reset the prevState as we don't know what the previous state was
            stackTab.data.prevState = stackTab.data.current
        }
    }

    function setRegisters(override?: number[]) {
        if (!riscv && !override) {
            override = new Array(RISCVRegisterNames.length).fill(0)
        }

        state.registers = (override ?? getRegistersValue()).map((reg, i) => {
            return makeRegister(RISCVRegisterNames[i], reg, state.systemSize)
        })
    }

    function updateRegisters() {
        if (state.registers.length === 0 || !riscv) return
        getRegistersValue().forEach((reg, i) => {
            state.registers[i].setValue(reg)
        })
        state.sp =
            options.language === 'RISC-V-64'
                ? BigInt(riscv.stackPointerLong)
                : BigInt(riscv.stackPointer)
    }

    function updateMemory() {
        const currentRiscv = riscv
        if (!currentRiscv) return
        try {
            const temp = state.memory.global.data.current
            const memory = currentRiscv.readMemoryBytes(
                Number(state.memory.global.address),
                state.memory.global.pageSize
            )
            state.memory.global.data.current = new Uint8Array(memory)
            state.memory.global.data.prevState = temp
            state.memory.tabs.forEach((tab) => {
                const temp = tab.data.current
                const memory = currentRiscv.readMemoryBytes(Number(tab.address), tab.pageSize)
                tab.data.current = new Uint8Array(memory)
                tab.data.prevState = temp
            })
        } catch (e) {
            console.error(e)
            addError(getRISCVErrorMessage(e))
        }
    }

    function updateData() {
        const settings = settingsStore
        const currentRiscv = riscv
        if (!currentRiscv) return
        state.terminated = hasTerminated(currentRiscv)
        const steps = currentRiscv
            .getUndoStack()
            .slice(0, settings.values.maxVisibleHistoryModifications.value)
        state.pc =
            options.language === 'RISC-V-64'
                ? BigInt(currentRiscv.programCounterLong)
                : BigInt(currentRiscv.programCounter)
        state.callStack = currentRiscv.getCallStack().map((v, i) => {
            const address = v.toAddress
            const statement = currentRiscv.getStatementAtAddress(address)
            return {
                address: BigInt(address),
                destination: BigInt(v.pc),
                sp: BigInt(v.sp),
                name:
                    currentRiscv.getLabelAtAddress(address) ??
                    `0x${address.toString(16).padStart(8, '0')}`,
                line: statement ? sourceLineToIndex(statement.sourceLine) : -1,
                color: makeLabelColor(i, v.sp)
            }
        })
        state.latestSteps = steps
            .map((step) => {
                let line = -1
                try {
                    const ins = currentRiscv.getStatementAtAddress(step.pc)
                    line = sourceLineToIndex(ins.sourceLine)
                } catch {}
                const mutations = backstepToMutation(step)
                if (!mutations) return null
                return {
                    pc: step.pc,
                    old_ccr: {
                        bits: 0
                    },
                    new_ccr: {
                        bits: 0
                    },
                    line,
                    mutations: [mutations]
                }
            })
            .filter((v) => v !== null)
    }

    function backstepToMutation(step: JsBackStep): MutationOperation | null {
        function makeMemoryMutation(address: number, size: RegisterSize): MutationOperation {
            return {
                type: 'WriteMemory',
                value: {
                    address: BigInt(address),
                    size,
                    old: 0n
                }
            }
        }

        switch (step.action) {
            case BackStepAction.REGISTER_RESTORE:
                return {
                    type: 'WriteRegister',
                    value: {
                        register: state.registers[step.param1].name,
                        old: 0n,
                        size: state.systemSize
                    }
                }
            case BackStepAction.FLOATING_POINT_REGISTER_RESTORE:
                return {
                    type: 'Other',
                    value: `Floating point register restore f${step.param1}`
                }
            case BackStepAction.MEMORY_RESTORE_BYTE:
                return makeMemoryMutation(step.param1, RegisterSize.Byte)
            case BackStepAction.MEMORY_RESTORE_HALF:
                return makeMemoryMutation(step.param1, RegisterSize.Word)
            case BackStepAction.MEMORY_RESTORE_WORD:
            case BackStepAction.MEMORY_RESTORE_RAW_WORD:
                return makeMemoryMutation(step.param1, RegisterSize.Long)
            case BackStepAction.MEMORY_RESTORE_DOUBLE_WORD:
                return makeMemoryMutation(step.param1, RegisterSize.Double)
            case BackStepAction.PC_RESTORE:
                return {
                    type: 'WriteRegister',
                    value: {
                        register: 'pc',
                        old: 0n,
                        size: state.systemSize
                    }
                }
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_BACKDOOR:
            case BackStepAction.CONTROL_AND_STATUS_REGISTER_RESTORE:
                return null
            case BackStepAction.DO_NOTHING:
                return {
                    type: 'Other',
                    value: backStepActionMap[step.action]
                }
        }
        // The runtime uses -1 for a backstep without an action, although its type omits it.
        return null
    }

    function dispose() {
        clearDebouncer()
        riscv = null
        clear()
    }

    function addError(error: string) {
        state.errors.push(error)
    }

    function hasTerminated(currentRiscv: JsRiscV) {
        try {
            //TODO improve this
            currentRiscv.getNextStatement()
            return false
        } catch {
            return true
        }
    }

    async function step() {
        let lastLine = -1
        try {
            if (!riscv) throw new Error('Interpreter not initialized')
            lastLine = sourceLineToIndex(riscv.getNextStatement().sourceLine)
            state.terminated = riscv.step() === StopReason.CLIFF_TERMINATION
            try {
                const ins = riscv.getNextStatement()
                state.line = sourceLineToIndex(ins.sourceLine)
            } catch {}

            state.canUndo = riscv.canUndo
            //if it managed to step, it means it does not have valid errors
            state.errors = []
        } catch (e) {
            console.error(e)
            addError(getRISCVErrorMessage(e))
            state.terminated = true
            state.line = lastLine
            throw e
        }
        updateRegisters()
        updateMemory()
        updateData()
        scrollStackTab()
        return riscv.terminated
    }

    function undo(amount = 1) {
        try {
            if (!riscv) return
            for (let i = 0; i < amount && riscv.canUndo; i++) {
                riscv.undo()
            }
            const instruction = riscv.getNextStatement()
            state.line = sourceLineToIndex(instruction.sourceLine)
            state.canUndo = riscv.canUndo
            updateRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
        } catch (e) {
            addError(getRISCVErrorMessage(e))
            state.terminated = true
            console.error(e)
            throw e
        }
    }

    function calculateBreakpoints(currentRiscv: JsRiscV, breakpoints: number[]) {
        const b = breakpoints
            .map((line) => {
                const ins = currentRiscv.getStatementAtSourceLine(line + 1)
                if (!ins) return -1
                return ins.address
            })
            .filter((e) => e !== -1)
        return b
    }

    async function run(haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        const breakpoints = state.breakpoints
        const currentRiscv = riscv
        try {
            if (!currentRiscv) throw new Error('Interpreter not initialized')
            const terminated =
                currentRiscv.simulateWithBreakpointsAndLimit(
                    calculateBreakpoints(currentRiscv, breakpoints),
                    haltLimit
                ) === StopReason.CLIFF_TERMINATION
            try {
                const ins = currentRiscv.getNextStatement()
                //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
                if (!terminated) {
                    state.line = sourceLineToIndex(ins.sourceLine)
                } else {
                    state.line = -1
                }
            } catch {
                state.line = -1
            }
            state.canUndo = currentRiscv.canUndo
            updateRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
            state.terminated = terminated
            //if it managed to run, it means it does not have valid errors
            state.errors = []
            return terminated ? InterpreterStatus.Terminated : InterpreterStatus.Running
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                if (currentRiscv) line = sourceLineToIndex(currentRiscv.getCurrentStatementIndex())
            } catch (e) {
                console.error(e)
            }
            addError(getRISCVErrorMessage(e))
            state.terminated = true
            state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    function setGlobalMemoryAddress(address: bigint) {
        try {
            const bytes = riscv?.readMemoryBytes(Number(address), state.memory.global.pageSize)
            state.memory.global.address = address
            state.memory.global.data.current = bytes
                ? new Uint8Array(bytes)
                : new Uint8Array(state.memory.global.pageSize).fill(0xff)
            state.memory.global.data.prevState = state.memory.global.data.current
        } catch (e) {
            console.error(e)
            addError(getRISCVErrorMessage(e))
        }
    }

    function setTabMemoryAddress(address: bigint, tabId: number) {
        try {
            const tab = state.memory.tabs.find((e) => e.id == tabId)
            if (!tab) return
            const bytes = riscv?.readMemoryBytes(Number(address), tab.pageSize)
            tab.address = address
            tab.data.current = bytes
                ? new Uint8Array(bytes)
                : new Uint8Array(tab.pageSize).fill(0xff)
            tab.data.prevState = tab.data.current
        } catch (e) {
            console.error(e)
            addError(getRISCVErrorMessage(e))
        }
    }

    async function validateTestcase(testcase: Testcase) {
        const errors: TestcaseValidationError[] = []
        const currentRiscv = riscv
        if (!currentRiscv) throw new Error('Interpreter not initialized')
        const registers = getRegistersValue(currentRiscv)
        for (const [register, value] of Object.entries(testcase.expectedRegisters)) {
            const normalizedRegister = register.toLowerCase()
            const registerIndex = RISCVRegisterNames.findIndex(
                (candidate) => candidate.toLowerCase() === normalizedRegister
            )
            const registerValue = registers[registerIndex]
            if (registerIndex === -1 || registerValue === undefined) {
                console.error(`Register ${register} not found`)
                continue
            }
            const actual = BigInt(registerValue)
            if (actual !== value) {
                errors.push({
                    type: 'wrong-register',
                    register,
                    expected: value,
                    got: actual
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
                const bytes = new Uint8Array(
                    currentRiscv.readMemoryBytes(Number(value.address), value.bytes)
                )
                const num = byteSliceToNum(bytes, 'little')
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
                const bytes = currentRiscv.readMemoryBytes(
                    Number(value.address),
                    value.expected.length * value.bytes
                )
                const expected = numbersOfSizeToSlice(value.expected, value.bytes, 'little')
                if (!isMemoryChunkEqual(bytes, expected)) {
                    errors.push({
                        type: 'wrong-memory-chunk',
                        address: value.address,
                        expected: expected,
                        got: Array.from(bytes)
                    })
                }
            } else if (value.type === 'string-chunk') {
                const bytes = currentRiscv.readMemoryBytes(
                    Number(value.address),
                    value.expected.length
                )
                const str = new TextDecoder().decode(new Uint8Array(bytes))
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

    function throwIfExamMode() {
        if (state.isExamMode) {
            throw new Error('Operation not allowed in exam mode')
        }
    }

    function getHandlers() {
        return {
            askDouble: (props: string) => {
                throwIfExamMode()
                return Number(prompt(props))
            },
            askFloat: (props: string) => {
                throwIfExamMode()
                return Number(prompt(props))
            },
            askInt: (props: string) => {
                throwIfExamMode()
                return Number(prompt(props))
            },
            askString: (props: string) => {
                throwIfExamMode()
                return prompt(props) ?? ''
            },
            printChar: (char: string) => {
                state.stdOut += char
            },
            printDouble: (value: number) => {
                state.stdOut += String(value)
            },
            printFloat: (value: number) => {
                state.stdOut += String(value)
            },
            printInt: (value: number) => {
                state.stdOut += String(value)
            },
            printString: (value: string) => {
                state.stdOut += value
            },

            readFile: unimplementedHandler('readFile'),
            writeFile: unimplementedHandler('writeFile'),
            openFile: unimplementedHandler('openFile'),
            closeFile: unimplementedHandler('closeFile'),
            stdIn: unimplementedHandler('stdIn'),

            stdOut: (buffer: number[]) => {
                state.stdOut += new TextDecoder().decode(new Uint8Array(buffer))
            },

            readChar: () => {
                throwIfExamMode()
                const str = prompt('Enter a character') ?? ''
                if (str.length !== 1) throw new Error('Invalid character')
                return str[0]
            },
            readDouble: () => {
                throwIfExamMode()
                return Number(prompt('Enter a double'))
            },
            readFloat: () => {
                throwIfExamMode()
                return Number(prompt('Enter a float'))
            },
            readInt: () => {
                throwIfExamMode()
                return Number(prompt('Enter an integer'))
            },
            readString: () => {
                throwIfExamMode()
                return prompt('Enter a string') ?? ''
            },

            log: (message: string) => {
                state.stdOut += message
            },
            logLine: (message: string) => {
                state.stdOut += message + '\n'
            },

            confirm: (message: string) => (confirm(message) ? ConfirmResult.YES : ConfirmResult.NO),
            inputDialog: (message: string) => prompt(message) ?? '',
            outputDialog: (message: string) => alert(message),

            sleep: unimplementedHandler('sleep')
        } satisfies HandlerMapFns
    }

    async function runTestcase(testcase: Testcase, haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        const currentRiscv = riscv
        try {
            const t = structuredClone($state.snapshot(testcase))
            if (!currentRiscv) throw new Error('Interpreter not initialized')
            function takeInput(errorMessage: string) {
                const input = t.input.shift()
                if (input === undefined) throw new Error(errorMessage)
                return input
            }
            for (const [register, value] of Object.entries(t.startingRegisters)) {
                const registerName = findRegisterName(register)
                if (registerName === undefined) {
                    throw new Error(
                        `Unsupported starting register "${register}"; only ordinary RISC-V registers are supported`
                    )
                }
                currentRiscv.setRegisterValue(registerName, ...bigintToHighLow(value))
            }
            for (const value of t.startingMemory) {
                if (value.type === 'number') {
                    const slice = numberToByteSlice(value.expected, value.bytes, 'little')
                    currentRiscv.setMemoryBytes(Number(value.address), slice)
                } else if (value.type === 'number-chunk') {
                    const expected = numbersOfSizeToSlice(value.expected, value.bytes, 'little')
                    currentRiscv.setMemoryBytes(Number(value.address), expected)
                } else if (value.type === 'string-chunk') {
                    const encoded = new TextEncoder().encode(value.expected)
                    currentRiscv.setMemoryBytes(Number(value.address), Array.from(encoded))
                }
            }
            registerHandlers(currentRiscv, {
                ...getHandlers(),
                readChar: () => {
                    const input = takeInput('Input does not have any characters left')
                    if (input.length !== 1) throw new Error('Invalid character')
                    return input[0]
                },
                readDouble: () => {
                    const input = Number(takeInput('Input does not have any numbers left'))
                    if (Number.isNaN(input)) throw new Error('Invalid number')
                    return input
                },
                readFloat: () => {
                    const input = Number(takeInput('Input does not have any numbers left'))
                    if (Number.isNaN(input)) throw new Error('Invalid number')
                    return input
                },
                readInt: () => {
                    const input = Number(takeInput('Input does not have any numbers left'))
                    if (Number.isNaN(input)) throw new Error('Invalid number')
                    return input
                },
                readString: () => takeInput('Input does not have any strings left'),
                printChar: (char: string) => {
                    state.stdOut += char
                },
                printDouble: (value: number) => {
                    state.stdOut += String(value)
                },
                printFloat: (value: number) => {
                    state.stdOut += String(value)
                },
                printInt: (value: number) => {
                    state.stdOut += String(value)
                },
                printString: (value: string) => {
                    state.stdOut += value
                },
                stdOut: (buffer: number[]) => {
                    state.stdOut += new TextDecoder().decode(new Uint8Array(buffer))
                },
                log: (message: string) => {
                    state.stdOut += message
                },
                logLine: (message: string) => {
                    state.stdOut += message + '\n'
                },

                askDouble: unimplementedHandler('askDouble'),
                askFloat: unimplementedHandler('askFloat'),
                askInt: unimplementedHandler('askInt'),
                askString: unimplementedHandler('askString'),
                confirm: unimplementedHandler('confirm'),
                inputDialog: unimplementedHandler('inputDialog'),
                outputDialog: unimplementedHandler('outputDialog'),
                sleep: unimplementedHandler('sleep')
            })
            currentRiscv.simulateWithLimit(haltLimit)
            try {
                const ins = currentRiscv.getNextStatement()
                //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
                state.line = sourceLineToIndex(ins.sourceLine)
            } catch {}

            state.canUndo = currentRiscv.canUndo

            updateRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
            return currentRiscv.terminated
                ? InterpreterStatus.Terminated
                : InterpreterStatus.Running
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                if (currentRiscv) line = sourceLineToIndex(currentRiscv.getCurrentStatementIndex())
            } catch (e) {
                console.error(e)
            }
            addError(getRISCVErrorMessage(e))
            try {
                updateRegisters()
                updateMemory()
                updateData()
                scrollStackTab()
            } catch {}
            state.terminated = true
            state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    async function test(code: string, testcases: Testcase[], haltLimit: number, historySize = 0) {
        testcases = structuredClone(testcases)
        const results: TestcaseResult[] = []
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
                state.errors.push(getRISCVErrorMessage(e))
            }
        }
        const passedTests = results.filter((r) => r.passed)
        state.stdOut = '⏳ Running tests...\n\n' + state.stdOut
        if (passedTests.length !== results.length) {
            state.stdOut += `\n❌ ${results.length - results.filter((r) => r.passed).length} testcases not passed\n`
        }
        if (passedTests.length > 0) {
            if (!state.stdOut.endsWith('testcases not passed')) {
                state.stdOut += '\n'
            }
            state.stdOut += `\n✅ ${passedTests.length} testcases passed \n`
        }
        return results
    }

    function getLineFromAddress(address: bigint) {
        if (!riscv) return -1
        const statement = riscv.getStatementAtAddress(Number(address))
        if (!statement) return -1
        return sourceLineToIndex(statement.sourceLine)
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
        get startingRegisterNames() {
            return state.startingRegisterNames
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
        get decorations() {
            return state.decorations
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
        get statusRegisters() {
            return state.statusRegisters
        },
        get pc() {
            return state.pc
        },
        get systemSize() {
            return state.systemSize
        },
        get isExamMode() {
            return state.isExamMode
        },
        set isExamMode(value: boolean) {
            state.isExamMode = value
        },
        compile,
        step,
        run,
        check: () => Promise.resolve(semanticCheck()),
        setGlobalMemoryAddress,
        setCode,
        clear,
        setTabMemoryAddress,
        toggleBreakpoint,
        undo,
        resetSelectedLine,
        dispose,
        test,
        getLineFromAddress,
        readMemoryBytes(address: bigint, length: number) {
            if (!riscv) throw new Error('Emulator not initialized')
            return new Uint8Array(riscv.readMemoryBytes(Number(address), length))
        }
    } satisfies RISCVEmulatorState & BaseEmulatorActions
}

const backStepActionMap = {
    [BackStepAction.MEMORY_RESTORE_RAW_WORD]: 'Memory restore raw word',
    [BackStepAction.MEMORY_RESTORE_DOUBLE_WORD]: 'Memory restore double word',
    [BackStepAction.MEMORY_RESTORE_WORD]: 'Memory restore word',
    [BackStepAction.MEMORY_RESTORE_HALF]: 'Memory restore half',
    [BackStepAction.MEMORY_RESTORE_BYTE]: 'Memory restore byte',
    [BackStepAction.REGISTER_RESTORE]: 'Register restore',
    [BackStepAction.PC_RESTORE]: 'PC restore',
    [BackStepAction.CONTROL_AND_STATUS_REGISTER_RESTORE]: 'Control and status register restore',
    [BackStepAction.CONTROL_AND_STATUS_REGISTER_BACKDOOR]: 'Control and status register backdoor',
    [BackStepAction.FLOATING_POINT_REGISTER_RESTORE]: 'Floating point register restore',
    [BackStepAction.DO_NOTHING]: 'Do nothing'
} satisfies Record<BackStepAction, string>
