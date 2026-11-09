import { describe, expect, it } from 'vite-plus/test'
import { documentationFor } from '#lib/documentation/documentation.ts'
import {
    highlightedTerms,
    LANGUAGE_KINDS,
    modifierKindOf,
    readQuery,
    scopeKinds,
    type ModifierKind
} from './queryModifiers'
import {
    COURSES_SCOPE,
    DOCUMENTATION_LANGUAGES,
    SITE_SCOPE,
    languageScope,
    type DocumentationLanguage
} from './scope'

/** The typed text each mark covers, with its kind of modifier and its label. */
function marked(query: string, scope = SITE_SCOPE, kinds?: ModifierKind[]) {
    return readQuery(query, scope, kinds).marks.map(
        (mark) => `${query.slice(mark.start, mark.end)}|${mark.modifier}|${mark.label}`
    )
}

describe('language names', () => {
    const aliases: [string, DocumentationLanguage, string][] = [
        ['m68k', 'm68k', 'M68K'],
        ['68k', 'm68k', 'M68K'],
        ['68000', 'm68k', 'M68K'],
        ['Motorola', 'm68k', 'M68K'],
        ['EASy68K', 'm68k', 'M68K'],
        ['mips', 'mips', 'MIPS'],
        ['MARS', 'mips', 'MIPS'],
        ['risc-v', 'risc-v', 'RISC-V'],
        ['RISC V', 'risc-v', 'RISC-V'],
        ['riscv', 'risc-v', 'RISC-V'],
        ['RARS', 'risc-v', 'RISC-V'],
        ['rv32', 'risc-v', 'RISC-V'],
        ['rv64', 'risc-v', 'RISC-V'],
        ['x86', 'x86', 'x86-64'],
        ['x86-64', 'x86', 'x86-64'],
        ['x86_64', 'x86', 'x86-64'],
        ['x64', 'x86', 'x86-64'],
        ['amd64', 'x86', 'x86-64'],
        ['Intel', 'x86', 'x86-64'],
        ['NASM', 'x86', 'x86-64'],
        ['z80', 'z80', 'Z80']
    ]

    it.each(aliases)('reads %s as %s, and leaves it out of the text', (alias, language, label) => {
        const query = `${alias} multiply two numbers`
        expect(readQuery(query, SITE_SCOPE)).toEqual({
            text: 'multiply two numbers',
            languages: [language],
            kinds: [],
            marks: [
                {
                    start: 0,
                    end: alias.length,
                    modifier: 'language',
                    label: `${label} results first`
                }
            ]
        })
    })

    it.each([
        ['risc   v exit', 'risc   v', 'exit'],
        ['exit the program in RISC-V', 'RISC-V', 'exit the program in'],
        ['x86-64 exit', 'x86-64', 'exit'],
        ['mips: add', 'mips', 'add'],
        ['add (mips)', 'mips', 'add'],
        ['mips - add -1', 'mips', 'add -1']
    ])('reads %j whole, and keeps the rest tidy', (query, alias, text) => {
        const read = readQuery(query, SITE_SCOPE)
        expect(read.text).toBe(text)
        expect(read.marks).toHaveLength(1)
        expect(query.slice(read.marks[0].start, read.marks[0].end)).toBe(alias)
    })

    it('keeps a name that is the whole query, or all but its stop words, in the text', () => {
        expect(readQuery('MIPS', SITE_SCOPE)).toMatchObject({ text: 'MIPS', languages: ['mips'] })
        expect(readQuery(' what is mips? ', SITE_SCOPE)).toMatchObject({
            text: 'what is mips?',
            languages: ['mips']
        })
        expect(readQuery('mips risc-v', SITE_SCOPE)).toMatchObject({
            text: 'mips risc-v',
            languages: ['mips', 'risc-v']
        })
    })

    it('reads two languages, both counting fully', () => {
        expect(readQuery('lw in mips and rars', SITE_SCOPE)).toMatchObject({
            text: 'lw in and',
            languages: ['mips', 'risc-v']
        })
    })

    it('counts in the Courses, a scope of several languages', () => {
        expect(readQuery('m68k loops', COURSES_SCOPE)).toMatchObject({
            text: 'loops',
            languages: ['m68k']
        })
    })

    it("leaves a name alone in one language's scope, where it is an ordinary word", () => {
        for (const query of ['rv64 only instructions', 'risc-v exit']) {
            expect(readQuery(query, languageScope('risc-v'))).toEqual({
                text: query,
                languages: [],
                kinds: [],
                marks: []
            })
        }
        expect(readQuery('mips registers', languageScope('m68k')).languages).toEqual([])
    })

    it.each(['mipsel', 'report', '$68000', '#68000', '0x64', 'x86.inc', 'risc-vector', 'nasmx'])(
        'finds no name inside %s',
        (word) => {
            expect(marked(`load ${word} here`)).toEqual([])
        }
    )
})

describe('kind words', () => {
    const words: [string, ModifierKind, string][] = [
        ['directive', 'directive', 'Directives first'],
        ['Directives', 'directive', 'Directives first'],
        ['pseudo-op', 'directive', 'Directives first'],
        ['pseudo ops', 'directive', 'Directives first'],
        ['syscall', 'syscall', 'Syscalls and trap tasks first'],
        ['syscalls', 'syscall', 'Syscalls and trap tasks first'],
        ['system call', 'syscall', 'Syscalls and trap tasks first'],
        ['trap tasks', 'syscall', 'Syscalls and trap tasks first'],
        ['addressing modes', 'addressing-mode', 'Addressing modes first'],
        ['condition code', 'condition-code', 'Condition codes first'],
        ['port', 'port', 'Ports first'],
        ['ports', 'port', 'Ports first'],
        ['screen commands', 'screen-command', 'Screen commands first'],
        ['library', 'library', 'Runtime library first'],
        ['libraries', 'library', 'Runtime library first'],
        ['libc', 'library', 'Runtime library first'],
        ['C function', 'library', 'Runtime library first'],
        ['lecture', 'lecture', 'Lectures first'],
        ['lessons', 'lecture', 'Lectures first'],
        ['tutorial', 'lecture', 'Lectures first'],
        ['course', 'lecture', 'Lectures first']
    ]

    it.each(words)('reads %s with other words, and keeps it in the text', (word, kind, label) => {
        const query = `a ${word} for strings`
        expect(readQuery(query, SITE_SCOPE)).toEqual({
            text: query,
            languages: [],
            kinds: [kind],
            marks: [{ start: 2, end: 2 + word.length, modifier: 'kind', label }]
        })
    })

    it.each(['directives', 'the directives', 'Trap tasks?', 'directive syscall'])(
        'leaves %j alone, a kind word with nothing else',
        (query) => {
            expect(readQuery(query, SITE_SCOPE)).toEqual({
                text: query.trim(),
                languages: [],
                kinds: [],
                marks: []
            })
        }
    )

    it('lifts two kinds named together', () => {
        expect(readQuery('directive or syscall for strings', SITE_SCOPE).kinds).toEqual([
            'directive',
            'syscall'
        ])
    })

    it('counts a language name as another word', () => {
        expect(readQuery('mips syscalls', SITE_SCOPE)).toMatchObject({
            text: 'syscalls',
            languages: ['mips'],
            kinds: ['syscall']
        })
    })

    it('counts only where the scope has such a Chapter', () => {
        const m68k = languageScope('m68k')
        // M68K has no ports, the Courses' results are all Lectures, an Exam has no Lectures
        expect(readQuery('port of the screen', m68k).kinds).toEqual([])
        expect(readQuery('a lecture on loops', COURSES_SCOPE).kinds).toEqual([])
        expect(readQuery('a lecture on loops', languageScope('m68k', false)).kinds).toEqual([])
        expect(readQuery('a lecture on loops', m68k).kinds).toEqual(['lecture'])
        expect(readQuery('read a port', languageScope('z80')).kinds).toEqual(['port'])
        // the engine passes the kinds of the shards it has loaded
        expect(readQuery('read a port', languageScope('z80'), []).kinds).toEqual([])
        expect(readQuery('read a port', SITE_SCOPE, ['port']).kinds).toEqual(['port'])
    })

    it('reads no kind word inside a couple, which the engine passes apart', () => {
        const query = 'the end directive, then any directive for strings'
        const couple = { start: 4, end: 17 }
        expect(readQuery(query, SITE_SCOPE, undefined, [couple]).marks).toEqual([
            {
                start: query.lastIndexOf('directive'),
                end: query.lastIndexOf('directive') + 9,
                modifier: 'kind',
                label: 'Directives first'
            }
        ])
        // a couple's noun alone is no kind word, and nothing else is lifted
        const whole = { start: 0, end: 13 }
        expect(readQuery('end directive', languageScope('mips'), undefined, [whole])).toEqual({
            text: 'end directive',
            languages: [],
            kinds: [],
            marks: []
        })
    })

    it('names the syscalls the way the languages in view call them', () => {
        expect(marked('syscall to print', languageScope('m68k'))).toEqual([
            'syscall|kind|Trap tasks first'
        ])
        expect(marked('syscall to print', languageScope('mips'))).toEqual([
            'syscall|kind|Syscalls first'
        ])
        expect(marked('mips syscall to print')).toEqual([
            'mips|language|MIPS results first',
            'syscall|kind|Syscalls first'
        ])
    })
})

describe('marks', () => {
    it('gives offsets in the query as typed, odd spacing and capitals included', () => {
        const query = '  How do I use   MIPS  System   Calls ?'
        const read = readQuery(query, SITE_SCOPE)
        expect(read.marks).toEqual([
            {
                start: query.indexOf('MIPS'),
                end: query.indexOf('MIPS') + 4,
                modifier: 'language',
                label: 'MIPS results first'
            },
            {
                start: query.indexOf('System'),
                end: query.indexOf('Calls') + 5,
                modifier: 'kind',
                label: 'Syscalls first'
            }
        ])
        expect(read.text).toBe('How do I use System Calls ?')
    })

    it('leaves the text as typed when only kind words are read', () => {
        expect(readQuery(' -1 from a syscall, ', SITE_SCOPE).text).toBe('-1 from a syscall,')
    })

    it('finds nothing in a query without modifiers', () => {
        expect(readQuery('print an integer', SITE_SCOPE)).toEqual({
            text: 'print an integer',
            languages: [],
            kinds: [],
            marks: []
        })
    })
})

describe('highlighting', () => {
    it('leaves out the language words the search left out, and keeps kind words', () => {
        expect(highlightedTerms('mips add', SITE_SCOPE)).toEqual(['add'])
        expect(highlightedTerms('directive for MIPS strings', SITE_SCOPE)).toEqual([
            'directive',
            'strings'
        ])
        expect(highlightedTerms('mips add', languageScope('mips'))).toEqual(['mips', 'add'])
        expect(highlightedTerms('mips add')).toEqual(['mips', 'add'])
    })
})

describe('the kinds of Chapter each language has', () => {
    it.each(DOCUMENTATION_LANGUAGES)('lists those of the %s Documentation', async (language) => {
        const chapters = await documentationFor(language)
        const kinds = new Set(
            chapters.flatMap((chapter) =>
                chapter.entries.map((entry) => modifierKindOf(entry.kind))
            )
        )
        kinds.delete(null)
        expect([...kinds].sort()).toEqual([...LANGUAGE_KINDS[language]].sort())
    })

    it('adds Lectures beside Documentation only', () => {
        expect(scopeKinds(languageScope('z80'))).toContain('lecture')
        expect(scopeKinds(languageScope('z80', false))).not.toContain('lecture')
        expect(scopeKinds(COURSES_SCOPE)).toEqual([])
        expect(scopeKinds(SITE_SCOPE)).toHaveLength(8)
    })
})
