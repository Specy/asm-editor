import { PAGE_ELEMENTS_PER_ROW, PAGE_SIZE } from '$lib/Config'
import { makeMipsfromSource, type JsMips, type RegisterName, type MIPSAssembleError, BackStepAction } from '@specy/mips'
import { createMemoryTab, InterpreterStatus, makeRegister, type BaseEmulatorActions, type BaseEmulatorState, type EmulatorSettings, type MonacoError, type RegisterChunk } from './commonLanguageFeatures.svelte'
import { createDebouncer } from '$lib/utils'
import { Prompt } from '$stores/promptStore'
import { settingsStore } from '$stores/settingsStore.svelte'
import type { Testcase, TestcaseResult, TestcaseValidationError } from '$lib/Project.svelte'
import { byteSliceToNum, isMemoryChunkEqual, numberToByteSlice } from '$cmp/specific/project/memory/memoryTabUtils'

export type MIPSEmulatorState = BaseEmulatorState & {}

/*
    compile: (historySize: number, codeOverride?: string) => Promise<void>
    step: () => Promise<boolean>
    run: (haltLimit: number) => Promise<InterpreterStatus>
    setGlobalMemoryAddress: (address: number) => void
    setCode: (code: string) => void
    clear: () => void
    setTabMemoryAddress: (address: number, tabId: number) => void
    toggleBreakpoint: (line: number) => void
    undo: (amount?: number) => void
    resetSelectedLine: () => void
    dispose: () => void
    test: (
        code: string,
        testcases: Testcase[],
        haltLimit: number,
        historySize?: number
    ) => Promise<TestcaseResult[]>
*/

function getMIPSErrorMessage(e: unknown) {
    return String(e)
}

export const MIPSRegisterNames = [
    '$zero',
    '$at',
    '$v0',
    '$v1',
    '$a0',
    '$a1',
    '$a2',
    '$a3',
    '$t0',
    '$t1',
    '$t2',
    '$t3',
    '$t4',
    '$t5',
    '$t6',
    '$t7',
    '$s0',
    '$s1',
    '$s2',
    '$s3',
    '$s4',
    '$s5',
    '$s6',
    '$s7',
    '$t8',
    '$t9',
    '$k0',
    '$k1',
    '$gp',
    '$sp',
    '$fp',
    '$ra'
]


/*
export type MonacoError = {
    lineIndex: number
    line: {
        line: string
        line_index: number
    }
    message: string
    formatted: string
}
    */

function assembleErrorToMonacoError(error: MIPSAssembleError): MonacoError {
    return {
        lineIndex: error.lineNumber,
        line: {
            line: "",
            line_index: error.lineNumber
        },
        message: error.message,
        formatted: error.message
    }

}


export function MIPSEmulator(baseCode: string, options: EmulatorSettings = {}) {
    options = {
        globalPageSize: PAGE_SIZE,
        globalPageElementsPerRow: PAGE_ELEMENTS_PER_ROW,
        ...options
    }
    let code = $state(baseCode)
    let state = $state<Omit<MIPSEmulatorState, 'code'>>({
        registers: [],
        terminated: false,
        line: -1,
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
                0x0
            ),
            tabs: [createMemoryTab(8 * 4, 'Stack', 0x7FFFFFFC, 4, 0x0)]
        },
    })

    let mips: JsMips | null = null
    const [debouncer, clearDebouncer] = createDebouncer(500)


    function setCode(c: string) {
        code = c
        debouncer(semanticCheck)
    }

    function compile(historySize: number, codeOverride?: string): Promise<void> {
        return new Promise((res, rej) => {
            try {
                clear()
                mips = makeMipsfromSource(codeOverride ?? code)
                const result = mips.assemble()
                state.compilerErrors = result.errors.map(assembleErrorToMonacoError)
                state.canExecute = result.errors.length === 0
                if (result.errors.length > 0) {
                    return rej(result.report)
                }
                mips.initialize(true)
                mips.setUndoEnabled(historySize > 0)
                //TODO add interrupts
                const stackTab = state.memory.tabs.find((e) => e.name === 'Stack')
                if (stackTab) stackTab.address = mips.stackPointer - stackTab.pageSize
                const next = mips.getNextStatement()
                state.canExecute = true
                state.line = next.sourceLine - 1
                state.terminated = hasTerminated() //TODO check this
                state.canUndo = false
                updateMemory()
                res()
            } catch (e) {
                addError(getMIPSErrorMessage(e))
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
            const mips = makeMipsfromSource(code)
            const result = mips.assemble()
            const errors = result.errors.map(assembleErrorToMonacoError)
            state.compilerErrors = errors
            state.errors = []
        } catch (e) {
            console.error(e)
            addError(getMIPSErrorMessage(e))
        }
    }
    function clear() {
        state = {
            ...state,
            terminated: false,
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
                    0x0
                ),
                tabs: [createMemoryTab(8 * 4, 'Stack', 0x7FFFFFFC, 4, 0x0)]
            }
        }
        setRegisters(new Array(MIPSRegisterNames.length).fill(0))
    }

    function getRegistersValue() {
        if (!mips) return []
        return mips.getRegistersValues()
    }

    function scrollStackTab() {
        const settings = settingsStore
        const current = state

        if (!settings.values.autoScrollStackTab.value || !mips) return
        const stackTab = current.memory.tabs.find((e) => e.name === 'Stack')
        const sp = mips.stackPointer
        if (stackTab) stackTab.address = sp - (sp % stackTab.pageSize)
    }


    function setRegisters(override?: number[]) {
        if (!mips && !override) {
            override = new Array(MIPSRegisterNames.length).fill(0)
        }
        const registers = (override ?? getRegistersValue()).map((reg, i) => {
            return makeRegister(MIPSRegisterNames[i], reg)
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
        if (!mips) return
        const temp = state.memory.global.data.current
        const memory = mips.readMemoryBytes(
            state.memory.global.address,
            state.memory.global.pageSize
        )
        state.memory.global.data.current = new Uint8Array(memory)
        state.memory.global.data.prevState = temp
        state.memory.tabs.forEach((tab) => {
            const temp = tab.data.current
            const memory = mips.readMemoryBytes(tab.address, tab.pageSize)
            tab.data.current = new Uint8Array(memory)
            tab.data.prevState = temp
        })
    }

    function updateData() {
        const settings = settingsStore
        if (!mips) return
        state.terminated = hasTerminated()
        const steps = mips.getUndoStack().slice(0, settings.values.maxVisibleHistoryModifications.value)
        state.latestSteps = steps.map(step => {
            return {
                pc: step.pc,
                old_ccr: {
                    bits: 0
                },
                new_ccr: {
                    bits: 0
                },
                line: -1,
                //TODO improve this, add more info from the step
                mutations: [{
                    type: 'Other',
                    value: backStepActionMap[step.action]
                }]
            }
        })
    }

    function dispose() {
        clearDebouncer()
        mips = null
        clear()
    }

    function addError(error: string) {
        state.errors.push(error)
    }

    function hasTerminated() {
        try {
            mips.getNextStatement()

            return false
        } catch (e) {
            return true
        }
    }

    async function step() {
        let lastLine = -1
        try {
            if (!mips) throw new Error('Interpreter not initialized')
            lastLine = mips.getNextStatement()?.sourceLine ?? -1
            mips.step()
            state.terminated = hasTerminated()
            try {
                const ins = mips.getNextStatement()
                state.line = ins.sourceLine - 1
            } catch (e) { }

            state.canUndo = mips.canUndo
        } catch (e) {
            console.error(e)
            addError(getMIPSErrorMessage(e))
            state.terminated = true
            state.line = lastLine
            throw e
        }
        updateRegisters()
        updateMemory()
        updateData()
        scrollStackTab()
        return mips.terminated
    }

    function undo(amount = 1) {
        try {
            if (!mips) return
            for (let i = 0; i < amount && mips.getUndoStack().length; i++) {
                //mips.undo()
            }
            const instruction = mips.getNextStatement()
            state.line = instruction.sourceLine - 1
            state.canUndo = mips.canUndo
            updateRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
        } catch (e) {
            addError(getMIPSErrorMessage(e))
            state.terminated = true
            console.error(e)
            throw e
        }
    }

    async function run(haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        const breakpoints = state.breakpoints
        try {
            mips.simulateWithBreakpointsAndLimit(breakpoints, haltLimit)
            try {
                const ins = mips.getNextStatement()
                //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
                state.line = ins.sourceLine - 1
            } catch (e) {
            }

            state.canUndo = mips.canUndo
            updateRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
            return mips.terminated ? InterpreterStatus.Terminated : InterpreterStatus.Running
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                line = mips.getCurrentStatementIndex()
            } catch (e) {
                console.error(e)
            }
            addError(getMIPSErrorMessage(e))
            state.terminated = true
            state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    function setGlobalMemoryAddress(address: number) {
        const bytes = mips?.readMemoryBytes(address, state.memory.global.pageSize)
        state.memory.global.address = address
        state.memory.global.data.current = bytes ? new Uint8Array(bytes) : new Uint8Array(state.memory.global.pageSize).fill(0xff)
        state.memory.global.data.prevState = state.memory.global.data.current
    }

    function setTabMemoryAddress(address: number, tabId: number) {
        const tab = state.memory.tabs.find((e) => e.id == tabId)
        if (!tab) return
        const bytes = mips?.readMemoryBytes(address, tab.pageSize)
        tab.address = address
        tab.data.current = bytes ? new Uint8Array(bytes) : new Uint8Array(tab.pageSize).fill(0xff)
        tab.data.prevState = tab.data.current
    }

    async function validateTestcase(testcase: Testcase) {
        const errors = [] as TestcaseValidationError[]
        if (!mips) throw new Error('Interpreter not initialized')
        const registers = mips.getRegistersValues()
        for (const [register, value] of Object.entries(testcase.expectedRegisters)) {
            const registerIndex = MIPSRegisterNames.indexOf(register.toUpperCase())
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
                const bytes = new Uint8Array(mips.readMemoryBytes(value.address, value.bytes))
                const num = byteSliceToNum(bytes)
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
                const bytes = mips.readMemoryBytes(value.address, value.expected.length)
                if (!isMemoryChunkEqual(bytes, value.expected)) {
                    errors.push({
                        type: 'wrong-memory-chunk',
                        address: value.address,
                        expected: value.expected,
                        got: Array.from(bytes)
                    })
                }
            } else if (value.type === 'string-chunk') {
                const bytes = mips.readMemoryBytes(value.address, value.expected.length)
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

    async function runTestcase(testcase: Testcase, haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        try {
            if (!mips) throw new Error('Interpreter not initialized')
            for (const [register, value] of Object.entries(testcase.startingRegisters)) {
                mips.setRegisterValue(register as RegisterName, value)
            }
            for (const value of testcase.startingMemory) {
                if (value.type === 'number') {
                    const slice = numberToByteSlice(value.expected, value.bytes)
                    mips.setMemoryBytes(value.address, slice)
                } else if (value.type === 'number-chunk') {
                    mips.setMemoryBytes(value.address, value.expected)
                } else if (value.type === 'string-chunk') {
                    const encoded = new TextEncoder().encode(value.expected)
                    mips.setMemoryBytes(value.address, Array.from(encoded))
                }
            }
            mips.simulateWithLimit(haltLimit)
            //TODO add interrupts
            const ins = mips.getNextStatement()
            //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
            state.line = ins.sourceLine - 1
            state.canUndo = mips.canUndo

            updateRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
            return mips.terminated ? InterpreterStatus.Terminated : InterpreterStatus.Running
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                line = mips.getCurrentStatementIndex()
            } catch (e) {
                console.error(e)
            }
            addError(getMIPSErrorMessage(e))
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
                state.errors.push(getMIPSErrorMessage(e))
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


    clear()
    semanticCheck()


    return {
        get registers() {
            return state.registers
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
        test
    } satisfies MIPSEmulatorState & BaseEmulatorActions
}



const backStepActionMap = {
    [BackStepAction.MEMORY_RESTORE_BYTE]: 'Memory restore byte',
    [BackStepAction.MEMORY_RESTORE_HALF]: 'Memory restore half',
    [BackStepAction.MEMORY_RESTORE_WORD]: 'Memory restore word',
    [BackStepAction.MEMORY_RESTORE_RAW_WORD]: 'Memory restore raw word',
    [BackStepAction.COPROC0_REGISTER_RESTORE]: 'Coproc0 register restore',
    [BackStepAction.COPROC1_REGISTER_RESTORE]: 'Coproc1 register restore',
    [BackStepAction.COPROC1_CONDITION_CLEAR]: 'Coproc1 condition clear',
    [BackStepAction.COPROC1_CONDITION_SET]: 'Coproc1 condition set',
    [BackStepAction.DO_NOTHING]: 'Do nothing',
    [BackStepAction.REGISTER_RESTORE]: 'Register restore',
    [BackStepAction.PC_RESTORE]: 'PC restore',
} satisfies Record<BackStepAction, string>