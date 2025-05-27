import {
    type EmulatorDecoration,
    type ExecutionStep, type MonacoError,
    type MutationOperation,
    RegisterSize,
    type StackFrame
} from '$lib/languages/commonLanguageFeatures.svelte'
import type { Testcase } from '$lib/Project.svelte'


export type CompilationError = {
    type: 'raw'
    message: string
}

export enum EmulatorStatus {

}

type Instruction = {
    address: number
    lineNumber: number
}

export type EmulatorConfig<R extends string> = {
    systemSize: RegisterSize
    registerNames: R[]
    endianness?: 'little' | 'big'
    hiddenRegisters?: R[]
}

export abstract class BaseEmulator<T, R extends string> {

    protected _registerNames: R[]
    protected _systemSize: RegisterSize
    protected _endianness: 'little' | 'big'

    constructor(options: EmulatorConfig<R>) {
        this._registerNames = options.registerNames;
        this._systemSize = options.systemSize;
        this._endianness = options.endianness ?? 'little';
    }

    getSystemSize(): RegisterSize {
        return this._systemSize;
    }

    getEndianness(): 'little' | 'big' {
        return this._endianness;
    }



    getRegisterNames(): R[] {
        return this._registerNames;
    }

    abstract _initialize(undoSize: number): void;

    abstract _getCompiledCode(): { decorations: EmulatorDecoration[], code: string }

    abstract _runTestcase(testcase: Testcase, haltLimit: number)

    abstract _dispose(): void;

    abstract _stringifyError(error: unknown): string;

    abstract _compile(code: string): { ok: true } | { ok: false, errors: CompilationError[], report: string};

    abstract _checkCode(code: string): MonacoError[];

    abstract _undo(): void;

    abstract _canUndo(): boolean;

    abstract _step(): Promise<{ terminated: boolean }>

    abstract _getStatus(): EmulatorStatus;

    abstract _writeMemoryBytes(address: bigint, data: Uint8Array): void;

    abstract _readMemoryBytes(address: bigint, length: bigint): Uint8Array;

    abstract _getNextInstruction(): Instruction | null;

    abstract _getUndoHistory(max: number): ExecutionStep[]

    abstract _getPc(): bigint;

    abstract _getSp(): bigint;

    abstract _getFlags(): {name: string, set: boolean}[];

    abstract _getCallStack(): StackFrame[];

    abstract _getInstructionAt(address: bigint): Instruction | null;

    abstract _getRegisterValues(): bigint[]

    abstract _getRegisterValuesRecord(): Record<R, bigint>

    abstract _getRegisterValue(register: R, size?: RegisterSize): bigint

    abstract _setRegisterValue(register: R, value: bigint, size?: RegisterSize): void;

    abstract _hasTerminated(): boolean

    abstract _run(limit?: number, breakpoints?: number[]): Promise<EmulatorStatus>;
}