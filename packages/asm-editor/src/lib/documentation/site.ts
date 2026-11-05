import { LANGUAGE_THEMES } from '#lib/Config.ts'
import type { DocumentationLanguage } from '#lib/search/scope.ts'
import documentationIntro from './intros/documentation.md?raw'
import mipsIntro from './intros/mips.md?raw'
import riscvIntro from './intros/risc-v.md?raw'
import x86Intro from './intros/x86.md?raw'
import z80Intro from './intros/z80.md?raw'

/**
 * The opening of `/documentation`, and of each language's hub where it has one: markdown that the
 * pages and their **Markdown twins** both render
 * ([ADR 0077](../../../../../docs/adr/0077-agents-read-markdown-twins-derived-from-the-pages-sources.md)).
 */
export const DOCUMENTATION_INTRO: string = documentationIntro

export const DOCUMENTATION_INTROS: Partial<Record<DocumentationLanguage, string>> = {
    mips: mipsIntro,
    'risc-v': riscvIntro,
    x86: x86Intro,
    z80: z80Intro
}

/**
 * What each language is and what its reference covers, in a sentence or two: the `/documentation`
 * hub is the one page that tells the five apart, and `/llms.txt` describes them with the same words.
 */
export const DOCUMENTATION_ABOUT: Record<DocumentationLanguage, string> = {
    m68k: 'The Motorola 68000, with eight data registers and eight address registers. Covers instructions, addressing modes, condition codes, directives and trap tasks for input, output and graphics.',
    mips: 'MIPS assembly for the MARS simulator. Covers instructions and pseudo-instructions, directives, registers, syscalls, screen and keyboard access, and using C and C++.',
    'risc-v':
        'RV32 and RV64 assembly for the RARS simulator. Covers instructions, directives, registers, syscalls, screen and keyboard access, and using C and C++.',
    x86: 'x86-64 assembly in NASM syntax, running as a Linux program. Covers instructions, vector extensions, directives, registers and flags, Linux syscalls, and using C and C++.',
    z80: 'The Zilog Z80, an 8 bit CPU with 64 KB of memory. Covers instructions, flags, cycle counts, directives, registers and I/O ports for the terminal, screen, keyboard, mouse and sound.'
}

/** A short markdown text's paragraphs, for a page that sets each in its own `<p>`. */
export function markdownParagraphs(markdown: string): string[] {
    return markdown
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean)
}

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
 * are its Chapters' ids, titles and hrefs, copied rather than read because the Chapters carry the
 * language's whole Documentation (its prose, tables and instruction content), which every
 * documentation page would then load. The Chapters stay the source
 * ([ADR 0025](../../../../../docs/adr/0025-documentation-is-a-list-of-entries.md)), and
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
        ['interrupts', 'Interrupts and the timer', 'interrupts'],
        ['synth', 'Synth', 'synth'],
        ['input-controller', 'Input controller', 'input-controller'],
        ['midi-and-audio', 'MIDI and sampled audio', 'midi-and-audio'],
        ['runtime-library', 'Runtime library', 'runtime-library'],
        ['using-c', 'Using C and C++', 'using-c']
    ]),
    'risc-v': site('risc-v', 'RISC-V', LANGUAGE_THEMES['RISC-V'], [
        ['instructions', 'Instructions', 'instruction'],
        ['directives', 'Directives', 'directive'],
        ['syscalls', 'Syscalls', 'syscall'],
        ['registers', 'Registers', 'registers'],
        ['screen', 'Screen', 'screen'],
        ['interrupts', 'Interrupts and the timer', 'interrupts'],
        ['synth', 'Synth', 'synth'],
        ['input-controller', 'Input controller', 'input-controller'],
        ['midi-and-audio', 'MIDI and sampled audio', 'midi-and-audio'],
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
        ['screen', 'The Screen', 'screen'],
        ['input', 'Keys and the pointer', 'input'],
        ['sound', 'Sound', 'sound'],
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
