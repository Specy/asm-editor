import { describe, expect, it } from 'vite-plus/test'
import type { EntryKind } from '#lib/documentation/entryKinds.ts'
import { coupleLabel, findCouples, type CoupleNames } from './queryCouples'

/**
 * A scope's names as the engine reads them, made up: each name with the kind of its entry, the
 * word-like ones apart. A name's entry is the name itself, so a test reads what was found.
 */
const ENTRIES: Record<string, EntryKind> = {
    tst: 'instruction',
    test: 'instruction',
    and: 'instruction',
    in: 'instruction',
    set: 'instruction',
    loop: 'instruction',
    move: 'instruction',
    syscall: 'instruction',
    call: 'instruction',
    '.end': 'directive',
    '.word': 'directive',
    $sp: 'register',
    a: 'register',
    an: 'addressing-mode',
    '(an)+': 'addressing-mode',
    "af'": 'register',
    af: 'register',
    z: 'flag',
    write: 'syscall',
    'task 9': 'trap-task',
    terminate: 'trap-task',
    printf: 'function',
    eq: 'condition-code',
    char: 'port',
    clear: 'screen-command'
}
const WORD_LIKE = new Set(['test', 'set', 'loop', 'move'])

const names: CoupleNames<string> = {
    entries: (name, kinds) => {
        const lower = name.toLowerCase()
        // a directive's dot is optional, as for an exact name
        const spellings = [lower, lower.startsWith('.') ? lower.slice(1) : `.${lower}`]
        return spellings.filter((spelling) => kinds.includes(ENTRIES[spelling]))
    },
    kindOf: (name) => ENTRIES[name],
    wordLike: (name) => WORD_LIKE.has(name)
}

/** Each couple as the text it spans, what it pins and what it says. */
const couples = (query: string, apart: { start: number; end: number }[] = []) =>
    findCouples(query, names, apart).map(({ start, end, entries, label }) => ({
        text: query.slice(start, end),
        entries,
        label
    }))
const texts = (query: string) => couples(query).map((couple) => couple.text)

describe('couples', () => {
    it('reads a name with its noun, in either order', () => {
        expect(couples('tst instruction')).toEqual([
            { text: 'tst instruction', entries: ['tst'], label: 'The tst instruction first' }
        ])
        expect(couples('instruction tst')).toEqual([
            { text: 'instruction tst', entries: ['tst'], label: 'The tst instruction first' }
        ])
    })

    it("reads every kind's nouns, singular only", () => {
        expect(texts('tst opcode')).toEqual(['tst opcode'])
        expect(texts('tst mnemonic')).toEqual(['tst mnemonic'])
        expect(texts('end directive')).toEqual(['end directive'])
        expect(texts('word pseudo-op')).toEqual(['word pseudo-op'])
        expect(texts('word pseudo op')).toEqual(['word pseudo op'])
        expect(texts('write syscall')).toEqual(['write syscall'])
        expect(texts('write system call')).toEqual(['write system call'])
        expect(texts('terminate trap task')).toEqual(['terminate trap task'])
        expect(texts('$sp register')).toEqual(['$sp register'])
        expect(texts('z flag')).toEqual(['z flag'])
        expect(texts('eq condition code')).toEqual(['eq condition code'])
        expect(texts('(an)+ addressing mode')).toEqual(['(an)+ addressing mode'])
        expect(texts('char port')).toEqual(['char port'])
        expect(texts('clear screen command')).toEqual(['clear screen command'])
        expect(texts('printf function')).toEqual(['printf function'])
        // a plural asks about a kind, not for one
        expect(texts('tst instructions')).toEqual([])
        expect(texts('instructions tst')).toEqual([])
        expect(texts('end directives')).toEqual([])
    })

    it("needs the name to be one of the noun's kind", () => {
        expect(texts('loop directive')).toEqual([])
        // `call` is an instruction, not a function
        expect(texts('function call')).toEqual([])
        expect(texts('printf instruction')).toEqual([])
        expect(texts('tst function')).toEqual([])
    })

    it('says a syscall is a trap task where every entry it names is one', () => {
        expect(couples('terminate syscall')[0].label).toBe('The terminate trap task first')
        expect(couples('write trap task')[0].label).toBe('The write syscall first')
        expect(coupleLabel('exit', 'syscall', ['syscall', 'trap-task'])).toBe(
            'The exit syscall first'
        )
        expect(coupleLabel('cf', 'condition-code', ['condition-code'])).toBe(
            'The cf condition code first'
        )
    })

    it('takes any name before its noun, word-like names and stop words too', () => {
        expect(texts('test instruction')).toEqual(['test instruction'])
        expect(texts('and instruction')).toEqual(['and instruction'])
        expect(texts('what does the in instruction read')).toEqual(['in instruction'])
        expect(texts('loop instruction')).toEqual(['loop instruction'])
    })

    it('takes an article before its noun only when typed as code', () => {
        expect(texts('what is a register')).toEqual([])
        expect(texts('what is an addressing mode')).toEqual([])
        expect(texts('the A register')).toEqual(['A register'])
        expect(texts('AN addressing mode')).toEqual(['AN addressing mode'])
    })

    it('takes a name after its noun only when it is no ordinary word, unless typed as code', () => {
        expect(texts('what is the instruction set')).toEqual([])
        expect(texts('instruction loop')).toEqual([])
        expect(texts('register a')).toEqual([])
        expect(texts('instruction in')).toEqual([])
        expect(texts('instruction SET')).toEqual(['instruction SET'])
        expect(texts('register A')).toEqual(['register A'])
        expect(texts('directive .word')).toEqual(['directive .word'])
        expect(texts('register $sp')).toEqual(['register $sp'])
    })

    it('breaks a couple at any punctuation between its words', () => {
        expect(texts('tst, instruction')).toEqual([])
        expect(texts('tst. instruction')).toEqual([])
        expect(texts('tst (instruction)')).toEqual([])
        expect(texts('instruction: tst')).toEqual([])
        expect(texts('"tst" instruction')).toEqual([])
        expect(texts('write system, call')).toEqual([])
        // punctuation around the couple is the sentence's, and left out of it
        expect(texts('(tst instruction)')).toEqual(['tst instruction'])
        expect(texts('what is the tst instruction?')).toEqual(['tst instruction'])
        expect(texts('register $sp, please')).toEqual(['register $sp'])
    })

    it('reads a name whose own punctuation is part of it', () => {
        expect(couples("af' register")[0]).toMatchObject({ text: "af' register", entries: ["af'"] })
        expect(couples("register af'")[0]).toMatchObject({ text: "register af'", entries: ["af'"] })
        expect(couples('register af,')[0]).toMatchObject({ text: 'register af', entries: ['af'] })
    })

    it('gives offsets into the query as typed, its spacing and case kept', () => {
        const query = '  why does TST   Instruction\tset flags'
        const [found] = findCouples(query, names)
        expect(query.slice(found.start, found.end)).toBe('TST   Instruction')
        expect(found.start).toBe(11)
        expect(found.label).toBe('The TST instruction first')
        expect(texts('Write  System   Call')).toEqual(['Write  System   Call'])
    })

    it('finds several couples in the order typed, a word in one at most', () => {
        expect(texts('tst instruction and the end directive')).toEqual([
            'tst instruction',
            'end directive'
        ])
        // the name after the first noun is taken, so the second noun has none before it
        expect(texts('instruction tst instruction')).toEqual(['instruction tst'])
        // a noun is a name of another kind's couple (`syscall` the instruction)
        expect(texts('syscall instruction')).toEqual(['syscall instruction'])
    })

    it('takes no name from inside a noun of two words', () => {
        expect(texts('the system call instruction')).toEqual([])
    })

    it('leaves out the words it is told to, a language name', () => {
        expect(texts('tst instruction')).toEqual(['tst instruction'])
        expect(couples('tst instruction', [{ start: 0, end: 3 }])).toEqual([])
        expect(couples('m68k tst instruction', [{ start: 0, end: 4 }])).toHaveLength(1)
    })
})
