import { describe, expect, it, vi } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import { splitLecture } from './lectureSections'
import { renderMarkdown, type MarkdownOptions } from './markdown'

//the playground modules reach the projects store, which opens its IndexedDB because this project
//resolves `browser` as true; jsdom has none, so the database is stubbed away
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))

/**
 * The pipeline's output is what a prerendered page carries and what the browser renders again
 * before hydrating, so these read it as a page would: parsed, then queried.
 */
function page(source: string, options: MarkdownOptions = {}): DocumentFragment {
    const html = renderMarkdown(source, options)
    const template = document.createElement('template')
    template.innerHTML = html
    return template.content
}

const PLAYGROUND = [
    '```m68k|playground|memory',
    '    move.l #1, d0',
    '```',
    '',
    '```testcase',
    '{ "expectedRegisters": { "d0": 1 } }',
    '```',
    ''
].join('\n')

const NAMED_C_FILES = [
    '```c|playground|target=riscv|file=src/main.c|console|allow-open',
    '#include "value.h"',
    'int main(void) { return VALUE; }',
    '',
    '```',
    '',
    '```c|file=src/value.h',
    '#define VALUE 42   ',
    '```',
    '',
    '```testcase',
    '{"expectedRegisters":{"a0":42}}',
    '```'
].join('\n')

describe('code blocks', () => {
    it('colours assembly as its editor does', () => {
        const block = page('```riscv\n.text\nmain:\n    li s0, 0xFF        # keep it\n```\n')
        const kindOf = (text: string) =>
            [...block.querySelectorAll('span')]
                .find((span) => span.textContent === text)
                ?.className.replace('asm-', '')
        expect(kindOf('.text')).toBe('directive')
        expect(kindOf('main')).toBe('label')
        expect(kindOf('li')).toBe('keyword')
        expect(kindOf('0xFF')).toBe('number-hex')
        expect(kindOf('# keep it')).toBe('comment')
    })

    it.each(['c', 'cpp', 'h', 'hpp'])('colours a %s fence as C/C++', (language) => {
        const content = page(
            `\`\`\`${language}\n#include <stdio.h>\nint main(void) { return 0; }\n\`\`\`\n`
        )
        const code = content.querySelector('pre.code-block > code')
        expect(code?.className).toBe('asm-code')
        expect(code?.querySelector('[class^="asm-"]')).not.toBeNull()
        expect(code?.textContent).toBe('#include <stdio.h>\nint main(void) { return 0; }')
    })

    it.each(['python', 'asm', 'not-a-language'])(
        'leaves a %s fence plain, named for Monaco',
        (language) => {
            const content = page(`\`\`\`${language}\nkept as written\n\`\`\`\n`)
            const code = content.querySelector('pre.code-block > code')
            expect(code?.className).toBe(`language-${language}`)
            expect(code?.children).toHaveLength(0)
            expect(code?.textContent).toBe('kept as written\n')
        }
    )

    it('numbers the lines beside the code, never inside it', () => {
        const content = page('```text\nfirst\n\nthird\n```\n')
        const gutter = content.querySelector('pre.code-block > .code-gutter')
        expect(gutter?.getAttribute('aria-hidden')).toBe('true')
        expect(gutter?.textContent).toBe('1\n2\n3')
        expect(content.querySelector('pre.code-block > code')?.textContent).toBe('first\n\nthird\n')
    })
})

describe('playgrounds', () => {
    it('leaves a playground as its highlighted code, marked for its embed', () => {
        const block = page(PLAYGROUND).querySelector('pre.code-playground')
        expect(block?.classList.contains('code-gutter-spacing')).toBe(true)
        expect(block?.getAttribute('data-playground')).toBe('m68k|playground|memory')
        expect(block?.getAttribute('data-testcases')).toContain('"d0"')
        //the class names the language, not the whole fence info string
        expect(block?.querySelector('code')?.className).toBe('language-m68k')
        expect(block?.querySelector('code')?.textContent).toBe('    move.l #1, d0')
        expect(block?.querySelector('.asm-keyword')?.textContent).toBe('move')
        expect(block?.querySelector('.code-gutter')?.textContent).toBe('1')
    })

    it('never shows a testcase fence to a reader', () => {
        expect(page(PLAYGROUND).textContent).not.toContain('expectedRegisters')
    })

    it('shows named C files as readable, coloured sources under one playground', () => {
        const content = page(NAMED_C_FILES)
        const playground = content.querySelector('div.code-playground')
        expect(playground?.getAttribute('data-program')).toContain('src/value.h')
        expect(
            [...content.querySelectorAll('.playground-filename')].map((node) => node.textContent)
        ).toEqual(['src/main.c', 'src/value.h'])
        const sources = [...content.querySelectorAll('pre code')]
        expect(sources.map((node) => node.textContent?.trimEnd())).toEqual([
            '#include "value.h"\nint main(void) { return VALUE; }',
            '#define VALUE 42'
        ])
        for (const source of sources) expect(source.querySelector('[class^="asm-"]')).not.toBeNull()
    })

    it('shows playgrounds as plain code where asked, never marked for an embed', () => {
        const content = page(PLAYGROUND, { playgrounds: 'code' })
        const block = content.querySelector('pre.plain-playground')
        expect(block?.classList.contains('code-gutter-spacing')).toBe(false)
        expect(block?.querySelector('.asm-keyword')?.textContent).toBe('move')
        expect(block?.querySelector('.asm-keyword-size')?.textContent).toBe('.l')
        expect(content.querySelector('[data-playground]')).toBeNull()
        expect(content.textContent).not.toContain('expectedRegisters')
    })

    it('leaves an ordinary fence an ordinary block', () => {
        const content = page('```m68k\n    move.l #1, d0\n```\n')
        expect(content.querySelector('[data-playground]')).toBeNull()
        expect(content.querySelector('pre.asm-block .asm-keyword')?.textContent).toBe('move')
    })
})

/**
 * A search result opens a Lecture at a heading, so the ids the render gives the headings and the
 * slugs the index links to have to be the same, and in the prerendered page: it is what the
 * browser scrolls on arrival.
 */
describe('heading ids', () => {
    const lectures = [
        //headings with inline code, and a numbered exercise list
        'src/content/m68k/introduction/addressing-modes/index.md',
        //a `$` register in a heading
        'src/content/mips/introduction/the-32-registers/index.md',
        //curly quotes in a heading
        'src/content/risc-v/introduction/getting-started/index.md',
        //no second-level heading at all
        'src/content/assembly-basics/think-in-assembly/loops/index.md'
    ]

    it.each(lectures)('match the index for %s', (path) => {
        const source = readFileSync(path, 'utf8')
        const ids = [...page(source, { headingIds: true }).querySelectorAll('h2')].map(
            (heading) => heading.id
        )
        const slugs = splitLecture(source)
            .map((section) => section.slug)
            .filter(Boolean)
        expect(ids).toEqual(slugs)
    })

    it('are left off where nobody asked for them', () => {
        expect(page('## A heading\n\nText.\n').querySelector('h2')?.id).toBe('')
    })
})

describe('links', () => {
    const source =
        'See [MOVEA](/documentation/m68k/instruction/movea) and [the web](https://example.com).'

    it('keep a link into the Documentation as a mark when disabled, and drop the rest', () => {
        const content = page(source, { links: 'disabled' })
        expect(content.querySelector('a')).toBeNull()
        const mark = content.querySelector('span.doc-link')
        expect(mark?.getAttribute('data-doc-href')).toBe('/documentation/m68k/instruction/movea')
        expect(mark?.textContent).toBe('MOVEA')
        expect(content.textContent).toContain('the web')
    })
})

describe("a Project File's Markdown", () => {
    it('loses its own styles, frames and forms, and embeds nothing', () => {
        const source = [
            '<p style="position:fixed">covered</p>',
            '<style>body { display: none }</style>',
            '<iframe src="https://example.com"></iframe>',
            '<form><input name="x"></form>',
            '',
            PLAYGROUND
        ].join('\n')
        const content = page(source, { untrusted: true })
        expect(content.querySelector('[style]')).toBeNull()
        expect(content.querySelector('style, iframe, form, input')).toBeNull()
        expect(content.querySelector('[data-playground]')).toBeNull()
        expect(content.querySelector('pre.plain-playground')).not.toBeNull()
        expect(content.textContent).toContain('covered')
    })
})

it('renders the same text the same way every time', () => {
    const source = readFileSync('src/content/m68k/introduction/addressing-modes/index.md', 'utf8')
    expect(renderMarkdown(source, { headingIds: true })).toBe(
        renderMarkdown(source, { headingIds: true })
    )
})
