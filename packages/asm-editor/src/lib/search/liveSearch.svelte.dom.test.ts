import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { SearchAnswer } from './searchClient.svelte'
import { languageScope, type SearchScope } from './scope'

//the client as a search box sees it: answers it is told to give, and a key the test moves on
vi.mock('./searchClient.svelte', async () => {
    const { SvelteMap } = await import('svelte/reactivity')
    const state = new SvelteMap<string, string>([['key', '0']])
    return {
        searchClient: {
            search: vi.fn(),
            answerKey: () => state.get('key'),
            arrive: (key: string) => state.set('key', key)
        }
    }
})

const { searchClient } = (await import('./searchClient.svelte')) as unknown as {
    searchClient: {
        search: ReturnType<typeof vi.fn>
        arrive(key: string): void
    }
}
const { LiveSearch } = await import('./liveSearch.svelte')

const mips = languageScope('mips')
const answerOf = (...keys: string[]) =>
    ({ results: keys.map((key) => ({ key })), mode: 'text' }) as unknown as SearchAnswer
const keysOf = (live: InstanceType<typeof LiveSearch>) => live.results.map((result) => result.key)
const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

let cleanup: (() => void) | undefined

function mount(options: { query?: string; scope?: SearchScope; active?: boolean } = {}) {
    const state = $state({
        query: options.query ?? 'add',
        scope: options.scope ?? mips,
        active: options.active ?? true
    })
    let live!: InstanceType<typeof LiveSearch>
    cleanup = $effect.root(() => {
        live = new LiveSearch({
            query: () => state.query,
            scope: () => state.scope,
            active: () => state.active,
            limit: 20,
            delay: 0
        })
    })
    flushSync()
    return { live, state }
}

beforeEach(() => {
    searchClient.arrive('0')
    searchClient.search.mockReset()
})

afterEach(() => {
    cleanup?.()
    cleanup = undefined
})

describe('a search box’s results', () => {
    it('come from whatever part of the index is in', async () => {
        searchClient.search.mockResolvedValue(answerOf('add'))
        const { live } = mount()
        await settle()
        expect(searchClient.search).toHaveBeenCalledWith(mips, 'add', 20, { partial: true })
        expect(keysOf(live)).toEqual(['add'])
        expect(live.searched).toBe('add')
    })

    it('are searched again when more of the index or the model arrives', async () => {
        searchClient.search.mockResolvedValueOnce(answerOf('addi'))
        const { live } = mount()
        await settle()
        searchClient.search.mockResolvedValueOnce(answerOf('add', 'addi'))
        searchClient.arrive('1')
        flushSync()
        await settle()
        expect(searchClient.search).toHaveBeenCalledTimes(2)
        expect(keysOf(live)).toEqual(['add', 'addi'])
    })

    it('hold still once the reader has started on them, until the query changes', async () => {
        searchClient.search.mockResolvedValueOnce(answerOf('addi'))
        const { live, state } = mount()
        await settle()
        live.hold()
        searchClient.arrive('1')
        flushSync()
        await settle()
        expect(searchClient.search).toHaveBeenCalledTimes(1)
        expect(keysOf(live)).toEqual(['addi'])

        searchClient.search.mockResolvedValue(answerOf('sub'))
        state.query = 'sub'
        flushSync()
        await settle()
        searchClient.arrive('2')
        flushSync()
        await settle()
        //the new query is searched, and refreshed again: the hold was the old query's
        expect(searchClient.search).toHaveBeenCalledTimes(3)
        expect(keysOf(live)).toEqual(['sub'])
    })

    it('are searched once more for what arrived while a search was under way', async () => {
        let finish!: (answer: SearchAnswer) => void
        searchClient.search.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
        const { live } = mount()
        await settle()
        searchClient.arrive('1')
        flushSync()
        searchClient.arrive('2')
        flushSync()
        expect(searchClient.search).toHaveBeenCalledTimes(1)
        searchClient.search.mockResolvedValueOnce(answerOf('add', 'addi'))
        finish(answerOf('addi'))
        await settle()
        expect(searchClient.search).toHaveBeenCalledTimes(2)
        expect(keysOf(live)).toEqual(['add', 'addi'])
    })

    it('say the search failed, and try again when a shard arrives', async () => {
        searchClient.search.mockRejectedValueOnce(new Error('HTTP 404'))
        const { live } = mount()
        await settle()
        expect(live.failed).toBe(true)
        expect(live.searched).toBe('add')
        searchClient.search.mockResolvedValueOnce(answerOf('add'))
        searchClient.arrive('1')
        flushSync()
        await settle()
        expect(live.failed).toBe(false)
        expect(keysOf(live)).toEqual(['add'])
    })

    it('are not searched for a box that is not open, nor for an empty query', async () => {
        const { state } = mount({ active: false })
        await settle()
        state.active = true
        state.query = '  '
        flushSync()
        searchClient.arrive('1')
        flushSync()
        await settle()
        expect(searchClient.search).not.toHaveBeenCalled()
    })
})
