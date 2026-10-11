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
    /** The sizes the bitmap display offers, and the range GNU-profile Builds give static data. */
    display: {
        sizes: readonly number[]
        units: readonly number[]
        staticData: number
        staticDataEnd: number
    }
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
