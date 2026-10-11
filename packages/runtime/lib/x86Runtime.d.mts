import type { X86Project } from '@specy/x86'

/** What the x86 link reads of a Runtime library, `generated/<abi>/x86_64.json`. */
export type X86RuntimeLibrary = {
    abi: string
    members: Record<string, string>
    index: Record<string, string>
    resolveWeak?: string[]
}

export function x86RuntimeUnits(
    runtime: X86RuntimeLibrary,
    entrySymbol?: string
): Pick<X86Project, 'startUnits' | 'library'>
