import type { BuildSources, ProjectFiles } from '$lib/projectFiles'
import { RUNTIME_ENTRY_SYMBOL } from '$lib/runtimeAbi'
import type { X86Project } from '@specy/x86'
import { toX86Project } from './x86Project'
import START_UNIT from './start.asm?raw'
import SUPPORT_UNIT from './support.asm?raw'

/**
 * Where the start code sits beside the Core's Project: under the Runtime library's namespace, so
 * the debugger shows it read-only and Step runs through it as library code
 * ([the plan](../../../../docs/design/x86-compiler-assembly-translation-plan.md), milestone 3a). It
 * is two units because a linker takes a unit whole: a program with a `_start` of its own may still
 * need the string functions, and must not get a second `_start` with them.
 */
export const X86_START_UNIT_PATH = '@runtime/start.asm'
export const X86_SUPPORT_UNIT_PATH = '@runtime/support.asm'

/**
 * The start code of an x86 program compiled from C or C++, until x86 has a Runtime library: it
 * runs the constructors, calls `main`, runs the static destructors and exits with `main`'s result.
 */
export const X86_START_UNIT: string = START_UNIT

/** What GCC's output calls without the program asking, and the destructors `_start` runs. */
export const X86_SUPPORT_UNIT: string = SUPPORT_UNIT

/**
 * The start code as a Build that linked it lends it to the debugger: read-only Files outside the
 * Project and its FileSystem, as the Runtime library's members are.
 */
export const X86_START_UNIT_FILES: ProjectFiles = Object.freeze({
    [X86_START_UNIT_PATH]: Object.freeze({ encoding: 'plain' as const, content: X86_START_UNIT }),
    [X86_SUPPORT_UNIT_PATH]: Object.freeze({
        encoding: 'plain' as const,
        content: X86_SUPPORT_UNIT
    })
})

/**
 * Whether a Build of these sources links the start code: they hold compiled code, which starts at
 * `_start`, and no Runtime library supplies one.
 */
export function linksX86StartUnit(sources: BuildSources): boolean {
    return sources.entrySymbol === RUNTIME_ENTRY_SYMBOL && sources.runtimeAbi === undefined
}

/**
 * The compiled Entry receives an always-linked start object. Support units follow user
 * archive members so secondary user definitions take precedence.
 */
export function x86CoreProject(sources: BuildSources): X86Project {
    const project = toX86Project(sources)
    if (!linksX86StartUnit(sources) && !sources.x86Support) return project
    return { ...project, ...(linksX86StartUnit(sources) ? { startUnits: { [X86_START_UNIT_PATH]: X86_START_UNIT } } : {}),
        library: { [X86_SUPPORT_UNIT_PATH]: X86_SUPPORT_UNIT } }
}
