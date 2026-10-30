import type { DocumentationLanguage } from '#lib/search/scope.ts'
import { lazyLoad } from '#lib/lazyLoad.ts'
import type { M68kDialect } from '#lib/languages/M68K/m68kDialect.ts'
import type { Chapter, DocumentationEntry } from './entries'

/**
 * A language's Chapters, loaded on demand: each language's adapter imports its data modules, and
 * the MIPS, RISC-V and Z80 ones import their Core for the instruction text, so nothing loads them
 * until a page or the Documentation panel asks. A load that failed is made again at the next ask.
 */

function chaptersOf(load: () => Promise<{ chapters: () => Chapter[] }>) {
    return lazyLoad(() => load().then((module) => module.chapters()))
}

const m68kModule = lazyLoad(() => import('./m68k/m68k'))

const loaders: Record<DocumentationLanguage, () => Promise<Chapter[]>> = {
    m68k: chaptersOf(m68kModule),
    mips: chaptersOf(() => import('./mips/mips')),
    'risc-v': chaptersOf(() => import('./riscv/riscv')),
    x86: chaptersOf(() => import('./x86/x86')),
    z80: chaptersOf(() => import('./z80/z80'))
}

export function documentationFor(language: DocumentationLanguage): Promise<Chapter[]> {
    return loaders[language]()
}

/** A language's Chapters as one program reads them, and the ids of the entries they leave out. */
export type ProgramDocumentation = { chapters: Chapter[]; hidden: ReadonlySet<string> }

/**
 * The M68K Chapters as the Workbench's Documentation panel shows them to a program written for
 * `dialect`, without what a later processor brought
 * ([m68k-machine.md](../../../../../docs/design/m68k-machine.md), decision 36), loaded on demand
 * as every language's Chapters are.
 */
export function m68kDocumentationFor(dialect: M68kDialect): Promise<ProgramDocumentation> {
    return m68kModule().then((module) => module.chaptersFor(dialect))
}

/** Every entry of a language, Chapter by Chapter. */
export function entriesOf(chapters: Chapter[]): DocumentationEntry[] {
    return chapters.flatMap((chapter) => chapter.entries)
}
