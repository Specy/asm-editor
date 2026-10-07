import { describe, expect, it } from 'vitest'
import { render } from 'svelte/server'
import DOMPurify from 'isomorphic-dompurify'
import EntryBody from '$cmp/documentation/entries/EntryBody.svelte'
import InstructionExample from '$cmp/documentation/site/InstructionExample.svelte'
import InstructionPreview from '$cmp/documentation/site/InstructionPreview.svelte'
import { M68KUncompoundedInstructions } from '$lib/languages/M68K/M68K-documentation'
import { chapters as mipsChapters } from '../mips/mips'
import { chapters as riscvChapters } from '../riscv/riscv'
import { mipsInstructionContent } from '../mips/instructionContent'
import { riscvInstructionContent } from '../riscv/instructionContent'
import { load as loadMips } from '../../../routes/documentation/mips/instruction/[instructionName]/+page.server'
import { load as loadRiscv } from '../../../routes/documentation/risc-v/instruction/[instructionName]/+page.server'

describe('instruction content integration', () => {
    it('preserves the full long M68K branch example in the scrollable preview HTML', () => {
        const code = M68KUncompoundedInstructions.get('beq')!.interactiveExample!.code
        const result = render(InstructionPreview, { props: { code, language: 'M68K' } })
        const body = DOMPurify.sanitize(result.body, { RETURN_DOM: true }) as HTMLElement
        expect(body.querySelector('pre')?.classList.contains('code-gutter-spacing')).toBe(true)
        expect(body.querySelector('pre code')?.textContent).toBe(code)
        expect(body.querySelector('.asm-mnemonic')).not.toBeNull()
        expect(result.body).not.toContain('Loading...')
    })

    it.each([
        ['mips', 'add'],
        ['risc-v', 'ld']
    ])(
        'renders the complete %s %s example as crawlable code before hydration',
        (language, name) => {
            const content = (
                language === 'mips' ? mipsInstructionContent : riscvInstructionContent
            )[name]
            const example = content.example!
            const result = render(InstructionExample, { props: { instructionKey: name, example } })
            const body = DOMPurify.sanitize(result.body, { RETURN_DOM: true }) as HTMLElement
            expect(body.querySelector('pre code')?.textContent).toBe(example.code)
            expect(body.querySelector('.asm-mnemonic')).not.toBeNull()
            expect(body.querySelector('.asm-register')).not.toBeNull()
            expect(body.querySelector('.asm-number')).not.toBeNull()
            expect(body.querySelector('figcaption')).toBeNull()
            expect(result.body).not.toContain('Loading example')
            expect(result.body).not.toContain('Loading emulator')
            if (example.target === 'RISC-V-64') {
                expect(result.body).toContain('This example runs on RV64.')
            }
        }
    )

    it('renders the authored program in the Documentation panel without starting an Emulator', () => {
        const entry = mipsChapters()
            .find((chapter) => chapter.id === 'instructions')!
            .entries.find((candidate) => candidate.title === 'add')!
        const result = render(EntryBody, { props: { entry } })
        const body = DOMPurify.sanitize(result.body, { RETURN_DOM: true }) as HTMLElement
        const samples = [...body.querySelectorAll('pre code')]
        expect(
            samples.some((sample) => sample.textContent === entry.instructionContent!.example!.code)
        ).toBe(true)
        expect(result.body).not.toContain('Runnable example')
        expect(body.querySelector('.asm-mnemonic')).not.toBeNull()
        expect(result.body).not.toContain('Loading emulator')
    })

    it.each([
        ['mips', 'beq'],
        ['mips', 'lw'],
        ['risc-v', 'fadd.s'],
        ['risc-v', 'ld'],
        ['risc-v', 'addw']
    ])('serves the same %s %s program to its page, panel and search', async (language, name) => {
        const mips = language === 'mips'
        const chapters = mips ? mipsChapters() : riscvChapters()
        const entry = chapters
            .find((chapter) => chapter.id === 'instructions')!
            .entries.find((candidate) => candidate.title === name)!
        const content = (mips ? mipsInstructionContent : riscvInstructionContent)[name]
        const load = mips ? loadMips : loadRiscv
        const result = await load({ params: { instructionName: name } } as never)
        expect(entry.instructionContent).toBe(content)
        expect(result.props.content).toBe(content)
        expect(entry.code).toContain(content.example!.code)
        expect(entry.href).toBe(`/documentation/${language}/instruction/${name}`)
        const instruction = result.props.instruction[0]
        expect(result.props.description).toBe(instruction.description)
        expect(entry.searchText).toContain(instruction.description)
        if (name === 'ld' || name === 'addw') {
            expect(result.props.content?.example?.target).toBe('RISC-V-64')
        }
    })
})
