import { describe, expect, it } from 'vite-plus/test'
import { riscvInstructionNames } from '#lib/languages/RISC-V/RISC-V-documentation.ts'
import { categoryProblems } from '../instructions/categories'
import { riscvInstructionCategories } from './categories'

describe('RISC-V instruction categories', () => {
    it('gives every documented mnemonic exactly one category RISC-V uses', () => {
        expect(
            categoryProblems(riscvInstructionCategories, riscvInstructionNames, 'risc-v')
        ).toEqual([])
    })
})
