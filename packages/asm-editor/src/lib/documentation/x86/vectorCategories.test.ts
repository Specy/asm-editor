import { describe, expect, it } from 'vite-plus/test'
import { X86_INSTRUCTIONS } from '#lib/languages/X86/X86-documentation.ts'
import { x86Support } from '#lib/languages/X86/x86Support.ts'
import { VECTOR_CATEGORIES, vectorCategory } from './vectorCategories'

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
        const vector = X86_INSTRUCTIONS.filter(
            (instruction) =>
                x86Support(instruction).any &&
                instruction.forms.some((form) => form.features.some((f) => VECTOR_FEATURES.has(f)))
        )
        expect(vector.length).toBeGreaterThan(700)
        expect(
            vector.filter((instruction) => !vectorCategory(instruction.name)).map((i) => i.name)
        ).toEqual([])
        const used = new Set(vector.map((instruction) => vectorCategory(instruction.name)))
        expect([...used].sort()).toEqual(VECTOR_CATEGORIES.map((category) => category.id).sort())
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
    })
})
