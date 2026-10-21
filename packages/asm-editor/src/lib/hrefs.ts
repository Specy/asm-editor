import { resolve } from '$app/paths'
import type { ResolvedPathname } from '$app/types'

/**
 * `resolve()` for a site-absolute href that is data rather than a route written in the source: a
 * documentation entry's, an operand's, a search result's. `resolve()` only types literal routes, so
 * this calls its pathname form (no leading slash, `?search` and `#hash` kept) with the href as text.
 */
export function resolveHref(href: string): ResolvedPathname {
    return (resolve as (pathname: string) => ResolvedPathname)(href.replace(/^\//, ''))
}
