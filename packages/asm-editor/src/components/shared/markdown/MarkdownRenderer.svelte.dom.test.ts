import { describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import lzstring from 'lz-string'
import MarkdownRenderer from './MarkdownRenderer.svelte'
import { renderMarkdown } from '#lib/content/markdown.ts'
import { decodePlaygroundProgram } from '#lib/content/playgroundProgram.ts'
import { extractPlaygrounds } from '#lib/content/playgrounds.ts'
import { EMBED_BUILT_MESSAGE } from '#lib/content/embedMessages.ts'

//the renderer reaches `#lib/Project.svelte.ts`, which reaches the projects store, which opens its
//IndexedDB because this project resolves `browser` as true. jsdom has no IndexedDB and Dexie's
//rejection would fail the run, so the database is stubbed away
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

/** Monaco, as far as the renderer's colouring asks it anything; it writes spaces as `&nbsp;`. */
const colorize = vi.fn(
    async (text: string, id: string) =>
        text
            .split('\n')
            .map((line) => `<span class="mtk-${id}">${line.replaceAll(' ', '&nbsp;')}</span><br/>`)
            .join('') as string
)
const setCustomTheme = vi.fn()
vi.mock('#lib/monaco/Monaco.ts', () => ({
    Monaco: {
        setCustomTheme,
        get: async () => ({
            languages: {
                getLanguages: () => [
                    { id: 'python', aliases: ['Python', 'py'], extensions: ['.py'] },
                    { id: 'plaintext', aliases: ['Plain Text', 'text'], extensions: ['.txt'] }
                ]
            },
            editor: {
                colorize,
                createModel: () => ({ dispose() {} }),
                tokenize: () => [[{ type: 'delimiter.python' }]]
            }
        })
    }
}))

/**
 * What the mounted renderer adds to the render the pipeline's own tests read
 * ([markdown.dom.test.ts](../../../lib/content/markdown.dom.test.ts)): the Playgrounds' embeds in
 * place of their code blocks, and Monaco's colours where a host asks for them.
 */

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

function render(source: string, options: Record<string, unknown> = {}) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const props = $state({ source, ...options })
    const component = mount(MarkdownRenderer, { target, props })
    flushSync()
    return {
        target,
        props,
        cleanup: () => {
            unmount(component)
            target.remove()
        }
    }
}

function embedUrl(iframe: Element | null) {
    return new URL(iframe?.getAttribute('src') ?? '', 'https://asm-editor.specy.app')
}

async function until<T>(read: () => T | null | undefined, what: string): Promise<T> {
    for (let attempt = 0; attempt < 200; attempt++) {
        const value = read()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error(`never ${what}`)
}

describe('playground embeds', () => {
    it('replace the code block with the embed, in the same box', () => {
        const block = new DOMParser()
            .parseFromString(renderMarkdown(PLAYGROUND), 'text/html')
            .querySelector('pre.code-playground')
        const { target, cleanup } = render(PLAYGROUND)
        try {
            expect(target.querySelector('pre.code-playground')).toBeNull()
            const iframe = target.querySelector('iframe')
            expect(iframe?.getAttribute('style')).toBe(block?.getAttribute('style'))
            expect(iframe?.getAttribute('class')).toBe(block?.getAttribute('class'))
            expect(iframe?.getAttribute('loading')).toBe('lazy')
            expect(target.textContent).not.toContain('expectedRegisters')
        } finally {
            cleanup()
        }
    })

    it('carry the fence’s source, settings and testcase', () => {
        const { target, cleanup } = render(PLAYGROUND)
        try {
            const src = target.querySelector('iframe')?.getAttribute('src') ?? ''
            expect(src.startsWith('/embed?')).toBe(true)
            expect(src).toContain('language=M68K')
            expect(src).toContain('showMemory=true')
            const url = embedUrl(target.querySelector('iframe'))
            //every playground leaves the code the whole width until its program is built
            expect(url.searchParams.get('hideUntilBuilt')).toBe('true')
            //the highlight's spans and the gutter are presentation only
            expect(
                lzstring.decompressFromEncodedURIComponent(url.searchParams.get('code') ?? '')
            ).toBe('    move.l #1, d0')
            expect(
                lzstring.decompressFromEncodedURIComponent(url.searchParams.get('testcases') ?? '')
            ).toContain('"d0"')
        } finally {
            cleanup()
        }
    })

    it('keep runFor-only metadata out of the embed testcases', () => {
        const source = PLAYGROUND.replace(
            '{ "expectedRegisters": { "d0": 1 } }',
            '{ "runFor": 200000 }'
        )
        const { target, cleanup } = render(source)
        try {
            expect(embedUrl(target.querySelector('iframe')).searchParams.has('testcases')).toBe(
                false
            )
            expect(extractPlaygrounds(source)[0].runFor).toBe(200000)
        } finally {
            cleanup()
        }
    })

    it('preserve an explicit empty-output assertion as a testcase', () => {
        const source = PLAYGROUND.replace(
            '{ "expectedRegisters": { "d0": 1 } }',
            '{ "expectedOutput": "" }'
        )
        const { target, cleanup } = render(source)
        try {
            const testcases = JSON.parse(
                lzstring.decompressFromEncodedURIComponent(
                    embedUrl(target.querySelector('iframe')).searchParams.get('testcases')!
                )
            )
            expect(testcases).toHaveLength(1)
            expect(testcases[0].expectedOutput).toBe('')
        } finally {
            cleanup()
        }
    })

    it('mount named C files as one RISC-V playground', () => {
        const source = [
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
        const { target, cleanup } = render(source)
        try {
            expect(target.querySelectorAll('iframe')).toHaveLength(1)
            expect(target.querySelectorAll('pre')).toHaveLength(0)
            const url = embedUrl(target.querySelector('iframe'))
            expect(url.searchParams.get('language')).toBe('RISC-V')
            expect(url.searchParams.get('openButton')).toBe('true')
            const program = decodePlaygroundProgram(url.searchParams.get('program')!)
            expect(program).toEqual(extractPlaygrounds(source)[0].program)
            expect(program.entry).toBe('src/main.c')
            expect(Object.keys(program.files)).toEqual(['src/main.c', 'src/value.h'])
            expect(url.searchParams.has('testcases')).toBe(true)
        } finally {
            cleanup()
        }
    })

    it('start a Screen as short as the code, and grow on Build', () => {
        const screen = ['```mips|playground|open-screen', '    nop', '```', ''].join('\n')
        const { target, cleanup } = render(`${screen}\n${screen}`)
        try {
            const [first, second] = target.querySelectorAll('iframe')
            expect(first.style.height).toBe('')
            expect(first.dataset.builtHeight).toBe('min(40rem, 85vh)')
            const tell = (built: boolean) =>
                window.dispatchEvent(
                    new MessageEvent('message', {
                        data: { type: EMBED_BUILT_MESSAGE, built },
                        source: first.contentWindow
                    })
                )
            tell(true)
            expect(first.style.height).toBe('min(40rem, 85vh)')
            //only the frame whose embed was built
            expect(second.style.height).toBe('')
            tell(false)
            expect(first.style.height).toBe('')
        } finally {
            cleanup()
        }
    })

    it('keep a tall Screen at the height it asked for', () => {
        const { target, cleanup } = render('```mips|playground|open-screen|tall\n    nop\n```\n')
        try {
            const iframe = target.querySelector('iframe')!
            expect(iframe.style.height).toBe('80dvh')
            expect(iframe.dataset.builtHeight).toBeUndefined()
        } finally {
            cleanup()
        }
    })

    it('are never built for playgrounds shown as plain code', () => {
        const { target, cleanup } = render(PLAYGROUND, { playgrounds: 'code' })
        try {
            expect(target.querySelector('iframe')).toBeNull()
            expect(target.querySelector('pre.plain-playground .asm-keyword')?.textContent).toBe(
                'move'
            )
        } finally {
            cleanup()
        }
    })

    it('follow the text as it changes, leaving nothing of the last render behind', () => {
        const { target, props, cleanup } = render(PLAYGROUND)
        try {
            props.source = `Some words first.\n\n${PLAYGROUND}\n${PLAYGROUND}`
            flushSync()
            expect(target.querySelectorAll('iframe')).toHaveLength(2)
            expect(target.querySelector('p')?.textContent).toBe('Some words first.')
            props.source = 'Only words now.'
            flushSync()
            expect(target.querySelector('iframe')).toBeNull()
            expect(target.textContent?.trim()).toBe('Only words now.')
        } finally {
            cleanup()
        }
    })
})

describe('code blocks', () => {
    it('hide the gutter when line numbers are off, without changing the code', () => {
        const { target, cleanup } = render('```text\nconst x = 1\n\nconst y = 2\n```\n', {
            lineNumbers: false
        })
        try {
            expect(target.firstElementChild?.getAttribute('style')).toContain(
                '--code-block-gutter-display: none'
            )
            expect(target.querySelector('pre.code-block code')?.textContent).toBe(
                'const x = 1\n\nconst y = 2\n'
            )
        } finally {
            cleanup()
        }
    })
})

describe('Monaco colours', () => {
    const SOURCE = [
        '```python',
        'print(1)',
        'if x: print(2)',
        '```',
        '',
        '```c',
        'int x = 1;',
        '```',
        '',
        '```text',
        'plain',
        '```',
        '',
        '```klingon',
        'Qapla',
        '```',
        ''
    ].join('\n')

    it('colour the blocks our highlighters leave plain, where the host asks', async () => {
        colorize.mockClear()
        const { target, cleanup } = render(SOURCE, { monacoColors: true })
        try {
            const code = await until(
                () => target.querySelector('code.monaco-colours'),
                'coloured by Monaco'
            )
            expect(code.innerHTML).toBe(
                '<span class="mtk-python">print(1)</span>\n<span class="mtk-python">if x: print(2)</span>'
            )
            //the block's text stays its source, spaces and all
            expect(code.textContent).toBe('print(1)\nif x: print(2)')
            //in the editor's own theme, which nothing else may have set
            expect(setCustomTheme).toHaveBeenCalled()
            //C is ours, text is plain, and Monaco has no Klingon
            expect(colorize).toHaveBeenCalledTimes(1)
            expect(target.querySelectorAll('code.monaco-colours')).toHaveLength(1)
            expect(target.textContent).toContain('Qapla')
        } finally {
            cleanup()
        }
    })

    it('colour a block seen before without asking Monaco again', async () => {
        const { target, props, cleanup } = render(SOURCE, { monacoColors: true })
        try {
            await until(() => target.querySelector('code.monaco-colours'), 'coloured by Monaco')
            colorize.mockClear()
            props.source = `A new first line.\n\n${SOURCE}`
            flushSync()
            await until(() => target.querySelector('code.monaco-colours'), 'coloured again')
            expect(colorize).not.toHaveBeenCalled()
        } finally {
            cleanup()
        }
    })

    it('never load Monaco where the host did not ask', async () => {
        colorize.mockClear()
        const { target, cleanup } = render('```python\nprint(3)\n```\n')
        try {
            await new Promise((resolve) => setTimeout(resolve, 20))
            expect(colorize).not.toHaveBeenCalled()
            expect(target.querySelector('code')?.className).toBe('language-python')
        } finally {
            cleanup()
        }
    })
})
