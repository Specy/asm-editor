import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { CURRENT_RUNTIME_ABI, isShippedRuntimeAbi } from '#lib/runtimeAbi.ts'
import { isCompilationTarget, type CompilationTarget } from './records'

/** Header availability shared by Compile and source help; no compiler or Core imports. */
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
    const headerAbi = abi
    const available = isShippedRuntimeAbi(headerAbi)
    const c = available ? [...HOSTED_C_HEADERS, 'sim.h'] : ['sim.h']
    const cpp = available ? [...c, ...HOSTED_CPP_HEADERS] : ['sim.h']
    return Object.freeze({
        target,
        headerAbi,
        runtimeAbi: abi,
        catalogRevision: SOURCE_HELP_REVISION,
        headers: Object.freeze({ c: Object.freeze(c), cpp: Object.freeze(cpp) })
    })
}
