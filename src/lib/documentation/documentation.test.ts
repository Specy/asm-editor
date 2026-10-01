import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOCUMENTATION_LANGUAGES } from '$lib/search/scope'
import { documentationFor, entriesOf } from './documentation'
import { documentationProblems } from './entries'

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
        const { mipsInstructionNames } = await import('$lib/languages/MIPS/MIPS-documentation')
        const { riscvInstructionNames } = await import('$lib/languages/RISC-V/RISC-V-documentation')
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
