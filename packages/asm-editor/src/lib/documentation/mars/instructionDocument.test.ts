import { describe, expect, it } from 'vite-plus/test'
import { MIPS } from '@specy/mips'
import { RISCV } from '@specy/risc-v'
import { mipsInstructionMap } from '#lib/languages/MIPS/MIPS-documentation.ts'
import { riscvInstructionMap } from '#lib/languages/RISC-V/RISC-V-documentation.ts'
import { documentPatterns, patternText, type InstructionDocument } from '../instructions/document'
import { normalizeNote } from '../instructions/formPatterns'
import {
    mipsInstructionDocument,
    riscvInstructionDocument,
    sentenceCase,
    splitDescription,
    type MarsForm
} from './instructionDocument'

/**
 * The Cores' pseudo-instruction templates, which the data modules do not carry yet: read here the
 * way `RISC-V-documentation.ts` reads its list (the RV64 one, each form once).
 */
function templates(): { mips: Map<string, string[]>; riscv: Map<string, string[]> } {
    const key = (name: string, example: string, types: string[]) =>
        [name, example.trim(), ...types].join('\0')
    const mips = new Map<string, string[]>()
    for (const form of MIPS.getInstructionSet()) {
        const id = key(
            form.name,
            form.example,
            form.tokens.slice(1).map((token) => token.type)
        )
        if (!mips.has(id)) mips.set(id, form.expansion)
    }
    const before = RISCV.is64Bit()
    RISCV.setIs64Bit(true)
    const riscv = new Map<string, string[]>()
    for (const form of RISCV.getInstructionSet()) {
        const id = key(
            form.name,
            form.example,
            form.tokens.slice(1).map((token) => token.type)
        )
        if (!riscv.has(id)) riscv.set(id, form.getExpansion())
    }
    RISCV.setIs64Bit(before)
    return { mips, riscv }
}

const TEMPLATES = templates()

function withTemplates(map: Map<string, string[]>, forms: readonly MarsForm[]): MarsForm[] {
    return forms.map((form) => ({
        ...form,
        expansion: map.get(
            [form.name, form.example.trim(), ...form.args.map(([token]) => token.type)].join('\0')
        )
    }))
}

function mips(name: string): InstructionDocument {
    return mipsInstructionDocument(
        name,
        withTemplates(TEMPLATES.mips, mipsInstructionMap.get(name)!)
    )
}

function riscv(name: string): InstructionDocument {
    return riscvInstructionDocument(
        name,
        withTemplates(TEMPLATES.riscv, riscvInstructionMap.get(name)!)
    )
}

function rows(document: InstructionDocument): string[] {
    return documentPatterns(document).map(patternText)
}

function sectionRows(document: InstructionDocument, index: number): string[] {
    return document.sections[index].groups.flatMap((group) => group.patterns.map(patternText))
}

function everyDocument(): { language: string; document: InstructionDocument }[] {
    return [
        ...[...mipsInstructionMap.keys()].map((name) => ({
            language: 'mips',
            document: mips(name)
        })),
        ...[...riscvInstructionMap.keys()].map((name) => ({
            language: 'risc-v',
            document: riscv(name)
        }))
    ]
}

describe('MIPS instruction documents', () => {
    it('writes lw as its one real form, then its pseudo-instructions under three notes', () => {
        const document = mips('lw')
        expect(document.longName).toBe('Load word')
        expect(document.tags).toEqual([])
        const [forms, pseudo] = document.sections
        expect(forms.tags).toEqual([])
        expect(forms.groups).toEqual([{ note: undefined, patterns: [expect.anything()] }])
        expect(sectionRows(document, 0)).toEqual(['lw $t1, imm16($t2)'])
        expect(pseudo.tags).toEqual(['pseudo'])
        expect(pseudo.groups.map((group) => group.note)).toEqual([
            'Set $t1 to contents of effective memory word address',
            "Set $t1 to contents of memory word at label's address",
            "Read from label's address, reached through the %hi already in $t2"
        ])
        expect(sectionRows(document, 1)).toEqual([
            'lw $t1, ($t2)',
            'lw $t1, imm',
            'lw $t1, imm($t2)',
            'lw $t1, label($t2)',
            'lw $t1, label+imm32',
            'lw $t1, label+imm32($t2)',
            'lw $t1, label',
            'lw $t1, %lo(label)($t2)'
        ])
        // 12 forms, 9 rows; the merged widths stay apart from the real signed 16-bit form
        expect(mipsInstructionMap.get('lw')).toHaveLength(12)
        const imm = documentPatterns(document).find(
            (pattern) => patternText(pattern) === 'lw $t1, imm'
        )!
        expect(imm.chips).toEqual([])
        expect(imm.forms.map((form) => form.code)).toEqual([
            'lw $t1,-100',
            'lw $t1,100',
            'lw $t1,100000'
        ])
        expect(imm.forms[2].expansion).toEqual(['lui $at, hi(imm)', 'lw $t1, lo(imm)($at)'])
        // the names table's summary; MARS's own first sentence is left out of the description
        expect(document.summary).toBe(
            'Loads the 32-bit word at the address $t2 plus an offset into $t1; the address must be word-aligned.'
        )
        expect(document.description).toMatch(/^The address must be word-aligned/)
    })

    it('writes li as one pseudo row whose three forms keep their own notes', () => {
        const document = mips('li')
        expect(document.tags).toEqual(['pseudo'])
        expect(document.sections.map((section) => section.tags)).toEqual([[]])
        expect(rows(document)).toEqual(['li $t1, imm'])
        const [row] = documentPatterns(document)
        expect(row.forms.map((form) => [form.code, form.note])).toEqual([
            ['li $t1,-100', 'Set $t1 to 16-bit immediate (sign-extended)'],
            ['li $t1,100', 'Set $t1 to unsigned 16-bit immediate (zero-extended)'],
            ['li $t1,100000', 'Set $t1 to 32-bit immediate']
        ])
        expect(row.forms.map((form) => form.expansion)).toEqual([
            ['addiu $t1, $zero, imm'],
            ['ori $t1, $zero, imm'],
            ['lui $at, hi(imm)', 'ori $t1, $at, lo(imm)']
        ])
    })

    it('writes la as seven rows for its ten forms', () => {
        const document = mips('la')
        expect(document.tags).toEqual(['pseudo'])
        expect(rows(document)).toEqual([
            'la $t1, ($t2)',
            'la $t1, imm',
            'la $t1, imm($t2)',
            'la $t1, label',
            'la $t1, label($t2)',
            'la $t1, label+imm32',
            'la $t1, label+imm32($t2)'
        ])
    })

    it('keeps the real beq, add and addi apart from their pseudo widths', () => {
        expect(sectionRows(mips('beq'), 0)).toEqual(['beq $t1, $t2, label'])
        expect(sectionRows(mips('beq'), 1)).toEqual(['beq $t1, imm, label'])
        expect(rows(mips('add'))).toEqual(['add $t1, $t2, $t3', 'add $t1, $t2, imm'])
        // the merged row has no note of its own: each width keeps its sentence
        const [, merged] = documentPatterns(mips('add'))
        expect(merged.forms.map((form) => form.note)).toEqual([
            'Set $t1 to ($t2 plus 16-bit immediate)',
            'Set $t1 to ($t2 plus 32-bit immediate)'
        ])
        expect(rows(mips('addi'))).toEqual([
            'addi $t1, $t2, imm16',
            'addi $t1, $t2, imm32',
            'addi $t1, $t2, %lo(label)'
        ])
    })

    it('folds the eight ld forms into seven rows under one note', () => {
        const document = mips('ld')
        expect(rows(document)).toEqual([
            'ld $t1, imm($t2)',
            'ld $t1, imm32',
            'ld $t1, label',
            'ld $t1, label+imm32',
            'ld $t1, ($t2)',
            'ld $t1, label($t2)',
            'ld $t1, label+imm32($t2)'
        ])
        expect(document.sections[0].groups.map((group) => group.note)).toEqual([
            undefined,
            'Set $t1 and the next register to the 64 bits starting at effective memory word address'
        ])
    })

    it('writes the FP condition flag as cc and the CP0 register as MARS does', () => {
        expect(rows(mips('bc1t'))).toEqual(['bc1t label', 'bc1t cc, label'])
        expect(rows(mips('mfc0'))).toEqual(['mfc0 $t1, $8'])
        expect(mips('c.eq.d').operands.map((operand) => operand.symbol)).toEqual([
            '$f2',
            '$f4',
            'cc'
        ])
    })
})

describe('RISC-V instruction documents', () => {
    it('writes lw, li, la and sw', () => {
        expect(sectionRows(riscv('lw'), 0)).toEqual(['lw t1, imm12(t2)'])
        expect(sectionRows(riscv('lw'), 1)).toEqual([
            'lw t1, (t2)',
            'lw t1, imm',
            'lw t1, label',
            'lw t1, %lo(label)(t2)'
        ])
        expect(riscv('lw').longName).toBe('Load word')

        const li = riscv('li')
        expect(rows(li)).toEqual(['li t1, imm'])
        expect(documentPatterns(li)[0].forms.map((form) => form.code)).toEqual([
            'li t1,-100',
            'li t1,10000000',
            'li t1,1000000000000000'
        ])

        const la = riscv('la')
        expect(rows(la)).toEqual(['la t1, label'])
        expect(documentPatterns(la)[0].forms[0].expansion).toEqual([
            'auipc t1, pcrel_hi(label)',
            'addi t1, t1, pcrel_lo(label)'
        ])

        expect(rows(riscv('sw'))).toEqual([
            'sw t1, imm12(t2)',
            'sw t1, (t2)',
            'sw t1, imm12',
            'sw t1, imm32, t2',
            'sw t1, label, t2',
            'sw t1, %lo(label)(t2)'
        ])
    })

    it('says RV64 only beside the name of a mnemonic every form of which needs it', () => {
        const document = riscv('addw')
        expect(document.tags).toEqual(['rv64-only'])
        expect(document.sections.map((section) => section.tags)).toEqual([[]])
        expect(riscv('ld').tags).toEqual(['rv64-only'])
        expect(riscv('ld').sections.map((section) => section.tags)).toEqual([[], ['pseudo']])
    })

    it('gives the RV64 only forms of a mnemonic their own section', () => {
        // RARS has no mnemonic with both kinds of form today, so one is made from lw's
        const forms = riscvInstructionMap
            .get('lw')!
            .map((form) =>
                form.example === 'lw t1,10000000' ? { ...form, isRv64Only: true } : form
            )
        const document = riscvInstructionDocument('lw', forms)
        expect(document.tags).toEqual([])
        expect(document.sections.map((section) => section.tags)).toEqual([
            [],
            ['pseudo'],
            ['pseudo', 'rv64-only']
        ])
        // forms with different tags never share a row: the 32-bit form leaves `lw t1, imm`
        expect(sectionRows(document, 1)).toContain('lw t1, imm12')
        expect(sectionRows(document, 2)).toEqual(['lw t1, imm32'])
    })

    it('writes the rounding mode and the CSR as symbols', () => {
        expect(rows(riscv('fadd.d'))).toEqual(['fadd.d f1, f2, f3, rm', 'fadd.d f1, f2, f3'])
        expect(rows(riscv('csrrw'))).toEqual(['csrrw t0, csr, t1'])
        expect(rows(riscv('slli'))).toEqual(['slli t1, t2, imm6'])
    })

    it("links the manual's rule for the instruction, and a pseudo-instruction's for what it becomes", () => {
        expect(riscv('sra').reference).toEqual({
            label: 'RISC-V manual: sra',
            href: 'https://docs.riscv.org/reference/isa/v20260120/unpriv/rv32.html#norm:sll_srl_sra_op'
        })
        expect(riscv('mv').reference?.label).toBe('RISC-V manual: add')
        expect(riscv('fcvt.w.s').reference?.href).toMatch(
            /f-st-ext\.html#norm:fcvt-l-s_fcvt-w-s_op$/
        )
        expect(riscv('ld').reference?.href).toMatch(/rv64\.html#norm:ld_op_rv64i$/)
        // the N extension's return, which the manual dropped
        expect(riscv('uret').reference).toBeUndefined()
        expect(mips('add').reference).toBeUndefined()
    })
})

describe('the names', () => {
    it('reads the title before the colon, with or without a space', () => {
        expect(
            splitDescription('Load Word : Set $t1 to contents of effective memory word address')
        ).toEqual({
            title: 'Load Word',
            body: 'Set $t1 to contents of effective memory word address'
        })
        expect(splitDescription('Floating ADD (64 bit): assigns f1 to f2 + f3').title).toBe(
            'Floating ADD (64 bit)'
        )
        expect(
            splitDescription('Set t1 to contents of effective memory word address').title
        ).toBeUndefined()
        // a colon later in a sentence is no title
        expect(splitDescription('Reads it. Example: lw').title).toBeUndefined()
    })

    it('turns MARS capitals into sentence case and keeps acronyms', () => {
        expect(sentenceCase('ADDition')).toBe('Addition')
        expect(sentenceCase('Branch if EQual')).toBe('Branch if equal')
        expect(sentenceCase('NO OPeration')).toBe('No operation')
        expect(sentenceCase('Bitwise AND immediate')).toBe('Bitwise AND immediate')
        expect(sentenceCase('FP compare eq (single)')).toBe('FP compare eq (single)')
        expect(sentenceCase('Move from Coprocessor 0')).toBe('Move from coprocessor 0')
        expect(sentenceCase('Atomic Read/Clear CSR Immediate')).toBe(
            'Atomic read/clear CSR immediate'
        )
    })

    it('says what a second spelling is the same as, where RARS calls it an alias', () => {
        const notes = riscv('fssr').sections.flatMap((section) =>
            section.groups.map((group) => group.note)
        )
        expect(notes).toContain('Same as `fscsr t1`.')
        expect(notes.join(' ')).not.toMatch(/Alias/)
    })

    it('falls back to a pseudo form’s title when the real form has none', () => {
        // RARS writes "Set t1 to sign-extended 8-bit value…" for the real lb, "Load Byte : …" for the others
        expect(riscv('lb').longName).toBe('Load byte')
        // the summary is the names table's
        expect(riscv('lb').summary).toMatch(/^Loads the byte /)
    })
})

describe('every MIPS and RISC-V document', () => {
    const documents = everyDocument()

    it('explains every symbol its rows use', () => {
        for (const { language, document } of documents) {
            const explained = new Set(document.operands.map((operand) => operand.symbol))
            for (const pattern of documentPatterns(document)) {
                for (const part of pattern.parts) {
                    if (part.symbol) {
                        expect(explained, `${language} ${document.name}: ${part.text}`).toContain(
                            part.text
                        )
                    }
                }
            }
            for (const operand of document.operands) {
                expect(operand.meaning, `${language} ${document.name}: ${operand.symbol}`).not.toBe(
                    ''
                )
            }
        }
    })

    it('has a long name and a one-sentence summary', () => {
        for (const { language, document } of documents) {
            expect(document.longName, `${language} ${document.name}`).not.toBe('')
            expect(document.summary, `${language} ${document.name}`).toMatch(/^[A-Z].*[.…]$/)
        }
    })

    it('never repeats the description or the summary in a note', () => {
        for (const { language, document } of documents) {
            const description = document.description
                ? normalizeNote(document.description)
                : undefined
            const summary = normalizeNote(document.summary)
            for (const section of document.sections) {
                for (const group of section.groups) {
                    if (group.note) {
                        expect(normalizeNote(group.note), `${language} ${document.name}`).not.toBe(
                            summary
                        )
                        expect(normalizeNote(group.note), `${language} ${document.name}`).not.toBe(
                            description
                        )
                    }
                    for (const form of group.patterns.flatMap((pattern) => pattern.forms)) {
                        if (form.note) {
                            expect(
                                normalizeNote(form.note),
                                `${language} ${document.name}`
                            ).not.toBe(description)
                        }
                    }
                }
            }
        }
    })

    it('shows the expansion of every pseudo form, and none of a real one', () => {
        let pseudo = 0
        let expanded = 0
        for (const [language, map, templatesOf] of [
            ['mips', mipsInstructionMap, TEMPLATES.mips],
            ['risc-v', riscvInstructionMap, TEMPLATES.riscv]
        ] as const) {
            for (const forms of map.values()) {
                for (const form of withTemplates(templatesOf, forms)) {
                    if (form.isPseudo) pseudo++
                    else expect(form.expansion ?? [], `${language} ${form.example}`).toEqual([])
                }
            }
        }
        for (const { document } of documents) {
            for (const form of documentPatterns(document).flatMap((pattern) => pattern.forms)) {
                if (!form.expansion) continue
                expanded++
                for (const line of form.expansion) {
                    // no placeholder of the Cores is left, and no marker of the adapter's
                    expect(line, `${document.name} ${form.code}`).not.toMatch(
                        /\b[A-Z]{2,}\d*\b|\uE000/
                    )
                }
            }
        }
        expect(pseudo).toBeGreaterThan(500)
        expect(expanded).toBe(pseudo)
    })
})
