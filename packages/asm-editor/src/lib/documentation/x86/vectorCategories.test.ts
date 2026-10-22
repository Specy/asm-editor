import { describe, expect, it } from 'vite-plus/test'
import { X86_INSTRUCTIONS } from '#lib/languages/X86/X86-documentation.ts'
import { x86Support } from '#lib/languages/X86/x86Support.ts'
import { VECTOR_CATEGORIES, VECTOR_SECTIONS, vectorCategory } from './vectorCategories'

const VECTOR_FEATURES = new Set([
    'SSE',
    'SSE2',
    'SSE3',
    'SSSE3',
    'SSE41',
    'SSE42',
    'AVX',
    'AVX2',
    'FMA'
])

describe('the vector categories', () => {
    it('file every vector mnemonic the Core runs under exactly one', () => {
        // `crc32` came with SSE4.2 and works on the general-purpose registers
        const vector = X86_INSTRUCTIONS.filter(
            (instruction) =>
                x86Support(instruction).any &&
                instruction.name !== 'crc32' &&
                instruction.forms.some((form) => form.features.some((f) => VECTOR_FEATURES.has(f)))
        )
        expect(vector.length).toBeGreaterThan(700)
        expect(
            vector.filter((instruction) => !vectorCategory(instruction.name)).map((i) => i.name)
        ).toEqual([])
        const used = new Set(vector.map((instruction) => vectorCategory(instruction.name)))
        expect([...used].sort()).toEqual(VECTOR_CATEGORIES.map((category) => category.id).sort())
    })

    it('names NASM headings that exist', () => {
        const sections = new Set(X86_INSTRUCTIONS.map((instruction) => instruction.section))
        for (const section of VECTOR_SECTIONS) expect(sections.has(section), section).toBe(true)
    })

    it('reads the same for the AVX spelling and the legacy one', () => {
        for (const [legacy, avx] of [
            ['paddd', 'vpaddd'],
            ['shufps', 'vshufps'],
            ['cvtdq2ps', 'vcvtdq2ps'],
            ['movaps', 'vmovaps'],
            ['pand', 'vpand']
        ]) {
            expect(vectorCategory(avx), avx).toBe(vectorCategory(legacy))
        }
        expect(vectorCategory('vzeroupper')).toBe('state')
        expect(vectorCategory('vfmadd231ps')).toBe('fused')
        expect(vectorCategory('vpgatherdd')).toBe('masked')
        expect(vectorCategory('vpermq')).toBe('shuffle')
        expect(vectorCategory('vextractf128')).toBe('lane')
        expect(vectorCategory('vldqqu')).toBe(vectorCategory('vlddqu'))
        expect(vectorCategory('vldqqu')).toBe('moves')
    })
})
