import { describe, expect, it } from 'vite-plus/test'
import { excerpt, prepareSearch, RANKING, SearchEngine, type SearchResult } from './engine'
import { queryTerms } from './queryTerms'
import { VECTOR_DIMS } from './model'
import { createPayload, type EntryDocument, type SectionDocument } from './payload'
import type { QueryModifiers } from './queryModifiers'
import { languageScope, SITE_SCOPE } from './scope'

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

/**
 * A unit vector spread evenly over 16 dimensions, the `index`th 16: a shard stores each value as
 * int8 within ±0.3, so a vector of any similarity to another needs its length spread out.
 */
function block(index: number): Float32Array {
    const vector = new Float32Array(VECTOR_DIMS)
    vector.fill(0.25, index * 16, index * 16 + 16)
    return vector
}

/** A unit vector whose similarity to `block(0)` is `cosine`, leaning towards `block(side)`. */
function toward(cosine: number, side = 1): Float32Array {
    const along = block(0)
    const away = block(side)
    return along.map((value, i) => cosine * value + Math.sqrt(1 - cosine * cosine) * away[i])
}

const idOf = (result: SearchResult) =>
    result.kind === 'entry' ? result.entry.id : result.section.id

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
    it('finds a word only an authored description has, below the same word in the text', async () => {
        const engine = SearchEngine.create()
        const entries = [
            entry('lw', 'Loads a word.', { detail: 'The address must be aligned to four bytes.' }),
            entry('lwa', 'Loads a word from an aligned address.')
        ]
        await engine.add(
            createPayload(
                { shard: 'docs-m68k', entries, sections: [], windows: [] },
                [axis(0), axis(1)],
                'test'
            )
        )
        const results = await engine.search('aligned', {
            scope: languageScope('m68k'),
            vector: null,
            limit: 5
        })
        const ids = results.map((result) => (result.kind === 'entry' ? result.entry.id : ''))
        expect(ids).toEqual(['m68k/instructions/lwa', 'm68k/instructions/lw'])
    })

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

    it("finds an instruction by its category's name, which its text never says", async () => {
        const engine = SearchEngine.create()
        const entries = [
            entry('asl', 'Moves every bit left.', { category: 'shifts-and-rotates' }),
            entry('move', 'Copies the source operand to the destination.', {
                category: 'data-movement'
            })
        ]
        await engine.add(
            createPayload({ shard: 'docs-m68k', entries, sections: [], windows: [] }, null, null)
        )
        const results = await engine.search('shifts', { scope: languageScope('m68k', false) })
        expect(results.map((result) => result.kind === 'entry' && result.entry.id)).toEqual([
            'm68k/instructions/asl'
        ])
    })

    it('knows which scopes it covers and which have vectors', async () => {
        const engine = await engineWith()
        expect(engine.covers(languageScope('m68k', false))).toBe(true)
        expect(engine.covers(languageScope('m68k'))).toBe(false)
        expect(engine.hasVectors(languageScope('m68k'))).toBe(true)
    })
})

describe('the statistics of a scope', () => {
    const docs = createPayload(
        {
            shard: 'docs-m68k',
            entries: [
                entry('clr', 'Clears a register or a byte of memory to zero.'),
                entry('dbra', 'Decrements a register and branches until it reaches -1.'),
                entry('move', 'Copies the source operand to the destination.')
            ],
            sections: [],
            windows: []
        },
        null,
        null
    )
    const lectures = createPayload(
        {
            shard: 'lectures-m68k',
            entries: [],
            sections: [section('Registers', 'A register holds a value.')],
            windows: [{ section: 0, text: 'A register holds a value, and a register is fast.' }]
        },
        null,
        null
    )
    // another language's Documentation, which says "register" on every page
    const mips = createPayload(
        {
            shard: 'docs-mips',
            entries: ['add', 'sub', 'and', 'or'].map((name) =>
                entry(name, `Puts the result in a register; register in, register out.`, {
                    id: `mips/instructions/${name}`,
                    language: 'mips'
                })
            ),
            sections: [],
            windows: []
        },
        null,
        null
    )
    const ranked = async (engine: SearchEngine, lectures = true) =>
        (await engine.search('clears a register', { scope: languageScope('m68k', lectures) })).map(
            (result) => [idOf(result), result.score] as const
        )

    it('scores a scope the same whatever else is loaded, in any order', async () => {
        const own = SearchEngine.create()
        for (const payload of [docs, lectures]) await own.add(payload)
        const everything = SearchEngine.create()
        for (const payload of [mips, lectures, docs]) await everything.add(payload)
        expect(await ranked(everything)).toEqual(await ranked(own))
        expect(await ranked(everything, false)).toEqual(await ranked(own, false))
    })

    it("scores each shard with its scope's statistics, not its own", async () => {
        const engine = SearchEngine.create()
        for (const payload of [docs, lectures]) await engine.add(payload)
        // the Lectures' units count in the Documentation's statistics, so without them, in an
        // Exam, the same entry scores otherwise
        const clr = async (lectures: boolean) =>
            new Map(await ranked(engine, lectures)).get('m68k/instructions/clr')
        expect(await clr(false)).toBeGreaterThan(0)
        expect(await clr(true)).toBeGreaterThan(0)
        expect(await clr(false)).not.toBe(await clr(true))
    })
})

describe('fusing the two halves on fixed scales', () => {
    const scope = languageScope('m68k', false)

    async function engineOf(entries: EntryDocument[], vectors: Float32Array[]) {
        const engine = SearchEngine.create()
        await engine.add(
            createPayload(
                { shard: 'docs-m68k', entries, sections: [], windows: [] },
                vectors,
                'test'
            )
        )
        return engine
    }

    it('keeps a result that only one half finds', async () => {
        const engine = await engineOf(
            [
                entry('alpha', 'Counts the zebras in a register.'),
                entry('beta', 'Nothing in common with the question.')
            ],
            [block(1), block(0)]
        )
        const ids = (await engine.search('zebras', { scope, vector: block(0) })).map(idOf)
        expect(ids.sort()).toEqual(['m68k/instructions/alpha', 'm68k/instructions/beta'])
    })

    it('keeps a weak best match weak, below a strong match by meaning', async () => {
        // Orama's hybrid mode divided each half by its best score, so the only, weak, match by
        // words (one word in the code) counted as much as a perfect one
        const engine = await engineOf(
            [
                entry('alpha', 'Copies a value.', { code: 'zebra' }),
                entry('beta', 'Says nothing of the word.')
            ],
            [block(1), toward(0.5)]
        )
        const results = await engine.search('zebra', { scope, vector: block(0) })
        expect(results.map(idOf)).toEqual(['m68k/instructions/beta', 'm68k/instructions/alpha'])
    })

    it('scores by words on a fixed scale, a weak best match far below a strong one', async () => {
        const fillers = Array.from({ length: 30 }, (_, i) =>
            entry(`filler${i}`, `Copies value number ${i} somewhere else.`)
        )
        const engine = await engineOf(
            [
                ...fillers,
                entry('zebra', 'Zebra: the zebra instruction counts zebras.'),
                entry('alpha', 'Copies a value.', { code: 'quagga' })
            ],
            fillers.map(() => block(2)).concat([block(2), block(2)])
        )
        const [strong] = await engine.search('zebras', { scope, vector: null })
        const [weak] = await engine.search('quagga', { scope, vector: null })
        expect(strong.score).toBeLessThan(1)
        expect(weak.score).toBeLessThan(strong.score / 3)
    })

    /** A plain entry and one whose kind is multiplied, the same words, and their similarities. */
    async function pair(weighted: Partial<EntryDocument>, cosines: [number, number]) {
        return engineOf(
            [
                entry('plain', 'Counts down a register and loops until it is zero.'),
                entry('other', 'Counts down a register and loops until it is zero.', weighted)
            ],
            [toward(cosines[0], 1), toward(cosines[1], 2)]
        )
    }

    const weightedKinds: [string, Partial<EntryDocument>, number][] = [
        ['an x86 Extensions entry', { entryKind: 'extension-group' }, RANKING.extensionGroupWeight],
        ['a Runtime library function', { entryKind: 'function' }, RANKING.runtimeFunctionWeight]
    ]

    it.each(weightedKinds)(
        'lets the weight of %s break a near tie, and not lift a weak plain entry over it',
        async (_, kind, weight) => {
            const question = 'count down until zero'
            const tie = await pair(kind, [0.45, 0.5])
            const tied = await tie.search(question, { scope, vector: block(0) })
            expect(tied.map(idOf)).toEqual(['m68k/instructions/plain', 'm68k/instructions/other'])

            const strong = await pair(kind, [0.2, 0.2 / weight + 0.2])
            const results = await strong.search(question, { scope, vector: block(0) })
            expect(results.map(idOf)).toEqual([
                'm68k/instructions/other',
                'm68k/instructions/plain'
            ])
        }
    )

    /** An entry and a Lecture section that match a question by meaning alone, as similar as given. */
    async function entryAndSection(cosines: [number, number]) {
        const engine = SearchEngine.create()
        const entries = [entry('plain', 'Counts down a register.')]
        await engine.add(
            createPayload(
                { shard: 'docs-m68k', entries, sections: [], windows: [] },
                [toward(cosines[0], 1)],
                'test'
            )
        )
        const text = 'Counts down a register.'
        await engine.add(
            createPayload(
                {
                    shard: 'lectures-m68k',
                    entries: [],
                    sections: [section('Counting', text)],
                    windows: [{ section: 0, text }]
                },
                [toward(cosines[1], 2)],
                'test'
            )
        )
        return engine.search('repeat a few times', {
            scope: languageScope('m68k'),
            vector: block(0)
        })
    }

    it('lets the weight of a Lecture section break a near tie, not hide a far better one', async () => {
        const tied = await entryAndSection([0.45, 0.5])
        expect(tied.map((result) => result.kind)).toEqual(['entry', 'section'])
        expect(tied[1].score / tied[0].score).toBeCloseTo((0.5 / 0.45) * RANKING.sectionWeight, 1)

        const better = await entryAndSection([0.3, 0.6])
        expect(better.map((result) => result.kind)).toEqual(['section', 'entry'])
    })
})

describe('the weights of the two halves', () => {
    async function engineWithNames() {
        const engine = SearchEngine.create()
        const entries = [
            entry('move', 'Copies a value.'),
            entry('dbra', 'Loops.'),
            entry('stop', 'Stops the processor.')
        ]
        await engine.add(
            createPayload(
                { shard: 'docs-m68k', entries, sections: [], windows: [], wordLikeNames: ['stop'] },
                null,
                null
            )
        )
        await engine.add(
            createPayload(
                {
                    shard: 'docs-mips',
                    entries: [entry('syscall', 'Calls a service.', { id: 'mips/x/syscall' })],
                    sections: [],
                    windows: []
                },
                null,
                null
            )
        )
        return engine
    }

    it('leans on words for names and code, on meaning for words, in proportion between', async () => {
        const engine = await engineWithNames()
        const m68k = languageScope('m68k')
        const wordsWeight = (query: string, scope = m68k) =>
            Number(engine.weightsOf(query, scope).words.toFixed(3))
        // a single word, name or not
        expect(wordsWeight('move')).toBe(0.7)
        expect(wordsWeight('print')).toBe(0.7)
        // names, numbers and code
        expect(wordsWeight('move dbra')).toBe(0.7)
        expect(wordsWeight('move.l $t0 #1 42')).toBe(0.7)
        // words only
        expect(wordsWeight('print integer')).toBe(0.35)
        // half and half, stop words left out
        expect(wordsWeight('how do I move the integer?')).toBe(0.525)
        expect(engine.weightsOf('move integer', m68k).meaning).toBeCloseTo(0.475)
    })

    it('counts a word-like name as a word, unless typed as code', async () => {
        const engine = await engineWithNames()
        const m68k = languageScope('m68k')
        expect(engine.weightsOf('stop the program', m68k).words).toBeCloseTo(0.35)
        expect(engine.weightsOf('STOP the program', m68k).words).toBeCloseTo(0.525)
    })

    it("counts only the scope's own names", async () => {
        const engine = await engineWithNames()
        expect(engine.weightsOf('syscall service', languageScope('m68k')).words).toBeCloseTo(0.35)
        expect(engine.weightsOf('syscall service', languageScope('mips')).words).toBeCloseTo(0.525)
    })
})

describe('stemming', () => {
    const scope = languageScope('m68k', false)

    async function engineOf(entries: EntryDocument[]) {
        const engine = SearchEngine.create()
        await engine.add(
            createPayload({ shard: 'docs-m68k', entries, sections: [], windows: [] }, null, null)
        )
        return engine
    }

    const ids = async (engine: SearchEngine, query: string) =>
        (await engine.search(query, { scope })).map(idOf)

    it('finds the forms of a word in prose', async () => {
        const engine = await engineOf([entry('divu', 'Divide two numbers.')])
        expect(await ids(engine, 'divides')).toEqual(['m68k/instructions/divu'])
        expect(await ids(engine, 'dividing numbers')).toEqual(['m68k/instructions/divu'])
    })

    it('never stems a name', async () => {
        const engine = await engineOf([
            entry('mov', 'Copies a value; mov is the instruction programs use most.'),
            entry('movs', 'Copies a string.')
        ])
        // two words, so that no typo is forgiven: stemmed, `movs` would be `mov`
        expect(await ids(engine, 'movs string')).toEqual(['m68k/instructions/movs'])
    })

    it('matches a stem as a whole word, not as the start of a longer one', async () => {
        const engine = await engineOf([
            entry('operand', 'Names the operand of an instruction.', { entryKind: 'prose' })
        ])
        expect(await ids(engine, 'operation')).toEqual([])
    })

    it('stems the title of a prose entry but not one that is code', async () => {
        const engine = await engineOf([
            entry('loop', 'Repeats a block.', { id: 'm68k/instructions/loop', title: 'LOOP' }),
            entry('loops', 'Repeats a block.', {
                id: 'm68k/prose/loops',
                entryKind: 'prose',
                title: 'Loop',
                names: []
            })
        ])
        expect(await ids(engine, 'looping')).toEqual(['m68k/prose/loops'])
    })

    it('searches the parts of a hyphenated word, as the text has them', async () => {
        const engine = await engineOf([
            entry('move', 'Copies a byte.'),
            entry('ext', 'Extends the sign of a byte into a word.')
        ])
        const scored = async (query: string) =>
            (await engine.search(query, { scope })).map((result) => ({
                id: idOf(result),
                score: result.score
            }))
        const spaced = await scored('sign extend a byte')
        expect(spaced[0].id).toBe('m68k/instructions/ext')
        for (const query of ['sign-extend a byte', 'sign/extend a byte']) {
            const found = await scored(query)
            expect(
                found.map(({ id }) => id),
                query
            ).toEqual(spaced.map(({ id }) => id))
            found.forEach(({ score }, i) => expect(score, query).toBeCloseTo(spaced[i].score, 10))
        }
    })
})

describe('Entry questions', () => {
    const scope = languageScope('m68k', false)

    async function engineOf(entries: EntryDocument[]) {
        const engine = SearchEngine.create()
        await engine.add(
            createPayload({ shard: 'docs-m68k', entries, sections: [], windows: [] }, null, null)
        )
        return engine
    }

    const ids = async (engine: SearchEngine, query: string) =>
        (await engine.search(query, { scope })).map(idOf)

    const bases = entry('task-15', 'Displays D1.L as an unsigned number in the base in D2.B.', {
        entryKind: 'trap-task',
        title: 'Display unsigned number in a base',
        names: ['15'],
        questions: ['how do I print a number in binary', 'show a value as hexadecimal digits']
    })
    const signed = entry('task-3', 'Displays D1.L as a signed number.', {
        entryKind: 'trap-task',
        title: 'Display signed number',
        names: ['3']
    })

    it("finds an entry by its questions' words, which its own text never uses", async () => {
        const engine = await engineOf([signed, bases])
        expect(await ids(engine, 'number in binary')).toEqual([
            'm68k/instructions/task-15',
            'm68k/instructions/task-3'
        ])
        expect(await ids(engine, 'hexadecimal')).toEqual(['m68k/instructions/task-15'])
    })

    it('finds the forms of a word in the questions', async () => {
        const engine = await engineOf([signed, bases])
        expect(await ids(engine, 'printing binary numbers')).toEqual([
            'm68k/instructions/task-15',
            'm68k/instructions/task-3'
        ])
    })

    it('counts a word in the questions more than the same word in the text', async () => {
        const engine = await engineOf([
            entry('told', 'Swaps two registers.'),
            entry('asked', 'Copies a value.', { questions: ['how do I swap two registers'] })
        ])
        expect(await ids(engine, 'swap')).toEqual([
            'm68k/instructions/asked',
            'm68k/instructions/told'
        ])
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

describe('Search modifiers', () => {
    const multiplies = 'Multiplies two numbers and keeps the product.'

    /** The same entry in M68K and MIPS, and a section of the General course and of MIPS's. */
    async function twoLanguages() {
        const engine = SearchEngine.create()
        await engine.add(
            createPayload(
                {
                    shard: 'docs-m68k',
                    entries: [entry('mulu', multiplies), entry('add', 'Adds two numbers.')],
                    sections: [],
                    windows: []
                },
                null,
                null
            )
        )
        const mips = (name: string, summary: string) =>
            entry(name, summary, { id: `mips/instructions/${name}`, language: 'mips' })
        await engine.add(
            createPayload(
                {
                    shard: 'docs-mips',
                    entries: [mips('mult', multiplies), mips('add', 'Adds two numbers.')],
                    sections: [],
                    windows: []
                },
                null,
                null
            )
        )
        for (const course of ['assembly-basics', 'mips'] as const) {
            await engine.add(
                createPayload(
                    {
                        shard: `lectures-${course}`,
                        entries: [],
                        sections: [
                            {
                                ...section('Multiplying', multiplies),
                                id: `${course}/arithmetic/multiplying#`,
                                course
                            }
                        ],
                        windows: [{ section: 0, text: multiplies }]
                    },
                    null,
                    null
                )
            )
        }
        return engine
    }

    const scores = async (engine: SearchEngine, query: string, modifiers?: QueryModifiers) =>
        new Map(
            (await engine.search(query, { scope: SITE_SCOPE, modifiers })).map((result) => [
                idOf(result),
                result.score
            ])
        )

    it('counts other languages a quarter where a language is named, the General course fully', async () => {
        const engine = await twoLanguages()
        const plain = await scores(engine, 'multiply numbers')
        const named = await scores(engine, 'm68k multiply numbers')
        const order = [...named.keys()]
        expect(order.indexOf('m68k/instructions/mulu')).toBeLessThan(
            order.indexOf('mips/instructions/mult')
        )
        const ratio = (id: string) => named.get(id)! / plain.get(id)!
        expect(ratio('m68k/instructions/mulu')).toBeCloseTo(1)
        expect(ratio('mips/instructions/mult')).toBeCloseTo(RANKING.otherLanguageWeight)
        expect(ratio('mips/arithmetic/multiplying#')).toBeCloseTo(RANKING.otherLanguageWeight)
        expect(ratio('assembly-basics/arithmetic/multiplying#')).toBeCloseTo(1)
        // two languages named both count fully
        const both = await scores(engine, 'm68k and mips multiply numbers')
        expect(
            both.get('mips/instructions/mult')! / plain.get('mips/instructions/mult')!
        ).toBeCloseTo(1)
    })

    it("pins the named language's exact name first, the others after it", async () => {
        const engine = await twoLanguages()
        const pinned = (results: SearchResult[]) =>
            results.filter((result) => result.kind === 'entry' && result.exact).map(idOf)
        expect(pinned(await engine.search('add', { scope: SITE_SCOPE }))).toEqual([
            'm68k/instructions/add',
            'mips/instructions/add'
        ])
        expect(pinned(await engine.search('mips add', { scope: SITE_SCOPE }))).toEqual([
            'mips/instructions/add',
            'm68k/instructions/add'
        ])
    })

    it('prepares a query once, for the model and the engine alike', async () => {
        const engine = await twoLanguages()
        const prepared = prepareSearch(engine, 'MIPS multiply numbers', SITE_SCOPE)
        expect(prepared.embed).toBe('multiply numbers')
        expect(prepared.options).toMatchObject({
            scope: SITE_SCOPE,
            modifiers: { languages: ['mips'], kinds: [] }
        })
        // in one language's scope the name is a word of the question
        expect(prepareSearch(engine, 'MIPS multiply', languageScope('mips')).embed).toBe(
            'MIPS multiply'
        )
    })

    /** Entries of three kinds and a Lecture section, saying the same words. */
    async function kinds() {
        const text = 'Stores the text of a message in memory.'
        const engine = SearchEngine.create()
        const directives = { chapter: 'directives', chapterTitle: 'Directives' }
        await engine.add(
            createPayload(
                {
                    shard: 'docs-mips',
                    entries: [
                        entry('asciiz', text, {
                            ...directives,
                            id: 'mips/directives/asciiz',
                            entryKind: 'directive'
                        }),
                        entry('about', text, {
                            ...directives,
                            id: 'mips/directives/about',
                            entryKind: 'prose',
                            names: []
                        }),
                        entry('sw', text, { id: 'mips/instructions/sw' }),
                        entry('strcpy', text, {
                            id: 'mips/runtime-library/strcpy',
                            chapter: 'runtime-library',
                            chapterTitle: 'Runtime library',
                            entryKind: 'function'
                        })
                    ],
                    sections: [],
                    windows: []
                },
                null,
                null
            )
        )
        await engine.add(
            createPayload(
                {
                    shard: 'lectures-mips',
                    entries: [],
                    sections: [section('Strings', text)],
                    windows: [{ section: 0, text }]
                },
                null,
                null
            )
        )
        return engine
    }

    /** Each result's score with the query's kind words read, against the same query without. */
    async function lifts(query: string) {
        const engine = await kinds()
        const scope = languageScope('mips')
        const none = { text: query, languages: [], kinds: [], marks: [] }
        const read = await engine.search(query, { scope })
        const plain = new Map(
            (await engine.search(query, { scope, modifiers: none })).map((r) => [idOf(r), r.score])
        )
        return new Map(
            read.map((result) => [idOf(result), result.score / plain.get(idOf(result))!])
        )
    }

    it("lifts a kind word's Chapter, its prose included, and leaves the rest", async () => {
        const lifted = await lifts('directive for the text of a message')
        expect(lifted.get('mips/directives/asciiz')).toBeCloseTo(RANKING.kindLift)
        expect(lifted.get('mips/directives/about')).toBeCloseTo(RANKING.kindLift)
        expect(lifted.get('mips/instructions/sw')).toBeCloseTo(1)
        expect(lifted.get('m68k/think-in-assembly/loops#strings')).toBeCloseTo(1)
    })

    it('lifts the Lecture sections for a lecture word', async () => {
        const lifted = await lifts('lesson on the text of a message')
        expect(lifted.get('m68k/think-in-assembly/loops#strings')).toBeCloseTo(RANKING.kindLift)
        expect(lifted.get('mips/instructions/sw')).toBeCloseTo(1)
    })

    it('counts a Runtime library function fully when the query asks for the library', async () => {
        const lifted = await lifts('libc call for the text of a message')
        expect(lifted.get('mips/runtime-library/strcpy')).toBeCloseTo(
            RANKING.kindLift / RANKING.runtimeFunctionWeight
        )
        expect(lifted.get('mips/directives/asciiz')).toBeCloseTo(1)
    })
})

describe('names inside a question', () => {
    async function engineOf() {
        const engine = SearchEngine.create()
        const mips = (name: string, summary: string, extra: Partial<EntryDocument> = {}) =>
            entry(name, summary, { id: `mips/x/${name}`, language: 'mips', ...extra })
        const register = { entryKind: 'register' as const }
        await engine.add(
            createPayload(
                {
                    shard: 'docs-mips',
                    entries: [
                        mips('dbra', 'Counts down a register and loops.'),
                        mips('stop', 'Stops the processor until an interrupt.'),
                        mips('lw', 'Loads a word from memory.'),
                        mips('$t0', 'A temporary register.', register),
                        mips('$sp', 'The stack pointer register.', register),
                        mips('rename', 'Renames a file.', { entryKind: 'syscall', codeName: true })
                    ],
                    sections: [],
                    windows: [],
                    wordLikeNames: ['stop']
                },
                null,
                null
            )
        )
        return engine
    }

    /** Each result's score with the name boost, against the same search without it. */
    async function boosts(query: string) {
        const engine = await engineOf()
        const scope = languageScope('mips', false)
        const boosted = await engine.search(query, { scope })
        const boost = RANKING.nameBoost
        RANKING.nameBoost = 1
        try {
            const plain = new Map(
                (await engine.search(query, { scope })).map((r) => [idOf(r), r.score])
            )
            return new Map(boosted.map((r) => [idOf(r), r.score / plain.get(idOf(r))!]))
        } finally {
            RANKING.nameBoost = boost
        }
    }

    it('lifts the entry a question names, and only it', async () => {
        const lifted = await boosts('how does dbra count down a register')
        expect(lifted.get('mips/x/dbra')).toBeCloseTo(RANKING.nameBoost)
        expect(lifted.get('mips/x/$t0')).toBeCloseTo(1)
    })

    it('lifts every name of a pasted line, split at commas and brackets', async () => {
        const lifted = await boosts('lw $t0, 4($sp)')
        for (const id of ['mips/x/lw', 'mips/x/$t0', 'mips/x/$sp']) {
            expect(lifted.get(id), id).toBeCloseTo(RANKING.nameBoost)
        }
    })

    it('leaves a word-like name alone unless it is written as code', async () => {
        expect((await boosts('stop the processor')).get('mips/x/stop')).toBeCloseTo(1)
        expect((await boosts('STOP the processor')).get('mips/x/stop')).toBeCloseTo(
            RANKING.nameBoost
        )
        // an operand written as code after it makes it an instruction
        expect((await boosts('stop $t0 processor')).get('mips/x/stop')).toBeCloseTo(
            RANKING.nameBoost
        )
        // a plain number does not: "wait 5 seconds" is English
        expect((await boosts('stop 5 processor')).get('mips/x/stop')).toBeCloseTo(1)
    })

    it('leaves a syscall alone, though its name is set as code', async () => {
        expect((await boosts('rename a file')).get('mips/x/rename')).toBeCloseTo(1)
    })

    it('takes neither "I" nor a word in capitals for an operand, unless the line is code', async () => {
        const stop = async (query: string) => (await boosts(query)).get('mips/x/stop')
        expect(await stop('why does the stop I added never end')).toBeCloseTo(1)
        expect(await stop('stop ASCII output')).toBeCloseTo(1)
        // a comma or an operand written as code makes a line of code, and its capitals operands
        expect(await stop('stop LABEL, 4')).toBeCloseTo(RANKING.nameBoost)
        expect(await stop('stop LABEL $t0')).toBeCloseTo(RANKING.nameBoost)
        const engine = await engineOf()
        const scope = languageScope('mips', false)
        expect(engine.weightsOf('why does the stop I added never end', scope).words).toBeCloseTo(
            engine.weightsOf('why does the stop we added never end', scope).words
        )
    })

    it('counts a word-like name followed by an operand as a name in the weights', async () => {
        const engine = await engineOf()
        const scope = languageScope('mips', false)
        expect(engine.weightsOf('stop the processor', scope).words).toBeCloseTo(0.35)
        expect(engine.weightsOf('stop $t0', scope).words).toBeCloseTo(0.7)
    })
})

describe('the Problems boost', () => {
    const scope = languageScope('m68k', false)
    const question = 'count down until zero'

    /** Two entries of the same words, as similar to the question as given. */
    async function engineOf(cosines: [number, number]) {
        const engine = SearchEngine.create()
        await engine.add(
            createPayload(
                {
                    shard: 'docs-m68k',
                    entries: [
                        entry('dbra', 'Counts down a register and loops until it is zero.'),
                        entry('subq', 'Counts down a register and loops until it is zero.')
                    ],
                    sections: [],
                    windows: []
                },
                [toward(cosines[0], 1), toward(cosines[1], 2)],
                'test'
            )
        )
        return engine
    }

    const search = async (cosines: [number, number], favour?: string[]) =>
        (await (await engineOf(cosines)).search(question, { scope, vector: block(0), favour })).map(
            idOf
        )

    it('lifts an entry an error names enough to break a near tie', async () => {
        expect(await search([0.45, 0.5])).toEqual([
            'm68k/instructions/subq',
            'm68k/instructions/dbra'
        ])
        expect(await search([0.45, 0.5], ['dbra'])).toEqual([
            'm68k/instructions/dbra',
            'm68k/instructions/subq'
        ])
    })

    it('does not lift a weak match over a strong one', async () => {
        expect(await search([0.2, 0.6], ['dbra'])).toEqual([
            'm68k/instructions/subq',
            'm68k/instructions/dbra'
        ])
    })

    it('multiplies by the boost, reads a size suffix and ignores names of no entry', async () => {
        const engine = await engineOf([0.45, 0.5])
        const scores = async (favour?: string[]) =>
            new Map(
                (await engine.search(question, { scope, vector: block(0), favour })).map((r) => [
                    idOf(r),
                    r.score
                ])
            )
        const plain = await scores()
        const lifted = await scores(['dbra.w', 'fps'])
        const dbra = 'm68k/instructions/dbra'
        expect(lifted.get(dbra)! / plain.get(dbra)!).toBeCloseTo(RANKING.problemBoost)
        expect(lifted.get('m68k/instructions/subq')).toBeCloseTo(
            plain.get('m68k/instructions/subq')!
        )
    })
})

describe('couples', () => {
    /**
     * M68K and x86 Documentation: `test` the x86 instruction, which the Lectures use as a word, the
     * M68K `tst`, `stop` and `end`, an entry whose words match "test instruction" best, and a MIPS
     * register spelled with its `$`.
     */
    async function engineOf() {
        const engine = SearchEngine.create()
        const directive = (name: string) =>
            entry(name, `The ${name} directive.`, {
                id: `m68k/directives/${name}`,
                chapter: 'directives',
                chapterTitle: 'Directives',
                entryKind: 'directive'
            })
        await engine.add(
            createPayload(
                {
                    shard: 'docs-m68k',
                    entries: [
                        entry('tst', 'Compares a value with zero and sets the flags.'),
                        entry('stop', 'Stops the processor until an interrupt.'),
                        entry('testcases', 'Each test instruction of a Testcase, a test test.', {
                            id: 'm68k/executables/testcases',
                            entryKind: 'prose',
                            names: []
                        }),
                        directive('end'),
                        directive('org')
                    ],
                    sections: [],
                    windows: [],
                    wordLikeNames: ['stop', 'end']
                },
                null,
                null
            )
        )
        const x86 = (name: string, summary: string) =>
            entry(name, summary, { id: `x86/instructions/${name}`, language: 'x86' })
        await engine.add(
            createPayload(
                {
                    shard: 'docs-x86',
                    entries: [
                        x86('test', 'Ands two operands and sets the flags.'),
                        x86('tst', 'Not a real x86 instruction, made up to share a name.')
                    ],
                    sections: [],
                    windows: [],
                    wordLikeNames: ['test']
                },
                null,
                null
            )
        )
        await engine.add(
            createPayload(
                {
                    shard: 'docs-mips',
                    entries: [
                        entry('$sp', 'The stack pointer.', {
                            id: 'mips/registers/$sp',
                            language: 'mips',
                            entryKind: 'register'
                        }),
                        entry('$at', 'The assembler temporary.', {
                            id: 'mips/registers/$at',
                            language: 'mips',
                            entryKind: 'register'
                        })
                    ],
                    sections: [],
                    windows: []
                },
                null,
                null
            )
        )
        return engine
    }

    const pinned = (results: SearchResult[]) =>
        results.filter((result) => result.kind === 'entry' && result.exact).map(idOf)

    it("pins a couple's entries first, the rest of the query ranking what follows", async () => {
        const engine = await engineOf()
        const scope = languageScope('x86', false)
        const results = await engine.search('test instruction', { scope })
        expect(results[0]).toMatchObject({ kind: 'entry', exact: true, score: Infinity })
        expect(pinned(results)).toEqual(['x86/instructions/test'])
        // without its noun, `test` is an ordinary word and the best match by words comes first
        const site = await engine.search('test instruction', { scope: SITE_SCOPE })
        expect(idOf(site[0])).toBe('x86/instructions/test')
        expect(idOf(site[1])).toBe('m68k/executables/testcases')
    })

    it("pins the named language's entries first, then the scope's order", async () => {
        const engine = await engineOf()
        expect(pinned(await engine.search('tst instruction', { scope: SITE_SCOPE }))).toEqual([
            'm68k/instructions/tst',
            'x86/instructions/tst'
        ])
        expect(
            pinned(await engine.search('tst instruction in x86', { scope: SITE_SCOPE }))
        ).toEqual(['x86/instructions/tst', 'm68k/instructions/tst'])
    })

    it('pins several couples in the order typed', async () => {
        const engine = await engineOf()
        const scope = languageScope('m68k', false)
        expect(pinned(await engine.search('org directive or tst instruction', { scope }))).toEqual([
            'm68k/directives/org',
            'm68k/instructions/tst'
        ])
        expect(
            pinned(await engine.search('instruction tst after the org directive', { scope }))
        ).toEqual(['m68k/instructions/tst', 'm68k/directives/org'])
    })

    it('reads a name after its noun only when it is no ordinary word', async () => {
        const engine = await engineOf()
        const scope = languageScope('m68k', false)
        expect(pinned(await engine.search('stop instruction', { scope }))).toEqual([
            'm68k/instructions/stop'
        ])
        expect(pinned(await engine.search('instruction stop', { scope }))).toEqual([])
        expect(pinned(await engine.search('instruction STOP', { scope }))).toEqual([
            'm68k/instructions/stop'
        ])
        // an exact name of another kind is no couple
        expect(pinned(await engine.search('tst directive', { scope }))).toEqual([])
    })

    it("reads a directive without its dot and a MIPS register without its '$'", async () => {
        const engine = await engineOf()
        const mips = languageScope('mips', false)
        expect(pinned(await engine.search('sp register', { scope: mips }))).toEqual([
            'mips/registers/$sp'
        ])
        // a stop word keeps its meaning: "look at" is not `$at`
        expect(pinned(await engine.search('look at register $sp', { scope: mips }))).toEqual([
            'mips/registers/$sp'
        ])
        const m68k = languageScope('m68k', false)
        expect(pinned(await engine.search('the .end directive', { scope: m68k }))).toEqual([
            'm68k/directives/end'
        ])
        expect(pinned(await engine.search('tst.l instruction', { scope: m68k }))).toEqual([
            'm68k/instructions/tst'
        ])
    })

    it('makes a kind word of a couple no Search modifier, and reports the couples', async () => {
        const engine = await engineOf()
        const scope = languageScope('m68k', false)
        const coupled = prepareSearch(engine, 'end directive', scope)
        expect(coupled.options.modifiers).toMatchObject({ kinds: [], marks: [] })
        expect(coupled.options.couples).toEqual([
            {
                start: 0,
                end: 13,
                label: 'The end directive first',
                entries: [{ shard: 'docs-m68k', ref: 3 }]
            }
        ])
        // with no name beside it, the kind word lifts its Chapter as before
        expect(prepareSearch(engine, 'directive for the end', scope).options).toMatchObject({
            modifiers: { kinds: ['directive'] },
            couples: []
        })
        // a language's name is never the name of a couple
        const site = prepareSearch(engine, 'TST instruction in m68k', SITE_SCOPE)
        expect(site.options.modifiers.languages).toEqual(['m68k'])
        expect(
            site.options.couples.map(({ start, end, label }) => ({ start, end, label }))
        ).toEqual([{ start: 0, end: 15, label: 'The TST instruction first' }])
    })
})
