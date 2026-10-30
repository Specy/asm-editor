/**
 * The Documentation panel beside an M68K program whose processor its live analysis knows
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 36): it shows the
 * Chapters as that program reads them, which leave out what a later processor brought, and leaves
 * the entries they leave out out of the search results too; while the processor is unknown it shows
 * everything. The Chapters are stand-ins here: s68k's WebAssembly, which the M68K Chapters read,
 * does not load under jsdom, and what they leave out is `processorChoice.test.ts`'s.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import type { Chapter, DocumentationEntry } from '#lib/documentation/entries.ts'
import { m68kDialectKey, type M68kDialect } from '#lib/languages/M68K/m68kDialect.ts'
import type { EntryResult } from '#lib/search/engine.ts'
import { searchClient } from '#lib/search/searchClient.svelte.ts'
import { languageScope } from '#lib/search/scope.ts'
import DocumentationBrowser from './DocumentationBrowser.svelte'

// svelte/motion reads the reduced motion query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})

function entry(chapter: string, title: string): DocumentationEntry {
    return {
        id: `m68k/${chapter}/${title}`,
        language: 'm68k',
        chapter,
        //a row with a name, as the real sections' prose is not
        kind: chapter === 'instructions' ? 'instruction' : 'directive',
        title,
        names: [title],
        summary: `${title} summary`,
        href: `/documentation/m68k/${chapter}#${title}`,
        anchor: title,
        view: { type: 'markdown', markdown: title },
        searchText: title
    }
}

const EVERYTHING: Chapter[] = [
    {
        id: 'instructions',
        language: 'm68k',
        title: 'Instructions',
        href: '/documentation/m68k/instruction',
        description: '',
        entries: ['ext', 'extb', 'movec', 'bfextu'].map((name) => entry('instructions', name))
    },
    {
        id: 'exceptions',
        language: 'm68k',
        title: 'Exceptions',
        href: '/documentation/m68k/exceptions',
        description: '',
        entries: ['frames', '68010', '68020'].map((anchor) => entry('exceptions', anchor))
    }
]

/** What each dialect leaves out, as the M68K Chapters would. */
const LEFT_OUT: Record<string, string[]> = {
    '68000': ['extb', 'movec', 'bfextu', '68010', '68020'],
    '68000+bit': ['extb', 'movec', '68010', '68020'],
    '68010': ['extb', 'bfextu', '68020'],
    '68020': []
}

const loads = vi.hoisted(() => ({ dialects: [] as string[], whole: 0 }))

vi.mock('#lib/documentation/documentation.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('#lib/documentation/documentation.ts')>()),
    documentationFor: async () => {
        loads.whole++
        return EVERYTHING
    },
    m68kDocumentationFor: async (dialect: M68kDialect) => {
        const key = m68kDialectKey(dialect)
        loads.dialects.push(key)
        const out = new Set(LEFT_OUT[key])
        const chapters = EVERYTHING.map((chapter) => ({
            ...chapter,
            entries: chapter.entries.filter((each) => !out.has(each.anchor))
        }))
        const hidden = new Set(
            EVERYTHING.flatMap((chapter) => chapter.entries)
                .filter((each) => out.has(each.anchor))
                .map((each) => each.id)
        )
        return { chapters, hidden }
    }
}))

beforeAll(() => {
    HTMLElement.prototype.animate = (() => ({
        cancel() {},
        finish() {},
        play() {},
        pause() {},
        onfinish: null,
        finished: Promise.resolve()
    })) as unknown as typeof HTMLElement.prototype.animate
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver
    HTMLElement.prototype.scrollTo ??= () => {}
})

let dispose = () => {}
afterEach(() => {
    dispose()
    vi.restoreAllMocks()
    loads.dialects = []
    loads.whole = 0
})

/** The panel, beside a program for `dialect` that the test can change, once its Chapters loaded. */
async function panel(dialect: M68kDialect | undefined) {
    const props = $state({ m68kDialect: dialect })
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(DocumentationBrowser, {
        target,
        props: {
            language: 'm68k',
            scope: languageScope('m68k', false),
            get m68kDialect() {
                return props.m68kDialect
            }
        }
    })
    dispose = () => {
        void unmount(app)
        target.remove()
    }
    await vi.waitFor(() => expect(target.querySelector('.chapter-toggle')).not.toBeNull())
    return { target, props }
}

/** The titles of a Chapter's entries, unfolded. */
function titles(target: HTMLElement, chapter: string): string[] {
    const section = target.querySelector(`[data-chapter="${chapter}"]`)!
    if (section.classList.contains('folded')) {
        section.querySelector<HTMLButtonElement>('.chapter-toggle')!.click()
        flushSync()
    }
    return [...section.querySelectorAll('.entry-row .name')].map(
        (name) => name.textContent?.trim() ?? ''
    )
}

describe('the Documentation panel beside an M68K program', () => {
    it('shows the Chapters as a 68000 program reads them', async () => {
        const { target } = await panel({ processor: '68000', bitFields: false })
        expect(loads.dialects).toEqual(['68000'])
        expect(titles(target, 'instructions')).toEqual(['ext'])
        expect(titles(target, 'exceptions')).toEqual(['frames'])
    })

    it('follows the program to another processor, and a new analysis of the same loads nothing', async () => {
        const { target, props } = await panel({ processor: '68000', bitFields: true })
        expect(titles(target, 'instructions')).toEqual(['ext', 'bfextu'])

        props.m68kDialect = { processor: '68000', bitFields: true }
        flushSync()
        await tick()
        expect(loads.dialects).toEqual(['68000+bit'])

        props.m68kDialect = { processor: '68010', bitFields: false }
        await vi.waitFor(() => expect(titles(target, 'instructions')).toEqual(['ext', 'movec']))
        expect(titles(target, 'exceptions')).toEqual(['frames', '68010'])
        expect(loads.dialects).toEqual(['68000+bit', '68010'])
    })

    it('shows everything while the processor is unknown', async () => {
        const { target } = await panel(undefined)
        expect(loads).toEqual({ dialects: [], whole: 1 })
        expect(titles(target, 'instructions')).toEqual(['ext', 'extb', 'movec', 'bfextu'])
    })

    it('leaves the entries it hides out of the search results', async () => {
        const result = (id: string, title: string, exact = false): EntryResult => ({
            kind: 'entry',
            key: id,
            score: 1,
            exact,
            entry: {
                id,
                language: 'm68k',
                chapter: id.split('/')[1],
                chapterTitle: '',
                entryKind: 'instruction',
                title,
                names: [title],
                signature: '',
                summary: `${title} summary`,
                text: title,
                code: '',
                href: `/documentation/m68k/instruction/${title}`
            }
        })
        vi.spyOn(searchClient, 'search').mockResolvedValue({
            results: [
                result('m68k/instructions/extb', 'extb', true),
                result('m68k/instructions/ext', 'ext', true),
                result('m68k/exceptions/68020', '68020')
            ]
        } as Awaited<ReturnType<typeof searchClient.search>>)
        const { target } = await panel({ processor: '68000', bitFields: false })
        const input = target.querySelector<HTMLInputElement>('input')!
        input.value = 'extb'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await vi.waitFor(() =>
            expect(target.querySelectorAll('.results .entry-row').length).toBeGreaterThan(0)
        )
        const found = [...target.querySelectorAll('.results .entry-row .name')].map((name) =>
            name.textContent?.trim()
        )
        expect(found).toEqual(['ext'])
        //the first exact match is hidden, so the next is the one opened
        await vi.waitFor(() =>
            expect(
                target.querySelector('.results .entry-row .head')?.getAttribute('aria-expanded')
            ).toBe('true')
        )
    })
})
