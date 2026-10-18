import { describe, expect, it } from 'vite-plus/test'
import {
    z80InstructionMap,
    z80InstructionNames,
    type Z80InstructionVariant
} from '#lib/languages/Z80/Z80-documentation.ts'
import { documentPatterns, patternText, type InstructionDocument } from '../instructions/document'
import { z80InstructionDocument, z80FormCode } from './instructionDocument'
import { chapters } from './z80'

const documents = z80InstructionNames.map((name) => z80InstructionDocument(name))

function sectionRows(document: InstructionDocument): Record<string, string[]> {
    return Object.fromEntries(
        document.sections.map((section) => [
            section.tags.join(',') || 'forms',
            section.groups.flatMap((group) => group.patterns.map(patternText))
        ])
    )
}

function row(name: string, text: string) {
    const document = z80InstructionDocument(name)
    for (const section of document.sections) {
        for (const group of section.groups) {
            const pattern = group.patterns.find((own) => patternText(own) === text)
            if (pattern) return { section, note: group.note, pattern }
        }
    }
    throw new Error(`${name} has no row ${text}`)
}

describe('Z80 instruction documents', () => {
    it('writes ld in the order of the manual, its 49 register loads as one row', () => {
        const rows = sectionRows(z80InstructionDocument('ld'))
        expect(rows.forms.slice(0, 8)).toEqual([
            "ld r, r'",
            'ld r, nn',
            'ld r, (hl)',
            'ld r, (ix+dd)',
            'ld (hl), r',
            'ld (ix+dd), r',
            'ld (hl), nn',
            'ld (ix+dd), nn'
        ])
        expect(rows.forms).toHaveLength(28)
        expect(rows.pseudo).toEqual(["ld rr, rr'", 'ld bc, (hl)', 'ld (hl), rr'])
        expect(rows.undocumented).toEqual([
            'ld ixh/l, nn',
            'ld r, ixh/l',
            'ld ixh/l, r',
            "ld ixh/l, ixh/l'"
        ])

        const loads = row('ld', "ld r, r'")
        expect(loads.pattern.forms).toHaveLength(49)
        expect(loads.note).toBe("The contents of `r'` are loaded into `r`.")
        expect(loads.pattern.forms.every((form) => form.note === undefined)).toBe(true)
    })

    it('keeps the forms that differ in size or speed on rows of their own', () => {
        expect(row('ld', 'ld (nnnn), hl').pattern.facts).toEqual(['3 bytes · 16 cycles'])
        expect(row('ld', 'ld (nnnn), rr').pattern.facts).toEqual([
            '4 bytes · 20 cycles',
            'rr: bc de sp'
        ])
    })

    it('merges every IY form onto the row of its IX twin', () => {
        const index = row('ld', 'ld ix, nnnn')
        expect(index.pattern.forms.map((form) => form.code)).toEqual(['ld ix, nnnn', 'ld iy, nnnn'])
        expect(index.pattern.parts.find((part) => part.text === 'ix')?.symbol).toBe(true)
        expect(row('ld', 'ld r, (ix+dd)').note).toBe(
            'Loads the value pointed to by IX plus `dd` into `r`.'
        )
        for (const document of documents) {
            for (const pattern of documentPatterns(document)) {
                const codes = pattern.forms.map((form) => form.code)
                for (const code of codes.filter((own) => /\bix/.test(own))) {
                    expect(codes, `${document.name}: ${code}`).toContain(
                        code.replace(/\bix/g, 'iy')
                    )
                }
                expect(
                    codes.some((code) => /\biy/.test(code)) &&
                        !codes.some((code) => /\bix/.test(code)),
                    `${document.name}: ${patternText(pattern)}`
                ).toBe(false)
            }
        }
    })

    it('writes add as its 8-bit forms, then the 16-bit ones, its flags per row', () => {
        const document = z80InstructionDocument('add')
        const rows = sectionRows(document)
        expect(rows.forms).toEqual([
            'add a, r',
            'add a, (hl)',
            'add a, nn',
            'add a, (ix+dd)',
            'add hl, rr',
            'add ix, rr',
            'add ix, ix'
        ])
        expect(rows.pseudo).toEqual(['add r', 'add (hl)', 'add nn', 'add (ix+dd)'])
        expect(rows.undocumented).toEqual(['add a, ixh/l'])
        expect(rows['pseudo,undocumented']).toEqual(['add ixh/l'])

        // `add a, r` sets every flag, `add hl, rr` leaves S, Z and P/V alone: the strip says what
        // the 8-bit rows do, and the 16-bit rows carry their own
        expect(document.flags?.marks?.Z.kind).toBe('changed')
        expect(document.flags?.marks?.['P/V']).toEqual({
            kind: 'changed',
            title: 'holds the signed overflow'
        })
        expect(document.flags?.varies).toBe(true)
        expect(row('add', 'add a, r').pattern.flags).toBeUndefined()
        expect(row('add', 'add hl, rr').pattern.flags?.Z.kind).toBe('unchanged')
        expect(row('add', 'add hl, rr').note).toBe('The value of `rr` is added to HL.')
    })

    it('puts the flags in the header when every row agrees', () => {
        const document = z80InstructionDocument('and')
        expect(document.flags?.order).toEqual(['S', 'Z', 'H', 'P/V', 'N', 'C'])
        expect(document.flags?.marks).toEqual({
            S: { kind: 'changed' },
            Z: { kind: 'changed' },
            H: { kind: 'set' },
            'P/V': { kind: 'changed', title: 'holds the parity of the result' },
            N: { kind: 'cleared' },
            C: { kind: 'cleared' }
        })
        expect(documentPatterns(document).every((pattern) => pattern.flags === undefined)).toBe(
            true
        )
        // the Core's `*`: `ccf` inverts C, which is not "undefined"
        expect(z80InstructionDocument('ccf').flags?.marks?.C.kind).toBe('changed')
        expect(z80InstructionDocument('bit').flags?.marks?.S.kind).toBe('undefined')
    })

    it('writes each bit of bit, set and res as one b', () => {
        expect(sectionRows(z80InstructionDocument('bit'))).toEqual({
            forms: ['bit b, r', 'bit b, (hl)', 'bit b, (ix+dd)']
        })
        for (const name of ['set', 'res']) {
            expect(sectionRows(z80InstructionDocument(name))).toEqual({
                forms: [`${name} b, r`, `${name} b, (hl)`, `${name} b, (ix+dd)`],
                undocumented: [`${name} b, (ix+dd), r`]
            })
        }
        expect(row('bit', 'bit b, r').pattern.forms).toHaveLength(56)
        expect(row('bit', 'bit b, r').note).toBe('Tests bit `b` of `r`.')
    })

    it('writes the conditions of a branch as one cc, the unconditional form first', () => {
        expect(sectionRows(z80InstructionDocument('jp'))).toEqual({
            forms: ['jp nnnn', 'jp cc, nnnn', 'jp (hl)', 'jp (ix)'],
            pseudo: ['jp hl', 'jp cc, nnnn', 'jp ix']
        })
        const conditional = row('jp', 'jp cc, nnnn')
        expect(conditional.pattern.forms).toHaveLength(8)
        expect(conditional.note).toBe('If the condition `cc` is true, `nnnn` is copied to PC.')
        // `jr` takes only the first four conditions, and says so
        expect(row('jr', 'jr cc, offset').pattern.facts).toContain('cc: nz z nc c')
        expect(z80InstructionDocument('jr').headerFacts).toContain(
            '12/7 cycles: 12 when it jumps, 7 when it does not'
        )
    })

    it('writes push, pop, inc, sub, djnz and nop as a few rows', () => {
        expect(sectionRows(z80InstructionDocument('push'))).toEqual({
            forms: ['push rr', 'push ix']
        })
        expect(sectionRows(z80InstructionDocument('pop'))).toEqual({ forms: ['pop rr', 'pop ix'] })
        expect(row('push', 'push rr').note).toBe(
            'SP is decremented and the high byte of `rr` is stored into the memory location pointed to by SP. SP is decremented again and the low byte of `rr` is stored into the memory location pointed to by SP.'
        )
        expect(
            z80InstructionDocument('push').operands.find((own) => own.symbol === 'rr')?.meaning
        ).toBe('A register pair: `bc`, `de`, `hl` or `af`.')
        expect(sectionRows(z80InstructionDocument('inc'))).toEqual({
            forms: ['inc r', 'inc (hl)', 'inc (ix+dd)', 'inc rr', 'inc ix'],
            undocumented: ['inc ixh/l']
        })
        expect(sectionRows(z80InstructionDocument('sub')).forms).toEqual([
            'sub r',
            'sub (hl)',
            'sub nn',
            'sub (ix+dd)'
        ])
        const djnz = z80InstructionDocument('djnz')
        expect(sectionRows(djnz)).toEqual({ forms: ['djnz offset'] })
        expect(djnz.headerFacts).toEqual([
            '2 bytes · 13/8 cycles',
            '13 cycles when it jumps, 8 when it does not'
        ])
        const nop = z80InstructionDocument('nop')
        expect(sectionRows(nop)).toEqual({ forms: ['nop'] })
        expect(nop.headerFacts).toEqual(['1 byte · 4 cycles'])
    })

    it('tells the register A from the article in a templated note', () => {
        expect(row('in', 'in r, (c)').note).toBe(
            'A byte from the port at the 16-bit address contained in the BC register pair is written to `r`.'
        )
    })

    it('says which real instructions a pseudo spelling becomes', () => {
        const short = row('add', 'add r')
        expect(short.section.tags).toEqual(['pseudo'])
        expect(short.pattern.forms[0]).toMatchObject({ code: 'add b', expansion: ['add a, b'] })
        expect(row('ld', "ld rr, rr'").pattern.forms[0]).toMatchObject({
            code: 'ld bc, hl',
            expansion: ['ld b, h', 'ld c, l']
        })
        const real = new Set(
            [...z80InstructionMap.values()]
                .flat()
                .filter((own) => !own.isPseudo)
                .map(z80FormCode)
        )
        for (const document of documents) {
            for (const section of document.sections) {
                for (const pattern of section.groups.flatMap((group) => group.patterns)) {
                    for (const form of pattern.forms) {
                        const pseudo =
                            section.tags.includes('pseudo') || document.tags.includes('pseudo')
                        if (!pseudo) {
                            expect(form.expansion, form.code).toBeUndefined()
                            continue
                        }
                        expect(form.expansion?.length, form.code).toBeGreaterThan(0)
                        for (const step of form.expansion ?? [])
                            expect(real, form.code).toContain(step)
                    }
                }
            }
        }
    })

    it('never puts forms of different sizes, speeds or flags on one row', () => {
        const byCode = new Map<string, Z80InstructionVariant[]>()
        for (const variant of [...z80InstructionMap.values()].flat()) {
            const code = z80FormCode(variant)
            byCode.set(code, [...(byCode.get(code) ?? []), variant])
        }
        for (const document of documents) {
            for (const pattern of documentPatterns(document)) {
                const facts = new Set(
                    pattern.forms.flatMap((form) =>
                        (byCode.get(form.code) ?? []).map(
                            (own) =>
                                `${own.bytes} ${own.cycles.taken}/${own.cycles.notTaken} ${own.flags}`
                        )
                    )
                )
                expect(facts.size, `${document.name}: ${patternText(pattern)}`).toBe(1)
                for (const form of pattern.forms) expect(form.facts).toEqual([])
            }
        }
    })

    it('explains every symbol its rows use, on every page, with links that lead somewhere', () => {
        const hrefs = new Set(
            chapters().flatMap((chapter) => chapter.entries.map((entry) => entry.href))
        )
        for (const document of documents) {
            const explained = new Map(document.operands.map((operand) => [operand.symbol, operand]))
            for (const pattern of documentPatterns(document)) {
                for (const part of pattern.parts) {
                    if (part.symbol)
                        expect(explained.has(part.text), `${document.name}: ${part.text}`).toBe(
                            true
                        )
                }
            }
            for (const operand of document.operands) {
                expect(operand.meaning, `${document.name}: ${operand.symbol}`).not.toContain(
                    '{members}'
                )
                if (operand.href) expect(hrefs, operand.href).toContain(operand.href)
            }
        }
    })

    it('gives every mnemonic a long name, a summary, a category and every form a place', () => {
        for (const document of documents) {
            expect(document.longName, document.name).not.toBe('')
            expect(document.summary, document.name).not.toBe('')
            expect(document.category, document.name).toBeDefined()
            expect(document.omitted).toEqual([])
            const forms = documentPatterns(document).reduce(
                (sum, pattern) => sum + pattern.forms.length,
                0
            )
            expect(forms, document.name).toBe(z80InstructionMap.get(document.name)!.length)
        }
    })

    it('collapses the undocumented sections, and tags sll as a whole', () => {
        const sections = z80InstructionDocument('add').sections
        expect(sections.map((section) => section.collapsed)).toEqual([false, false, true, true])
        const sll = z80InstructionDocument('sll')
        expect(sll.tags).toEqual(['undocumented'])
        expect(sll.sections.map((section) => section.collapsed)).toEqual([false])
    })

    it('throws for a mnemonic the Z80 does not have', () => {
        expect(() => z80InstructionDocument('mov')).toThrow()
    })
})
