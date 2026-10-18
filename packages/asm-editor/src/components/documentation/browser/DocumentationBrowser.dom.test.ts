/**
 * The Instructions Chapter while browsing: a heading per **Instruction category** in the shared
 * order, the entries alphabetical under each, and every other Chapter as it was
 * ([the design record](../../../../../../docs/design/instruction-categories.md), decision 10).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import type { Chapter, DocumentationEntry } from '#lib/documentation/entries.ts'
import type { InstructionCategory } from '#lib/documentation/instructions/categories.ts'
import DocumentationBrowser from './DocumentationBrowser.svelte'

// svelte/motion reads the reduced motion query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})

beforeAll(() => {
    HTMLElement.prototype.animate = (() => ({
        cancel() {},
        finish() {},
        play() {},
        pause() {},
        onfinish: null,
        finished: Promise.resolve()
    })) as unknown as typeof HTMLElement.prototype.animate
    // the pinned Chapter heading's height, which the category headings pin under
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver
})

let dispose = () => {}
afterEach(() => dispose())

function entry(chapter: string, title: string, category?: InstructionCategory): DocumentationEntry {
    return {
        id: `mips/${chapter}/${title}`,
        language: 'mips',
        chapter,
        kind: chapter === 'instructions' ? 'instruction' : 'directive',
        title,
        names: [title],
        summary: `${title} summary`,
        href: `/documentation/mips/${chapter}/${title}`,
        anchor: title,
        view: { type: 'markdown', markdown: title },
        searchText: title,
        ...(category ? { category } : {})
    }
}

function chapter(id: string, entries: DocumentationEntry[]): Chapter {
    return { id, language: 'mips', title: id, href: `/${id}`, description: id, entries }
}

function open(chapters: Chapter[]) {
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(DocumentationBrowser, {
        target,
        props: { language: 'mips', chapters, variant: 'page' }
    })
    dispose = () => {
        unmount(app)
        target.remove()
    }
    for (const toggle of target.querySelectorAll<HTMLButtonElement>('.chapter-toggle')) {
        toggle.click()
    }
    flushSync()
    return target
}

const titles = (element: Element) =>
    [...element.querySelectorAll('.entry-row .name')].map((name) => name.textContent)

describe('the Instructions Chapter while browsing', () => {
    it('lists its entries under category headings in the shared order, alphabetical under each', () => {
        const target = open([
            chapter('instructions', [
                entry('instructions', 'add', 'arithmetic'),
                entry('instructions', 'beq', 'control-flow'),
                entry('instructions', 'lw', 'load-and-store'),
                entry('instructions', 'sub', 'arithmetic'),
                entry('instructions', 'syscall', 'system')
            ]),
            chapter('directives', [entry('directives', '.word'), entry('directives', '.data')])
        ])
        const instructions = target.querySelector('[data-chapter="instructions"]')!
        const groups = [...instructions.querySelectorAll('.category-group')]
        expect(
            groups.map((group) => group.querySelector('.category-title')?.textContent?.trim())
        ).toEqual(['Load and store', 'Arithmetic', 'Control flow', 'System'])
        expect(titles(groups[1])).toEqual(['add', 'sub'])
        expect(instructions.querySelectorAll('.entry-row .category')).toHaveLength(0)

        const directives = target.querySelector('[data-chapter="directives"]')!
        expect(directives.querySelector('.category-group')).toBeNull()
        expect(titles(directives)).toEqual(['.word', '.data'])
    })

    it('stays flat when an entry has no category, rather than dropping it', () => {
        const target = open([
            chapter('instructions', [
                entry('instructions', 'add', 'arithmetic'),
                entry('instructions', 'mystery')
            ])
        ])
        expect(target.querySelector('.category-group')).toBeNull()
        expect(titles(target)).toEqual(['add', 'mystery'])
    })
})
