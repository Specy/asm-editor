import type { X86Project } from '@specy/x86'
import type { RuntimeLibraryData } from './runtimeLibrary'
export function x86RuntimeUnits(
    runtime: RuntimeLibraryData,
    entrySymbol?: string
): Pick<X86Project, 'startUnits' | 'library'>
