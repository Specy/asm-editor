import { describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import lzstring from 'lz-string'
import MarkdownRenderer from './MarkdownRenderer.svelte'

//the renderer reaches `$lib/Project.svelte`, which reaches the projects store, which opens its
//IndexedDB because this project resolves `browser` as true. jsdom has no IndexedDB and Dexie's
//rejection would fail the run, so the database is stubbed away
vi.mock('$lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

/**
 * The two passes a playground fence goes through. Carta renders twice: `renderSSR`, whose output is
 * what the prerendered file carries, and `render`, which `Markdown.svelte` runs on mount. A
 * playground is a code block in the first and an embed iframe in the second, so a lecture ships the
 * assembly it was written about as text - readable without scripts, and readable by a crawler,
 * which no longer meets one `/embed?code=...` URL per playground to weigh against the canonical.
 *
 * The two must agree about the box they occupy, because the second replaces the first under a
 * reader who may already be looking at it.
 */

const HIGHLIGHTED = [
    '```riscv|playground|memory',
    '.text',
    'main:',
    '    li s0, 0xFF        # keep it',
    '```',
    ''
].join('\n')

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

function render(source: string) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const component = mount(MarkdownRenderer, { target, props: { source } })
    flushSync()
    return {
        target,
        cleanup: () => {
            unmount(component)
            target.remove()
        }
    }
}

/** The mount-time `carta.render` is async, so the iframe arrives a few microtasks later. */
async function waitForIframe(target: HTMLElement) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const iframe = target.querySelector('iframe')
        if (iframe) return iframe
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`no iframe after mount, got: ${target.innerHTML.slice(0, 400)}`)
}

describe('playground rendering', () => {
    it('renders a playground as its code before mount and as the embed after', async () => {
        const { target, cleanup } = render(PLAYGROUND)
        try {
            const block = target.querySelector('pre.code-playground')
            expect(block).not.toBeNull()
            expect(block?.querySelector('code')?.textContent).toContain('move.l #1, d0')
            //the class names the language, not the whole fence info string
            expect(block?.querySelector('code')?.className).toBe('language-m68k')
            expect(target.querySelector('iframe')).toBeNull()

            const iframe = await waitForIframe(target)
            const src = iframe.getAttribute('src') ?? ''
            expect(src.startsWith('/embed?')).toBe(true)
            expect(src).toContain('language=M68K')
            expect(src).toContain('showMemory=true')
            //the fence's code and its attached testcase both survive the handoff between the passes
            const url = new URL(src, 'https://asm-editor.specy.app')
            expect(
                lzstring.decompressFromEncodedURIComponent(url.searchParams.get('code') ?? '')
            ).toBe('    move.l #1, d0')
            expect(
                lzstring.decompressFromEncodedURIComponent(url.searchParams.get('testcases') ?? '')
            ).toContain('"d0"')
            expect(target.querySelector('pre.code-playground')).toBeNull()
        } finally {
            cleanup()
        }
    })

    it('gives the code block and the iframe that replaces it the same box', async () => {
        const { target, cleanup } = render(PLAYGROUND)
        try {
            const block = target.querySelector('pre.code-playground')
            const style = block?.getAttribute('style')
            const className = block?.getAttribute('class')
            const iframe = await waitForIframe(target)
            expect(iframe.getAttribute('style')).toBe(style)
            expect(iframe.getAttribute('class')).toBe(className)
        } finally {
            cleanup()
        }
    })

    it('never shows a testcase fence to a reader, in either pass', async () => {
        const { target, cleanup } = render(PLAYGROUND)
        try {
            expect(target.textContent).not.toContain('expectedRegisters')
            await waitForIframe(target)
            expect(target.textContent).not.toContain('expectedRegisters')
        } finally {
            cleanup()
        }
    })

    it('highlights the code block the prerendered page carries', async () => {
        const { target, cleanup } = render(HIGHLIGHTED)
        try {
            const block = target.querySelector('pre.code-playground')
            const kindOf = (text: string) =>
                [...(block?.querySelectorAll('span') ?? [])]
                    .find((span) => span.textContent === text)
                    ?.className.replace('asm-', '')
            expect(kindOf('.text')).toBe('directive')
            expect(kindOf('main')).toBe('label')
            expect(kindOf('li')).toBe('mnemonic')
            expect(kindOf('0xFF')).toBe('number')
            expect(kindOf('# keep it')).toBe('comment')
            //the spans are presentation only: the embed still gets the source it would have got
            const iframe = await waitForIframe(target)
            const url = new URL(iframe.getAttribute('src') ?? '', 'https://asm-editor.specy.app')
            expect(
                lzstring.decompressFromEncodedURIComponent(url.searchParams.get('code') ?? '')
            ).toBe('.text\nmain:\n    li s0, 0xFF        # keep it')
        } finally {
            cleanup()
        }
    })

    it('leaves an ordinary fence alone in both passes', async () => {
        const { target, cleanup } = render('```m68k\n    move.l #1, d0\n```\n')
        try {
            expect(target.querySelector('pre.code-playground')).toBeNull()
            expect(target.textContent).toContain('move.l #1, d0')
            await new Promise((resolve) => setTimeout(resolve, 50))
            expect(target.querySelector('iframe')).toBeNull()
            expect(target.textContent).toContain('move.l #1, d0')
        } finally {
            cleanup()
        }
    })
})
