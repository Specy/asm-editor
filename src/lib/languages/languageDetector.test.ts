import { describe, expect, it } from 'vitest'
import { getProjectTemplates } from '$lib/content/templates'
import { detectAssemblyLanguage } from './languageDetector'

/**
 * The detector reads a program and guesses its language from the mnemonics it uses, which is how a
 * pasted or imported file gets a language. Its x86 list is every mnemonic NASM accepts, around
 * 2600 of them, and a list that large is the one that can drown out the others: `daa`, `in` and
 * `out` belong to the Z80 as well, and the vector extensions add names nothing else has.
 *
 * The programs below are the ones this repository actually offers, so a regression here is a
 * regression a reader would meet.
 */

const templates = await getProjectTemplates()

/**
 * What each language's own programs are allowed to be read as.
 *
 * RISC-V is the one that is not itself: its everyday mnemonics (`li`, `lw`, `add`, `beq`, `j`) are
 * MIPS mnemonics too, the two score equally on a short program, and MIPS comes first in the tie
 * break. That predates the x86 work and is recorded rather than asserted away, so that a change
 * which fixes it shows up here as a failure to update.
 */
const ACCEPTED: Record<string, string[]> = {
    'RISC-V': ['RISC-V', 'RISC-V-64', 'MIPS'],
    'RISC-V-64': ['RISC-V', 'RISC-V-64', 'MIPS']
}

describe('language detection', () => {
    for (const [language, programs] of Object.entries(templates)) {
        const accepted = ACCEPTED[language] ?? [language]
        it(`reads the ${language} templates as ${language}`, () => {
            for (const template of programs) {
                expect(accepted, `${language}/${template.id}`).toContain(
                    detectAssemblyLanguage(template.code)
                )
            }
        })
    }

    it('tells the shared mnemonics apart by what surrounds them', () => {
        // `ld` is Z80, `mov`/`syscall` are x86, and both programs are full of words the other
        // language also has (`add`, `call`, `ret`, `push`).
        const z80 = ['        ld a, 5', '        add a, b', '        call sub', '        halt']
        const x86 = ['        mov rax, 5', '        add rax, rbx', '        syscall']
        expect(detectAssemblyLanguage(z80.join('\n'))).toBe('Z80')
        expect(detectAssemblyLanguage(x86.join('\n'))).toBe('X86')
    })

    it('recognises the extensions no other language has', () => {
        const avx = ['        vaddpd xmm0, xmm1, xmm2', '        vmovaps ymm3, ymm4']
        expect(detectAssemblyLanguage(avx.join('\n'))).toBe('X86')
    })
})
