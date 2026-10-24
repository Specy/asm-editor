import { describe, expect, it } from 'vite-plus/test'
import { z80InstructionNames } from '#lib/languages/Z80/Z80-documentation.ts'
import { categoryProblems } from '../instructions/categories'
import { z80InstructionCategories } from './categories'

describe('Z80 instruction categories', () => {
    it('gives every documented mnemonic exactly one category Z80 uses', () => {
        expect(categoryProblems(z80InstructionCategories, z80InstructionNames, 'z80')).toEqual([])
    })
})
