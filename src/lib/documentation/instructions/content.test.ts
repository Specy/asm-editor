import { describe, expect, it } from 'vitest'
import { instructionContentFromFiles, instructionDescription } from './content'
import { withInstructionContent } from './resolve'
import type { DocumentationEntry } from '../entries'

describe('authored instruction content', () => {
    it('keeps a program and its Target together, including dotted instruction names', () => {
        const content = instructionContentFromFiles(
            { './instructions/fadd.d.asm': 'fadd.d f0, f1, f2\n' },
            { 'fadd.d': { target: 'RISC-V-64', presentation: { initialRegisterFile: 'fpu' } } }
        )
        expect(content['fadd.d'].example).toEqual({
            code: 'fadd.d f0, f1, f2\n',
            target: 'RISC-V-64',
            presentation: { initialRegisterFile: 'fpu' }
        })
        expect(content['fadd.d'].description).toBeUndefined()
    })

    it('rejects missing sources, missing metadata and duplicate programs', () => {
        expect(() => instructionContentFromFiles({ './add.asm': 'add' }, {})).toThrow(
            'has no metadata'
        )
        expect(() => instructionContentFromFiles({}, { add: { target: 'MIPS' } })).toThrow(
            'has no source'
        )
        expect(() =>
            instructionContentFromFiles(
                { './a/add.asm': 'add', './b/add.asm': 'add' },
                { add: { target: 'MIPS' } }
            )
        ).toThrow('Duplicate')
        expect(() =>
            instructionContentFromFiles({ './add.asm': ' \n' }, { add: { target: 'MIPS' } })
        ).toThrow('is empty')
    })

    it('supports future authored prose while retaining the Core description as the fallback', () => {
        const content = instructionContentFromFiles({}, {}, { add: 'An authored explanation.' })
        expect(instructionDescription(content.add, 'Core explanation.')).toBe(
            'An authored explanation.'
        )
        expect(instructionDescription(undefined, 'Core explanation.')).toBe('Core explanation.')
        expect(instructionDescription({ description: '  ' }, 'Core explanation.')).toBe(
            'Core explanation.'
        )
    })

    it('gives pages, the panel and search one supplement without changing instruction forms', () => {
        const entry: DocumentationEntry = {
            id: 'mips/instructions/add',
            language: 'mips',
            chapter: 'instructions',
            kind: 'instruction',
            title: 'add',
            names: ['add'],
            summary: 'Core summary.',
            href: '/documentation/mips/instruction/add',
            anchor: 'add',
            view: { type: 'markdown', markdown: 'Core forms.' },
            searchText: 'Core explanation.',
            code: 'add $t0, $t1, $t2'
        }
        const content = {
            description: 'Authored explanation. More detail.',
            example: { target: 'MIPS' as const, code: 'li $t1, 7\nli $t2, 5\nadd $t0, $t1, $t2' }
        }
        const resolved = withInstructionContent(entry, content)
        expect(resolved.instructionContent).toBe(content)
        expect(resolved.summary).toBe('Authored explanation.')
        expect(resolved.searchText).toContain('Core explanation.')
        expect(resolved.searchText).toContain(content.description)
        expect(resolved.code).toContain(content.example.code)
        expect(resolved.view).toBe(entry.view)
        expect(resolved.id).toBe(entry.id)
        expect(entry.summary).toBe('Core summary.')
        expect(withInstructionContent(entry, undefined)).toBe(entry)
    })

    it('keeps authored content independent of any one architecture', () => {
        const content = instructionContentFromFiles(
            { './move.asm': 'move.l #7,d0', './ld.asm': 'ld a,7', './mov.asm': 'mov rax,7' },
            { move: { target: 'M68K' }, ld: { target: 'Z80' }, mov: { target: 'X86' } }
        )
        expect(content.move.example?.target).toBe('M68K')
        expect(content.ld.example?.target).toBe('Z80')
        expect(content.mov.example?.target).toBe('X86')
    })
})
