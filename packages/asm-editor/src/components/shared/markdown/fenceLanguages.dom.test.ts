import { expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import MarkdownRenderer from './MarkdownRenderer.svelte'

//see MarkdownRenderer.dom.test.ts: the renderer reaches the projects store's IndexedDB
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

/**
 * The grammars Shiki loads for a fence whose info is more than a language name. Every Carta shares
 * one Shiki highlighter, so a grammar another test loaded would hide a block left plain: these
 * tests have a file of their own, which starts with none loaded.
 */

async function render(source: string, options: Record<string, unknown>) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const component = mount(MarkdownRenderer, { target, props: { source, ...options } })
    flushSync()
    //Shiki runs in Carta's mount-time render; the lazily loaded grammar arrives after it starts
    for (let attempt = 0; attempt < 300; attempt++) {
        if (target.querySelector('pre.shiki')) break
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return {
        target,
        cleanup: () => {
            unmount(component)
            target.remove()
        }
    }
}

it('highlights the files of a C playground read as plain code', async () => {
    const source = [
        '```c|playground|target=riscv|file=src/main.c|console',
        '#include "value.h"',
        'int main(void) { return VALUE; }',
        '```',
        '',
        '```c|file=src/value.h',
        '#define VALUE 42',
        '```',
        ''
    ].join('\n')
    const { target, cleanup } = await render(source, { playgrounds: 'code' })
    try {
        const blocks = [...target.querySelectorAll('pre.code-block')]
        expect(blocks).toHaveLength(2)
        for (const block of blocks) {
            expect(block.classList.contains('shiki')).toBe(true)
            expect(block.querySelectorAll('code span[style*="color"]').length).toBeGreaterThan(0)
        }
        expect(target.querySelector('pre.code-block code')?.textContent).toContain('int main(void)')
    } finally {
        cleanup()
    }
})

it('reads a fence Shiki has no grammar for as plain text rather than failing the render', async () => {
    const source = '```not-a-language\nkept as written\n```\n'
    const { target, cleanup } = await render(source, { playgrounds: 'code' })
    try {
        expect(target.querySelector('pre.shiki code')?.textContent).toBe('kept as written')
    } finally {
        cleanup()
    }
})
