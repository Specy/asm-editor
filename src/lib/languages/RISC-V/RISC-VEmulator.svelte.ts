import { PAGE_ELEMENTS_PER_ROW, PAGE_SIZE } from '$lib/Config'
import {
    BackStepAction,
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
    type EmulatorSettings, type ExecutionStep,
    InterpreterStatus,
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
import { byteSliceToNum, isMemoryChunkEqual, numberToByteSlice } from '$cmp/specific/project/memory/memoryTabUtils'

export type RISCVEmulatorState = BaseEmulatorState & {}

function getRISCVErrorMessage(e: unknown) {
    return String(e)
}


export const RISCVRegisterNames = [
    ...RISCV_REGISTERS,
    'pc'
]

const STACK_POINTER_INDEX = RISCVRegisterNames.indexOf('$sp')


function assembleErrorToMonacoError(error: RISCVAssembleError): MonacoError {
    return {
        lineIndex: error.lineNumber - 1,
        column: error.columnNumber,
        line: {
            line: '',
            line_index: error.lineNumber
        },
        message: error.message,
        formatted: error.message
    }
}


function formatStatement(statement: string) {
    statement = statement.replace(/,/g, ', ');
    //reverse because it's from bigger to smaller, prevents $10 from being replaced by $1
    ([...RISCVRegisterNames]).reverse().forEach((reg, i) => {
        statement = statement.replace(new RegExp(`\\$${RISCVRegisterNames.length - i}`, 'g'), reg)
    })
    //replaces all empty hex like 0x0000ffff with 0xffff
    statement = statement.replace(/0x0*(?=[0-9a-fA-F])/g, '0x')
    return statement
}

export function RISCVEmulator(baseCode: string, options: EmulatorSettings = {}) {
    options = {
        globalPageSize: PAGE_SIZE,
        globalPageElementsPerRow: PAGE_ELEMENTS_PER_ROW,
        ...options
    }
    let code = $state(baseCode)
    let state = $state<Omit<RISCVEmulatorState, 'code'>>({
        registers: [],
        hiddenRegisters: ['zero'],
        pc: 0,
        terminated: false,
        line: -1,
        decorations: [],
        statusRegisters: [],
        compilerErrors: [],
        callStack: [],
        errors: [],
        sp: 0,
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
                0x10010000,
                options.globalPageElementsPerRow,
                0x0,
                'little'
            ),
            tabs: [createMemoryTab(8 * 4, 'Stack', 0x7ffffffc, 4, 0x0, 'little')]
        }
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
        const nonBasic = values.filter((v) => v.length > 1).map(v => {
            const original = joined.get(v[0].sourceLine)
            const indent = original[0].source.length - original[0].source.trimStart().length
            const lines = v.map(s => `${' '.repeat(indent)}${formatStatement(s.assemblyStatement)}`)
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
                clear()
                riscv = RISCV.makeRiscVFromSource(codeOverride ?? code)
                riscv.setUndoSize(historySize)
                const result = riscv.assemble()
                state.compilerErrors = result.errors.map(assembleErrorToMonacoError)
                state.canExecute = !result.hasErrors
                if (result.hasErrors) {
                    return rej(result.report)
                }
                addDecorations()
                riscv.setUndoEnabled(historySize > 0)
                riscv.initialize(true)
                registerHandlers(riscv, getHandlers())

                //TODO add interrupts
                const stackTab = state.memory.tabs.find((e) => e.name === 'Stack')
                if (stackTab) stackTab.address = riscv.stackPointer - stackTab.pageSize
                const next = riscv.getNextStatement()
                state.canExecute = true
                state.line = next.sourceLine - 1
                state.terminated = hasTerminated() //TODO check this
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
        } catch (e) {
            addError(getRISCVErrorMessage(e))
        }
    }

    function clear() {
        state = {
            ...state,
            terminated: false,
            pc: 0,
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
                    options.globalPageSize,
                    'Global',
                    0x10010000,
                    options.globalPageElementsPerRow,
                    0x0,
                    'little'
                ),
                tabs: [createMemoryTab(8 * 4, 'Stack', 0x7ffffffc, 4, 0x0, 'little')]
            }
        }
        setRegisters(new Array(RISCVRegisterNames.length).fill(0))
    }

    function getRegistersValue() {
        if (!riscv) return []
        return [
            ...riscv.getRegistersValues(),
            riscv.programCounter
        ]
    }

    function scrollStackTab() {
        const settings = settingsStore
        const current = state
        if (!settings.values.autoScrollStackTab.value || !riscv) return
        const stackTab = current.memory.tabs.find((e) => e.name === 'Stack')
        const sp = riscv.stackPointer
        if (stackTab) stackTab.address = sp - (sp % stackTab.pageSize)
    }

    function setRegisters(override?: number[]) {
        if (!riscv && !override) {
            override = new Array(RISCVRegisterNames.length).fill(0)
        }

        state.registers = (override ?? getRegistersValue()).map((reg, i) => {
            return makeRegister(RISCVRegisterNames[i], reg)
        })
    }

    function updateRegisters() {
        if (state.registers.length === 0) return
        getRegistersValue().forEach((reg, i) => {
            state.registers[i].setValue(reg)
        })
        state.sp = riscv.stackPointer
    }

    function updateMemory() {
        if (!riscv) return
        try {
            const temp = state.memory.global.data.current
            const memory = riscv.readMemoryBytes(
                state.memory.global.address,
                state.memory.global.pageSize
            )
            state.memory.global.data.current = new Uint8Array(memory)
            state.memory.global.data.prevState = temp
            state.memory.tabs.forEach((tab) => {
                const temp = tab.data.current
                const memory = riscv.readMemoryBytes(tab.address, tab.pageSize)
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
        if (!riscv) return
        state.terminated = hasTerminated()
        const steps = riscv
            .getUndoStack()
            .slice(0, settings.values.maxVisibleHistoryModifications.value)
        state.pc = riscv.programCounter
        state.callStack = riscv.getCallStack().map((v, i) => {
            const address = v.toAddress
            return {
                address,
                destination: v.pc,
                sp: v.sp,
                name: riscv.getLabelAtAddress(address) ?? `0x${address.toString(16).padStart(8, '0')}`,
                line: (riscv.getStatementAtAddress(address)?.sourceLine ?? 0) - 1,
                color: makeLabelColor(i, v.sp)
            }
        })
        state.latestSteps = steps.map((step) => {
            let line = -1
            try {
                const ins = riscv.getStatementAtAddress(step.pc)
                line = ins.sourceLine - 1
            } catch (e) {
            }
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
        }).filter(v => v !== null)
    }

    function backstepToMutation(step: JsBackStep): MutationOperation | null {
        if (
            step.action === BackStepAction.REGISTER_RESTORE ||
            step.action === BackStepAction.FLOATING_POINT_REGISTER_RESTORE
        ) {
            return {
                type: 'WriteRegister',
                value: {
                    register: state.registers[step.param1].name,
                    old: 0,
                    size: RegisterSize.Long
                }
            }
        } else if (
            [
                BackStepAction.MEMORY_RESTORE_BYTE,
                BackStepAction.MEMORY_RESTORE_HALF,
                BackStepAction.MEMORY_RESTORE_WORD,
                BackStepAction.MEMORY_RESTORE_RAW_WORD
            ].includes(step.action)
        ) {
            return {
                type: 'WriteMemory',
                value: {
                    address: step.param1,
                    size: memorySizeMap[step.action],
                    old: 0
                }
            }
        } else if (step.action === BackStepAction.PC_RESTORE) {
            return {
                type: 'WriteRegister',
                value: {
                    register: '$pc',
                    old: 0,
                    size: RegisterSize.Long
                }
            }
        } else if ([
            BackStepAction.CONTROL_AND_STATUS_REGISTER_BACKDOOR,
            BackStepAction.CONTROL_AND_STATUS_REGISTER_RESTORE,
            -1 //here means no action
        ].includes(step.action)) {
            return null
        }
        return {
            type: 'Other',
            value: backStepActionMap[step.action]
        }
    }

    function dispose() {
        clearDebouncer()
        riscv = null
        clear()
    }

    function addError(error: string) {
        state.errors.push(error)
    }

    function hasTerminated() {
        try {
            //TODO improve this
            riscv.getNextStatement()
            return false
        } catch (e) {
            return true
        }
    }

    async function step() {
        let lastLine = -1
        try {
            if (!riscv) throw new Error('Interpreter not initialized')
            lastLine = riscv.getNextStatement()?.sourceLine ?? -1
            state.terminated = riscv.step() === StopReason.CLIFF_TERMINATION
            try {
                const ins = riscv.getNextStatement()
                state.line = ins.sourceLine - 1
            } catch (e) {
            }

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
            state.line = instruction.sourceLine - 1
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

    function calculateBreakpoints(breakpoints: number[]) {
        const b = breakpoints
            .map((line) => {
                const ins = riscv.getStatementAtSourceLine(line + 1)
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
        try {
            const terminated = riscv.simulateWithBreakpointsAndLimit(
                calculateBreakpoints(breakpoints),
                haltLimit
            ) === StopReason.CLIFF_TERMINATION
            try {
                const ins = riscv.getNextStatement()
                //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
                if (!terminated) {
                    state.line = ins.sourceLine - 1
                } else {
                    state.line = -1
                }
            } catch (e) {
                state.line = -1
            }
            state.canUndo = riscv.canUndo
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
                line = riscv.getCurrentStatementIndex()
            } catch (e) {
                console.error(e)
            }
            addError(getRISCVErrorMessage(e))
            state.terminated = true
            state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    function setGlobalMemoryAddress(address: number) {
        try {
            const bytes = riscv?.readMemoryBytes(address, state.memory.global.pageSize)
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

    function setTabMemoryAddress(address: number, tabId: number) {
        try {
            const tab = state.memory.tabs.find((e) => e.id == tabId)
            if (!tab) return
            const bytes = riscv?.readMemoryBytes(address, tab.pageSize)
            tab.address = address
            tab.data.current = bytes ? new Uint8Array(bytes) : new Uint8Array(tab.pageSize).fill(0xff)
            tab.data.prevState = tab.data.current
        } catch (e) {
            console.error(e)
            addError(getRISCVErrorMessage(e))
        }
    }

    async function validateTestcase(testcase: Testcase) {
        const errors = [] as TestcaseValidationError[]
        if (!riscv) throw new Error('Interpreter not initialized')
        const registers = riscv.getRegistersValues()
        for (const [register, value] of Object.entries(testcase.expectedRegisters)) {
            const registerIndex = RISCVRegisterNames.indexOf(register.toUpperCase())
            if (registerIndex === -1) {
                console.error(`Register ${register} not found`)
                continue
            }
            const registerValue = registers[registerIndex]
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
                const bytes = new Uint8Array(riscv.readMemoryBytes(value.address, value.bytes))
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
                const bytes = riscv.readMemoryBytes(value.address, value.expected.length * value.bytes)
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
                const bytes = riscv.readMemoryBytes(value.address, value.expected.length)
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

    function getHandlers() {
        return {
            askDouble: (props: string) => Number(prompt(props)),
            askFloat: (props: string) => Number(prompt(props)),
            askInt: (props: string) => Number(prompt(props)),
            askString: (props: string) => prompt(props),

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
                const str = prompt('Enter a character')
                if (str.length !== 1) throw new Error('Invalid character')
                return str[0]
            },
            readDouble: () => Number(prompt('Enter a double')),
            readFloat: () => Number(prompt('Enter a float')),
            readInt: () => Number(prompt('Enter an integer')),
            readString: () => prompt('Enter a string'),

            log: (message: string) => {
                state.stdOut += message
            },
            logLine: (message: string) => {
                state.stdOut += message + '\n'
            },

            confirm: (message: string) =>
                Number(confirm(`${message}; 1 = yes, 0 = no, -1 = cancel`)) as ConfirmResult,
            inputDialog: (message: string) => prompt(message),
            outputDialog: (message: string) => alert(message),

            sleep: unimplementedHandler('sleep')
        } satisfies HandlerMapFns
    }

    async function runTestcase(testcase: Testcase, haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        try {
            const t = structuredClone($state.snapshot(testcase))
            if (!riscv) throw new Error('Interpreter not initialized')
            for (const [register, value] of Object.entries(t.startingRegisters)) {
                riscv.setRegisterValue(register as RegisterName, value)
            }
            for (const value of t.startingMemory) {
                if (value.type === 'number') {
                    const slice = numberToByteSlice(value.expected, value.bytes, 'little')
                    riscv.setMemoryBytes(value.address, slice)
                } else if (value.type === 'number-chunk') {
                    const expected = numbersOfSizeToSlice(value.expected, value.bytes, 'little')
                    riscv.setMemoryBytes(value.address, expected)
                } else if (value.type === 'string-chunk') {
                    const encoded = new TextEncoder().encode(value.expected)
                    riscv.setMemoryBytes(value.address, Array.from(encoded))
                }
            }
            registerHandlers(riscv, {
                ...getHandlers(),
                readChar: () => {
                    if (t.input.length === 0)
                        throw new Error('Input does not have any characters left')
                    if (t.input[0].length !== 1) throw new Error('Invalid character')
                    return t.input.shift()[0]
                },
                readDouble: () => {
                    if (t.input.length === 0)
                        throw new Error('Input does not have any numbers left')
                    if (Number.isNaN(Number(t.input[0]))) throw new Error('Invalid number')
                    return Number(t.input.shift())
                },
                readFloat: () => {
                    if (t.input.length === 0)
                        throw new Error('Input does not have any numbers left')
                    if (Number.isNaN(Number(t.input[0]))) throw new Error('Invalid number')
                    return Number(t.input.shift())
                },
                readInt: () => {
                    if (t.input.length === 0)
                        throw new Error('Input does not have any numbers left')
                    if (Number.isNaN(Number(t.input[0]))) throw new Error('Invalid number')
                    return Number(t.input.shift())
                },
                readString: () => {
                    if (t.input.length === 0)
                        throw new Error('Input does not have any strings left')
                    return t.input.shift()
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
            riscv.simulateWithLimit(haltLimit)
            try {
                const ins = riscv.getNextStatement()
                //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
                state.line = ins.sourceLine - 1
            } catch (e) {
            }

            state.canUndo = riscv.canUndo

            updateRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
            return riscv.terminated ? InterpreterStatus.Terminated : InterpreterStatus.Running
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                line = riscv.getCurrentStatementIndex()
            } catch (e) {
                console.error(e)
            }
            addError(getRISCVErrorMessage(e))
            try {
                updateRegisters()
                updateMemory()
                updateData()
                scrollStackTab()
            } catch (e) {

            }
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

    function getLineFromAddress(address: number) {
        if (!riscv) return -1
        const statement = riscv.getStatementAtAddress(address)
        if (!statement) return -1
        return statement.sourceLine - 1
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
        compile,
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

const memorySizeMap = {
    [BackStepAction.MEMORY_RESTORE_BYTE]: RegisterSize.Byte,
    [BackStepAction.MEMORY_RESTORE_HALF]: RegisterSize.Word,
    [BackStepAction.MEMORY_RESTORE_WORD]: RegisterSize.Long,
    [BackStepAction.MEMORY_RESTORE_RAW_WORD]: RegisterSize.Long,
    [BackStepAction.MEMORY_RESTORE_DOUBLE_WORD]: RegisterSize.Double
}
