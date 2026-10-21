import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { executableKind } from '#lib/executables.ts'
import type { ProjectFile } from '#lib/projectFiles.ts'

/**
 * The assembly extensions a Project's first Program makes itself from
 * ([programs.md](../../../../../docs/design/programs.md), decision 8): every Target's, but not
 * `.inc`, which names a File meant to be included, nor no extension at all, although the editor
 * shows both as assembly.
 */
const PROGRAM_EXTENSIONS = new Set(['s', 'asm', 'mips', 'riscv', 'm68k', 'z80'])

/**
 * Whether a File a host action added, or renamed, can be the Entry of the first Program of a
 * Project that has none: assembly by its extension, or in an x86 Project a supported Executable.
 * C and C++ source never is, since Compile makes its Program (decision 9), and neither is a File
 * stored as bytes under an assembly name.
 */
export function startsProgram(
    path: string,
    file: ProjectFile | undefined,
    language: AvailableLanguages
): boolean {
    if (language === 'X86' && executableKind(file) === 'supported') return true
    if (file && file.encoding !== 'plain') return false
    const name = path.slice(path.lastIndexOf('/') + 1)
    const dot = name.lastIndexOf('.')
    return dot > 0 && PROGRAM_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

/**
 * The File that one host action's Files make the first Program from: of those that qualify, the
 * one named `main.<ext>`, else the only one, else none, since taking one of `bubble.s` and
 * `quick.s` would be a guess (decision 8).
 */
export function firstProgramEntry(
    paths: readonly string[],
    qualifies: (path: string) => boolean
): string | undefined {
    const qualifying = [...new Set(paths)].filter(qualifies)
    const main = qualifying.filter((path) =>
        /^main\.[^.]+$/.test(path.slice(path.lastIndexOf('/') + 1))
    )
    if (main.length === 1) return main[0]
    return qualifying.length === 1 ? qualifying[0] : undefined
}
