import { LANGUAGE_THEMES } from '#lib/Config.ts'
import type { DocumentationLanguage } from '#lib/search/scope.ts'

/** A page the documentation site's sidebar and hub link to. */
export type DocumentationPage = { id: string; title: string; href: string }

export type DocumentationSite = {
    /** The language's name on its pages. */
    label: string
    /** The built-in theme its pages wear. */
    theme: string
    /** Its **Chapters**, in their order, then the complete documentation. */
    pages: DocumentationPage[]
}

/**
 * Each language's part of the documentation site, read by its layout and its hub page. Its pages
 * are its Chapters' ids, titles and hrefs, copied rather than read because a layout must not load
 * the Chapters, whose data modules bring in the Core for MIPS, RISC-V and Z80. The Chapters stay
 * the source ([ADR 0025](../../../../../docs/adr/0025-documentation-is-a-list-of-entries.md)), and
 * `documentation.test.ts` checks that the two agree.
 */
export const DOCUMENTATION_SITES: Record<DocumentationLanguage, DocumentationSite> = {
    m68k: site('m68k', 'M68K', LANGUAGE_THEMES.M68K, [
        ['instructions', 'Instructions', 'instruction'],
        ['addressing-modes', 'Addressing modes', 'addressing-mode'],
        ['condition-codes', 'Condition codes', 'condition-codes'],
        ['shift-directions', 'Shift directions', 'shift-direction'],
        ['trap-tasks', 'Trap tasks', 'traps'],
        ['synth', 'Synth', 'synth'],
        ['exceptions', 'Exceptions', 'exceptions'],
        ['directives', 'Directives', 'directive'],
        ['assembler-features', 'Assembler features', 'assembler-features']
    ]),
    mips: site('mips', 'MIPS', LANGUAGE_THEMES.MIPS, [
        ['instructions', 'Instructions', 'instruction'],
        ['directives', 'Directives', 'directive'],
        ['syscalls', 'Syscalls', 'syscall'],
        ['registers', 'Registers', 'registers'],
        ['screen', 'Screen', 'screen'],
        ['synth', 'Synth', 'synth'],
        ['runtime-library', 'Runtime library', 'runtime-library'],
        ['using-c', 'Using C and C++', 'using-c']
    ]),
    'risc-v': site('risc-v', 'RISC-V', LANGUAGE_THEMES['RISC-V'], [
        ['instructions', 'Instructions', 'instruction'],
        ['directives', 'Directives', 'directive'],
        ['syscalls', 'Syscalls', 'syscall'],
        ['registers', 'Registers', 'registers'],
        ['screen', 'Screen', 'screen'],
        ['synth', 'Synth', 'synth'],
        ['runtime-library', 'Runtime library', 'runtime-library'],
        ['using-c', 'Using C and C++', 'using-c']
    ]),
    x86: site('x86', 'x86-64', LANGUAGE_THEMES.X86, [
        ['instructions', 'Instructions', 'instruction'],
        ['extensions', 'Extensions', 'extensions'],
        ['directives', 'Directives', 'directive'],
        ['registers-and-flags', 'Registers & flags', 'registers'],
        ['vector-instructions', 'Vector instructions', 'vector-instructions'],
        ['syscalls', 'Syscalls', 'syscall'],
        ['using-c', 'Using C and C++', 'using-c'],
        ['runtime-library', 'Runtime library', 'runtime-library'],
        ['executables', 'Executables', 'executables']
    ]),
    z80: site('z80', 'Z80', LANGUAGE_THEMES.Z80, [
        ['instructions', 'Instructions', 'instruction'],
        ['directives', 'Directives', 'directive'],
        ['registers-and-flags', 'Registers & Flags', 'registers'],
        ['input-output', 'Input/Output', 'io']
    ])
}

/** A site from its Chapters as [id, title, path under the language's documentation]. */
function site(
    language: DocumentationLanguage,
    label: string,
    theme: string,
    chapters: [id: string, title: string, path: string][]
): DocumentationSite {
    return {
        label,
        theme,
        pages: [...chapters, ['all', 'Complete documentation', 'all']].map(([id, title, path]) => ({
            id,
            title,
            href: `/documentation/${language}/${path}`
        }))
    }
}
