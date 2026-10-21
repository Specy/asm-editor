import { describe, expect, it } from 'vite-plus/test'
import { X86_INSTRUCTIONS } from './X86-documentation'
import { x86Support } from './x86Support'

const summaryOf = (name: string) =>
    X86_INSTRUCTIONS.find((instruction) => instruction.name === name)?.summary

describe('the summaries of the aliases', () => {
    it('writes the compare predicates out', () => {
        expect(summaryOf('cmpltps')).toBe(
            'Compare Packed Single-Precision Floating-Point Values for Less Than'
        )
        expect(summaryOf('vcmpeq_uqsd')).toBe(
            'Compare Scalar Double-Precision Floating-Point Values for Equal (Unordered, Non-Signaling)'
        )
        expect(summaryOf('vcmpord_spd')).toBe(
            'Compare Packed Double-Precision Floating-Point Values for Ordered (Signaling)'
        )
        expect(summaryOf('vcmpfalsepd')).toBe(
            'Compare Packed Double-Precision Floating-Point Values for False'
        )
    })

    it('lends the FMA orders and the 256-bit moves their instruction’s', () => {
        expect(summaryOf('vfmadd123ps')).toBe(summaryOf('vfmadd213ps'))
        expect(summaryOf('vfnmsub312sd')).toBe(summaryOf('vfnmsub132sd'))
        expect(summaryOf('vfmaddsub321pd')).toBe(summaryOf('vfmaddsub231pd'))
        expect(summaryOf('vmovqqa')).toBe(summaryOf('vmovdqa'))
        expect(summaryOf('vldqqu')).toBe(summaryOf('vlddqu'))
        expect(summaryOf('vpclmulhqhqdq')).toContain('Carry-Less')
    })

    it('leaves no instruction the Core runs, apart from x87 and system ones, without a line', () => {
        const bare = X86_INSTRUCTIONS.filter(
            (instruction) =>
                !instruction.summary &&
                x86Support(instruction).any &&
                instruction.forms.some((form) => form.features.length > 0) &&
                !/^f|msr|^(rolx|salx)$/.test(instruction.name)
        )
        expect(bare.map((instruction) => instruction.name)).toEqual([])
    })
})
