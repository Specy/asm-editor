import { describe, expect, it } from 'vitest'
import { shardContent } from './shards'

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

    it("holds a language's Documentation entries", async () => {
        const content = await shardContent('docs-mips')
        expect(content.sections).toHaveLength(0)
        expect(content.entries.length).toBeGreaterThan(300)
        const add = content.entries.find((entry) => entry.id === 'mips/instructions/add')!
        expect(add).toMatchObject({ chapterTitle: 'Instructions', names: ['add'] })
        expect(add.text).not.toContain('**')
    })
})
