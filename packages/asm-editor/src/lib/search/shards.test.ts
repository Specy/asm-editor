import { describe, expect, it } from 'vite-plus/test'
import { buildShard, shardContent } from './shards'

describe('shards', () => {
    it('cuts a Course into Lecture sections with windows and links', async () => {
        const content = await shardContent('lectures-m68k')
        expect(content.entries).toHaveLength(0)
        expect(content.sections.length).toBeGreaterThan(150)
        expect(content.windows.length).toBeGreaterThanOrEqual(content.sections.length)
        for (const window of content.windows) {
            expect(content.sections[window.section]).toBeDefined()
            expect(window.text.split(/\s+/).length).toBeLessThanOrEqual(240)
        }
        const section = content.sections.find((section) => section.id.includes('#'))!
        expect(section.href.startsWith('/learn/courses/m68k/')).toBe(true)
    })

    // a Documentation shard reads every Course's Lectures for its word-like names
    it("holds a language's Documentation entries", { timeout: 60_000 }, async () => {
        const content = await shardContent('docs-mips')
        expect(content.sections).toHaveLength(0)
        expect(content.entries.length).toBeGreaterThan(300)
        const add = content.entries.find((entry) => entry.id === 'mips/instructions/add')!
        expect(add).toMatchObject({
            chapterTitle: 'Instructions',
            category: 'arithmetic',
            names: ['add']
        })
        expect(add.text).not.toContain('**')
        const directive = content.entries.find((entry) => entry.id === 'mips/directives/word')!
        expect(directive.category).toBeUndefined()
    })

    it(
        "gives each entry the Entry questions of its language's file, an Extensions entry none",
        { timeout: 60_000 },
        async () => {
            const { default: file } = await import('#lib/documentation/questions/x86.json')
            const { entries } = await shardContent('docs-x86')
            const read = entries.find((entry) => entry.id === 'x86/syscalls/syscall-read')!
            expect(read.questions).toEqual(
                (file as Record<string, { questions: string[] }>)['x86/syscalls/syscall-read']
                    .questions
            )
            const groups = entries.filter((entry) => entry.entryKind === 'extension-group')
            expect(groups.length).toBeGreaterThan(0)
            for (const group of groups) expect(group.questions).toBeUndefined()
        }
    )

    it(
        'names the entries the Lectures use as ordinary words, and only those',
        { timeout: 60_000 },
        async () => {
            const { wordLikeNames } = await shardContent('docs-m68k')
            expect(wordLikeNames).toEqual(expect.arrayContaining(['stop', 'end', 'not']))
            expect(wordLikeNames).not.toContain('dbra')
            expect(wordLikeNames).not.toContain('move.l')
            const lectures = await shardContent('lectures-m68k')
            expect(lectures.wordLikeNames ?? []).toEqual([])
        }
    )

    it(
        'gives long entries further windows, never an x86 Extensions entry',
        { timeout: 600_000 },
        async () => {
            const payload = await buildShard('docs-x86')
            expect(payload.entryWindows.length).toBeGreaterThan(0)
            for (const window of payload.entryWindows) {
                const entry = payload.entries[window.entry]
                expect(entry.entryKind).not.toBe('extension-group')
                expect(
                    `${entry.summary}\n${entry.text}${entry.detail ?? ''}`.length
                ).toBeGreaterThan(1500)
            }
        }
    )
})
