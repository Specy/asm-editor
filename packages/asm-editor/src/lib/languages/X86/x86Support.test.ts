import { describe, expect, it } from 'vite-plus/test'
import { x86InstructionMap } from './X86-documentation'
import { x86FormRuns, x86IsUnsupported, x86Support, x86SupportNote } from './x86Support'

const instruction = (name: string) => x86InstructionMap.get(name)!

describe('which forms the Core runs', () => {
    it('runs a form that needs no extension, and the x87, SSE and AVX ones', () => {
        for (const name of [
            'add',
            'fadd',
            'addps',
            'addpd',
            'haddps',
            'pshufb',
            'vaddps',
            'vpermq',
            'vfmadd132ps',
            'andn',
            'mulx'
        ]) {
            expect(x86Support(instruction(name)).any, name).toBe(true)
        }
    })

    it('does not run AVX-512, APX or MMX forms', () => {
        const forms = instruction('vaddps').forms
        const running = forms.filter((form) => x86FormRuns('vaddps', form))
        expect(running.map((form) => form.operands.join(','))).toEqual([
            'xmmreg,xmmreg,xmmreg/mem128',
            'ymmreg,ymmreg,ymmreg/mem256'
        ])
        expect(x86Support(instruction('vaddps')).all).toBe(false)
        expect(x86Support(instruction('vpmovm2b')).any).toBe(false)
        expect(x86Support(instruction('movq')).any).toBe(true)
        expect(
            instruction('pshufb').forms.filter((form) => !x86FormRuns('pshufb', form))
        ).toHaveLength(1)
    })

    it('runs SSE4, AES and PCLMULQDQ only as their v forms', () => {
        for (const name of ['pminsd', 'blendps', 'ptest', 'aesenc', 'pclmulqdq', 'pcmpistri']) {
            expect(x86Support(instruction(name)).any, name).toBe(false)
        }
        for (const name of [
            'vpminsd',
            'vblendps',
            'vptest',
            'vaesenc',
            'vpclmulqdq',
            'vpcmpistri'
        ]) {
            expect(x86Support(instruction(name)).any, name).toBe(true)
        }
    })

    it('says in one sentence what it will not run', () => {
        expect(x86SupportNote(instruction('vpmovm2b'))).toBe(
            'This emulator does not support AVX-512.'
        )
        expect(x86SupportNote(instruction('vaddps'))).toBe(
            'The AVX-512 forms are not supported by this emulator.'
        )
        expect(x86SupportNote(instruction('blendps'))).toBe(
            'This emulator runs SSE4 only in its `v` form.'
        )
        expect(x86SupportNote(instruction('vpaddd'))).toBe(
            'The AVX-512 forms are not supported by this emulator.'
        )
        expect(x86SupportNote(instruction('vzeroupper'))).toBeUndefined()
    })

    it('claims nothing about an extension it knows nothing about', () => {
        for (const name of ['endbr64', 'getsec', 'cmpxchg16b']) {
            const support = x86Support(instruction(name))
            expect(support.missing, name).toEqual([])
            expect(x86IsUnsupported(instruction(name)), name).toBe(false)
            expect(x86SupportNote(instruction(name)), name).toBeUndefined()
        }
        expect(x86IsUnsupported(instruction('vpmovm2b'))).toBe(true)
        expect(x86IsUnsupported(instruction('vaddps'))).toBe(false)
    })
})
