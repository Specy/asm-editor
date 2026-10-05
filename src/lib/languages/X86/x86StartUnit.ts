import type { BuildSources, ProjectFiles } from '$lib/projectFiles'
import { RUNTIME_ENTRY_SYMBOL } from '$lib/runtimeAbi'
import { toX86Project, type X86ProjectInput } from './x86Project'
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
 * Whether a Core links a Project as a toolchain links objects and a static library: the Entry's
 * unit always, every other unit only for a symbol the program needs. `@specy/x86` does since 4.0.0,
 * which also takes the library units this offers; an older one links every unit of the Project.
 */
export function x86CoreLinksAsArchive(core: object): boolean {
    return (core as { projectLinking?: unknown }).projectLinking === 'archive'
}

/**
 * The Core's Project for these sources: their Files, and the start code when they ask for it. A
 * Core that links a Project as an archive takes the start code as library units, ahead of the
 * Project's own, so it supplies `_start` to a program without one, and a default Project's
 * `main.asm`, which defines its own, stays out of a Build whose Entry is compiled code. An older
 * Core links every unit, so the start code joins the Files.
 */
export function x86CoreProject(sources: BuildSources, archiveLinking: boolean): X86ProjectInput {
    const project = toX86Project(sources)
    if (!linksX86StartUnit(sources)) return project
    const units = {
        [X86_START_UNIT_PATH]: X86_START_UNIT,
        [X86_SUPPORT_UNIT_PATH]: X86_SUPPORT_UNIT
    }
    return archiveLinking
        ? { ...project, library: units }
        : { ...project, files: { ...project.files, ...units } }
}
