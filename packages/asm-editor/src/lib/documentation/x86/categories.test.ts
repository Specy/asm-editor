import { describe, expect, it } from 'vite-plus/test'
import { x86DocumentedNames } from '#lib/languages/X86/X86-documentation.ts'
import { categoryProblems } from '../instructions/categories'
import { x86InstructionCategories } from './categories'

describe('x86 instruction categories', () => {
    it('gives every documented mnemonic exactly one category x86 uses', () => {
        expect(categoryProblems(x86InstructionCategories, x86DocumentedNames, 'x86')).toEqual([])
    })
})
