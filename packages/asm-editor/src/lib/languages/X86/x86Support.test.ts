import { describe, expect, it } from 'vite-plus/test'
import { x86InstructionMap } from './X86-documentation'
import {
    x86FormRuns,
    x86FormSupport,
    x86IsUnsupported,
    x86Support,
    x86SupportNote
} from './x86Support'

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

    it('runs SSE4 and AES only as their v forms', () => {
        for (const name of ['pminsd', 'blendps', 'ptest', 'aesenc', 'pcmpistri']) {
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

    it('runs the legacy PCLMULQDQ and the few legacy SSE4 encodings the Core decodes', () => {
        for (const name of [
            'pclmulqdq',
            'pclmullqhqdq',
            'pclmulhqhqdq',
            'pmulld',
            'movntdqa',
            'crc32'
        ]) {
            expect(x86Support(instruction(name)).all, name).toBe(true)
        }
        // `crc32` has no `v` form to send a reader to
        expect(x86SupportNote(instruction('crc32'))).toBeUndefined()
    })

    it('does not run an instruction on an MMX register, whatever extension NASM files it under', () => {
        for (const [name, operands] of [
            ['paddb', 'mmxreg,mmxreg/mem64'],
            ['psubq', 'mmxreg,mmxreg/mem64'],
            ['pmuludq', 'mmxreg,mmxreg/mem64'],
            ['cvtpi2ps', 'xmmreg,mmxreg/mem64'],
            ['movq2dq', 'xmmreg,mmxreg']
        ]) {
            const form = instruction(name).forms.find(
                (form) => form.operands.join(',') === operands
            )!
            expect(x86FormSupport(name, form), name).toEqual({ kind: 'family', family: 'MMX' })
        }
        expect(x86Support(instruction('psubq')).any).toBe(true)
        // `emms` has no MMX state to empty, and 0F 0D is a prefetch hint
        for (const name of ['emms', 'prefetch', 'prefetchw']) {
            expect(x86Support(instruction(name)).all, name).toBe(true)
        }
        expect(x86SupportNote(instruction('pfadd'))).toBe('This emulator does not support 3DNow!.')
    })

    it('names the instructions it does not run that NASM tags with no extension it does not run', () => {
        expect(x86SupportNote(instruction('movbe'))).toBe('This emulator does not support MOVBE.')
        expect(x86SupportNote(instruction('adcx'))).toContain('ADX')
        expect(x86IsUnsupported(instruction('adox'))).toBe(true)
        expect(x86SupportNote(instruction('fbld'))).toBe(
            'This emulator does not support the x87 BCD instructions.'
        )
        expect(x86IsUnsupported(instruction('fbstp'))).toBe(true)
        for (const name of ['movdiri', 'urdmsr', 'uwrmsr']) {
            expect(x86IsUnsupported(instruction(name)), name).toBe(true)
        }
    })

    it('offers the 16 and 32-bit forms NASM can also encode as APX, and not the ones only APX encodes', () => {
        for (const name of ['popcnt', 'lzcnt', 'tzcnt']) {
            expect(x86Support(instruction(name)).all, name).toBe(true)
        }
        for (const name of ['andn', 'blsi', 'bzhi']) {
            const running = instruction(name).forms.filter((form) => x86FormRuns(name, form))
            expect(
                running.map((form) => form.operands[0]),
                name
            ).toEqual(['reg32', 'reg64'])
        }
        // `mul eax, ebx, ecx` is APX's encoding; `{nf} mul` is the VEX `mulx`
        const mul = instruction('mul').forms.filter((form) => !x86FormRuns('mul', form))
        expect(mul.every((form) => form.features.includes('APX'))).toBe(true)
        expect(mul.map((form) => form.operands.join(','))).toContain('reg32,reg32,r/m32')
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
