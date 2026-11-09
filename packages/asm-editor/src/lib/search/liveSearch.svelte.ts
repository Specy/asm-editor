import { untrack } from 'svelte'
import { OutdatedIndexError } from './outdatedIndex'
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
    /**
     * The names whose entries count a little more: the instructions on the lines of the
     * Problems' errors, which only the Workbench's Documentation panel passes
     * (`searchClient.search`).
     */
    favour?: () => readonly string[]
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
 * A change of the favoured names (`favour`) asks again as a new shard does: it changes the order,
 * not the query, so it never lets go of results the reader holds.
 *
 * Made while a component initialises: its effects live as long as the component.
 */
export class LiveSearch {
    results = $state<SearchResult[]>([])
    /** The query the results answer: empty before the first answer, to tell "not yet" from "none". */
    searched = $state('')
    /** The last search failed: its index could not be loaded, or the search worker stopped. */
    failed = $state(false)
    /**
     * It failed because the index is of another format than the page reads: the site was updated
     * since the page was opened, and only a reload helps, not the connection.
     */
    outdated = $state(false)

    /** The reader has started on the results. */
    private held = false
    /** Counts the searches asked for and the queries typed: an older answer is dropped. */
    private generation = 0
    /** The generation of the search under way, if one is. */
    private running: number | null = null
    /**
     * The favoured names as one string: a new analysis with the same errors gives the same names
     * in a new list, which asks nothing again.
     */
    declare private readonly favourKey: string

    constructor(private readonly source: Source) {
        this.favourKey = $derived((source.favour?.() ?? []).join('\n'))

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
                this.outdated = false
                return
            }
            const timer = setTimeout(() => void this.run(scope, text), source.delay)
            return () => clearTimeout(timer)
        })

        $effect(() => {
            const scope = source.scope()
            if (!scope) return
            this.refreshKey(scope)
            untrack(() => this.refresh(scope))
        })
    }

    /** The reader has started on the results: they stay as they are until the query changes. */
    hold() {
        this.held = true
    }

    /**
     * Changes whenever the shown query could be answered differently: more of the index or the
     * model arrived, or the favoured names changed.
     */
    private refreshKey(scope: SearchScope): string {
        return `${searchClient.answerKey(scope)}\0${this.favourKey}`
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
        const key = this.refreshKey(scope)
        const favour = this.favourKey ? { favour: this.favourKey.split('\n') } : {}
        try {
            const answer = await searchClient.search(scope, text, this.source.limit, {
                partial: true,
                ...favour
            })
            if (mine !== this.generation) return
            this.results = answer.results
            this.searched = text
            this.failed = false
            this.outdated = false
            this.source.onAnswer?.(answer)
        } catch (error) {
            if (mine !== this.generation) return
            this.results = []
            this.searched = text
            this.failed = true
            this.outdated = error instanceof OutdatedIndexError
        } finally {
            if (this.running === mine) this.running = null
        }
        // a shard or the model that came while it ran, or other favoured names
        if (this.refreshKey(scope) !== key) this.refresh(scope)
    }
}
