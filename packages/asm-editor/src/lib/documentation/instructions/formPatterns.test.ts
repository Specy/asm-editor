import { describe, expect, it } from 'vite-plus/test'
import { patternText } from './document'
import { buildFormPatterns, literal, type ClassPart, type FormInput } from './formPatterns'

const R8 = ['a', 'b', 'c', 'd', 'e', 'h', 'l']

function r(member: string, symbol = 'r'): ClassPart {
    return { symbol, member, memberText: member, memberSymbolic: false }
}

function ld(destination: string, source: string, extra: Partial<FormInput> = {}): FormInput {
    return {
        code: `ld ${destination},${source}`,
        parts: [literal('ld '), r(destination), literal(', '), r(source, "r'")],
        tags: [],
        note: `Loads ${source.toUpperCase()} into ${destination.toUpperCase()}.`,
        facts: ['1 byte · 4 cycles'],
        ...extra
    }
}

function x86(destination: string, width: number, cpu: string): FormInput {
    return {
        code: `add ${destination}${width},reg${width}`,
        parts: [
            literal('add '),
            {
                symbol: destination,
                member: `${destination}${width}`,
                memberText: `${destination}${width}`,
                memberSymbolic: true,
                width
            },
            literal(', '),
            {
                symbol: 'reg',
                member: `reg${width}`,
                memberText: `reg${width}`,
                memberSymbolic: true,
                width
            }
        ],
        tags: [],
        facts: [cpu]
    }
}

describe('buildFormPatterns', () => {
    it('merges forms that differ only in a register of one class, with one templated note', () => {
        const forms = R8.flatMap((destination) => R8.map((source) => ld(destination, source)))
        const result = buildFormPatterns(forms, {
            // the Z80 adapter's own rule is positional; this one only has to see both registers
            templateNote: (form, merged) => {
                const [destination, source] = merged
                return form.note?.replace(
                    /^Loads (\w+) into (\w+)\.$/,
                    () => `Loads \`${source.symbol}\` into \`${destination.symbol}\`.`
                )
            }
        })
        expect(result.sections).toHaveLength(1)
        const [group] = result.sections[0].groups
        expect(group.note).toBe("Loads `r'` into `r`.")
        expect(group.patterns.map(patternText)).toEqual(["ld r, r'"])
        expect(group.patterns[0].forms).toHaveLength(49)
        // the fact every row shares moves to the header
        expect(result.headerFacts).toEqual(['1 byte · 4 cycles'])
        expect(group.patterns[0].facts).toEqual([])
    })

    it('writes a lone member as itself, and says which members a partial row covers', () => {
        const forms = [ld('a', 'b'), ld('a', 'c'), ld('b', 'c', { split: 'other timing' })]
        const result = buildFormPatterns(forms, {
            universe: (symbol) => (symbol === "r'" ? R8 : undefined)
        })
        const rows = result.sections[0].groups.flatMap((group) => group.patterns)
        expect(rows.map(patternText)).toEqual(["ld a, r'", 'ld b, c'])
        expect(rows[0].facts).toContain("r': b c")
    })

    it('never puts forms with different tags on one row, and sections them by tag', () => {
        const forms: FormInput[] = [
            ld('a', 'b'),
            ld('a', 'c', { tags: ['undocumented'] }),
            ld('a', 'd', { tags: ['pseudo', 'undocumented'] })
        ]
        const result = buildFormPatterns(forms)
        expect(result.sections.map((section) => section.tags)).toEqual([
            [],
            ['undocumented'],
            ['pseudo', 'undocumented']
        ])
        expect(result.sections[1].collapsed).toBe(true)
        expect(result.sections[0].collapsed).toBe(false)
    })

    it('says a tag every form has beside the name instead of on a section', () => {
        const result = buildFormPatterns([
            ld('a', 'b', { tags: ['pseudo'] }),
            ld('a', 'c', { tags: ['pseudo'] })
        ])
        expect(result.tags).toEqual(['pseudo'])
        expect(result.sections.map((section) => section.tags)).toEqual([[]])
    })

    it('chips the sizes of a row, each with the facts only its forms have', () => {
        const result = buildFormPatterns([
            x86('r/m', 8, '8086'),
            x86('r/m', 16, '8086'),
            x86('r/m', 32, '386'),
            x86('r/m', 64, 'x86-64')
        ])
        const [row] = result.sections[0].groups[0].patterns
        expect(patternText(row)).toBe('add r/m, reg')
        expect(row.chips.map((chip) => chip.label)).toEqual(['8', '16', '32', '64'])
        expect(row.chips.map((chip) => chip.title)).toEqual(['8086', '8086', '386', 'x86-64'])
        expect(row.parts.filter((part) => part.symbol).map((part) => part.text)).toEqual([
            'r/m',
            'reg'
        ])
    })

    it('drops a note that only repeats the description, and groups rows by note', () => {
        const forms: FormInput[] = [
            { code: 'lw $t1,-100($t2)', parts: [literal('lw a')], tags: [], note: 'Load word.' },
            {
                code: 'lw $t1,($t2)',
                parts: [literal('lw b')],
                tags: ['pseudo'],
                note: 'Effective.'
            },
            { code: 'lw $t1,label', parts: [literal('lw c')], tags: ['pseudo'], note: 'Label.' },
            { code: 'lw $t1,100', parts: [literal('lw d')], tags: ['pseudo'], note: 'Effective. ' }
        ]
        const result = buildFormPatterns(forms, { redundantNotes: ['load word'] })
        expect(result.sections[0].groups).toEqual([expect.objectContaining({ note: undefined })])
        expect(result.sections[1].groups.map((group) => group.note)).toEqual([
            'Effective.',
            'Label.'
        ])
        expect(result.sections[1].groups[0].patterns).toHaveLength(2)
    })

    it('puts what most rows do to the flags in the strip, and the rest on their rows', () => {
        const same = buildFormPatterns([
            ld('a', 'b', { flags: { Z: { kind: 'changed' } } }),
            ld('a', '(hl)' as string, { flags: { Z: { kind: 'changed' } }, split: 'mem' })
        ])
        expect(same.flags).toEqual({ Z: { kind: 'changed' } })
        const different = buildFormPatterns([
            ld('a', 'b', { flags: { Z: { kind: 'changed' } }, split: '1' }),
            ld('a', 'c', { flags: { Z: { kind: 'unchanged' } }, split: '2' })
        ])
        // a tie goes to the first row
        expect(different.flags).toEqual({ Z: { kind: 'changed' } })
        expect(different.flagsVary).toBe(true)
        expect(
            different.sections[0].groups.flatMap((group) => group.patterns.map((p) => p.flags))
        ).toEqual([undefined, { Z: { kind: 'unchanged' } }])
        expect(same.flagsVary).toBe(false)
    })
})
