import { describe, expect, it } from 'vite-plus/test'
import { plainText } from '../entries'
import {
    descriptionAfterSummary,
    documentSignature,
    type FormPattern,
    type InstructionDocument
} from './document'
import { documentHover } from './hoverLine'

function pattern(text: string): FormPattern {
    return { parts: [{ text }], chips: [], facts: [], forms: [], details: [] }
}

function document(
    sections: { tags?: InstructionDocument['tags']; rows: string[] }[]
): InstructionDocument {
    return {
        name: 'ret',
        longName: 'Return',
        summary: 'Returns to the caller.',
        category: 'control-flow',
        tags: [],
        headerFacts: ['8086 and later'],
        sections: sections.map((section) => ({
            tags: section.tags ?? [],
            collapsed: false,
            groups: [{ patterns: section.rows.map(pattern) }]
        })),
        omitted: [],
        operands: []
    }
}

describe('documentSignature', () => {
    it('brackets operands a form may leave out, and stops after three', () => {
        expect(documentSignature(document([{ rows: ['ret', 'ret imm16'] }]))).toBe('[imm16]')
        expect(documentSignature(document([{ rows: ['ret a', 'ret b', 'ret c', 'ret d'] }]))).toBe(
            'a | b | c | …'
        )
        expect(documentSignature(document([{ rows: ['ret'] }]))).toBeUndefined()
    })

    it('reads the untagged forms, and leaves out what a language skips', () => {
        const built = document([
            { rows: ['ret a', 'ret acc'] },
            { tags: ['pseudo'], rows: ['ret p'] }
        ])
        expect(documentSignature(built, (row) => row.parts[0].text.endsWith('acc'))).toBe('a')
    })
})

describe('descriptionAfterSummary', () => {
    it('drops the first sentence when it is the summary, cut or whole', () => {
        expect(descriptionAfterSummary('Adds them. Then more.', 'Adds them.', plainText)).toBe(
            'Then more.'
        )
        expect(descriptionAfterSummary('Adds them.', 'Adds them.', plainText)).toBeUndefined()
        expect(
            descriptionAfterSummary(
                'Adds a long thing, e.g. this. More.',
                'Adds a long…',
                plainText
            )
        ).toBe('More.')
        expect(descriptionAfterSummary('Other text. More.', 'Adds them.', plainText)).toBe(
            'Other text. More.'
        )
    })
})

describe('documentHover', () => {
    it('heads with the long name and the italic line, then the summary and the rows', () => {
        const blocks = documentHover(
            document([{ rows: ['ret', 'ret imm16'] }, { tags: ['privileged'], rows: ['ret x'] }]),
            { href: '/documentation/x86/instruction/ret' }
        )
        expect(blocks).toEqual([
            '**ret** Return\n\n*Control flow · 8086 and later*',
            'Returns to the caller.',
            '`ret`  \n`ret imm16`  \n`ret x` · Privileged',
            '[Documentation](/documentation/x86/instruction/ret)'
        ])
    })
})
