import { describe, expect, it } from 'vite-plus/test'
import { rewriteMarkdown } from './rewrite'

const absolute = (url: string) => (url.startsWith('/') ? `https://site${url}` : url)

describe('rewriteMarkdown', () => {
    it('keeps a fence language, drops Playground flags, and labels an Exercise and its testcase', () => {
        const source = [
            'Swap them.',
            '',
            '```mips|playground|exercise|memory',
            'main:',
            '```',
            '',
            '```testcase',
            '{ "expectedRegisters": { "$t0": 1 } }',
            '```',
            ''
        ].join('\n')
        expect(rewriteMarkdown(source, absolute)).toBe(
            [
                'Swap them.',
                '',
                '*Exercise: the code to start from, checked by the testcase after it:*',
                '',
                '```mips',
                'main:',
                '```',
                '',
                '*Testcase for the program above (JSON):*',
                '',
                '```json',
                '{ "expectedRegisters": { "$t0": 1 } }',
                '```',
                ''
            ].join('\n')
        )
    })

    it('labels a solution inside <details> and leaves plain fences alone', () => {
        const source =
            '<details>\n<summary>Show solution</summary>\n\n```riscv|playground|solution\nnop\n```\n\n</details>\n\n```text\nplain\n```\n'
        const out = rewriteMarkdown(source, absolute)
        expect(out).toContain('*Solution:*\n\n```riscv\nnop\n```')
        expect(out).toContain('```text\nplain\n```')
    })

    it('names the file of a C playground and the Target it is compiled for', () => {
        const out = rewriteMarkdown(
            '```c|playground|file=main.c|target=mips\nint x;\n```\n',
            absolute
        )
        expect(out).toBe('*File `main.c` compiled for MIPS:*\n\n```c\nint x;\n```\n')
    })

    it('keeps a label in the info string when the fence opens on a list marker', () => {
        const out = rewriteMarkdown('- ```mips|playground|solution\n  nop\n  ```\n', absolute)
        expect(out).toBe('- ```mips Solution:\n  nop\n  ```\n')
    })

    it('keeps an indented fence inside its list item', () => {
        const out = rewriteMarkdown(
            '1. Try:\n\n    ```mips|playground|solution\n    nop\n    ```\n',
            absolute
        )
        expect(out).toBe('1. Try:\n\n    *Solution:*\n\n    ```mips\n    nop\n    ```\n')
    })

    it('rewrites the URLs of links, images, definitions and raw HTML, and nothing else', () => {
        const source = [
            'See [the `li` page](/documentation/mips/instruction/li "title") and [x][ref].',
            '',
            '![A screen](/images/a.webp)',
            '',
            '<a href="/blog">Blog</a> <img src="/images/b.png">',
            '',
            'Text with /documentation/mips in it, and `[a](/b)` in code.',
            '',
            '[ref]: /learn/courses',
            ''
        ].join('\n')
        expect(rewriteMarkdown(source, absolute)).toBe(
            [
                'See [the `li` page](https://site/documentation/mips/instruction/li "title") and [x][ref].',
                '',
                '![A screen](https://site/images/a.webp)',
                '',
                '<a href="https://site/blog">Blog</a> <img src="https://site/images/b.png">',
                '',
                'Text with /documentation/mips in it, and `[a](/b)` in code.',
                '',
                '[ref]: https://site/learn/courses',
                ''
            ].join('\n')
        )
    })

    it('returns text it has nothing to change in as it was', () => {
        const source =
            '# Title\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nSome *words* and https://example.com.\n'
        expect(rewriteMarkdown(source, absolute)).toBe(source)
    })
})
