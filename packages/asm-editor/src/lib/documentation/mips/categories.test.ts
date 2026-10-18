import { describe, expect, it } from 'vite-plus/test'
import { mipsInstructionNames } from '#lib/languages/MIPS/MIPS-documentation.ts'
import { categoryProblems } from '../instructions/categories'
import { mipsInstructionCategories } from './categories'

describe('MIPS instruction categories', () => {
    it('gives every documented mnemonic exactly one category MIPS uses', () => {
        expect(categoryProblems(mipsInstructionCategories, mipsInstructionNames, 'mips')).toEqual(
            []
        )
    })
})
