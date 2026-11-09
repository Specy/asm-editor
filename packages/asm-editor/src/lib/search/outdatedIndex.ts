/*
 * A search shard of another format than the page reads ([the plan](../../../../../docs/design/plain-english-search-plan.md),
 * phase 2): the site was deployed after the page loaded, and only a reload brings the two back in
 * step. A module of its own, without Orama or the model, since the search boxes check for it.
 */

/** What a search box says, and what the agents' tool reports, when the index is outdated. */
export const OUTDATED_INDEX_MESSAGE =
    'The site was updated after this page was opened. Reload the page to search.'

export class OutdatedIndexError extends Error {
    constructor() {
        super(OUTDATED_INDEX_MESSAGE)
        this.name = 'OutdatedIndexError'
    }
}
