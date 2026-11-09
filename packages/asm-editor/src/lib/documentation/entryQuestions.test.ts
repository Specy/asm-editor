import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
    buildPackets,
    checkAll,
    checkLanguage,
    entryHash,
    formatCheck,
    mergeQuestions,
    namesEntry,
    otherLanguageNames,
    questionProblems,
    serializeQuestions,
    validateResult,
    type LanguageCheck,
    type QuestionsFile,
    type ShardEntry
} from '../../../scripts/entry-questions/lib.mjs'

/**
 * The logic of `scripts/entry-questions.mjs` ([ADR 0079](../../../../../docs/adr/0079-entry-questions-are-written-once-and-committed.md)):
 * the hash, what `merge` rejects, and what `check` and `packets` report on fixture shards.
 */

function entry(id: string, fields: Partial<ShardEntry> = {}): ShardEntry {
    const [, chapter] = id.split('/')
    return {
        id,
        chapter,
        chapterTitle: chapter[0].toUpperCase() + chapter.slice(1),
        entryKind: 'syscall',
        title: id,
        names: [],
        signature: '',
        summary: `${id} summary.`,
        text: `${id} text.`,
        ...fields
    }
}

const PRINT = entry('mips/syscalls/1', {
    title: 'Print integer',
    names: ['print integer', 'syscall 1', 'service 1'],
    summary: 'Prints a number.',
    text: 'Service 1. Prints a number.'
})
const HEX = entry('mips/syscalls/34', {
    title: 'Print integer in hexadecimal',
    names: ['print integer in hexadecimal', 'syscall 34', 'service 34']
})
const ADD = entry('mips/instructions/add', {
    entryKind: 'instruction',
    title: 'add',
    names: ['add']
})
const MIPS = [PRINT, HEX, ADD]

const QUESTIONS = ['how do I show a number', 'what prints an integer', 'why is nothing printed']

describe('entryHash', () => {
    it('hashes summary, text and detail joined by NUL', () => {
        expect(entryHash(PRINT)).toBe('072919fdf23a514c')
        const expected = createHash('sha256')
            .update('Prints a number.\u0000Service 1. Prints a number.\u0000More.')
            .digest('hex')
            .slice(0, 16)
        expect(entryHash({ ...PRINT, detail: 'More.' })).toBe(expected)
    })

    it('reads an absent detail as the empty string', () => {
        expect(entryHash({ ...PRINT, detail: '' })).toBe(entryHash(PRINT))
    })

    it('does not read the title, names or code', () => {
        const renamed: ShardEntry = { ...PRINT, title: 'Other', names: ['x'], code: 'li $v0, 1' }
        expect(entryHash(renamed)).toBe(entryHash(PRINT))
    })

    it('changes with each field, and does not run them together', () => {
        expect(entryHash({ ...PRINT, summary: 'Other.' })).not.toBe(entryHash(PRINT))
        expect(entryHash({ ...PRINT, text: 'Other.' })).not.toBe(entryHash(PRINT))
        expect(entryHash({ summary: 'ab', text: 'c' })).not.toBe(
            entryHash({ summary: 'a', text: 'bc' })
        )
    })
})

describe('otherLanguageNames', () => {
    it.each([
        ['how do I print in MARS', 'm68k', ['MARS']],
        ['is this like mips', 'risc-v', ['mips']],
        ['what does rars do here', 'mips', ['rars']],
        ['RISC-V registers', 'mips', ['RISC-V']],
        ['risc v registers', 'mips', ['risc v']],
        ['riscv registers', 'x86', ['riscv']],
        ['rv32i only', 'mips', ['rv32i']],
        ['rv64 only', 'm68k', ['rv64']],
        ['x86-64 calls', 'mips', ['x86', 'x86-64']],
        ['x86_64 calls', 'mips', ['x86_64']],
        ['x64 calls', 'z80', ['x64']],
        ['AMD64 and Intel', 'm68k', ['AMD64', 'Intel']],
        ['nasm syntax', 'mips', ['nasm']],
        ['the 68000 stack', 'x86', ['68000']],
        ['68k traps', 'mips', ['68k']],
        ['m68k traps', 'mips', ['m68k']],
        ['Motorola syntax', 'mips', ['Motorola']],
        ['EASy68K tasks', 'mips', ['EASy68K']],
        ['easy 68k tasks', 'mips', ['68k', 'easy 68k']],
        ['Z80 ports', 'mips', ['Z80']]
    ] as const)('finds %j in a %s question', (question, language, found) => {
        expect(otherLanguageNames(question, language)).toEqual(found)
    })

    it.each([
        ['how do I print in MARS', 'mips'],
        ['what does rv64 add', 'risc-v'],
        ['nasm and intel syntax', 'x86'],
        ['the 68000 stack', 'm68k'],
        ['an intelligent guess', 'mips'],
        ['mipsy and smartest', 'z80'],
        ['address 680001', 'mips'],
        ['what is 0x86', 'mips']
    ] as const)('finds nothing in %j as a %s question', (question, language) => {
        expect(otherLanguageNames(question, language)).toEqual([])
    })
})

describe('namesEntry', () => {
    it('matches a name as a whole word, in any case', () => {
        expect(namesEntry('how does dbra work', ['dbra'])).toBe(true)
        expect(namesEntry('How does DBRA work', ['dbra'])).toBe(true)
        expect(namesEntry('what does move.l do', ['move'])).toBe(true)
        expect(namesEntry('what does movea do', ['move'])).toBe(false)
        expect(namesEntry('what is in $t0', ['$t0'])).toBe(true)
        expect(namesEntry('what does print integer do', ['print integer'])).toBe(true)
        expect(namesEntry('how do I print an integer', ['print integer'])).toBe(false)
        expect(namesEntry('what is syscall 10', ['syscall 1'])).toBe(false)
    })

    it('counts a one-letter or English-word name only in capitals', () => {
        expect(namesEntry('how do I add a number', ['a'])).toBe(false)
        expect(namesEntry('what is kept in A', ['a'])).toBe(true)
        expect(namesEntry('what does it do', ['do'])).toBe(false)
        expect(namesEntry('what does DO reserve', ['do'])).toBe(true)
        expect(namesEntry('how do I keep some bits and clear others', ['and'])).toBe(false)
        expect(namesEntry('what does AND do', ['and'])).toBe(true)
        expect(namesEntry('what is the size of a word', ['of'])).toBe(false)
    })

    it('never counts the pronoun I', () => {
        expect(namesEntry('how do I wait', ['i'])).toBe(false)
    })
})

describe('questionProblems', () => {
    it('accepts three good questions', () => {
        expect(questionProblems(QUESTIONS, PRINT, 'mips')).toEqual([])
    })

    it('needs at least three questions', () => {
        expect(questionProblems(QUESTIONS.slice(0, 2), PRINT, 'mips')).toEqual([
            '2 questions; at least 3 are needed'
        ])
    })

    it('refuses what is not a list of strings', () => {
        expect(questionProblems('how', PRINT, 'mips')).toEqual([
            'the questions are not a list of strings'
        ])
        expect(questionProblems([...QUESTIONS, 3, '  '], PRINT, 'mips')).toEqual([
            'question 4 is empty or not a string',
            'question 5 is empty or not a string'
        ])
    })

    it('finds duplicates whatever their case and punctuation', () => {
        expect(questionProblems([...QUESTIONS, 'How do I show a number?'], PRINT, 'mips')).toEqual([
            '"How do I show a number?" repeats "how do I show a number"'
        ])
    })

    it('refuses a question over 140 characters', () => {
        const long = `how do I ${'print '.repeat(23)}`.trim()
        expect([...long].length).toBeGreaterThan(140)
        expect(questionProblems([...QUESTIONS, long], PRINT, 'mips')).toEqual([
            `"${long}" is ${[...long].length} characters; at most 140`
        ])
    })

    it('refuses another language, and allows its own', () => {
        expect(questionProblems([...QUESTIONS, 'print a number in MARS'], PRINT, 'mips')).toEqual(
            []
        )
        expect(
            questionProblems([...QUESTIONS, 'print a number like in rars'], PRINT, 'mips')
        ).toEqual(['"print a number like in rars" names another language (rars)'])
    })

    it('lets at most half of the questions name the entry', () => {
        const naming = ['what is syscall 1', 'what does service 1 print']
        expect(questionProblems([...naming, QUESTIONS[0], QUESTIONS[1]], PRINT, 'mips')).toEqual([])
        expect(questionProblems([...naming, QUESTIONS[0]], PRINT, 'mips')).toEqual([
            '2 of 3 questions name the entry (print integer, syscall 1, service 1); at most half may'
        ])
    })

    it('lists every problem', () => {
        expect(
            questionProblems(['what is syscall 1', 'What is syscall 1?'], PRINT, 'mips')
        ).toEqual([
            '2 questions; at least 3 are needed',
            '"What is syscall 1?" repeats "what is syscall 1"',
            '2 of 2 questions name the entry (print integer, syscall 1, service 1); at most half may'
        ])
    })
})

describe('validateResult', () => {
    it('refuses a result it cannot read', () => {
        expect(validateResult([], MIPS)).toEqual({ fatal: 'the result is not a JSON object' })
        expect(validateResult({ language: 'arm', entries: {} }, MIPS).fatal).toMatch(/"language"/)
        expect(validateResult({ language: 'mips', entries: [] }, MIPS).fatal).toMatch(/"entries"/)
    })

    it('accepts good entries, tidied, and rejects the rest with their problems', () => {
        const result = validateResult(
            {
                language: 'mips',
                entries: {
                    'mips/syscalls/1': ['  how do I show   a number ', ...QUESTIONS.slice(1)],
                    'mips/syscalls/34': ['one', 'two'],
                    'mips/syscalls/99': QUESTIONS,
                    'm68k/trap-tasks/task-3': QUESTIONS
                }
            },
            MIPS
        )
        expect(result).toEqual({
            accepted: { 'mips/syscalls/1': QUESTIONS },
            rejected: {
                'mips/syscalls/34': ['2 questions; at least 3 are needed'],
                'mips/syscalls/99': ['not an entry of the mips Documentation'],
                'm68k/trap-tasks/task-3': ['not an entry of the mips Documentation']
            },
            warnings: []
        })
    })

    it('rejects the x86 Extensions', () => {
        const group = entry('x86/extensions/sse', { entryKind: 'extension-group' })
        const result = validateResult(
            { language: 'x86', entries: { 'x86/extensions/sse': QUESTIONS } },
            [group]
        )
        expect(result.fatal).toBeUndefined()
        expect(result).toMatchObject({
            accepted: {},
            rejected: {
                'x86/extensions/sse': ['an x86 Extensions entry, which has no Entry questions']
            }
        })
    })

    it('warns of more than six questions and of a question two entries share', () => {
        const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => `question number ${n}`)
        const result = validateResult(
            {
                language: 'mips',
                entries: {
                    'mips/syscalls/1': seven,
                    'mips/syscalls/34': ['Question number 1?', 'how do I show hex', 'hex digits']
                }
            },
            MIPS
        )
        expect(result.fatal).toBeUndefined()
        expect(result).toMatchObject({
            rejected: {},
            warnings: [
                'mips/syscalls/1: 7 questions; usually at most 6',
                '"question number 1" is a question of mips/syscalls/1, mips/syscalls/34'
            ]
        })
    })
})

describe('mergeQuestions and serializeQuestions', () => {
    it('writes each accepted entry with its hash, keeps the others, sorted by id', () => {
        const file: QuestionsFile = {
            'mips/syscalls/34': { hash: 'old', questions: ['a', 'b', 'c'] },
            'mips/instructions/add': { hash: 'kept', questions: ['d', 'e', 'f'] }
        }
        const merged = mergeQuestions(file, { 'mips/syscalls/1': QUESTIONS }, MIPS)
        expect(Object.keys(merged)).toEqual([
            'mips/instructions/add',
            'mips/syscalls/1',
            'mips/syscalls/34'
        ])
        expect(merged['mips/syscalls/1']).toEqual({ hash: entryHash(PRINT), questions: QUESTIONS })
        expect(merged['mips/syscalls/34']).toEqual(file['mips/syscalls/34'])
        expect(merged['mips/instructions/add']).toEqual(file['mips/instructions/add'])
    })

    it('replaces an entry questions whole', () => {
        const file = { 'mips/syscalls/1': { hash: 'old', questions: ['x', 'y', 'z', 'w'] } }
        expect(mergeQuestions(file, { 'mips/syscalls/1': QUESTIONS }, MIPS)).toEqual({
            'mips/syscalls/1': { hash: entryHash(PRINT), questions: QUESTIONS }
        })
    })

    it('writes JSON as the formatter does: a short list on one line, a long one broken', () => {
        const long = [
            'how do I show a number on the screen',
            'what is the quickest way to print an integer',
            'why is nothing printed'
        ]
        const text = serializeQuestions({
            'a/b/short': { hash: '0123456789abcdef', questions: ['one', 'two', 'three'] },
            'a/b/long': { hash: 'fedcba9876543210', questions: long }
        })
        expect(text).toBe(
            [
                '{',
                '    "a/b/short": {',
                '        "hash": "0123456789abcdef",',
                '        "questions": ["one", "two", "three"]',
                '    },',
                '    "a/b/long": {',
                '        "hash": "fedcba9876543210",',
                '        "questions": [',
                '            "how do I show a number on the screen",',
                '            "what is the quickest way to print an integer",',
                '            "why is nothing printed"',
                '        ]',
                '    }',
                '}',
                ''
            ].join('\n')
        )
        expect(JSON.parse(text)['a/b/long'].questions).toEqual(long)
        expect(serializeQuestions({})).toBe('{}\n')
    })
})

describe('check', () => {
    const folders: string[] = []
    afterEach(() => {
        for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
    })

    function folder(files: Record<string, unknown>): string {
        const path = mkdtempSync(join(tmpdir(), 'entry-questions-'))
        folders.push(path)
        for (const [name, content] of Object.entries(files)) {
            writeFileSync(
                join(path, name),
                typeof content === 'string' ? content : JSON.stringify(content)
            )
        }
        return path
    }

    const READ = entry('mips/syscalls/5', { title: 'Read integer', names: ['read integer'] })
    const SSE = entry('x86/extensions/sse', { entryKind: 'extension-group' })
    const EXTENSIONS = entry('x86/extensions/extensions', { entryKind: 'prose' })

    it('lists missing, stale, orphaned and invalid entries, leaving the Extensions out', () => {
        const shards = folder({
            'docs-mips.json': { format: 1, entries: [PRINT, HEX, READ, ADD] },
            'docs-x86.json': { format: 2, entries: [SSE, EXTENSIONS] }
        })
        const questions = folder({
            'mips.json': {
                'mips/syscalls/1': { hash: entryHash(PRINT), questions: QUESTIONS },
                'mips/syscalls/34': { hash: '0000000000000000', questions: QUESTIONS },
                'mips/syscalls/5': { hash: entryHash(READ), questions: ['one', 'two'] },
                'mips/syscalls/2': { hash: '0000000000000000', questions: QUESTIONS }
            },
            'x86.json': { 'x86/extensions/sse': { hash: entryHash(SSE), questions: QUESTIONS } }
        })
        const reports = checkAll(shards, questions)
        const byLanguage = Object.fromEntries(reports.map((report) => [report.language, report]))
        const mips = byLanguage.mips as LanguageCheck
        expect(mips.entries).toBe(4)
        expect(mips.written).toBe(3)
        expect(mips.missing.map((item) => item.id)).toEqual(['mips/instructions/add'])
        expect(mips.stale).toEqual(['mips/syscalls/34'])
        expect(mips.orphaned).toEqual(['mips/syscalls/2'])
        expect(mips.invalid).toEqual([
            { id: 'mips/syscalls/5', problems: ['2 questions; at least 3 are needed'] }
        ])
        const x86 = byLanguage.x86 as LanguageCheck
        expect(x86.entries).toBe(1)
        expect(x86.missing.map((item) => item.id)).toEqual(['x86/extensions/extensions'])
        expect(x86.orphaned).toEqual(['x86/extensions/sse'])
        expect(byLanguage.m68k).toEqual({
            language: 'm68k',
            error: `no docs-m68k.json in ${shards}`
        })

        const printed = formatCheck(reports)
        expect(printed).toContain(
            'mips: 4 entries, 3 with questions, 1 missing, 1 stale, 1 orphaned, 1 invalid'
        )
        expect(printed).toContain('    missing by Chapter: Instructions 1')
        expect(printed).toContain('    stale: mips/syscalls/34')
        expect(printed).toContain('    orphaned: mips/syscalls/2')
        expect(printed).toContain(
            '    invalid: mips/syscalls/5: 2 questions; at least 3 are needed'
        )
        expect(printed).toContain(`m68k: not checked: no docs-m68k.json in ${shards}`)
        expect(printed.split('\n').at(-1)).toBe(
            'total: 5 entries, 3 with questions, 2 missing, 1 stale, 2 orphaned, 1 invalid'
        )
    })

    it('reads an absent questions file as no questions, and reports one it cannot parse', () => {
        const shards = folder({ 'docs-z80.json': { format: 1, entries: [entry('z80/io/a')] } })
        const questions = folder({ 'mips.json': '{ not json' })
        const reports = checkAll(shards, questions)
        expect(reports.find((report) => report.language === 'z80')).toMatchObject({
            entries: 1,
            written: 0
        })
        expect(reports.find((report) => report.language === 'mips')).toMatchObject({
            error: `no docs-mips.json in ${shards}`
        })
        const broken = checkAll(folder({ 'docs-mips.json': { entries: [PRINT] } }), questions)
        expect(broken.find((report) => report.language === 'mips')).toMatchObject({
            error: expect.stringMatching(/^mips\.json: /)
        })
    })

    it('treats a missing detail and an empty one alike', () => {
        const stored = { [PRINT.id]: { hash: entryHash(PRINT), questions: QUESTIONS } }
        expect(checkLanguage('mips', [{ ...PRINT, detail: '' }], stored).stale).toEqual([])
        expect(checkLanguage('mips', [{ ...PRINT, detail: 'New.' }], stored).stale).toEqual([
            PRINT.id
        ])
    })
})

describe('buildPackets', () => {
    const OVERVIEW = entry('mips/syscalls/overview', {
        entryKind: 'prose',
        title: 'Asking for a service',
        code: 'li $v0, 1\nsyscall'
    })
    const SYSCALLS = [OVERVIEW, PRINT, HEX, ADD]

    it('makes one packet a Chapter with every entry in full', () => {
        const packets = buildPackets('mips', SYSCALLS, {})
        expect(packets.map((item) => item.name)).toEqual(['syscalls', 'instructions'])
        const [syscalls] = packets
        expect(syscalls.packet).toMatchObject({
            language: 'mips',
            chapter: 'syscalls',
            chapterTitle: 'Syscalls',
            others: []
        })
        expect(syscalls.packet.entries.map((item) => item.id)).toEqual([
            OVERVIEW.id,
            PRINT.id,
            HEX.id
        ])
        expect(syscalls.packet.entries[0]).toEqual({
            id: OVERVIEW.id,
            kind: 'prose',
            title: 'Asking for a service',
            names: [],
            signature: '',
            summary: OVERVIEW.summary,
            text: OVERVIEW.text,
            code: 'li $v0, 1\nsyscall'
        })
    })

    it('picks a Chapter by title or id, in any case', () => {
        expect(buildPackets('mips', SYSCALLS, {}, { chapter: 'SYSCALLS' })).toHaveLength(1)
        expect(buildPackets('mips', SYSCALLS, {}, { chapter: 'Instructions' })[0].name).toBe(
            'instructions'
        )
        expect(buildPackets('mips', SYSCALLS, {}, { chapter: 'nope' })).toEqual([])
    })

    it('keeps missing or stale entries only, listing the rest of the Chapter by summary', () => {
        const questions: QuestionsFile = {
            [PRINT.id]: { hash: entryHash(PRINT), questions: QUESTIONS },
            [HEX.id]: { hash: 'stale', questions: QUESTIONS }
        }
        const [missing] = buildPackets('mips', SYSCALLS, questions, { missing: true })
        expect(missing.packet.entries.map((item) => item.id)).toEqual([OVERVIEW.id])
        expect(missing.packet.others).toEqual([
            { id: PRINT.id, title: PRINT.title, names: PRINT.names, summary: PRINT.summary },
            { id: HEX.id, title: HEX.title, names: HEX.names, summary: HEX.summary }
        ])
        const [stale] = buildPackets('mips', SYSCALLS, questions, {
            chapter: 'syscalls',
            stale: true
        })
        expect(stale.packet.entries).toEqual([
            expect.objectContaining({ id: HEX.id, currentQuestions: QUESTIONS })
        ])
        const both = buildPackets('mips', SYSCALLS, questions, {
            chapter: 'syscalls',
            missing: true,
            stale: true
        })
        expect(both[0].packet.entries.map((item) => item.id)).toEqual([OVERVIEW.id, HEX.id])
        const done = { ...questions, [OVERVIEW.id]: { hash: entryHash(OVERVIEW), questions: [] } }
        expect(
            buildPackets('mips', SYSCALLS, done, { chapter: 'syscalls', missing: true })
        ).toEqual([])
    })

    it('splits a Chapter into parts of at most `size` entries', () => {
        const packets = buildPackets('mips', SYSCALLS, {}, { chapter: 'syscalls', size: 2 })
        expect(packets.map((item) => item.name)).toEqual(['syscalls.1', 'syscalls.2'])
        expect(packets[0].packet).toMatchObject({ part: 1, parts: 2 })
        expect(packets[0].packet.entries.map((item) => item.id)).toEqual([OVERVIEW.id, PRINT.id])
        expect(packets[0].packet.others.map((item) => item.id)).toEqual([HEX.id])
        expect(packets[1].packet.entries.map((item) => item.id)).toEqual([HEX.id])
        expect(packets[1].packet.others.map((item) => item.id)).toEqual([OVERVIEW.id, PRINT.id])
    })

    it('leaves the x86 Extensions out, but lists them beside their Chapter', () => {
        const group = entry('x86/extensions/sse', { entryKind: 'extension-group', title: 'SSE' })
        const prose = entry('x86/extensions/extensions', { entryKind: 'prose' })
        const [packet] = buildPackets('x86', [prose, group], {})
        expect(packet.packet.entries.map((item) => item.id)).toEqual([prose.id])
        expect(packet.packet.others.map((item) => item.id)).toEqual([group.id])
        expect(buildPackets('x86', [group], {})).toEqual([])
    })
})
