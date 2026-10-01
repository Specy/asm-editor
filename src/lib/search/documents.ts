import type { LectureSection } from '$lib/content/lectureSections'
import { plainText, type DocumentationEntry } from '$lib/documentation/entries'
import type { EntryDocument, SectionDocument, WindowDocument } from './payload'

/**
 * What the index holds, built from the Documentation entries and the Lecture sections
 * ([the plan](../../../docs/design/documentation-search-plan.md), phase 3). An entry is one search
 * unit. A Lecture section is one unit per window of its words: the model reads at most 512 tokens,
 * and a long section read whole would be cut, so it is read in overlapping stretches instead and
 * the search shows it once, at its best stretch.
 */

/** Words in a window, and words two neighbouring windows share. */
export const WINDOW_WORDS = 200
export const WINDOW_OVERLAP = 40

/** Characters of an entry's text the model reads; the rest would be cut at 512 tokens anyway. */
const ENTRY_EMBEDDING_CHARACTERS = 1800

export function entryDocument(entry: DocumentationEntry, chapterTitle: string): EntryDocument {
    return {
        id: entry.id,
        language: entry.language,
        chapter: entry.chapter,
        chapterTitle,
        entryKind: entry.kind,
        title: entry.title,
        ...(entry.codeName === undefined ? {} : { codeName: entry.codeName }),
        names: entry.names,
        signature: entry.signature ?? '',
        summary: entry.summary,
        text: plainText(entry.searchText),
        code: entry.code ?? '',
        href: entry.href
    }
}

/** What the model reads of an entry: where it is, what it is called, and what it says. */
export function entryEmbeddingText(entry: EntryDocument): string {
    const name = entry.signature ? `${entry.title} ${entry.signature}` : entry.title
    const text = `${entry.chapterTitle}: ${name}. ${entry.summary}\n${entry.text}`
    return text.slice(0, ENTRY_EMBEDDING_CHARACTERS)
}

/** Stretches of `WINDOW_WORDS` words, each starting `WINDOW_WORDS - WINDOW_OVERLAP` after the last. */
export function windowsOf(text: string): string[] {
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length <= WINDOW_WORDS + WINDOW_OVERLAP) return words.length ? [words.join(' ')] : []
    const out: string[] = []
    const step = WINDOW_WORDS - WINDOW_OVERLAP
    for (let start = 0; start < words.length; start += step) {
        out.push(words.slice(start, start + WINDOW_WORDS).join(' '))
        if (start + WINDOW_WORDS >= words.length) break
    }
    return out
}

export type LectureRef = {
    course: string
    courseName: string
    module: string
    lecture: string
    lectureName: string
}

/**
 * A Lecture's sections and their windows. A section's words are its prose and the comments of its
 * code: an Example is mostly code, and what its comments say is what a reader searches for.
 */
export function lectureDocuments(
    ref: LectureRef,
    sections: LectureSection[]
): { sections: SectionDocument[]; windows: { section: number; text: string }[] } {
    const path = `${ref.course}/${ref.module}/${ref.lecture}`
    const outSections: SectionDocument[] = []
    const outWindows: { section: number; text: string }[] = []
    for (const section of sections) {
        const title = section.title ?? ref.lectureName
        const index = outSections.length
        outSections.push({
            id: `${path}#${section.slug}`,
            course: ref.course,
            courseName: ref.courseName,
            lectureName: ref.lectureName,
            title,
            href: `/learn/courses/${path}${section.slug ? `#${section.slug}` : ''}`,
            markdown: section.markdown,
            code: section.code
        })
        const words = [section.prose, section.comments].filter(Boolean).join('\n')
        const windows = windowsOf(words)
        // A section that is all code and no comment still has a title worth finding.
        for (const text of windows.length > 0 ? windows : [title]) {
            outWindows.push({ section: index, text })
        }
    }
    return { sections: outSections, windows: outWindows }
}

/** What the model reads of a window: where the section is, and the window's words. */
export function windowEmbeddingText(section: SectionDocument, window: WindowDocument): string {
    return `${section.courseName} › ${section.lectureName} › ${section.title}\n${window.text}`
}
