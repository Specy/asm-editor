import { untrack } from 'svelte'
import { searchClient, type SearchAnswer, type SearchResult } from './searchClient.svelte'
import type { SearchScope } from './scope'

type Source = {
    /** What is in the box. */
    query: () => string
    /** What it searches; none, nothing is searched. */
    scope: () => SearchScope | undefined
    /** Whether it is on screen; a closed palette searches nothing. */
    active?: () => boolean
    limit: number
    /** The pause in typing, in milliseconds, before a query is searched. */
    delay: number
    /** Each answer shown, first or refreshed: what the box opens or selects with it. */
    onAnswer?: (answer: SearchAnswer) => void
}

/**
 * A search box's results as the reader types, for the palette and the Documentation panel
 * ([the design record](../../../../../docs/design/documentation-search.md), Loading in the
 * browser). A query is searched after a pause in typing, from whatever part of the index is in,
 * and asked again each time more of the index or the model arrives (`searchClient.answerKey`): the
 * first results can be words from one shard, the last are words and meaning over the whole scope.
 *
 * Asking again stops once the reader starts on the results (`hold`): moving through them, pointing
 * at one, scrolling them or opening one. They then stay as they are, under the reader, until the
 * query changes.
 *
 * Made while a component initialises: its effects live as long as the component.
 */
export class LiveSearch {
    results = $state<SearchResult[]>([])
    /** The query the results answer: empty before the first answer, to tell "not yet" from "none". */
    searched = $state('')
    /** The last search failed: its index could not be loaded, or the search worker stopped. */
    failed = $state(false)

    /** The reader has started on the results. */
    private held = false
    /** Counts the searches asked for and the queries typed: an older answer is dropped. */
    private generation = 0
    /** The generation of the search under way, if one is. */
    private running: number | null = null

    constructor(private readonly source: Source) {
        $effect(() => {
            const text = source.query().trim()
            const scope = source.scope()
            const active = source.active?.() ?? true
            this.held = false
            this.generation++
            if (!active || !text || !scope) {
                this.results = []
                this.searched = ''
                this.failed = false
                return
            }
            const timer = setTimeout(() => void this.run(scope, text), source.delay)
            return () => clearTimeout(timer)
        })

        $effect(() => {
            const scope = source.scope()
            if (!scope) return
            searchClient.answerKey(scope)
            untrack(() => this.refresh(scope))
        })
    }

    /** The reader has started on the results: they stay as they are until the query changes. */
    hold() {
        this.held = true
    }

    /** The shown query again, for what arrived since it was answered, unless the reader holds it. */
    private refresh(scope: SearchScope) {
        const text = this.source.query().trim()
        if (this.held || !text || this.searched !== text) return
        if (!(this.source.active?.() ?? true)) return
        if (this.running === this.generation) return
        void this.run(scope, text)
    }

    private async run(scope: SearchScope, text: string) {
        const mine = ++this.generation
        this.running = mine
        const key = searchClient.answerKey(scope)
        try {
            const answer = await searchClient.search(scope, text, this.source.limit, {
                partial: true
            })
            if (mine !== this.generation) return
            this.results = answer.results
            this.searched = text
            this.failed = false
            this.source.onAnswer?.(answer)
        } catch {
            if (mine !== this.generation) return
            this.results = []
            this.searched = text
            this.failed = true
        } finally {
            if (this.running === mine) this.running = null
        }
        // a shard or the model that came while it ran
        if (searchClient.answerKey(scope) !== key) this.refresh(scope)
    }
}
