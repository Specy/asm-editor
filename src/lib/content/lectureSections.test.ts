import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import DOMPurify from 'isomorphic-dompurify'
import { describe, expect, it } from 'vitest'
import { headingSlug, HeadingSlugger } from './headings'
import { splitLecture } from './lectureSections'

/** Every Lecture: `src/content/<course>/<module>/<lecture>/index.md`. */
function lectures(): { path: string; source: string }[] {
    const root = 'src/content'
    const out: { path: string; source: string }[] = []
    for (const course of readdirSync(root)) {
        const coursePath = join(root, course)
        if (!statSync(coursePath).isDirectory()) continue
        for (const module of readdirSync(coursePath)) {
            const modulePath = join(coursePath, module)
            if (!statSync(modulePath).isDirectory()) continue
            for (const lecture of readdirSync(modulePath)) {
                const file = join(modulePath, lecture, 'index.md')
                try {
                    out.push({ path: file, source: readFileSync(file, 'utf8') })
                } catch {
                    // a module's own index.md and meta.json sit beside the lecture folders
                }
            }
        }
    }
    return out
}

describe('headingSlug', () => {
    it('keeps inline code as text and drops punctuation', () => {
        expect(headingSlug('Absolute memory: $2000')).toBe('absolute-memory-2000')
        expect(headingSlug('`$zero` always contains zero')).toBe('zero-always-contains-zero')
        expect(headingSlug('Move an address first, then use it: -(a2)')).toBe(
            'move-an-address-first-then-use-it-a2'
        )
    })

    it('steers clear of names DOMPurify would strip from an id', () => {
        expect(headingSlug('Title')).toBe('title-section')
        expect(headingSlug('Links')).toBe('links-section')
        expect(headingSlug('Onload')).toBe('onload-section')
    })

    it('numbers a repeated heading', () => {
        const slugger = new HeadingSlugger()
        expect(['Try it', 'Try it', 'Try it'].map((text) => slugger.slug(text))).toEqual([
            'try-it',
            'try-it-2',
            'try-it-3'
        ])
    })
})

describe('splitLecture', () => {
    it('reads headings as markdown does, not as lines', () => {
        const source = [
            '# The title the page already shows',
            '',
            'Opening words.',
            '',
            '```mips|playground',
            '# @screen unit=16',
            'li $v0, 1 # print the number',
            '```',
            '',
            '## Counting `down`',
            '',
            '1. A step',
            '',
            '    ```m68k',
            '    move.l #1, d0 ; one into d0',
            '    ```',
            '',
            '### Inside',
            '',
            'Folded in.',
            '',
            '<details>',
            '<summary>Show solution</summary>',
            '',
            '```m68k',
            'secret',
            '```',
            '',
            '</details>',
            '',
            '```testcase',
            '{}',
            '```'
        ].join('\n')
        const [opening, counting] = splitLecture(source)
        expect(opening).toMatchObject({ slug: '', title: null, prose: 'Opening words.' })
        expect(opening.code).toContain('# @screen unit=16')
        expect(opening.comments).toBe('print the number')
        expect(counting.slug).toBe('counting-down')
        expect(counting.title).toBe('Counting down')
        expect(counting.prose).toBe('A step\nInside\nFolded in.')
        expect(counting.code).toContain('move.l #1, d0')
        expect(counting.comments).toBe('one into d0')
        expect(counting.code).not.toContain('secret')
        expect(counting.markdown).toContain('secret')
        expect(counting.markdown).not.toContain('## Counting')
    })

    const all = lectures()

    it('finds every Lecture', () => {
        expect(all.length).toBeGreaterThan(200)
    })

    it('gives every section something to read and a unique id', () => {
        let sections = 0
        for (const { path, source } of all) {
            const split = splitLecture(source)
            const slugs = split.map((section) => section.slug).filter(Boolean)
            expect(new Set(slugs).size, path).toBe(slugs.length)
            for (const section of split) {
                sections++
                expect(section.prose || section.code, `${path}#${section.slug}`).toBeTruthy()
                expect(section.prose, `${path}#${section.slug}`).not.toContain('```')
            }
        }
        expect(sections).toBeGreaterThan(900)
    })

    it('makes ids the sanitizer keeps', () => {
        for (const { path, source } of all) {
            for (const { slug } of splitLecture(source)) {
                if (!slug) continue
                const html = DOMPurify.sanitize(`<h2 id="${slug}">x</h2>`)
                expect(html, `${path}#${slug}`).toContain(`id="${slug}"`)
            }
        }
    })
})
