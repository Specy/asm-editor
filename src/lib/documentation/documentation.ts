import type { DocumentationLanguage } from '$lib/search/scope'
import type { Chapter, DocumentationEntry } from './entries'

/**
 * A language's Chapters, loaded on demand: each language's adapter imports its data modules, and
 * the MIPS, RISC-V and Z80 ones import their Core for the instruction text, so nothing loads them
 * until a page or the Documentation panel asks.
 */

const loaders: Record<DocumentationLanguage, () => Promise<{ chapters: () => Chapter[] }>> = {
    m68k: () => import('./m68k/m68k'),
    mips: () => import('./mips/mips'),
    'risc-v': () => import('./riscv/riscv'),
    x86: () => import('./x86/x86'),
    z80: () => import('./z80/z80')
}

const loaded = new Map<DocumentationLanguage, Promise<Chapter[]>>()

export function documentationFor(language: DocumentationLanguage): Promise<Chapter[]> {
    let chapters = loaded.get(language)
    if (!chapters) {
        chapters = loaders[language]().then((module) => module.chapters())
        loaded.set(language, chapters)
    }
    return chapters
}

/** Every entry of a language, Chapter by Chapter. */
export function entriesOf(chapters: Chapter[]): DocumentationEntry[] {
    return chapters.flatMap((chapter) => chapter.entries)
}
