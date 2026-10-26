import type { DocumentationLanguage } from '#lib/search/scope.ts'
import { lazyLoad } from '#lib/lazyLoad.ts'
import type { Chapter, DocumentationEntry } from './entries'

/**
 * A language's Chapters, loaded on demand: each language's adapter imports its data modules, and
 * the MIPS, RISC-V and Z80 ones import their Core for the instruction text, so nothing loads them
 * until a page or the Documentation panel asks. A load that failed is made again at the next ask.
 */

function chaptersOf(load: () => Promise<{ chapters: () => Chapter[] }>) {
    return lazyLoad(() => load().then((module) => module.chapters()))
}

const loaders: Record<DocumentationLanguage, () => Promise<Chapter[]>> = {
    m68k: chaptersOf(() => import('./m68k/m68k')),
    mips: chaptersOf(() => import('./mips/mips')),
    'risc-v': chaptersOf(() => import('./riscv/riscv')),
    x86: chaptersOf(() => import('./x86/x86')),
    z80: chaptersOf(() => import('./z80/z80'))
}

export function documentationFor(language: DocumentationLanguage): Promise<Chapter[]> {
    return loaders[language]()
}

/** Every entry of a language, Chapter by Chapter. */
export function entriesOf(chapters: Chapter[]): DocumentationEntry[] {
    return chapters.flatMap((chapter) => chapter.entries)
}
