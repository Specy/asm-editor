import { SITE_URL } from '#lib/seo.ts'
import { DOCUMENTATION_LANGUAGES } from '#lib/search/scope.ts'
import { documentationFor } from '#lib/documentation/documentation.ts'
import { lazyLoad } from '#lib/lazyLoad.ts'
import { absoluteUrl, entryTwinPathname, trimPathname, twinPathname } from './urls'
import type { LinkRewriter } from './rewrite'

/**
 * Where a link written in the site's sources leads in a **Markdown twin**: to the twin of the page or
 * entry it names when there is one, and otherwise to the page itself, always as an absolute URL,
 * since several agents' fetch tools resolve no relative link. A link to an entry's anchor on its
 * Chapter page reaches the entry's own twin, so this reads every language's Chapters once.
 */

const SITE = new URL(SITE_URL)

/** Each Chapter page's entries, by anchor: `/documentation/mips/syscall` → `service-1` → its twin. */
const entryTwins = lazyLoad(async () => {
    const byPage = new Map<string, Map<string, string>>()
    for (const language of DOCUMENTATION_LANGUAGES) {
        for (const chapter of await documentationFor(language)) {
            for (const entry of chapter.entries) {
                const path = entry.href.split('#')[0]
                if (!entry.href.includes('#')) continue
                let anchors = byPage.get(path)
                if (!anchors) byPage.set(path, (anchors = new Map()))
                anchors.set(entry.anchor, entryTwinPathname(entry))
            }
        }
    }
    return byPage
})

export type TwinLinks = {
    /** Where `url`, written on the page at `pagePathname`, goes in its twin. */
    rewriter(pagePathname: string): LinkRewriter
}

export async function twinLinks(): Promise<TwinLinks> {
    const entries = await entryTwins()
    return {
        rewriter: (pagePathname) => (written) => {
            // other schemes (mailto:, data:) are left as they are
            if (/^[a-z][a-z0-9+.-]*:/i.test(written) && !/^https?:/i.test(written)) return written
            let url: URL
            try {
                url = new URL(written, new URL(pagePathname, SITE))
            } catch {
                return written
            }
            if (url.origin !== SITE.origin) return written
            const path = trimPathname(url.pathname)
            const anchor = decodeURIComponent(url.hash.slice(1))
            const entry = anchor ? entries.get(path)?.get(anchor) : undefined
            if (entry) return absoluteUrl(entry)
            const twin = twinPathname(path)
            if (twin) return `${absoluteUrl(twin)}${url.hash}`
            return `${absoluteUrl(path)}${url.search}${url.hash}`
        }
    }
}
