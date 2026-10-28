import { describe, expect, it, vi } from 'vite-plus/test'
import { render } from 'svelte/server'
import DOMPurify from 'isomorphic-dompurify'
import EntryBody from '#cmp/documentation/entries/EntryBody.svelte'
import InstructionExample from '#cmp/documentation/site/InstructionExample.svelte'
import InstructionPreview from '#cmp/documentation/site/InstructionPreview.svelte'
import InstructionDocumentView from '#cmp/documentation/instruction/InstructionDocumentView.svelte'
import { M68KUncompoundedInstructions } from '#lib/languages/M68K/M68K-documentation.ts'
import { mipsInstructionMap } from '#lib/languages/MIPS/MIPS-documentation.ts'
import { riscvInstructionMap } from '#lib/languages/RISC-V/RISC-V-documentation.ts'
import { x86InstructionMap } from '#lib/languages/X86/X86-documentation.ts'
import type { Chapter } from '../entries'
import { documentPatterns, patternText, type InstructionDocument } from './document'
import { x86InstructionDocument } from '../x86/instructionDocument'
import { chapters as m68kChapters } from '../m68k/m68k'
import { chapters as mipsChapters } from '../mips/mips'
import { chapters as riscvChapters } from '../riscv/riscv'
import { chapters as x86Chapters } from '../x86/x86'
import { chapters as z80Chapters } from '../z80/z80'
import { mipsInstructionContent } from '../mips/instructionContent'
import { riscvInstructionContent } from '../riscv/instructionContent'
import { load as loadM68k } from '../../../routes/documentation/m68k/instruction/[instructionName]/+page.server'
import { load as loadMips } from '../../../routes/documentation/mips/instruction/[instructionName]/+page.server'
import { load as loadRiscv } from '../../../routes/documentation/risc-v/instruction/[instructionName]/+page.server'
import { load as loadX86 } from '../../../routes/documentation/x86/instruction/[instructionName]/+page.server'
import { load as loadZ80 } from '../../../routes/documentation/z80/instruction/[instructionName]/+page.server'
import X86InstructionPage from '../../../routes/documentation/x86/instruction/[instructionName]/+page.svelte'
import Z80InstructionPage from '../../../routes/documentation/z80/instruction/[instructionName]/+page.svelte'

// An instruction page reads its own URL for its schema.org data, which only a request has.
vi.mock('$app/state', () => ({
    page: { url: new URL('https://asm-editor.specy.app/documentation/x86/instruction/add') }
}))

function instructionEntry(chapters: Chapter[], title: string) {
    return chapters
        .find((chapter) => chapter.id === 'instructions')!
        .entries.find((candidate) => candidate.title === title)!
}

function renderBody(entry: ReturnType<typeof instructionEntry>): HTMLElement {
    const result = render(EntryBody, { props: { entry } })
    return DOMPurify.sanitize(result.body, { RETURN_DOM: true }) as HTMLElement
}

function renderDocument(document: InstructionDocument): HTMLElement {
    const result = render(InstructionDocumentView, { props: { document } })
    return DOMPurify.sanitize(result.body, { RETURN_DOM: true }) as HTMLElement
}

/** Each section's heading and its rows' syntax, as the view draws them. */
function sectionsIn(element: Element): [string, string[]][] {
    return [...element.querySelectorAll('.section')].map((section) => [
        section.querySelector('.heading')?.textContent?.trim() ?? '',
        [...section.querySelectorAll('.syntax')].map((syntax) => syntax.textContent ?? '')
    ])
}

function tagsIn(element: Element): string[] {
    return [...element.querySelectorAll('.instruction-tag')].map(
        (badge) => badge.getAttribute('data-tag') ?? ''
    )
}

describe('instruction content integration', () => {
    it('preserves the full long M68K branch example in the scrollable preview HTML', () => {
        const code = M68KUncompoundedInstructions.get('beq')!.interactiveExample!.code
        const result = render(InstructionPreview, { props: { code, language: 'M68K' } })
        const body = DOMPurify.sanitize(result.body, { RETURN_DOM: true }) as HTMLElement
        expect(body.querySelector('pre')?.classList.contains('code-gutter-spacing')).toBe(true)
        expect(body.querySelector('pre code')?.textContent).toBe(code)
        expect(body.querySelector('.asm-keyword')).not.toBeNull()
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
            expect(body.querySelector('.asm-keyword')).not.toBeNull()
            expect(body.querySelector('.asm-variable-predefined')).not.toBeNull()
            expect(body.querySelector('.asm-number')).not.toBeNull()
            expect(body.querySelector('figcaption')).toBeNull()
            expect(result.body).not.toContain('Loading example')
            expect(result.body).not.toContain('Loading emulator')
            if (example.target === 'RISC-V-64') {
                expect(result.body).toContain('This example runs on RV64.')
            }
        }
    )

    it.each([
        ['x86', 'add', X86InstructionPage, loadX86],
        ['Z80', 'ld', Z80InstructionPage, loadZ80]
    ] as const)(
        'prerenders the %s %s page with its generated example as code, not a loading box',
        async (_language, name, Route, load) => {
            const data = await load({ params: { instructionName: name } } as never)
            const result = render(Route, { props: { data } as never })
            const body = DOMPurify.sanitize(result.body, { RETURN_DOM: true }) as HTMLElement
            expect(body.querySelector('.instruction-example pre code')?.textContent).toBe(
                data.props.example!.code
            )
            expect(result.body).not.toContain('Loading...')
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
        expect(body.querySelector('.asm-keyword')).not.toBeNull()
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
        expect(result.props.example).toBe(content.example)
        expect(entry.code).toContain(content.example!.code)
        expect(entry.href).toBe(`/documentation/${language}/instruction/${name}`)
        // the page and the panel draw the same document, and search reads its words
        if (entry.view.type !== 'instruction') throw new Error(`${entry.id} has no document`)
        expect(result.props.document).toEqual(entry.view.document)
        expect(entry.summary).toBe(result.props.document.summary)
        const first = (mips ? mipsInstructionMap : riscvInstructionMap).get(name)![0]
        expect(entry.searchText).toContain(first.description)
        if (name === 'ld' || name === 'addw') {
            expect(result.props.example?.target).toBe('RISC-V-64')
        }
    })

    it.each([
        ['M68K', 'directives', m68kChapters],
        ['MIPS', 'runtime-library', mipsChapters],
        ['RISC-V', 'runtime-library', riscvChapters],
        ['x86', 'runtime-library', x86Chapters],
        ['Z80', 'input-output', z80Chapters]
    ])('highlights a %s %s example as the entry’s own assembly', (_language, id, chapters) => {
        const entry = chapters()
            .find((chapter) => chapter.id === id)!
            .entries.find(
                (candidate) => candidate.view.type === 'fields' && candidate.view.example
            )!
        if (entry.view.type !== 'fields') throw new Error(`${entry.id} has no example`)
        const sample = renderBody(entry).querySelector('.code-sample')!
        expect(sample.querySelector('code')?.textContent).toBe(entry.view.example)
        expect(sample.querySelector('[class^="asm-"]')).not.toBeNull()
    })

    it('names an instruction’s long name in the header of its expanded body, not its category', () => {
        const body = renderBody(instructionEntry(mipsChapters(), 'add'))
        const entry = instructionEntry(mipsChapters(), 'add')
        if (entry.view.type !== 'instruction') throw new Error('add has no document')
        expect(body.querySelector('.header .long-name')?.textContent).toBe(
            entry.view.document.longName
        )
        // the sidebar and the Chapter's headings group by category; the header leaves it out
        expect(body.querySelector('.header')?.textContent).not.toContain('Arithmetic')
    })

    it('shows RISC-V li’s mnemonic-level Pseudo-instruction tag beside its long name', () => {
        const body = renderBody(instructionEntry(riscvChapters(), 'li'))
        expect(tagsIn(body.querySelector('.header .identity')!)).toEqual(['pseudo'])
    })

    it('says MIPS lw’s Pseudo-instruction tag once, on the section of its pseudo forms', async () => {
        const body = renderBody(instructionEntry(mipsChapters(), 'lw'))
        const sections = sectionsIn(body)
        expect(sections.map(([heading]) => heading)).toEqual(['Forms', 'Pseudo-instructions'])
        expect(sections[0][1]).toEqual(['lw $t1, imm16($t2)'])
        // no row repeats the tag its section heading says
        for (const row of body.querySelectorAll('.pattern-row')) expect(tagsIn(row)).toEqual([])
        expect(tagsIn(body.querySelector('.header .identity')!)).toEqual([])

        // the page shows every row; the panel the first six of a section and "Show all"
        const page = await loadMips({ params: { instructionName: 'lw' } } as never)
        const onPage = sectionsIn(renderDocument(page.props.document))
        expect(onPage.map(([heading]) => heading)).toEqual(sections.map(([heading]) => heading))
        for (const [index, [, rows]] of sections.entries()) {
            expect(onPage[index][1].slice(0, rows.length)).toEqual(rows)
        }
        expect(body.querySelector('.show-all')?.textContent?.trim()).toBe(
            `Show all ${onPage[1][1].length}`
        )
        expect(page.props.document.category).toBe('load-and-store')
        expect(page.props.document.tags).toEqual([])
    })

    it('says RV64 only beside the name of a mnemonic whose every form is RV64 only', () => {
        const body = renderBody(instructionEntry(riscvChapters(), 'ld'))
        expect(tagsIn(body.querySelector('.header .identity')!)).toEqual(['rv64-only'])
        expect(sectionsIn(body).map(([heading]) => heading)).not.toContain('RV64 only')
        expect(body.textContent).not.toContain('(64bit)')
    })

    it('lists M68K move’s forms with <ea>,sr and usp Privileged and ccr,<ea> the 68010’s', () => {
        const body = renderBody(instructionEntry(m68kChapters(), 'move'))
        const sections = sectionsIn(body)
        expect(sections.flatMap(([, rows]) => rows)).toHaveLength(7)
        expect(sections.slice(1)).toEqual([
            ['Privileged', ['move <ea>, sr', 'move usp, An', 'move An, usp']],
            ['68010 and later', ['move ccr, <ea>']]
        ])
        expect(sections[0][1]).toContain('move sr, <ea>')
        //the section says how to write a program for it, its option set as code
        expect(
            [...body.querySelectorAll('.explanation code')].map((code) => code.textContent)
        ).toContain('opt p=68010')
        const rows = [...body.querySelectorAll('.pattern-row')]
        expect(rows[0].querySelector('.pattern-facts')?.textContent).toContain('Sizes .b .w .l')
        expect(rows.at(-1)!.querySelector('.pattern-facts')?.textContent).toContain('Size .w')
    })

    it.each([
        ['beq', 'bcc', 'control-flow'],
        ['asl', 'asd', 'shifts-and-rotates'],
        ['asd', 'asd', 'shifts-and-rotates']
    ])('gives the M68K %s page its family’s forms and category', async (name, family, category) => {
        const page = await loadM68k({ params: { instructionName: name } } as never)
        const familyPage = await loadM68k({ params: { instructionName: family } } as never)
        const operands = (document: InstructionDocument) =>
            documentPatterns(document).map((pattern) =>
                patternText(pattern).slice(document.name.length)
            )
        expect(operands(page.props.document).length).toBeGreaterThan(0)
        expect(operands(page.props.document)).toEqual(operands(familyPage.props.document))
        expect(page.props.document.category).toBe(category)
    })

    it('shows NASM’s PRIV and UNDOC notes on x86 forms as the shared sections and tags', () => {
        const mov = renderDocument(x86InstructionDocument(x86InstructionMap.get('mov')!))
        expect(sectionsIn(mov).map(([heading]) => heading)).toEqual(['Forms', 'Privileged'])
        expect(mov.textContent).not.toMatch(/\bpriv\b/)
        const salc = renderDocument(x86InstructionDocument(x86InstructionMap.get('salc')!))
        expect(tagsIn(salc)).toContain('undocumented')
        expect(salc.textContent).not.toMatch(/\bundoc\b/)
    })
})
