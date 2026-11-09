import { describe, expect, it } from 'vite-plus/test'
import { ENTRY_EMBEDDING_CHARACTERS, ENTRY_WINDOW_OVERLAP, entryEmbeddingTexts } from './documents'
import type { EntryDocument } from './payload'

function entry(text: string, extra: Partial<EntryDocument> = {}): EntryDocument {
    return {
        id: 'm68k/trap-tasks/task-3',
        language: 'm68k',
        chapter: 'trap-tasks',
        chapterTitle: 'Trap tasks',
        entryKind: 'trap-task',
        title: 'Task 3',
        names: ['3'],
        signature: '',
        summary: 'Displays the signed number in D1.L.',
        text,
        code: '',
        href: '/documentation/m68k/trap-tasks#task-3',
        ...extra
    }
}

/** Sentences numbered so that each is found again: "Sentence 12 says something." */
function sentences(count: number): string {
    return Array.from({ length: count }, (_, i) => `Sentence ${i} says something.`).join(' ')
}

describe("an entry's embedding texts", () => {
    it('reads a short entry in one text, as it always did', () => {
        expect(entryEmbeddingTexts(entry('Short.'))).toEqual([
            'Trap tasks: Task 3. Displays the signed number in D1.L.\nShort.'
        ])
    })

    it('reads its Entry questions first', () => {
        const [first] = entryEmbeddingTexts(
            entry('Short.', { questions: ['How do I print a number?', 'Why is it negative?'] })
        )
        expect(first.startsWith('How do I print a number?\nWhy is it negative?\nTrap tasks:')).toBe(
            true
        )
    })

    it('reads a long entry in windows that start with its Chapter and name and cover all of it', () => {
        const text = sentences(300)
        const texts = entryEmbeddingTexts(entry(text))
        expect(texts.length).toBeGreaterThan(2)
        for (const window of texts)
            expect(window.length).toBeLessThanOrEqual(ENTRY_EMBEDDING_CHARACTERS)
        for (const window of texts.slice(1))
            expect(window.startsWith('Trap tasks: Task 3.\n')).toBe(true)
        expect(texts.at(-1)!.endsWith('Sentence 299 says something.')).toBe(true)
        // each window starts within the overlap before where the last one ended, at a word
        for (let i = 1; i < texts.length; i++) {
            const start = texts[i].slice(
                'Trap tasks: Task 3.\n'.length,
                40 + 'Trap tasks: Task 3.\n'.length
            )
            const previous = texts[i - 1]
            const at = previous.indexOf(start)
            expect(at, start).toBeGreaterThan(0)
            expect(previous.length - at).toBeLessThanOrEqual(ENTRY_WINDOW_OVERLAP + 40)
        }
    })

    it('reads in a further window the text its questions left no room for', () => {
        const questions = ['How do I print a number?', 'Why is it negative?', 'What is task 3?']
        const text = sentences(61)
        const without = entryEmbeddingTexts(entry(text))
        const texts = entryEmbeddingTexts(entry(text, { questions }))
        expect(without).toHaveLength(1)
        expect(texts).toHaveLength(2)
        expect(texts[0].length).toBe(ENTRY_EMBEDDING_CHARACTERS)
        expect(texts[1].startsWith('Trap tasks: Task 3.\n')).toBe(true)
        expect(texts[1].endsWith('Sentence 60 says something.')).toBe(true)
    })

    it('gives an x86 Extensions entry no windows', () => {
        const texts = entryEmbeddingTexts(entry(sentences(300), { entryKind: 'extension-group' }))
        expect(texts).toHaveLength(1)
    })
})
