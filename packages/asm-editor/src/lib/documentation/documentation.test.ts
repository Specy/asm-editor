import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { DOCUMENTATION_LANGUAGES, type DocumentationLanguage } from '#lib/search/scope.ts'
import { documentationFor, entriesOf } from './documentation'
import { documentationProblems, type DocumentationEntry, type EntryView } from './entries'
import { documentPatterns, patternText } from './instructions/document'
import { mipsFormTags, riscvFormTags, z80FormTags } from './instructions/formTags'

/** The route file a documentation href is served by. */
function routeExists(href: string): boolean {
    const path = href.split('#')[0]
    const instruction = /^\/documentation\/([^/]+)\/instruction\/[^/]+$/.exec(path)
    if (instruction) {
        return existsSync(
            `src/routes/documentation/${instruction[1]}/instruction/[instructionName]/+page.svelte`
        )
    }
    return existsSync(`src/routes${path}/+page.svelte`)
}

// The first test of each language loads its data and, for MIPS, RISC-V and Z80, its Core.
describe.each(DOCUMENTATION_LANGUAGES)('the %s Documentation', { timeout: 60_000 }, (language) => {
    it('has unique ids and anchors, and something to show for every entry', async () => {
        const chapters = await documentationFor(language)
        expect(documentationProblems(chapters)).toEqual([])
    })

    it('links every entry and Chapter to a page that exists', async () => {
        const chapters = await documentationFor(language)
        for (const chapter of chapters) {
            expect(routeExists(chapter.href), chapter.href).toBe(true)
            for (const entry of chapter.entries) {
                expect(routeExists(entry.href), `${entry.id} → ${entry.href}`).toBe(true)
                expect(
                    entry.href.split('#')[0].startsWith(chapter.href.split('#')[0]) ||
                        entry.kind === 'instruction',
                    entry.id
                ).toBe(true)
            }
        }
    })

    it('names every entry it can be searched by in lowercase', async () => {
        const entries = entriesOf(await documentationFor(language))
        for (const entry of entries) {
            for (const name of entry.names) expect(name).toBe(name.toLowerCase())
        }
    })
})

describe('the instruction Chapters', { timeout: 60_000 }, () => {
    it('have an entry for every MIPS and RISC-V instruction page', async () => {
        const { mipsInstructionNames } = await import('#lib/languages/MIPS/MIPS-documentation.ts')
        const { riscvInstructionNames } =
            await import('#lib/languages/RISC-V/RISC-V-documentation.ts')
        for (const [language, expected] of [
            ['mips', mipsInstructionNames],
            ['risc-v', riscvInstructionNames]
        ] as const) {
            const chapters = await documentationFor(language)
            const instructions = chapters.find((chapter) => chapter.id === 'instructions')!
            const named = new Set(instructions.entries.flatMap((entry) => entry.names))
            for (const name of expected)
                expect(named.has(name.toLowerCase()), `${language} ${name}`).toBe(true)
        }
    })
})

describe.each(['mips', 'risc-v', 'x86'] as const)('%s C documentation', (language) => {
    it('exposes a searchable chapter with compilation, services and debugging guidance', async () => {
        const chapter = (await documentationFor(language)).find((entry) => entry.id === 'using-c')
        expect(chapter?.href).toBe(`/documentation/${language}/using-c`)
        expect(chapter?.entries.map((entry) => entry.anchor)).toEqual(
            language === 'x86'
                ? [
                      'overview',
                      'editing-help',
                      'compiling',
                      'libraries',
                      'following-execution',
                      'linking-project-files'
                  ]
                : [
                      'overview',
                      'editing-help',
                      'compiling',
                      'libraries',
                      'screen-and-devices',
                      'following-execution'
                  ]
        )
        expect(chapter?.entries.every((entry) => entry.searchText.length > 0)).toBe(true)
        expect(
            chapter?.entries.find((entry) => entry.anchor === 'libraries')?.searchText
        ).toContain('<sim.h>')
    })
})

async function instruction(
    language: DocumentationLanguage,
    name: string
): Promise<DocumentationEntry> {
    const chapters = await documentationFor(language)
    const found = chapters
        .find((chapter) => chapter.id === 'instructions')
        ?.entries.find((entry) => entry.title === name)
    if (!found) throw new Error(`no ${language} ${name}`)
    return found
}

function viewOf<T extends EntryView['type']>(
    entry: DocumentationEntry,
    type: T
): Extract<EntryView, { type: T }> {
    if (entry.view.type !== type) throw new Error(`${entry.id} is a ${entry.view.type} view`)
    return entry.view as Extract<EntryView, { type: T }>
}

// A tag shows beside a name only when every form has it; each form keeps its own.
describe('instruction categories and tags', { timeout: 60_000 }, () => {
    it('tags MIPS pseudo-instructions by form', async () => {
        const li = await instruction('mips', 'li')
        expect(li.category).toBe('data-movement')
        expect(li.tags).toEqual(['pseudo'])
        const lw = await instruction('mips', 'lw')
        expect(lw.category).toBe('load-and-store')
        expect(lw.tags).toBeUndefined()
        const { mipsInstructionMap } = await import('#lib/languages/MIPS/MIPS-documentation.ts')
        const forms = mipsInstructionMap.get('lw')!.map(mipsFormTags)
        expect(forms).toContainEqual([])
        expect(forms).toContainEqual(['pseudo'])
        // and the page says the tag once, on the section of the forms that have it
        const sections = viewOf(lw, 'instruction').document().sections
        expect(sections.map((section) => section.tags)).toEqual([[], ['pseudo']])
        expect((await instruction('mips', 'add')).category).toBe('arithmetic')
    })

    it('tags only what RV32 does not accept as RV64 only, and lists each form once', async () => {
        const addw = await instruction('risc-v', 'addw')
        expect(addw.tags).toEqual(['rv64-only'])
        const slli = await instruction('risc-v', 'slli')
        expect(slli.tags).toBeUndefined()
        const { riscvInstructionMap } =
            await import('#lib/languages/RISC-V/RISC-V-documentation.ts')
        expect(riscvInstructionMap.get('slli')!.map(riscvFormTags)).toEqual([[]])
        expect((await instruction('risc-v', 'amoadd.w')).category).toBe('atomic')
        for (const name of ['li', 'zext.b']) {
            const variants = riscvInstructionMap.get(name)!
            const examples = variants.map((variant) => variant.example)
            expect(new Set(examples).size, name).toBe(examples.length)
        }
        const entries = entriesOf(await documentationFor('risc-v'))
        for (const entry of entries) expect(entry.searchText, entry.id).not.toContain('(64bit)')
    })

    it('reads x86 tags from NASM', async () => {
        const sysret = await instruction('x86', 'sysret')
        expect(sysret.tags).toEqual(['privileged'])
        const mov = await instruction('x86', 'mov')
        expect(mov.category).toBe('data-movement')
        expect(mov.tags).toBeUndefined()
        const sections = viewOf(mov, 'instruction').document().sections
        expect(sections.map((section) => section.tags)).toEqual([[], ['privileged']])
    })

    it('tags a Z80 pseudo spelling apart from an undocumented opcode', async () => {
        const { z80InstructionMap } = await import('#lib/languages/Z80/Z80-documentation.ts')
        const formOf = async (mnemonic: string, params: string[]) =>
            z80InstructionMap
                .get(mnemonic)!
                .find((variant) => variant.params.join(',') === params.join(','))!
        expect(z80FormTags(await formOf('ld', ['hl', 'bc']))).toEqual(['pseudo'])
        expect(z80FormTags(await formOf('add', ['ixh']))).toEqual(['pseudo', 'undocumented'])
        expect(z80FormTags(await formOf('add', ['a', 'ixh']))).toEqual(['undocumented'])
        expect(z80FormTags(await formOf('add', ['a', 'c']))).toEqual([])
        expect((await instruction('z80', 'sll')).tags).toEqual(['undocumented'])
        expect((await instruction('z80', 'add')).tags).toBeUndefined()
    })

    it('lists the M68K forms from s68k, with Privileged only where the 68000 says', async () => {
        const move = await instruction('m68k', 'move')
        expect(move.category).toBe('data-movement')
        expect(move.tags).toBeUndefined()
        const sectionsOf = async (name: string) =>
            viewOf(await instruction('m68k', name), 'instruction')
                .document()
                .sections.map((section) => [
                    section.tags,
                    section.groups.flatMap((group) => group.patterns.map(patternText))
                ])
        expect((await sectionsOf('move')).at(-1)).toEqual([['privileged'], ['move <ea>, sr']])
        expect(await sectionsOf('andi')).toEqual([
            [[], ['andi #imm, <ea>', 'andi #imm, ccr']],
            [['privileged'], ['andi #imm, sr']]
        ])
        // a family's forms are its members' own
        expect(await sectionsOf('bcc')).toEqual([[[], ['bcc label']]])
        const entries = entriesOf(await documentationFor('m68k'))
        for (const entry of entries.filter((entry) => entry.kind === 'instruction')) {
            const patterns = documentPatterns(viewOf(entry, 'instruction').document())
            expect(patterns.length, entry.id).toBeGreaterThan(0)
            expect(entry.tags, entry.id).toBeUndefined()
        }
    })

    it('reports an instruction without a category', async () => {
        const [chapter] = await documentationFor('mips')
        const add = chapter.entries.find((entry) => entry.title === 'add')!
        const uncategorised = { ...add, category: undefined }
        expect(documentationProblems([{ ...chapter, entries: [uncategorised] }])).toEqual([
            'mips/instructions/add has no category'
        ])
    })
})
