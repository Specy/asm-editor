import type { ListingPlace } from '#lib/listing/listing.ts'
import type { ProjectSourceSelection } from '#lib/monaco/projectSourceSelection.ts'

/**
 * A place an editor pane showed in an Executable, which Back and Forward return to
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision 8):
 * a line of its Listing, or the function its Pseudocode showed, in the version of the File the
 * pane showed it in. A Listing's line keeps the address it stands for, by which it is found again
 * in a Listing made since, whose comment lines or names may have moved it
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 22); `line` is where it was, for a line standing for no address.
 */
export type NavigationPosition = { selection: ProjectSourceSelection } & (
    | { view: 'listing'; line: number; place?: ListingPlace }
    | { view: 'pseudocode'; functionAddress: number }
)

/** How many places a pane keeps behind it, and as many ahead. */
export const NAVIGATION_HISTORY_LIMIT = 50

/**
 * Whether two places are the same: the same File, view and line (by its address where both have
 * one) or function, in either version.
 */
export function samePosition(a: NavigationPosition, b: NavigationPosition): boolean {
    if (a.selection.path !== b.selection.path) return false
    if (a.view === 'listing') {
        if (b.view !== 'listing') return false
        if (!a.place || !b.place) return a.line === b.line
        return (
            a.place.address === b.place.address &&
            a.place.kind === b.place.kind &&
            a.place.nth === b.place.nth
        )
    }
    return b.view === 'pseudocode' && a.functionAddress === b.functionAddress
}

/**
 * One pane's navigation history, as a browser keeps one: each jump puts the place it left behind
 * and forgets what was ahead; Back goes to the latest place behind and puts the pane's place
 * ahead, Forward the reverse.
 */
export class NavigationHistory {
    /** The places behind the pane, the latest last. */
    behind = $state.raw<readonly NavigationPosition[]>([])
    /** The places Back left, the nearest last. */
    ahead = $state.raw<readonly NavigationPosition[]>([])

    get canGoBack() {
        return this.behind.length > 0
    }

    get canGoForward() {
        return this.ahead.length > 0
    }

    /** A jump leaves `from`. */
    record(from: NavigationPosition) {
        const latest = this.behind.at(-1)
        if (!latest || !samePosition(latest, from))
            this.behind = [...this.behind, from].slice(-NAVIGATION_HISTORY_LIMIT)
        if (this.ahead.length) this.ahead = []
    }

    /**
     * Back from `current`, the place the pane is at, if it is at one: the latest place behind it
     * that is not that place and that `usable` takes, such as one whose File still exists. The
     * places passed over are dropped.
     */
    back(
        current: NavigationPosition | undefined,
        usable: (position: NavigationPosition) => boolean
    ): NavigationPosition | undefined {
        return this.step('behind', 'ahead', current, usable)
    }

    /** Forward from `current`, as Back is. */
    forward(
        current: NavigationPosition | undefined,
        usable: (position: NavigationPosition) => boolean
    ): NavigationPosition | undefined {
        return this.step('ahead', 'behind', current, usable)
    }

    private step(
        from: 'behind' | 'ahead',
        to: 'behind' | 'ahead',
        current: NavigationPosition | undefined,
        usable: (position: NavigationPosition) => boolean
    ): NavigationPosition | undefined {
        const places = [...this[from]]
        let target: NavigationPosition | undefined
        while (!target && places.length) {
            const candidate = places.pop()!
            if ((!current || !samePosition(candidate, current)) && usable(candidate))
                target = candidate
        }
        this[from] = places
        if (target && current) this[to] = [...this[to], current].slice(-NAVIGATION_HISTORY_LIMIT)
        return target
    }

    /** A File was renamed: its places go with it. */
    rename(from: string, to: string) {
        const moved = (places: readonly NavigationPosition[]) =>
            places.some((place) => place.selection.path === from)
                ? places.map((place) =>
                      place.selection.path === from
                          ? { ...place, selection: { ...place.selection, path: to } }
                          : place
                  )
                : places
        this.behind = moved(this.behind)
        this.ahead = moved(this.ahead)
    }
}
