import type { AvailableLanguages } from '$lib/Project.svelte'
import { CURRENT_RUNTIME_ABI, isShippedRuntimeAbi } from '$lib/runtimeAbi'
import { isCompilationTarget, type CompilationTarget } from './records'

/** Header availability shared by Compile and source help; no compiler or Core imports. */
export const X86_HEADERS = {
    c: [
        'stddef.h',
        'stdint.h',
        'stdbool.h',
        'stdarg.h',
        'limits.h',
        'float.h',
        'iso646.h',
        'stdnoreturn.h'
    ],
    cpp: ['cstddef', 'cstdint', 'climits', 'cfloat', 'cstdarg', 'new']
} as const
export const X86_HEADER_NAMES: ReadonlySet<string> = new Set([
    ...X86_HEADERS.c,
    ...X86_HEADERS.cpp,
    'sim.h'
])
export const HOSTED_C_HEADERS = [
    'assert.h',
    'ctype.h',
    'errno.h',
    'float.h',
    'inttypes.h',
    'iso646.h',
    'limits.h',
    'math.h',
    'stdarg.h',
    'stdbool.h',
    'stddef.h',
    'stdint.h',
    'stdio.h',
    'stdlib.h',
    'stdnoreturn.h',
    'string.h',
    'time.h'
] as const
export const HOSTED_CPP_HEADERS = [
    'cassert',
    'cctype',
    'cerrno',
    'cfloat',
    'cinttypes',
    'climits',
    'cmath',
    'cstdarg',
    'cstddef',
    'cstdint',
    'cstdio',
    'cstdlib',
    'cstring',
    'ctime',
    'new'
] as const
export const SOURCE_HELP_REVISION = 1

export type CompilerCapabilities = Readonly<{
    target: CompilationTarget
    headerAbi: string
    runtimeAbi?: string
    catalogRevision: number
    headers: Readonly<{ c: readonly string[]; cpp: readonly string[] }>
}>

export function compilerCapabilities(
    target: AvailableLanguages,
    abi: string = CURRENT_RUNTIME_ABI
): CompilerCapabilities | undefined {
    if (!isCompilationTarget(target)) return undefined
    const hosted = target !== 'X86'
    const headerAbi = hosted ? abi : CURRENT_RUNTIME_ABI
    const available = isShippedRuntimeAbi(headerAbi)
    const c = available ? [...(hosted ? HOSTED_C_HEADERS : X86_HEADERS.c), 'sim.h'] : ['sim.h']
    const cpp = available ? [...c, ...(hosted ? HOSTED_CPP_HEADERS : X86_HEADERS.cpp)] : ['sim.h']
    return Object.freeze({
        target,
        headerAbi,
        ...(hosted ? { runtimeAbi: abi } : {}),
        catalogRevision: SOURCE_HELP_REVISION,
        headers: Object.freeze({ c: Object.freeze(c), cpp: Object.freeze(cpp) })
    })
}
