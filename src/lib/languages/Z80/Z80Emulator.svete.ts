/*
import { GenericEmulator } from '$lib/languages/GenericEmulator.svelte'
import type { Testcase } from '$lib/Project.svelte'
import { EmulatorStatus, type CompilationError, type Instruction } from '../BaseEmulator.svelte'
import {
    type EmulatorDecoration,
    type EmulatorSettings,
    type MonacoError, type ExecutionStep, type StackFrame, RegisterSize
} from '../commonLanguageFeatures.svelte'
import { Trs80 } from 'trs80-emulator'
import { hi, lo, toHexByte } from 'z80-base'
import { Asm } from 'z80-asm'


type Z80RegisterName = 'A' | 'B' | 'C' | 'D' | 'E' | 'H' | 'L' | 'F'

export class Z80Emulator extends GenericEmulator<Trs80, Z80RegisterName> {
    private interpreter: Trs80 | undefined
    private assembler: Asm | undefined

    constructor(code: string, options: EmulatorSettings = {}) {
        super(code,
            {
                systemSize: RegisterSize.Word,
                registerNames: ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'F'] as Z80RegisterName[],
                endianness: 'little'
            },
            {
                language: 'Z80',
                stackAddress: 0xFFFFn,
                baseAddress: 0x0000n,
                initialMemoryValue: 0x0,
                ...options,
            }
        )
    }

    static create(code: string, options: EmulatorSettings = {}) {
        return new Z80Emulator(code, options)
    }

    protected getInstance(): Trs80 | null {
        return this.interpreter || null
    }
    _initialize(undoSize: number): void {
        throw new Error('Method not implemented.')
    }
    _getCompiledCode(): { decorations: EmulatorDecoration[]; code: string } {
        throw new Error('Method not implemented.')
    }
    _runTestcase(testcase: Testcase, haltLimit: number) {
        throw new Error('Method not implemented.')
    }
    _dispose(): void {
        throw new Error('Method not implemented.')
    }
    _stringifyError(error: unknown): string {
        throw new Error('Method not implemented.')
    }
    _compile(code: string): { ok: true } | { ok: false; errors: CompilationError[]; report: string } {
        throw new Error('Method not implemented.')
    }
    _checkCode(code: string): MonacoError[] {
        throw new Error('Method not implemented.')
    }
    _undo(): void {
        throw new Error('Method not implemented.')
    }
    _canUndo(): boolean {
        throw new Error('Method not implemented.')
    }
    async _step(): Promise<{ terminated: boolean }> {
        this.interpreter.step()
        return {
            terminated: false //TODO
        }
    }
    _getStatus(): EmulatorStatus {
        return EmulatorStatus.Running //TODO
    }
    _writeMemoryBytes(address: bigint, data: Uint8Array): void {
        this.interpreter.writeMemoryBlock(Number(address), data)
    }
    _readMemoryBytes(address: bigint, length: bigint): Uint8Array {
        const data = new Uint8Array(Number(length))
        for (let i = 0; i < data.length; i++) {
            data[i] = this.interpreter.readMemory(Number(address) + i)
        }
        return data
    }
    _getNextInstruction(): Instruction | null {
        throw new Error('Method not implemented.')
    }
    _getUndoHistory(max: number): ExecutionStep[] {
        throw new Error('Method not implemented.')
    }
    _getPc(): bigint {
        throw new Error('Method not implemented.')
    }
    _getSp(): bigint {
        throw new Error('Method not implemented.')
    }
    _getFlags(): { name: string; value: number; prev?: number }[] {
        throw new Error('Method not implemented.')
    }
    _getCallStack(): StackFrame[] {
        throw new Error('Method not implemented.')
    }
    _getInstructionAt(address: bigint): Instruction | null {
        throw new Error('Method not implemented.')
    }
    _getRegisterValues(): bigint[] {
        throw new Error('Method not implemented.')
    }
    _getRegisterValuesRecord(): Record<Z80RegisterName, bigint> {
        throw new Error('Method not implemented.')
    }
    _getRegisterValue(register: Z80RegisterName, size?: RegisterSize): bigint {
        throw new Error('Method not implemented.')
    }
    _setRegisterValue(register: Z80RegisterName, value: bigint, size?: RegisterSize): void {
        throw new Error('Method not implemented.')
    }
    _hasTerminated(): boolean {
        throw new Error('Method not implemented.')
    }
    _run(limit?: number, breakpoints?: number[]): Promise<EmulatorStatus> {
        throw new Error('Method not implemented.')
    }

}
 */