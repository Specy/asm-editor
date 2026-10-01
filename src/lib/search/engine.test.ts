import { describe, expect, it } from 'vitest'
import { excerpt, queryTerms, SearchEngine } from './engine'
import { VECTOR_DIMS } from './model'
import { createPayload, type EntryDocument, type SectionDocument } from './payload'
import { languageScope } from './scope'

function entry(name: string, summary: string, extra: Partial<EntryDocument> = {}): EntryDocument {
    return {
        id: `m68k/instructions/${name}`,
        language: 'm68k',
        chapter: 'instructions',
        chapterTitle: 'Instructions',
        entryKind: 'instruction',
        title: name.toUpperCase(),
        names: [name],
        signature: '',
        summary,
        text: summary,
        code: '',
        href: `/documentation/m68k/instruction/${name}`,
        ...extra
    }
}

function section(title: string, markdown: string): SectionDocument {
    return {
        id: `m68k/think-in-assembly/loops#${title.toLowerCase().replace(/ /g, '-')}`,
        course: 'm68k',
        courseName: 'M68K',
        lectureName: 'Loops',
        title,
        href: '/learn/courses/m68k/think-in-assembly/loops',
        markdown,
        code: ''
    }
}

/** A unit vector along one axis, so that similarity is 1 on the same axis and 0 elsewhere. */
function axis(index: number): Float32Array {
    const vector = new Float32Array(VECTOR_DIMS)
    vector[index] = 1
    return vector
}

async function engineWith() {
    const engine = SearchEngine.create()
    const entries = [
        entry('move', 'Copies the source operand to the destination.'),
        entry('movea', 'Copies a value into an address register; it moves addresses.'),
        entry('dbra', 'Decrements a register and branches until it reaches -1.'),
        entry('data', 'A made-up entry that mentions move several times: move move move.', {
            names: ['.data']
        })
    ]
    const sections = [
        section('Counting loops', 'Use dbra to count down and loop a fixed number of times.')
    ]
    const windows = [
        { section: 0, text: 'Use dbra to count down and loop a fixed number of times.' },
        { section: 0, text: 'A second stretch of the same section about loops and counters.' }
    ]
    await engine.add(
        createPayload(
            { shard: 'docs-m68k', entries, sections: [], windows: [] },
            [axis(0), axis(1), axis(2), axis(3)],
            'test'
        )
    )
    await engine.add(
        createPayload(
            { shard: 'lectures-m68k', entries: [], sections, windows },
            [axis(2), axis(2)],
            'test'
        )
    )
    return engine
}

describe('SearchEngine', () => {
    it('puts the entry named exactly what was typed first', async () => {
        const engine = await engineWith()
        const results = await engine.search('MOVE', { scope: languageScope('m68k') })
        expect(results[0]).toMatchObject({ kind: 'entry', exact: true })
        expect(results[0].kind === 'entry' && results[0].entry.names).toEqual(['move'])
    })

    it('matches a directive with or without its dot, and a size suffix', async () => {
        const engine = await engineWith()
        const dotless = await engine.search('data', { scope: languageScope('m68k') })
        expect(dotless[0]).toMatchObject({ exact: true })
        const sized = await engine.search('move.l', { scope: languageScope('m68k') })
        expect(sized[0].kind === 'entry' && sized[0].entry.names).toEqual(['move'])
    })

    it('matches a syscall name and kind ahead of semantic near matches', async () => {
        const engine = SearchEngine.create()
        const entries = [
            entry('write', 'Writes bytes to a file descriptor.', {
                id: 'x86/syscalls/syscall-write',
                language: 'x86',
                chapter: 'syscalls',
                chapterTitle: 'Syscalls',
                entryKind: 'syscall',
                names: ['write', 'syscall 1']
            }),
            entry('writev', 'Writes buffers to a file descriptor.', {
                id: 'x86/syscalls/syscall-writev',
                language: 'x86',
                chapter: 'syscalls',
                chapterTitle: 'Syscalls',
                entryKind: 'syscall',
                names: ['writev', 'syscall 20']
            }),
            entry('syscall', 'Invokes a syscall, such as write.', {
                id: 'x86/instructions/syscall',
                language: 'x86'
            })
        ]
        await engine.add(
            createPayload(
                { shard: 'docs-x86', entries, sections: [], windows: [] },
                [axis(1), axis(0), axis(0)],
                'test'
            )
        )
        for (const vector of [axis(0), null]) {
            for (const query of ['write syscall', 'syscall write', 'syscall 1']) {
                const results = await engine.search(query, {
                    scope: languageScope('x86', false),
                    vector
                })
                expect(results[0], query).toMatchObject({
                    kind: 'entry',
                    exact: true,
                    entry: { id: 'x86/syscalls/syscall-write' }
                })
            }
        }
    })

    it('shows a Lecture section once, however many windows match', async () => {
        const engine = await engineWith()
        const results = await engine.search('loops', { scope: languageScope('m68k') })
        expect(results.filter((result) => result.kind === 'section')).toHaveLength(1)
    })

    it('never returns a Lecture section in an Exam', async () => {
        const engine = await engineWith()
        const results = await engine.search('loop dbra', { scope: languageScope('m68k', false) })
        expect(results.length).toBeGreaterThan(0)
        expect(results.every((result) => result.kind === 'entry')).toBe(true)
    })

    it('ranks by meaning when given a query vector', async () => {
        const engine = await engineWith()
        const results = await engine.search('repeat a few times', {
            scope: languageScope('m68k'),
            vector: axis(2)
        })
        const top = results.slice(0, 2).map((result) => result.kind)
        expect(top).toContain('section')
        expect(results[0].kind === 'entry' ? results[0].entry.names : ['section']).not.toEqual([
            'move'
        ])
    })

    it('knows which scopes it covers and which have vectors', async () => {
        const engine = await engineWith()
        expect(engine.covers(languageScope('m68k', false))).toBe(true)
        expect(engine.covers(languageScope('m68k'))).toBe(false)
        expect(engine.hasVectors(languageScope('m68k'))).toBe(true)
    })
})

describe('excerpts', () => {
    it('keeps short text whole and centres long text on the first query word', () => {
        expect(excerpt('Short text.', ['text'])).toBe('Short text.')
        const long = `${'filler words here '.repeat(30)}the stack grows downward ${'more '.repeat(40)}`
        const cut = excerpt(long, queryTerms('stack'))
        expect(cut).toContain('stack grows downward')
        expect(cut.startsWith('…')).toBe(true)
    })

    it('keeps the words of a query that are worth highlighting', () => {
        expect(queryTerms('How do I print a number?')).toEqual(['number', 'print'])
        expect(queryTerms('.data')).toEqual(['data'])
    })
})
