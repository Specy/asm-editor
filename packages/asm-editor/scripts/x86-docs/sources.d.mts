/**
 * Types for the parts of `sources.mjs` the editor's tests import. TypeScript reads this file in
 * place of `sources.mjs`, which is plain JavaScript written for Node, so a test that needs anything
 * else from it declares that here first.
 */

export const projectRoot: string
export const blinkRoot: string
/** A syscall as `x86Syscalls.ts` lists it. */
export type BlinkSyscall = {
    number: number
    name: string
    arity: number
    args: string[]
    blocking: boolean
}

export type ImplementedBlinkSyscall = { number: number; name: string; arity: number }

export function parseBlinkSyscalls(
    sources: { syscall: string; strace: string },
    implemented: readonly ImplementedBlinkSyscall[]
): BlinkSyscall[]

export function readBlinkSyscalls(): Promise<BlinkSyscall[]>
