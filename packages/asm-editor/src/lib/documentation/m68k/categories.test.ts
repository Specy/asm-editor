import { describe, expect, it } from 'vite-plus/test'
import { instructionsDocumentationList } from '#lib/languages/M68K/M68K-documentation.ts'
import { categoryProblems } from '../instructions/categories'
import { m68kInstructionCategories } from './categories'

describe('M68K instruction categories', () => {
    it('gives every documented mnemonic exactly one category M68K uses', () => {
        expect(
            categoryProblems(
                m68kInstructionCategories,
                instructionsDocumentationList.map((instruction) => instruction.name),
                'm68k'
            )
        ).toEqual([])
    })
})
