import { describe, expect, it } from 'vitest'
import {
    ALL_SHARDS,
    COURSES_SCOPE,
    documentationLanguageOf,
    languageScope,
    scopeForAgent,
    shardsOf
} from './scope'

describe('search scope', () => {
    it("reads a language's Documentation, its Course and the General course", () => {
        expect(shardsOf(languageScope('m68k'))).toEqual([
            'docs-m68k',
            'lectures-m68k',
            'lectures-assembly-basics'
        ])
    })

    it('reads the Documentation alone in an Exam', () => {
        expect(shardsOf(languageScope('z80', false))).toEqual(['docs-z80'])
    })

    it('reads every Course and no Documentation from the General course', () => {
        const shards = shardsOf(COURSES_SCOPE)
        expect(shards).toHaveLength(6)
        expect(shards.every((shard) => shard.startsWith('lectures-'))).toBe(true)
    })

    it('names eleven shards', () => {
        expect(ALL_SHARDS).toHaveLength(11)
    })

    it('sends a RISC-V-64 Project to the RISC-V Documentation', () => {
        expect(documentationLanguageOf('RISC-V-64')).toBe('risc-v')
        expect(documentationLanguageOf('X86')).toBe('x86')
    })
})

describe("the agents' scope", () => {
    const anywhere = { language: null, lectures: true }

    it("prefers the place's language over anything the agent asks", () => {
        expect(scopeForAgent({ language: 'mips', lectures: true }, 'z80', 'x86')).toEqual(
            languageScope('mips')
        )
    })

    it('then the language asked for, then the editor, then every Course', () => {
        expect(scopeForAgent(anywhere, 'z80', 'x86')).toEqual(languageScope('z80'))
        expect(scopeForAgent(anywhere, null, 'x86')).toEqual(languageScope('x86'))
        expect(scopeForAgent(anywhere, null, null)).toEqual(COURSES_SCOPE)
    })

    it('keeps an Exam to the Documentation, and needs a language there', () => {
        const exam = { language: null, lectures: false }
        expect(scopeForAgent(exam, 'm68k', null)).toEqual(languageScope('m68k', false))
        expect(scopeForAgent(exam, null, null)).toBeNull()
    })
})
