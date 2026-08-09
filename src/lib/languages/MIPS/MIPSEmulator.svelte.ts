import { PAGE_ELEMENTS_PER_ROW, PAGE_SIZE } from '$lib/Config'
import {
    BackStepAction,
    ConfirmResult,
    type HandlerMapFns,
    type JsBackStep,
    type JsMips,
    type JsProgramStatement,
    MIPS,
    type MIPSAssembleError,
    registerHandlers,
    type RegisterName,
    unimplementedHandler
} from '@specy/mips'
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

export type MIPSEmulatorState = BaseEmulatorState & {}

function getMIPSErrorMessage(e: unknown) {
    return String(e)
}

function promptForInput(message: string) {
    const input = prompt(message)
    if (input === null) throw new Error('Input cancelled')
    return input
}

export const MIPSNumericRegisterNames: readonly RegisterName[] = [
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

export const MIPSRegisterNames = [...MIPSNumericRegisterNames, 'pc', 'hi', 'lo']

function isMIPSNumericRegisterName(register: string): register is RegisterName {
    return MIPSNumericRegisterNames.some((candidate) => candidate === register)
}

const STACK_POINTER_INDEX = MIPSRegisterNames.indexOf('$sp')

function assembleErrorToMonacoError(error: MIPSAssembleError): MonacoError {
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
    statement = statement.replace(/,/g, ', ')
    for (let index = MIPSNumericRegisterNames.length - 1; index >= 0; index--) {
        const register = MIPSNumericRegisterNames[index]
        if (!register) continue
        statement = statement.replace(new RegExp(`\\$${index}\\b`, 'g'), register)
    }
    //replaces all empty hex like 0x0000ffff with 0xffff
    statement = statement.replace(/0x0*(?=[0-9a-fA-F])/g, '0x')
    return statement
}

export function MIPSEmulator(baseCode: string, options: EmulatorSettings = {}) {
    const globalPageSize = options.globalPageSize ?? PAGE_SIZE
    const globalPageElementsPerRow = options.globalPageElementsPerRow ?? PAGE_ELEMENTS_PER_ROW
    let code = $state(baseCode)
    let state = $state<Omit<MIPSEmulatorState, 'code'>>({
        registers: [],
        startingRegisterNames: [...MIPSNumericRegisterNames],
        systemSize: RegisterSize.Long,
        hiddenRegisters: ['$zero'],
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

    let mips: JsMips | null = null
    const [debouncer, clearDebouncer] = createDebouncer(500)

    function setCode(c: string) {
        code = c
        debouncer(semanticCheck)
    }

    function addDecorations() {
        if (!mips) return
        const statements = mips.getCompiledStatements()
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
        const nonBasic: EmulatorDecoration[] = []
        for (const statements of joined.values()) {
            if (statements.length <= 1) continue
            const original = statements[0]
            if (!original) continue
            const indent = original.source.length - original.source.trimStart().length
            const lines = statements.map(
                (statement) =>
                    `${' '.repeat(indent)}${formatStatement(statement.assemblyStatement)}`
            )
            nonBasic.push({
                type: 'below-line',
                note: 'Assembled instructions',
                belowLine: original.sourceLine,
                md: `\`\`\`mips\n${lines.join('\n')}\n\`\`\``
            })
        }
        state.decorations = nonBasic
    }

    function compile(historySize: number, codeOverride?: string): Promise<void> {
        return new Promise((res, rej) => {
            try {
                const normalizedHistorySize = Number.isFinite(historySize)
                    ? Math.max(0, Math.floor(historySize))
                    : 0
                clear()
                const currentMips = MIPS.makeMipsFromSource(codeOverride ?? code)
                mips = currentMips
                currentMips.setUndoSize(Math.max(1, normalizedHistorySize))
                const result = currentMips.assemble()
                state.compilerErrors = result.errors.map(assembleErrorToMonacoError)
                state.canExecute = !result.hasErrors
                if (result.hasErrors) {
                    return rej(result.report)
                }
                addDecorations()
                currentMips.setUndoEnabled(normalizedHistorySize > 0)
                currentMips.initialize(true)
                registerHandlers(currentMips, getHandlers())

                //TODO add interrupts
                const stackTab = state.memory.tabs.find((e) => e.name === 'Stack')
                if (stackTab)
                    stackTab.address = BigInt(currentMips.stackPointer - stackTab.pageSize)
                const next = currentMips.getNextStatement()
                state.canExecute = true
                state.line = next.sourceLine - 1
                state.terminated = hasTerminated(currentMips) //TODO check this
                state.canUndo = false
                updateMemory()
                updateData()
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
            const mips = MIPS.makeMipsFromSource(code)
            const result = mips.assemble()
            const errors = result.errors.map(assembleErrorToMonacoError)
            state.compilerErrors = errors
            state.errors = []
            return errors
        } catch (e) {
            console.error(e)
            const error = getMIPSErrorMessage(e)
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
        setRegisters(new Array(MIPSRegisterNames.length).fill(0))
    }

    function getRegistersValue() {
        if (!mips) return []
        return [...mips.getRegistersValues(), mips.programCounter, mips.getHi(), mips.getLo()]
    }

    function scrollStackTab() {
        const settings = settingsStore
        const current = state
        if (!settings.values.autoScrollStackTab.value || !mips) return
        const stackTab = current.memory.tabs.find((e) => e.name === 'Stack')
        const sp = mips.stackPointer
        if (!stackTab) return
        const newAddress = BigInt(sp - (sp % stackTab.pageSize))
        if (stackTab.address !== newAddress) {
            stackTab.address = newAddress
            updateMemory()
            //reset the prevState as we don't know what the previous state was
            stackTab.data.prevState = stackTab.data.current
        }
    }

    function setRegisters(override?: number[]) {
        if (!mips && !override) {
            override = new Array(MIPSRegisterNames.length).fill(0)
        }

        state.registers = (override ?? getRegistersValue()).map((reg, i) => {
            return makeRegister(MIPSRegisterNames[i], reg, RegisterSize.Long)
        })
    }

    function updateRegisters() {
        if (state.registers.length === 0) return
        getRegistersValue().forEach((reg, i) => {
            state.registers[i].setValue(reg)
        })
        state.sp = BigInt(state.registers[STACK_POINTER_INDEX].value)
    }

    function updateMemory() {
        try {
            const currentMips = mips
            if (!currentMips) return
            const temp = state.memory.global.data.current
            const memory = currentMips.readMemoryBytes(
                Number(state.memory.global.address),
                state.memory.global.pageSize
            )
            state.memory.global.data.current = new Uint8Array(memory)
            state.memory.global.data.prevState = temp
            state.memory.tabs.forEach((tab) => {
                const temp = tab.data.current
                const memory = currentMips.readMemoryBytes(Number(tab.address), tab.pageSize)
                tab.data.current = new Uint8Array(memory)
                tab.data.prevState = temp
            })
        } catch (e) {
            console.error(e)
            addError(getMIPSErrorMessage(e))
        }
    }

    function updateData() {
        const settings = settingsStore
        const currentMips = mips
        if (!currentMips) return
        state.terminated = hasTerminated(currentMips)
        const steps = currentMips
            .getUndoStack()
            .slice(0, settings.values.maxVisibleHistoryModifications.value)
        state.pc = BigInt(currentMips.programCounter)
        state.callStack = currentMips.getCallStack().map((v, i) => {
            const address = v.toAddress
            return {
                address: BigInt(address),
                destination: BigInt(v.pc),
                sp: BigInt(v.sp),
                name:
                    currentMips.getLabelAtAddress(address) ??
                    `0x${address.toString(16).padStart(8, '0')}`,
                line: (currentMips.getStatementAtAddress(address)?.sourceLine ?? 0) - 1,
                color: makeLabelColor(i, v.sp)
            }
        })
        state.latestSteps = steps.map((step) => {
            let line = -1
            try {
                const ins = currentMips.getStatementAtAddress(step.pc)
                line = ins.sourceLine - 1
            } catch {}
            return {
                pc: step.pc,
                old_ccr: {
                    bits: 0
                },
                new_ccr: {
                    bits: 0
                },
                line,
                //TODO improve this, add more info from the step
                mutations: [backstepToMutation(step)]
            }
        })
    }

    function backstepToMutation(step: JsBackStep): MutationOperation {
        if (step.action === BackStepAction.REGISTER_RESTORE) {
            return makeRegisterBackstepMutation(getRegisterFileName(step.param1))
        }
        if (step.action === BackStepAction.COPROC0_REGISTER_RESTORE) {
            return makeRegisterBackstepMutation(getCP0RegisterName(step.param1))
        }
        if (step.action === BackStepAction.COPROC1_REGISTER_RESTORE) {
            return makeRegisterBackstepMutation(getCP1RegisterName(step.param1))
        }
        const memorySize = getMemoryBackstepSize(step.action)
        if (memorySize !== undefined) {
            return {
                type: 'WriteMemory',
                value: {
                    address: BigInt(step.param1),
                    size: memorySize,
                    old: 0n
                }
            }
        }
        if (step.action === BackStepAction.PC_RESTORE) {
            return makeRegisterBackstepMutation('$pc')
        }
        if (step.action === BackStepAction.COPROC1_CONDITION_CLEAR) {
            return {
                type: 'Other',
                value: `CP1 condition flag ${step.param1} restore: clear`
            }
        }
        if (step.action === BackStepAction.COPROC1_CONDITION_SET) {
            return {
                type: 'Other',
                value: `CP1 condition flag ${step.param1} restore: set`
            }
        }
        return {
            type: 'Other',
            value: backStepActionMap[step.action]
        }
    }

    function dispose() {
        clearDebouncer()
        mips = null
        clear()
    }

    function addError(error: string) {
        state.errors.push(error)
    }

    function hasTerminated(currentMips: JsMips) {
        try {
            //TODO improve this
            currentMips.getNextStatement()
            return false
        } catch {
            return true
        }
    }

    async function step() {
        let lastLine = -1
        try {
            if (!mips) throw new Error('Interpreter not initialized')
            lastLine = (mips.getNextStatement()?.sourceLine ?? 0) - 1
            state.terminated = mips.step()
            try {
                const ins = mips.getNextStatement()
                state.line = ins.sourceLine - 1
            } catch {}

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
            for (let i = 0; i < amount && mips.canUndo; i++) {
                mips.undo()
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

    function calculateBreakpoints(currentMips: JsMips, breakpoints: number[]) {
        const b = breakpoints
            .map((line) => {
                const ins = currentMips.getStatementAtSourceLine(line + 1)
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
        const currentMips = mips
        try {
            if (!currentMips) throw new Error('Interpreter not initialized')
            const terminated = currentMips.simulateWithBreakpointsAndLimit(
                calculateBreakpoints(currentMips, breakpoints),
                haltLimit
            )
            try {
                const ins = currentMips.getNextStatement()
                //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
                if (!terminated) {
                    state.line = ins.sourceLine - 1
                } else {
                    state.line = -1
                }
            } catch {
                state.line = -1
            }
            state.canUndo = currentMips.canUndo
            updateRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
            state.terminated = terminated
            return terminated ? InterpreterStatus.Terminated : InterpreterStatus.Running
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                if (currentMips) line = currentMips.getCurrentStatementIndex() - 1
            } catch (e) {
                console.error(e)
            }
            addError(getMIPSErrorMessage(e))
            state.terminated = true
            state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    function setGlobalMemoryAddress(address: bigint) {
        try {
            const bytes = mips?.readMemoryBytes(Number(address), state.memory.global.pageSize)
            state.memory.global.address = address
            state.memory.global.data.current = bytes
                ? new Uint8Array(bytes)
                : new Uint8Array(state.memory.global.pageSize).fill(0xff)
            state.memory.global.data.prevState = state.memory.global.data.current
        } catch (e) {
            console.error(e)
            addError(getMIPSErrorMessage(e))
        }
    }

    function setTabMemoryAddress(address: bigint, tabId: number) {
        try {
            const tab = state.memory.tabs.find((e) => e.id == tabId)
            if (!tab) return
            const bytes = mips?.readMemoryBytes(Number(address), tab.pageSize)
            tab.address = address
            tab.data.current = bytes
                ? new Uint8Array(bytes)
                : new Uint8Array(tab.pageSize).fill(0xff)
            tab.data.prevState = tab.data.current
        } catch (e) {
            console.error(e)
            addError(getMIPSErrorMessage(e))
        }
    }

    async function validateTestcase(testcase: Testcase) {
        const errors: TestcaseValidationError[] = []
        if (!mips) throw new Error('Interpreter not initialized')
        const registers = getRegistersValue()
        for (const [register, value] of Object.entries(testcase.expectedRegisters)) {
            const normalizedRegister = register.toLowerCase()
            const registerIndex = MIPSRegisterNames.findIndex(
                (candidate) => candidate === normalizedRegister
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
                    mips.readMemoryBytes(Number(value.address), value.bytes)
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
                const bytes = mips.readMemoryBytes(
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
                const bytes = mips.readMemoryBytes(Number(value.address), value.expected.length)
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
                return Number(promptForInput(props))
            },
            askFloat: (props: string) => {
                throwIfExamMode()
                return Number(promptForInput(props))
            },
            askInt: (props: string) => {
                throwIfExamMode()
                return Number(promptForInput(props))
            },
            askString: (props: string) => {
                throwIfExamMode()
                return promptForInput(props)
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
                const str = promptForInput('Enter a character')
                if (str.length !== 1) throw new Error('Invalid character')
                return str
            },
            readDouble: () => {
                throwIfExamMode()
                return Number(promptForInput('Enter a double'))
            },
            readFloat: () => {
                throwIfExamMode()
                return Number(promptForInput('Enter a float'))
            },
            readInt: () => {
                throwIfExamMode()
                return Number(promptForInput('Enter an integer'))
            },
            readString: () => {
                throwIfExamMode()
                return promptForInput('Enter a string')
            },

            log: (message: string) => {
                state.stdOut += message
            },
            logLine: (message: string) => {
                state.stdOut += message + '\n'
            },

            confirm: (message: string) => (confirm(message) ? ConfirmResult.YES : ConfirmResult.NO),
            inputDialog: (message: string) => {
                throwIfExamMode()
                return promptForInput(message)
            },
            outputDialog: (message: string) => alert(message),

            sleep: unimplementedHandler('sleep')
        } satisfies HandlerMapFns
    }

    async function runTestcase(testcase: Testcase, haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        const currentMips = mips
        try {
            const t = structuredClone($state.snapshot(testcase))
            if (!currentMips) throw new Error('Interpreter not initialized')
            for (const [register, value] of Object.entries(t.startingRegisters)) {
                if (!isMIPSNumericRegisterName(register)) {
                    throw new Error(`Unsupported starting register: ${register}`)
                }
                currentMips.setRegisterValue(register, Number(value))
            }
            for (const value of t.startingMemory) {
                if (value.type === 'number') {
                    const slice = numberToByteSlice(value.expected, value.bytes, 'little')

                    currentMips.setMemoryBytes(Number(value.address), slice)
                } else if (value.type === 'number-chunk') {
                    const expected = numbersOfSizeToSlice(value.expected, value.bytes, 'little')
                    currentMips.setMemoryBytes(Number(value.address), expected)
                } else if (value.type === 'string-chunk') {
                    const encoded = new TextEncoder().encode(value.expected)
                    currentMips.setMemoryBytes(Number(value.address), Array.from(encoded))
                }
            }
            registerHandlers(currentMips, {
                ...getHandlers(),
                readChar: () => {
                    const input = takeTestcaseInput(
                        t.input,
                        'Input does not have any characters left'
                    )
                    if (input.length !== 1) throw new Error('Invalid character')
                    return input
                },
                readDouble: () => {
                    const input = takeTestcaseInput(t.input, 'Input does not have any numbers left')
                    if (Number.isNaN(Number(input))) throw new Error('Invalid number')
                    return Number(input)
                },
                readFloat: () => {
                    const input = takeTestcaseInput(t.input, 'Input does not have any numbers left')
                    if (Number.isNaN(Number(input))) throw new Error('Invalid number')
                    return Number(input)
                },
                readInt: () => {
                    const input = takeTestcaseInput(t.input, 'Input does not have any numbers left')
                    if (Number.isNaN(Number(input))) throw new Error('Invalid number')
                    return Number(input)
                },
                readString: () =>
                    takeTestcaseInput(t.input, 'Input does not have any strings left'),
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
            currentMips.simulateWithLimit(haltLimit)
            try {
                const ins = currentMips.getNextStatement()
                //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
                state.line = ins.sourceLine - 1
            } catch {}

            state.canUndo = currentMips.canUndo

            updateRegisters()
            updateMemory()
            updateData()
            scrollStackTab()
            state.executionTime = performance.now() - start
            return currentMips.terminated ? InterpreterStatus.Terminated : InterpreterStatus.Running
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                if (currentMips) line = currentMips.getCurrentStatementIndex() - 1
            } catch (e) {
                console.error(e)
            }
            addError(getMIPSErrorMessage(e))
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
                state.errors.push(getMIPSErrorMessage(e))
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
        if (!mips) return -1
        const statement = mips.getStatementAtAddress(Number(address))
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
            if (!mips) throw new Error('Emulator not initialized')
            return new Uint8Array(mips.readMemoryBytes(Number(address), length))
        }
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
    [BackStepAction.PC_RESTORE]: 'PC restore'
} satisfies Record<BackStepAction, string>

function makeRegisterBackstepMutation(register: string): MutationOperation {
    return {
        type: 'WriteRegister',
        value: {
            register,
            old: 0n,
            size: RegisterSize.Long
        }
    }
}

function getRegisterFileName(index: number) {
    const generalRegister = MIPSNumericRegisterNames[index]
    if (generalRegister) return generalRegister
    if (index === 33) return 'hi'
    if (index === 34) return 'lo'
    return `GPR[${index}]`
}

function getCP0RegisterName(index: number) {
    switch (index) {
        case 8:
            return 'CP0 $8 (vaddr)'
        case 12:
            return 'CP0 $12 (status)'
        case 13:
            return 'CP0 $13 (cause)'
        case 14:
            return 'CP0 $14 (epc)'
        default:
            return `CP0[${index}]`
    }
}

function getCP1RegisterName(index: number) {
    if (Number.isInteger(index) && index >= 0 && index < 32) return `$f${index}`
    return `CP1[${index}]`
}

function getMemoryBackstepSize(action: BackStepAction): RegisterSize | undefined {
    switch (action) {
        case BackStepAction.MEMORY_RESTORE_BYTE:
            return RegisterSize.Byte
        case BackStepAction.MEMORY_RESTORE_HALF:
            return RegisterSize.Word
        case BackStepAction.MEMORY_RESTORE_WORD:
        case BackStepAction.MEMORY_RESTORE_RAW_WORD:
            return RegisterSize.Long
        case BackStepAction.REGISTER_RESTORE:
        case BackStepAction.PC_RESTORE:
        case BackStepAction.COPROC0_REGISTER_RESTORE:
        case BackStepAction.COPROC1_REGISTER_RESTORE:
        case BackStepAction.COPROC1_CONDITION_CLEAR:
        case BackStepAction.COPROC1_CONDITION_SET:
        case BackStepAction.DO_NOTHING:
            return undefined
    }
    const exhaustiveAction: never = action
    return exhaustiveAction
}

function takeTestcaseInput(input: string[], emptyMessage: string) {
    const value = input.shift()
    if (value === undefined) throw new Error(emptyMessage)
    return value
}
