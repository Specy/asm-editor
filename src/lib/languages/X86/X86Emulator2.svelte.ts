import { type CompilationError, EmulatorStatus, type Instruction } from '$lib/languages/BaseEmulator.svelte'
import { X86ConditionFlags, X86Interpreter, X86Register } from '@specy/x86'
import {
    type EmulatorDecoration,
    type EmulatorSettings,
    type ExecutionStep,
    type MonacoError,
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import { bigIntOfSize, getEnumKeys } from '$lib/utils'
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import type { Testcase } from '$lib/Project.svelte'

type X86RegisterName = 'EAX' | 'EBX' | 'ECX' | 'EDX' | 'ESI' | 'EDI' | 'EBP' | 'ESP'

export class X86Emulator2 extends GenericEmulator<X86Interpreter, X86RegisterName> {
    private interpreter: X86Interpreter | undefined

    constructor(code: string, options: EmulatorSettings = {}) {
        super(code,
            {
                systemSize: RegisterSize.Long,
                registerNames: ['EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'EBP', 'ESP'] as X86RegisterName[],
                endianness: 'little'
            },
            {
                language: 'X86',
                stackAddress: BigInt(X86Interpreter.STACK_START_ADDRESS + X86Interpreter.STACK_SIZE),
                baseAddress: BigInt(X86Interpreter.START_ADDRESS),
                initialMemoryValue: 0x0,
                ...options,
            }
        )
    }

    static create(code: string, options: EmulatorSettings = {}) {
        return new X86Emulator2(code, options)
    }

    protected getInstance(): X86Interpreter {
        return this.interpreter
    }

    _canUndo(): boolean {
        return false
    }

    _checkCode(code: string): MonacoError[] {
        return [] //not implemented
    }

    _compile(code: string): { ok: true } | { ok: false; errors: CompilationError[]; report: string } {
        try {
            this.interpreter = X86Interpreter.create(code)
            this.interpreter.assemble()
            return { ok: true }
        } catch (e) {
            return {
                ok: false,
                errors: [{ type: 'raw', message: this._stringifyError(e) }],
                report: this._stringifyError(e)
            }

        }
    }

    _initialize(undoSize: number): void {
        if (!this.interpreter) {
            throw new Error('Interpreter not initialized')
        }
        this.interpreter.initialize()
    }

    _dispose(): void {
        this.interpreter?.dispose()
    }

    _getCallStack(): StackFrame[] {
        return [] //not implemented
    }

    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        return {
            code: this.interpreter
                ?.getAssembledStatements()
                .map((s) => s.text)
                .join('\n') || '',
            decorations: []
        }
    }

    _getFlags(): { name: string; value: number, prev?: number }[] {
        if (!this.interpreter) {
            return getEnumKeys(X86ConditionFlags).map(k => ({ name: k, value: 0 }))
        }
        const x86Flags = this.interpreter?.getConditionFlags()


        return Object.entries(x86Flags).map(([k, v]) => ({ name: X86ConditionFlags[k], value: v }))
    }

    _getInstructionAt(address: bigint): Instruction | null {
        if (!this.interpreter) return null
        const ins = this.interpreter.getStatementAtAddress(Number(address))
        if (!ins) return null
        return {
            lineNumber: ins.line,
            address,
            code: ins.text
        }
    }

    _getNextInstruction(): Instruction | null {
        if (!this.interpreter) return null
        const ins = this.interpreter.getNextStatement()
        if (!ins) return null
        return {
            lineNumber: ins.line,
            address: BigInt(ins.address),
            code: ins.text
        }
    }

    _getPc(): bigint {
        if (!this.interpreter) return 0n
        return BigInt(this.interpreter.getProgramCounter())
    }

    _getRegisterValue(register: X86RegisterName, size: RegisterSize | undefined = RegisterSize.Long): bigint {
        if (!this.interpreter) throw new Error('Interpreter not initialized')
        const value = this.interpreter.getRegisterValue(X86Register[register])
        return bigIntOfSize(BigInt(value), size)
    }

    _getRegisterValues(): bigint[] {
        if (!this.interpreter) return new Array(this._registerNames.length).fill(0n)
        return this.interpreter.getRegistersValues().map(BigInt)
    }

    _getRegisterValuesRecord(): Record<X86RegisterName, bigint> {
        const values = this._getRegisterValues()
        const names = this._registerNames
        return Object
            .fromEntries(
                names.map((k, i) => ([k, BigInt(values[i])]))
            ) as Record<X86RegisterName, bigint>
    }

    _getSp(): bigint {
        if (!this.interpreter) return 0n
        return BigInt(this.interpreter.getStackPointer())
    }

    _getStatus(): EmulatorStatus {
        return this.interpreter?.isTerminated() ? EmulatorStatus.Terminated : EmulatorStatus.Running
    }

    _getUndoHistory(max: number): ExecutionStep[] {
        return [] //not implemented
    }

    _hasTerminated(): boolean {
        return this.interpreter?.isTerminated() ?? true
    }


    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        if (!this.interpreter) throw new Error('Interpreter not initialized')
        return this.interpreter.readMemoryBytes(Number(address), Number(length))
    }

    _run(limit: number | undefined, breakpoints: number[] | undefined): Promise<EmulatorStatus> {
        if (!this.interpreter) throw new Error('Interpreter not initialized')
        const hasBreakpoints = breakpoints.length > 0
        if (!hasBreakpoints) {
            this.interpreter.simulate(limit)
        } else {
            this.interpreter.simulateWithBreakpoints(breakpoints, limit)
        }

        return Promise.resolve(undefined)
    }

    _runTestcase(testcase: Testcase, haltLimit: number) {
        if (haltLimit <= 0) haltLimit = Number.MAX_SAFE_INTEGER
        //TODO syscalls
        this.interpreter.simulate(haltLimit)
    }

    _setRegisterValue(register: X86RegisterName, value: bigint, size: RegisterSize | undefined): void {
        if (!this.interpreter) throw new Error('Interpreter not initialized')
        this.interpreter.setRegisterValue(X86Register[register], Number(value))
    }

    async _step(): Promise<{ terminated: boolean }> {
        if (!this.interpreter) throw new Error('Interpreter not initialized')
        this.interpreter.step()
        return {
            terminated: this.interpreter.isTerminated()
        }
    }

    _stringifyError(error: unknown): string {
        const string = error instanceof Error ? error.message : String(error)
        if (
            string.startsWith('Keystone.js') ||
            string.startsWith('Capstone.js') ||
            string.startsWith('Unicorn.js')
        ) {
            return string.split('\n').slice(1).join('\n')
        }
        return string
    }

    _undo(): void {
        //noop
    }

    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        if (!this.interpreter) throw new Error('Interpreter not initialized')
        this.interpreter.setMemoryBytes(Number(address), [...data])
    }

}