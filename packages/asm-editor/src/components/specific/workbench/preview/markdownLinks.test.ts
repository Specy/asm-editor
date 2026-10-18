import { describe, expect, it } from 'vite-plus/test'
import { bytesFile, type ProjectFile } from '#lib/projectFiles.ts'
import { markdownImageType, markdownTarget } from './markdownLinks'

describe('where a Markdown link points', () => {
    it('leaves a URL of its own to the browser', () => {
        for (const reference of [
            'https://example.com/a.md',
            'mailto:me@example.com',
            'data:image/png;base64,AA==',
            '//example.com/x.png'
        ])
            expect(markdownTarget('docs/README.md', reference)).toEqual({ to: 'web' })
    })

    it('reads any other as a path from the File, or from the root with a leading slash', () => {
        expect(markdownTarget('docs/README.md', 'pic.png')).toEqual({
            to: 'file',
            path: 'docs/pic.png'
        })
        expect(markdownTarget('docs/README.md', './img/../pic.png')).toEqual({
            to: 'file',
            path: 'docs/pic.png'
        })
        expect(markdownTarget('docs/README.md', '../main.asm')).toEqual({
            to: 'file',
            path: 'main.asm'
        })
        expect(markdownTarget('docs/README.md', '/main.asm?raw=1')).toEqual({
            to: 'file',
            path: 'main.asm'
        })
        expect(markdownTarget('README.md', 'my%20notes.md#Part%20two')).toEqual({
            to: 'file',
            path: 'my notes.md',
            slug: 'Part two'
        })
    })

    it('reads a fragment alone as a heading of the same document', () => {
        expect(markdownTarget('README.md', '#app-features')).toEqual({
            to: 'heading',
            slug: 'app-features'
        })
        expect(markdownTarget('README.md', '#')).toEqual({ to: 'nothing' })
    })

    it('goes nowhere above the root, nor to the root itself', () => {
        expect(markdownTarget('README.md', '../secret.md')).toEqual({ to: 'nothing' })
        expect(markdownTarget('docs/README.md', '..')).toEqual({ to: 'nothing' })
        expect(markdownTarget('README.md', '/')).toEqual({ to: 'nothing' })
        expect(markdownTarget('README.md', '')).toEqual({ to: 'nothing' })
    })
})

describe('the type of an image a Markdown File shows', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])

    it('reads an image File by its bytes, whatever its name', () => {
        expect(markdownImageType('shot', bytesFile(png))).toBe('image/png')
        expect(markdownImageType('a.png', bytesFile(new Uint8Array([0xde, 0xad, 0xbe])))).toBe(
            undefined
        )
    })

    it('takes an SVG written as text, and no other text', () => {
        const svg: ProjectFile = {
            encoding: 'plain',
            content: '<svg xmlns="http://www.w3.org/2000/svg"/>'
        }
        expect(markdownImageType('diagram.svg', svg)).toBe('image/svg+xml')
        expect(markdownImageType('diagram.txt', svg)).toBeUndefined()
        expect(
            markdownImageType('notes.svg', { encoding: 'plain', content: 'no image' })
        ).toBeUndefined()
    })
})
