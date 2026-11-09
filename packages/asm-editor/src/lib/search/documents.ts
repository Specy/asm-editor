import type { LectureSection } from '#lib/content/lectureSections.ts'
import { plainText, type DocumentationEntry } from '#lib/documentation/entries.ts'
import type { EntryDocument, SectionDocument, WindowDocument } from './payload'

/**
 * What the index holds, built from the Documentation entries and the Lecture sections
 * ([the plan](../../../../../docs/design/documentation-search-plan.md), phase 3). An entry is one search
 * unit for words, with one vector, or more when it is longer than the model reads. A Lecture section
 * is one unit per window of its words: the model reads at most 512 tokens, and a long section read
 * whole would be cut, so it is read in overlapping stretches instead and the search shows it once,
 * at its best stretch.
 */

/** Words in a window, and words two neighbouring windows share. */
export const WINDOW_WORDS = 200
export const WINDOW_OVERLAP = 40

/**
 * Characters of an entry's text one vector reads; the model would cut the rest at 512 tokens
 * anyway. An entry longer than this is read in further windows of about this length.
 */
export const ENTRY_EMBEDDING_CHARACTERS = 1800

/** Characters two neighbouring windows of a long entry share, so a sentence cut by one is whole in the other. */
export const ENTRY_WINDOW_OVERLAP = 200

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
        ...(entry.category ? { category: entry.category } : {}),
        summary: entry.summary,
        text: plainText(entry.searchText),
        ...(entry.detailText ? { detail: plainText(entry.detailText) } : {}),
        code: entry.code ?? '',
        href: entry.href
    }
}

/**
 * What the model reads of an entry, one text per vector. The first reads its Entry questions, then
 * where it is, what it is called and what it says, cut at `ENTRY_EMBEDDING_CHARACTERS`
 * ([ADR 0079](../../../../../docs/adr/0079-entry-questions-are-written-once-and-committed.md)). The
 * text past the cut is read in further windows, each starting with the entry's Chapter and name so
 * that it still says what it is about. An x86 Extensions entry gets no windows: it lists other
 * instructions, and more vectors would only let it compete with their own entries.
 *
 * Not the category, which the words half matches instead, so that a category's name never moves a
 * vector.
 */
export function entryEmbeddingTexts(entry: EntryDocument): string[] {
    const name = entry.signature ? `${entry.title} ${entry.signature}` : entry.title
    const heading = `${entry.chapterTitle}: ${name}.`
    const body = `${heading} ${entry.summary}\n${entry.text}${entry.detail ? `\n${entry.detail}` : ''}`
    const questions = entry.questions?.length ? `${entry.questions.join('\n')}\n` : ''
    const first = (questions + body).slice(0, ENTRY_EMBEDDING_CHARACTERS)
    const read = first.length - questions.length
    if (entry.entryKind === 'extension-group' || read >= body.length) return [first]
    return [first, ...restWindows(body, Math.max(0, read), `${heading}\n`)]
}

/**
 * The text of `body` past `from`, in windows that start with `heading` and fit the model's length,
 * each overlapping the text before it by about `ENTRY_WINDOW_OVERLAP` and cut between words.
 */
function restWindows(body: string, from: number, heading: string): string[] {
    const room = ENTRY_EMBEDDING_CHARACTERS - heading.length
    const out: string[] = []
    let start = wordStart(body, Math.max(0, from - ENTRY_WINDOW_OVERLAP))
    while (start < body.length) {
        let end = Math.min(body.length, start + room)
        if (end < body.length) {
            const space = body.lastIndexOf(' ', end)
            if (space > start + room / 2) end = space
        }
        out.push(heading + body.slice(start, end).trim())
        if (end >= body.length) break
        const next = wordStart(body, end - ENTRY_WINDOW_OVERLAP)
        start = next > start ? next : end
    }
    return out
}

/** The start of the first word at or after `index`. */
function wordStart(text: string, index: number): number {
    if (index <= 0) return 0
    if (/\s/.test(text[index - 1])) return index
    const space = text.slice(index).search(/\s/)
    return space < 0 ? text.length : index + space + 1
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
