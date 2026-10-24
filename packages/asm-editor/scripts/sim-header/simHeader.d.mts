/**
 * Types for `simHeader.mjs`, which is plain JavaScript written for Node: TypeScript reads this file
 * in its place when the editor's tests import it.
 */
import type { MarsSyscall, SimBinding } from '../../src/lib/documentation/mars/syscallBinding'
import type {
    X86SimBinding,
    X86SimHeaderData
} from '../../src/lib/documentation/x86/syscallBinding'

export type SimHeaderTargetName = 'mips' | 'riscv32' | 'riscv64'

export type SimHeaderTarget = {
    language: 'MIPS' | 'RISC-V' | 'RISC-V-64'
    simulator: 'MARS' | 'RARS'
    syscalls: 'mips' | 'riscv'
    guard: string
    call: 'syscall' | 'ecall'
    serviceRegister: string
}

/** What a header is generated from. */
export type SimHeaderData = {
    syscalls: Record<number, MarsSyscall>
    /** The keyboard and display registers, and the Ready bit of their control registers. */
    devices: {
        receiverControl: number
        receiverData: number
        transmitterControl: number
        transmitterData: number
        readyBit: number
    }
    /**
     * The sizes MARS's and RARS's bitmap display offers, the ranges the editor's display takes, and
     * the range GNU-profile Builds give static data.
     */
    display: {
        sizes: readonly number[]
        units: readonly number[]
        sizeMin: number
        sizeMax: number
        unitMin: number
        unitMax: number
        staticData: number
        staticDataEnd: number
    }
    /** The Synth's block, from `synthRegisters.ts`. */
    synth: {
        base: number
        channelCount: number
        channelSize: number
        channelRegisters: readonly SimSynthRegister[]
        uploadRegisters: readonly SimSynthRegister[]
        waveforms: readonly string[]
        wavetables: number
        wavetableSize: number
        gate: number
        loop: number
    }
}

export type SimSynthRegister = {
    readonly name: string
    readonly offset: number
    readonly bytes: number
    readonly description: string
}

export const SIM_HEADER_DIRECTORY: string
export const SIM_HEADER_TARGETS: Record<SimHeaderTargetName, SimHeaderTarget>
export function prototypeOf(binding: SimBinding): string
export function syscallDescription(syscall: MarsSyscall): string
export function generateSimHeader(target: SimHeaderTargetName, data: SimHeaderData): string

export type { X86SimHeaderData }

export const X86_SIM_HEADER: { file: 'x86_64'; language: 'x86'; guard: string }
export function x86PrototypeOf(binding: X86SimBinding): string
export function generateX86SimHeader(data: X86SimHeaderData): string
