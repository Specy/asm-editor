import { describe, expect, it } from 'vite-plus/test'
import type { InstructionDocument } from '#lib/documentation/instructions/document.ts'
import { instructionMarkdown } from './documentation'

const popf: InstructionDocument = {
    name: 'popf',
    longName: 'Pop flags',
    summary: 'Pops the flags.',
    tags: [],
    headerFacts: [],
    flags: {
        order: ['CF', 'IF', 'DF'],
        marks: { CF: { kind: 'changed' }, IF: { kind: 'changed' }, DF: { kind: 'unchanged' } },
        meanings: { changed: 'loaded from the stack' },
        notes: { IF: 'Loaded only with the privilege to change it.' }
    },
    sections: [],
    omitted: [],
    operands: []
}

describe('an instruction twin', () => {
    it('says what each mark means on its strip, then a flag’s note as a sentence of its own', () => {
        const markdown = instructionMarkdown(popf, {}, (href) => href)
        expect(markdown).toContain('| CF | loaded from the stack |')
        expect(markdown).toContain(
            '| IF | loaded from the stack. Loaded only with the privilege to change it. |'
        )
        expect(markdown).toContain('| DF | not changed |')
    })
})
