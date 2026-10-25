import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import MarkdownEditor from './MarkdownEditor.svelte'

vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))
//Monaco does not run in jsdom; the editor's text is what these are about, not its colours
vi.mock('#cmp/specific/project/Editor.svelte', async () => ({
    default: (await import('./__fixtures__/EditorStub.svelte')).default
}))

let dispose = () => {}
afterEach(() => dispose())

function render(props: Record<string, unknown>) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const component = mount(MarkdownEditor, { target, props })
    flushSync()
    dispose = () => {
        unmount(component)
        target.remove()
    }
    return target
}

function button(target: HTMLElement, label: string) {
    return [...target.querySelectorAll('button')].find((node) => node.textContent?.trim() === label)
}

describe('Markdown editor', () => {
    it('writes the text in Markdown mode and previews it as the Exam session shows it', () => {
        const target = render({
            value: 'See [MOVEA](/documentation/m68k/instruction/movea).\n\n```riscv\nli a0, 1\n```'
        })
        expect(target.querySelector('textarea')?.dataset.language).toBe('markdown')
        const preview = target.querySelector('.preview')
        //links stay out of an Exam, a link into the Documentation as its mark
        expect(preview?.querySelector('a')).toBeNull()
        expect(preview?.querySelector('span.doc-link')?.textContent).toBe('MOVEA')
        expect(preview?.querySelector('pre.code-block .asm-keyword')?.textContent).toBe('li')
    })

    it('previews what is typed', () => {
        const target = render({ value: 'before' })
        const textarea = target.querySelector('textarea')!
        textarea.value = '## after'
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        expect(target.querySelector('.preview h2')?.textContent).toBe('after')
    })

    it('switches between the text and the preview', () => {
        const target = render({ value: 'text', layout: 'switch' })
        expect(target.querySelector('.text')?.classList.contains('shown')).toBe(true)
        expect(target.querySelector('.preview')?.classList.contains('shown')).toBe(false)
        button(target, 'Preview')?.click()
        flushSync()
        expect(target.querySelector('.text')?.classList.contains('shown')).toBe(false)
        expect(target.querySelector('.preview')?.classList.contains('shown')).toBe(true)
    })

    it.each(['split', 'auto'] as const)('takes the %s layout it is given', (layout) => {
        const target = render({ value: 'text', layout })
        expect(target.querySelector('.markdown-editor')?.classList.contains(layout)).toBe(true)
    })

    it.each([true, false])('numbers the preview’s code lines: %s', (lineNumbers) => {
        const target = render({ value: '```riscv\nli a0, 1\n```', lineNumbers })
        expect(target.querySelector('.preview ._markdown')?.getAttribute('style')).toContain(
            `--code-block-gutter-display: ${lineNumbers ? 'block' : 'none'}`
        )
    })
})
