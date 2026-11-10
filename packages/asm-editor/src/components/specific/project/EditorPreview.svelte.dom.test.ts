/**
 * The code an editor shows while its Monaco loads: coloured as the editor colours it and numbered
 * as Monaco numbers it, the empty line after a final newline included.
 */
import { afterEach, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import EditorPreview from './EditorPreview.svelte'

const mounted: ReturnType<typeof mount>[] = []
afterEach(() => {
    mounted.splice(0).forEach((app) => unmount(app))
    document.body.replaceChildren()
})

function show(code: string, language: 'MIPS' | 'c' | 'markdown') {
    const target = document.createElement('div')
    document.body.appendChild(target)
    mounted.push(mount(EditorPreview, { target, props: { code, language } }))
    flushSync()
    return target
}

it('colours assembly and numbers every line, the one after a final newline too', () => {
    const target = show('main:\n    li $t0, 1\n', 'MIPS')
    expect(target.querySelector('code')?.textContent).toContain('li $t0, 1')
    expect(target.querySelectorAll('code span[class^="asm-"]').length).toBeGreaterThan(0)
    expect(target.querySelector('.code-gutter')?.textContent).toBe('1\n2\n3')
    //one indentation guide, for the indented line
    expect(target.querySelectorAll('.code-indent-guides > i')).toHaveLength(1)
})

it('colours C and leaves any other text plain', () => {
    expect(
        show('int main(void) { return 0; }', 'c').querySelectorAll('code span').length
    ).toBeGreaterThan(0)
    const plain = show('# Notes', 'markdown')
    expect(plain.querySelector('code')?.textContent).toContain('# Notes')
    expect(plain.querySelectorAll('code span[class^="asm-"]')).toHaveLength(0)
})

it('says the editor is still loading', () => {
    expect(show('nop', 'MIPS').querySelector('.loading')?.textContent).toContain('Loading editor…')
})
