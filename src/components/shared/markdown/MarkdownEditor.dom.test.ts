import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import MarkdownEditor from './MarkdownEditor.svelte'

vi.mock('$lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

afterEach(() => vi.unstubAllGlobals())

describe('Markdown editor code previews', () => {
    it.each([
        { language: 'riscv', lineNumbers: true },
        { language: 'riscv', lineNumbers: false },
        { language: 'javascript', lineNumbers: true },
        { language: 'javascript', lineNumbers: false }
    ])(
        'styles $language previews with lineNumbers=$lineNumbers',
        async ({ language, lineNumbers }) => {
            vi.stubGlobal(
                'ResizeObserver',
                class {
                    observe() {}
                    unobserve() {}
                    disconnect() {}
                }
            )
            const target = document.createElement('div')
            document.body.appendChild(target)
            const source =
                language === 'riscv'
                    ? 'li a0, 1\n\naddi a0, a0, 2'
                    : 'const x = 1\n\nconsole.log(x)'
            const value = `\`\`\`${language}\n${source}\n\`\`\``
            const component = mount(MarkdownEditor, { target, props: { value, lineNumbers } })
            // Carta restores scroll positions on mount; jsdom has no scrolling implementation.
            target.querySelectorAll<HTMLElement>('*').forEach((element) => {
                element.scroll = () => {}
            })
            try {
                flushSync()
                const initialBlock = target.querySelector('.carta-renderer pre.code-block')
                for (
                    let attempt = 0;
                    attempt < 200 &&
                    target.querySelector('.carta-renderer pre.code-block') === initialBlock;
                    attempt++
                ) {
                    await new Promise((resolve) => setTimeout(resolve, 10))
                }
                const block = target.querySelector('.carta-renderer pre.code-block')
                expect(block).not.toBe(initialBlock)
                expect(block?.querySelector('code')?.textContent).toBe(source)
                if (language === 'riscv') {
                    expect(block?.querySelector('.asm-mnemonic')?.textContent).toBe('li')
                } else {
                    expect(block?.classList.contains('shiki')).toBe(true)
                }
                expect(block?.querySelectorAll('.code-gutter')).toHaveLength(1)
                expect(block?.querySelector('.code-gutter')?.textContent).toBe('1\n2\n3')
                expect(
                    target
                        .querySelector<HTMLElement>('.markdown-editor')
                        ?.style.getPropertyValue('--code-block-gutter-display')
                ).toBe(lineNumbers ? 'block' : 'none')
                expect(target.querySelector('textarea')?.value).toBe(value)
            } finally {
                await unmount(component)
                target.remove()
            }
        }
    )
})
