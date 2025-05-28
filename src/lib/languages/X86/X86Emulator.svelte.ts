import {
    type BaseEmulatorActions,
    type BaseEmulatorState,
    createMemoryTab,
    type EmulatorSettings,
    InterpreterStatus,
    makeRegister,
    numbersOfSizeToSlice,
    RegisterSize
} from '$lib/languages/commonLanguageFeatures.svelte'
import { PAGE_ELEMENTS_PER_ROW, PAGE_SIZE } from '$lib/Config'
import { X86_REGISTERS, X86ConditionFlags, X86Interpreter, X86Register } from '@specy/x86'
import { createDebouncer } from '$lib/utils'
import { Prompt } from '$stores/promptStore'
import { settingsStore } from '$stores/settingsStore.svelte'
import type { Testcase, TestcaseResult, TestcaseValidationError } from '$lib/Project.svelte'
import { byteSliceToNum, isMemoryChunkEqual, numberToByteSlice } from '$cmp/specific/project/memory/memoryTabUtils'

const emultor = X86Interpreter.create('')

export type X86RegisterNames = ['EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'EBP', 'ESP']

function registerNameToType(name: string) {
    return X86Register[name] as X86Register
}

export type X86EmulatorState = BaseEmulatorState & {}

function getErrorMessage(e: unknown): string {
    const string = e instanceof Error ? e.message : String(e)
    if (
        string.startsWith('Keystone.js') ||
        string.startsWith('Capstone.js') ||
        string.startsWith('Unicorn.js')
    ) {
        return string.split('\n').slice(1).join('\n')
    }
    return string
}

export function X86Emulator(baseCode: string, options: EmulatorSettings = {}) {
    options = {
        globalPageSize: PAGE_SIZE,
        globalPageElementsPerRow: PAGE_ELEMENTS_PER_ROW,
        ...options
    }

    let code = $state(baseCode)
    let state = $state<Omit<X86EmulatorState, 'code'>>({
        systemSize: RegisterSize.Long,
        registers: [],
        pc: 0n,
        hiddenRegisters: [],
        decorations: [],
        terminated: false,
        line: -1,
        statusRegisters: ['C', 'P', 'A', 'Z', 'S', 'O'].map((n) => ({
            name: n,
            value: 0,
            prev: 0
        })),
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
                BigInt(X86Interpreter.START_ADDRESS),
                options.globalPageElementsPerRow,
                0,
                'little'
            ),
            tabs: [
                createMemoryTab(
                    8 * 4,
                    'Stack',
                    BigInt(X86Interpreter.STACK_START_ADDRESS + X86Interpreter.STACK_SIZE),
                    4,
                    0,
                    'little'
                )
            ]
        },
        interrupt: undefined
    })
    let x86: X86Interpreter | null = null
    const [debouncer, clearDebouncer] = createDebouncer(500)

    function setCode(c: string) {
        code = c
        debouncer(semanticCheck)
    }

    function compile(historySize: number, codeOverride?: string): Promise<void> {
        return new Promise((res, rej) => {
            try {
                clear()
                x86?.dispose()
                x86 = X86Interpreter.create(codeOverride ?? code)
                x86.assemble()
                x86.initialize()
                const stackTab = state.memory.tabs.find((e) => e.name === 'Stack')
                if (stackTab) stackTab.address = BigInt(x86.getStackPointer() - stackTab.pageSize)
                const next = x86.getNextStatement()
                state.canExecute = true
                state.line = next ? next.line : -1
                state.terminated = !next
                state.canUndo = false
                state.compiledCode = x86
                    .getAssembledStatements()
                    .map((s) => s.text)
                    .join('\n')
                updateMemory()
                updateData()
                res()
            } catch (e) {
                addError(getErrorMessage(e))
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
            //TODO
            state.compilerErrors = []
            state.errors = []
        } catch (e) {
            console.error(e)
            addError(getErrorMessage(e))
        }
    }

    function clear() {
        const current = state

        setRegisters(new Array(X86_REGISTERS.length).fill(0))
        updateStatusRegisters(new Array(6).fill(0))
        if (current.interrupt) Prompt.cancel()
        state = {
            ...state,
            pc: 0n,
            sp: 0n,
            terminated: false,
            compiledCode: undefined,
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
                    BigInt(X86Interpreter.START_ADDRESS),
                    options.globalPageElementsPerRow,
                    0,
                    'little'
                ),
                tabs: [
                    createMemoryTab(
                        8 * 4,
                        'Stack',
                        BigInt(X86Interpreter.STACK_START_ADDRESS + X86Interpreter.STACK_SIZE),
                        4,
                        0,
                        'little'
                    )
                ]
            }
        }
    }

    function getRegistersValue() {
        if (!x86) return []
        return x86.getRegistersValues()
    }

    function scrollStackTab() {
        const settings = settingsStore
        const current = state

        if (!settings.values.autoScrollStackTab.value || !x86) return
        const stackTab = current.memory.tabs.find((e) => e.name === 'Stack')
        const sp = x86.getStackPointer() - stackTab.pageSize
        if (stackTab) stackTab.address = BigInt(sp - (sp % stackTab.pageSize))
    }

    function updateStatusRegisters(override?: number[]) {
        const x86Flags = x86?.getConditionFlags()
        const flags = (
            override ??
            (x86Flags
                ? state.statusRegisters.map((s) => x86Flags[X86ConditionFlags[s.name]])
                : new Array(6).fill(0))
        ).reverse()
        state.statusRegisters = state.statusRegisters.map((s, i) => ({
            ...s,
            value: flags[i] ?? -1,
            prev: flags[i] ?? -1
        }))
    }

    function setRegisters(override?: number[]) {
        if (!x86 && !override) {
            override = new Array(X86_REGISTERS.length).fill(0)
        }
        const registers = (override ?? getRegistersValue()).map((reg, i) => {
            return makeRegister(X86_REGISTERS[i], reg, RegisterSize.Long)
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
        if (!x86) return
        const temp = state.memory.global.data.current
        console.log(Number(state.memory.global.address), state.memory.global.pageSize)
        const memory = x86.readMemoryBytes(
            Number(state.memory.global.address),
            state.memory.global.pageSize
        )
        state.memory.global.data.current = new Uint8Array(memory)
        state.memory.global.data.prevState = temp
        state.memory.tabs.forEach((tab) => {
            const temp = tab.data.current
            const memory = x86.readMemoryBytes(Number(tab.address), tab.pageSize)
            console.log(Number(tab.address), tab.pageSize)
            tab.data.current = new Uint8Array(memory)
            tab.data.prevState = temp
        })
    }

    function updateData() {
        state.terminated = x86.isTerminated()
        state.canExecute = !x86.isTerminated()
        state.pc = BigInt(x86.getProgramCounter())
    }

    function dispose() {
        clearDebouncer()
        try {
            x86?.dispose()
        } catch (e) {
            console.error(e)
        }
        clear()
    }

    function addError(error: string) {
        state.errors.push(error)
    }

    async function step() {
        let lastLine = -1
        try {
            if (!x86) throw new Error('Interpreter not initialized')
            lastLine = x86.getNextStatement().line
            x86.step()
            const ins = x86.getNextStatement()
            state.line = ins?.line ?? lastLine
            state.canUndo = false
        } catch (e) {
            console.error(e)
            addError(getErrorMessage(e))
            state.terminated = true
            state.line = lastLine
            throw e
        }
        updateRegisters()
        updateStatusRegisters()
        updateMemory()
        updateData()
        scrollStackTab()
        return x86.isTerminated()
    }

    function undo(amount = 1) {
    }

    async function run(haltLimit: number) {
        if (!x86) throw new Error('Interpreter not initialized')
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        const breakpoints = state.breakpoints.map(
            (line) => x86.getStatementAtSourceLine(line).address
        )
        try {
            const hasBreakpoints = breakpoints.length > 0
            if (!hasBreakpoints) {
                x86.simulate(haltLimit)
            } else {
                x86.simulateWithBreakpoints(breakpoints, haltLimit)
            }
            const ins = x86.getNextStatement()
            //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
            state.line = ins?.line ?? -1
            state.canUndo = false

            updateRegisters()
            updateStatusRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                line = x86?.getNextStatement()?.line ?? -1
            } catch (e) {
                console.error(e)
            }
            addError(getErrorMessage(e))
            state.terminated = true
            state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    function setGlobalMemoryAddress(address: bigint) {
        state.memory.global.address = address
        state.memory.global.data.current =
            x86?.readMemoryBytes(Number(address), state.memory.global.pageSize) ??
            new Uint8Array(state.memory.global.pageSize).fill(0)
        state.memory.global.data.prevState = state.memory.global.data.current
    }

    function setTabMemoryAddress(address: bigint, tabId: number) {
        const tab = state.memory.tabs.find((e) => e.id == tabId)
        if (!tab) return
        tab.address = address
        tab.data.current =
            x86?.readMemoryBytes(Number(address), tab.pageSize) ??
            new Uint8Array(tab.pageSize).fill(0)
        tab.data.prevState = tab.data.current
    }

    async function validateTestcase(testcase: Testcase) {
        const errors = [] as TestcaseValidationError[]
        if (!x86) throw new Error('Interpreter not initialized')
        const registers = x86.getRegistersValues()
        for (const [register, value] of Object.entries(testcase.expectedRegisters)) {
            const registerIndex = X86_REGISTERS.indexOf(register.toUpperCase())
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
                const bytes = x86.readMemoryBytes(Number(value.address), value.bytes)
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
                const bytes = x86.readMemoryBytes(
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
                const bytes = x86.readMemoryBytes(Number(value.address), value.expected.length)
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
            if (!x86) throw new Error('Interpreter not initialized')
            for (const [register, value] of Object.entries(testcase.startingRegisters)) {
                x86.setRegisterValue(registerNameToType(register), Number(value))
            }
            for (const value of testcase.startingMemory) {
                if (value.type === 'number') {
                    const slice = new Uint8Array(numberToByteSlice(value.expected, value.bytes))
                    x86.setMemoryBytes(Number(value.address), [...slice])
                } else if (value.type === 'number-chunk') {
                    const expected = numbersOfSizeToSlice(value.expected, value.bytes)
                    x86.setMemoryBytes(Number(value.address), expected)
                } else if (value.type === 'string-chunk') {
                    const encoded = new TextEncoder().encode(value.expected)
                    x86.setMemoryBytes(Number(value.address), [...encoded])
                }
            }
            x86.simulate(haltLimit)
            const ins = x86.getNextStatement()
            //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
            state.line = ins?.line ?? -1
            state.canUndo = false

            updateRegisters()
            updateStatusRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                line = x86?.getNextStatement()?.line ?? -1
            } catch (e) {
                console.error(e)
            }
            addError(getErrorMessage(e))
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
                state.errors.push(getErrorMessage(e))
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
        if (!x86) return -1
        const line = x86.getStatementAtAddress(Number(address))
        return line?.line ?? -1
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
        get compiledCode() {
            return state.compiledCode
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
        get decorations() {
            return state.decorations
        },
        get pc() {
            return state.pc
        },
        get systemSize() {
            return state.systemSize
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
    } satisfies X86EmulatorState & BaseEmulatorActions
}
