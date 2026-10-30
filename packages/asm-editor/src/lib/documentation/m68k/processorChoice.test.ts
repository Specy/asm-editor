/**
 * The M68K Documentation as the Workbench's panel shows it to a program whose processor is known
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 36): without the
 * instructions, the rows and the sections a later processor brought, while the site's Chapters keep
 * everything.
 */
import { describe, expect, it } from 'vite-plus/test'
import type { M68kDialect } from '#lib/languages/M68K/m68kDialect.ts'
import { documentPatterns, patternText } from '../instructions/document'
import { m68kInstructionDocument } from './instructionDocument'
import { chapters, chaptersFor, M68K_LATER_PROCESSOR_SECTIONS } from './m68k'

const M68000: M68kDialect = { processor: '68000', bitFields: false }
const M68000_BIT: M68kDialect = { processor: '68000', bitFields: true }
const M68010: M68kDialect = { processor: '68010', bitFields: false }
const M68020: M68kDialect = { processor: '68020', bitFields: true }

function rows(name: string, dialect?: M68kDialect): string[] {
    const document = m68kInstructionDocument(name, dialect)
    return document ? documentPatterns(document).map(patternText) : []
}

/** The anchors a dialect's Chapter shows. */
function anchors(dialect: M68kDialect, chapter: string): string[] {
    const found = chaptersFor(dialect).chapters.find((each) => each.id === chapter)
    return found?.entries.map((entry) => entry.anchor) ?? []
}

describe('an instruction for a program’s processor', () => {
    it('draws only the rows of the forms the program can write', () => {
        expect(rows('move', M68000)).not.toContain('move ccr, <ea>')
        expect(rows('move', M68010)).toContain('move ccr, <ea>')
        expect(rows('move', M68020)).toEqual(rows('move'))
        expect(rows('muls', M68000)).toEqual(['muls <ea>, Dn'])
        expect(rows('muls', M68020)).toEqual(rows('muls'))
        //bit fields under `opt bit`, and nothing else of the 68020
        expect(rows('bfextu', M68000)).toEqual([])
        expect(rows('bfextu', M68000_BIT)).toEqual(rows('bfextu'))
        expect(m68kInstructionDocument('extb', M68000_BIT)).toBeUndefined()
        expect(m68kInstructionDocument('movec', M68000)).toBeUndefined()
    })

    it('says no privilege only a later processor gives, nor what the legend says of the 68020', () => {
        const fromSr = (dialect: M68kDialect) =>
            documentPatterns(m68kInstructionDocument('move', dialect)!).find(
                (pattern) => patternText(pattern) === 'move sr, <ea>'
            )!.facts
        expect(fromSr(M68000)).toEqual(['Size .w'])
        expect(fromSr(M68010)).toEqual(['Size .w', 'Privileged on the 68010 and 68020'])
        const legend = (name: string, symbol: string, dialect?: M68kDialect) =>
            m68kInstructionDocument(name, dialect)!.operands.find(
                (operand) => operand.symbol === symbol
            )!.meaning
        for (const dialect of [M68000, M68000_BIT, M68010]) {
            expect(legend('move', '<ea>', dialect)).not.toContain('68020')
            expect(legend('jmp', '<ea>', dialect)).not.toContain('68020')
        }
        expect(legend('move', '<ea>', M68020)).toBe(legend('move', '<ea>'))
        expect(legend('movec', 'Rc', M68010)).not.toContain('msp')
        expect(legend('movec', 'Rc', M68020)).toContain('msp')
    })
})

describe('the Chapters for a program’s processor', () => {
    it('leaves out the instructions a later processor brought', () => {
        const instructions = (dialect: M68kDialect) => anchors(dialect, 'instructions')
        expect(instructions(M68000)).not.toContain('extb')
        expect(instructions(M68000)).not.toContain('movec')
        expect(instructions(M68000)).not.toContain('bfextu')
        expect(instructions(M68000)).toContain('move')
        expect(instructions(M68000_BIT)).toContain('bfextu')
        expect(instructions(M68000_BIT)).not.toContain('extb')
        expect(instructions(M68010)).toContain('movec')
        expect(instructions(M68010)).not.toContain('bfextu')
        expect(instructions(M68020)).toContain('extb')
    })

    it('leaves out the sections a later processor needs', () => {
        expect(anchors(M68000, 'exceptions')).not.toContain('68010')
        expect(anchors(M68000, 'exceptions')).not.toContain('format-error')
        expect(anchors(M68000, 'exceptions')).toContain('frames')
        expect(anchors(M68010, 'exceptions')).toEqual(
            expect.arrayContaining(['68010', 'format-error'])
        )
        expect(anchors(M68010, 'exceptions')).not.toContain('68020')
        expect(anchors(M68010, 'exceptions')).not.toContain('master-stack')
        expect(anchors(M68000, 'addressing-modes')).not.toContain('control-registers')
        expect(anchors(M68000, 'addressing-modes')).not.toContain('bit-fields')
        expect(anchors(M68000_BIT, 'addressing-modes')).toContain('bit-fields')
        expect(anchors(M68000_BIT, 'addressing-modes')).not.toContain('scaled-index')
        expect(anchors(M68010, 'addressing-modes')).toContain('control-registers')
        expect(anchors(M68010, 'addressing-modes')).not.toContain('68020')
    })

    it('names the entries it leaves out, and leaves a 68020 program everything', () => {
        const { chapters: shown, hidden } = chaptersFor(M68000)
        expect(hidden).toContain('m68k/instructions/extb')
        expect(hidden).toContain('m68k/exceptions/68020')
        const ids = shown.flatMap((chapter) => chapter.entries.map((entry) => entry.id))
        expect(ids.filter((id) => hidden.has(id))).toEqual([])
        expect(chaptersFor(M68020).chapters).toBe(chapters())
        expect(chaptersFor(M68020).hidden.size).toBe(0)
        //made once per dialect, so a new analysis of the same program changes nothing
        expect(chaptersFor({ ...M68000 })).toBe(chaptersFor(M68000))
    })

    it('marks only sections the Chapters have, and keeps them on the site’s pages', () => {
        for (const [chapterId, sections] of Object.entries(M68K_LATER_PROCESSOR_SECTIONS)) {
            const site = chapters().find((chapter) => chapter.id === chapterId)!
            for (const anchor of Object.keys(sections)) {
                expect(
                    site.entries.some((entry) => entry.anchor === anchor),
                    `${chapterId}#${anchor}`
                ).toBe(true)
            }
        }
    })
})
