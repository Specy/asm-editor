import { BaseEmulator, type EmulatorConfig } from '$lib/languages/BaseEmulator'
import {
    type BaseEmulatorActions,
    type BaseEmulatorState,
    createMemoryTab,
    type EmulatorSettings,
    InterpreterStatus,
    makeRegister,
    numbersOfSizeToSlice
} from '$lib/languages/commonLanguageFeatures.svelte'
import type { Testcase, TestcaseResult, TestcaseValidationError } from '$lib/Project.svelte'
import { PAGE_ELEMENTS_PER_ROW, PAGE_SIZE } from '$lib/Config'
import { RISCVRegisterNames } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import { createDebouncer } from '$lib/utils'
import { settingsStore } from '$stores/settingsStore.svelte'
import { byteSliceToNum, isMemoryChunkEqual } from '$cmp/specific/project/memory/memoryTabUtils'
import { StopReason } from '@specy/risc-v'


export abstract class GenericEmulator<T, R extends string> extends BaseEmulator<T, R> implements BaseEmulatorActions, BaseEmulatorState {
    private state: Omit<BaseEmulatorState, 'code'>
    private _code: string
    private _emulatorOptions: EmulatorSettings

    constructor(code: string, options: EmulatorConfig<R>, emulatorOptions: EmulatorSettings = {}) {
        super(options)
        this._emulatorOptions = {
            globalPageSize: PAGE_SIZE,
            globalPageElementsPerRow: PAGE_ELEMENTS_PER_ROW,
            baseAddress: 0x1000n,
            stackAddress: 0x7ffffffcn,
            initialMemoryValue: 0x0,
            ...options
        }
        this._code = $state(code)

        this.state = $state({
            systemSize: options.systemSize,
            registers: [],
            hiddenRegisters: options.hiddenRegisters,
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
                    this._emulatorOptions.globalPageSize,
                    'Global',
                    this._emulatorOptions.baseAddress,
                    this._emulatorOptions.globalPageElementsPerRow,
                    this._emulatorOptions.initialMemoryValue,
                    options.endianness
                ),
                tabs: [createMemoryTab(8 * 4, 'Stack', this._emulatorOptions.stackAddress, 4, this._emulatorOptions.initialMemoryValue, this._endianness)]
            }
        })
        this.clear()
        this.semanticCheck()
    }

    protected abstract getInstance(): T


    private addDecorations() {
        if (!this.getInstance()) return
        const decorations = this._getCompiledCode()
        this.state.decorations = decorations.decorations
        this.state.compiledCode = decorations.code
    }

    private addError(error: string) {
        this.state.errors.push(error)
    }

    private scrollStackTab() {
        const settings = settingsStore
        const current = this.state
        if (!settings.values.autoScrollStackTab.value || !this.getInstance()) return
        const stackTab = current.memory.tabs.find((e) => e.name === 'Stack')
        const sp = this._getSp()
        if (stackTab) stackTab.address = sp - (sp % BigInt(stackTab.pageSize))
    }

    private semanticCheck() {
        try {
            const errors = this._checkCode(this._code)
            this.state.compilerErrors = errors
            this.state.errors = []
        } catch (e) {
            this.addError(this._stringifyError(e))
        }
    }


    private setRegisters(override?: bigint[]) {
        if (!this.getInstance() && !override) {
            override = new Array(this._registerNames.length).fill(0)
        }

        this.state.registers = (override ?? this._getRegisterValues()).map((reg, i) => {
            return makeRegister(this._registerNames[i], reg, this._systemSize)
        })
    }

    private getRegistersValue() {
        if (!this.getInstance()) return []
        return this._getRegisterValues()
    }

    private updateRegisters() {
        if (this.state.registers.length === 0) return
        this.getRegistersValue().forEach((reg, i) => {
            this.state.registers[i].setValue(reg)
        })
        this.state.sp = this._getSp()
    }

    private updateMemory() {
        if (!this.getInstance()) return
        try {
            const temp = this.state.memory.global.data.current
            const memory = this._readMemoryBytes(
                this.state.memory.global.address,
                BigInt(this.state.memory.global.pageSize)
            )
            this.state.memory.global.data.current = new Uint8Array(memory)
            this.state.memory.global.data.prevState = temp
            this.state.memory.tabs.forEach((tab) => {
                const temp = tab.data.current
                const memory = this._readMemoryBytes(tab.address, BigInt(tab.pageSize))
                tab.data.current = new Uint8Array(memory)
                tab.data.prevState = temp
            })
        } catch (e) {
            console.error(e)
            this.addError(this._stringifyError(e))
        }
    }

    private updateData() {
        const settings = settingsStore
        if (!this.getInstance()) return
        this.state.terminated = this._hasTerminated()
        this.state.pc = this._getPc()
        this.state.callStack = this._getCallStack()
        this.state.latestSteps = this._getUndoHistory(settings.values.maxVisibleHistoryModifications.value)
    }


    // ----- public api ----- //
    clear(): void {
        this.state = {
            ...this.state,
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
                    this._emulatorOptions.globalPageSize,
                    'Global',
                    this._emulatorOptions.baseAddress,
                    this._emulatorOptions.globalPageElementsPerRow,
                    this._emulatorOptions.initialMemoryValue,
                    this._endianness
                ),
                tabs: [createMemoryTab(8 * 4, 'Stack', this._emulatorOptions.stackAddress, 4, this._emulatorOptions.initialMemoryValue, this._endianness)]
            }
        }
        this.setRegisters(new Array(RISCVRegisterNames.length).fill(0))
    }


    compile(historySize: number, codeOverride: string | undefined): Promise<void> {
        return new Promise((res, rej) => {
            try {
                this.clear()
                const result = this._compile(codeOverride ?? this._code)
                //riscv.setUndoSize(historySize)
                if (!result.ok) {
                    //@ts-ignore
                    this.state.compilerErrors = result.errors
                    this.state.canExecute = false
                    //@ts-ignore
                    rej(result.report)
                }
                this.addDecorations()
                this._initialize(historySize)

                this.state.canExecute = true
                this.state.canUndo = false
                this.updateRegisters()
                this.updateMemory()
                this.updateData()
                this.scrollStackTab()
                res()
            } catch (e) {
                this.addError(this._stringifyError(e))
                this.debouncer[1]()
                rej(e)
            }
        })
    }


    dispose(): void {
        this.debouncer[1]()
        this.clear()
        this._dispose()
    }


    getLineFromAddress(address: bigint): number {
        if (!this.getInstance()) return -1
        const statement = this._getInstructionAt(address)
        if (!statement) return -1
        return statement.lineNumber - 1
    }


    resetSelectedLine(): void {
        this.state.line = -1
    }

    async run(haltLimit: number): Promise<InterpreterStatus> {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        const start = performance.now()
        const breakpoints = this.state.breakpoints
        try {
            const status =
                await this._run(haltLimit, this.state.breakpoints)
            const terminated = this._hasTerminated()
            try {
                const ins = this._getNextInstruction()
                //shows the next instruction, if it't not available it means the code has terminated, so show the last instruction
                if (!terminated) {
                    this.state.line = ins.lineNumber - 1
                } else {
                    this.state.line = -1
                }
            } catch (e) {
                this.state.line = -1
            }
            this.state.canUndo = this._canUndo()
            this.updateRegisters()
            this.updateMemory()
            this.updateData()
            this.scrollStackTab()
            this.state.executionTime = performance.now() - start
            this.state.terminated = terminated
            //if it managed to run, it means it does not have valid errors
            this.state.errors = []
            return terminated ? InterpreterStatus.Terminated : InterpreterStatus.Running
        } catch (e) {
            console.error(e)
            let line = -1
            try {
                line = this._getNextInstruction().lineNumber - 1
            } catch (e) {
                console.error(e)
            }
            this.addError(this._stringifyError(e))
            this.state.terminated = true
            this.state.line = line
        }
        return InterpreterStatus.TerminatedWithException
    }

    private debouncer = createDebouncer(500)

    setCode(code: string): void {
        this._code = code
        this.debouncer[0](() => this.semanticCheck())
    }

    setGlobalMemoryAddress(address: bigint): void {
        try {
            const bytes = this.getInstance()
                ? this._readMemoryBytes(address, BigInt(this.state.memory.global.pageSize))
                : new Uint8Array(this.state.memory.global.pageSize).fill(this._emulatorOptions.initialMemoryValue)
            this.state.memory.global.address = address
            this.state.memory.global.data.current = bytes,
                this.state.memory.global.data.prevState = this.state.memory.global.data.current
        } catch (e) {
            console.error(e)
            this.addError(this._stringifyError(e))
        }
    }

    setTabMemoryAddress(address: bigint, tabId: number): void {
        try {
            const tab = this.state.memory.tabs.find((e) => e.id == tabId)
            if (!tab) return
            const bytes = this.getInstance()
                ? this._readMemoryBytes(address, BigInt(this.state.memory.global.pageSize))
                : new Uint8Array(this.state.memory.global.pageSize).fill(this._emulatorOptions.initialMemoryValue)
            tab.address = address
            tab.data.current = bytes
            tab.data.prevState = tab.data.current
        } catch (e) {
            console.error(e)
            this.addError(this._stringifyError(e))
        }
    }

    async validateTestcase(testcase: Testcase) {
        const errors = [] as TestcaseValidationError[]
        if (!this.getInstance()) throw new Error('Interpreter not initialized')
        const registers = this._getRegisterValues()
        for (const [register, value] of Object.entries(testcase.expectedRegisters)) {
            const registerIndex = RISCVRegisterNames.indexOf(register.toUpperCase())
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
        const current = this.state
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
                    this._readMemoryBytes(value.address, BigInt(value.bytes))
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
                const bytes = this._readMemoryBytes(
                    value.address,
                    BigInt(value.expected.length * value.bytes)
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
                const bytes = this._readMemoryBytes(value.address, BigInt(value.expected.length))
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


    async step(): Promise<boolean> {
        let lastLine = -1
        try {
            if (!this.getInstance()) throw new Error('Interpreter not initialized')
            lastLine = this._getNextInstruction()?.lineNumber ?? -1
            this.state.terminated = (await this._step()).terminated
            try {
                const ins = this._getNextInstruction()
                this.state.line = ins.lineNumber - 1
            } catch (e) {
            }

            this.state.canUndo = this._canUndo()
            //if it managed to step, it means it does not have valid errors
            this.state.errors = []
        } catch (e) {
            console.error(e)
            this.addError(this._stringifyError(e))
            this.state.terminated = true
            this.state.line = lastLine
            throw e
        }
        this.updateRegisters()
        this.updateMemory()
        this.updateData()
        this.scrollStackTab()
        return this._hasTerminated()
    }


    async test(code: string, testcases: Testcase[], haltLimit: number, historySize = 0) {
        const results = [] as TestcaseResult[]
        for (const testcase of testcases) {
            try {
                await this.compile(historySize, code)
                await this._runTestcase(testcase, haltLimit)
                const errors = await this.validateTestcase(testcase)
                results.push({
                    errors,
                    passed: errors.length === 0,
                    testcase
                })
            } catch (e) {
                console.error(e)
                this.addError(this._stringifyError(e))
            }
        }
        const passedTests = results.filter((r) => r.passed)
        this.state.stdOut = '⏳ Running tests...\n\n' + this.state.stdOut
        if (passedTests.length !== results.length) {
            this.state.stdOut += `\n❌ ${results.length - results.filter((r) => r.passed).length} testcases not passed\n`
        }
        if (passedTests.length > 0) {
            if (!this.state.stdOut.endsWith('testcases not passed')) {
                this.state.stdOut += '\n'
            }
            this.state.stdOut += `\n✅ ${passedTests.length} testcases passed \n`
        }
        return results
    }

    toggleBreakpoint(line: number): void {
        const index = this.state.breakpoints.indexOf(line)
        if (index === -1) this.state.breakpoints.push(line)
        else this.state.breakpoints.splice(index, 1)
    }

    undo(amount: number | undefined): void {
        try {
            if (!this.getInstance()) return
            for (let i = 0; i < amount && this._canUndo; i++) {
                this._undo()
            }
            const instruction = this._getNextInstruction()
            this.state.line = instruction.lineNumber - 1
            this.state.canUndo = this._canUndo()
            this.updateRegisters()
            this.updateMemory()
            this.updateData()
            this.scrollStackTab()
        } catch (e) {
            this.addError(this._stringifyError(e))
            this.state.terminated = true
            console.error(e)
            throw e
        }
    }


    get breakpoints() {
        return this.state.breakpoints

    }

    get callStack() {
        return this.state.callStack
    }

    get canExecute() {
        return this.state.canExecute
    }

    get canUndo() {
        return this.state.canUndo
    }

    get compilerErrors() {
        return this.state.compilerErrors
    }

    get decorations() {
        return this.state.decorations
    }

    get errors() {
        return this.state.errors
    }

    get executionTime() {
        return this.state.executionTime
    }

    get hiddenRegisters() {
        return this.state.hiddenRegisters
    }

    get latestSteps() {
        return this.state.latestSteps
    }

    get line() {
        return this.state.line
    }

    get memory() {
        return this.state.memory
    }

    get pc() {
        return this.state.pc
    }

    get registers() {
        return this.state.registers
    }

    get sp() {
        return this.state.sp
    }

    get statusRegisters() {
        return this.state.statusRegisters
    }

    get stdOut() {
        return this.state.stdOut
    }

    get terminated() {
        return this.state.terminated
    }

    get code() {
        return this._code
    }

    get systemSize() {
        return this._systemSize
    }

    get endianness() {
        return this._endianness
    }
}
