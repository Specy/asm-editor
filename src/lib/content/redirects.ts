import { redirect } from '@sveltejs/kit'

/**
 * The "Assembly Examples" course was retired once every language course grew an Examples module of
 * its own, holding the same programs and a great many more. Its pages had been linked to for over a
 * year, so rather than let them 404 they are sent to the page that replaced each one.
 *
 * Keyed by the path under `/learn/courses/`, so `examples/m68k/fibonacci` is the lecture of that
 * name in the course `examples`.
 */
const RETIRED_PAGES: Record<string, string> = {
    examples: '/learn/courses',
    'examples/m68k/fibonacci': '/learn/courses/m68k/examples/factorial-and-fibonacci',
    'examples/mips/fibonacci': '/learn/courses/mips/examples/factorial-and-fibonacci',
    'examples/risc-v/fibonacci': '/learn/courses/risc-v/examples/factorial-and-fibonacci'
}

/**
 * Redirects a retired course page to whatever replaced it, permanently. Called by the course and
 * lecture loads before they look a slug up, because a retired slug is no longer in the content and
 * would otherwise be reported as missing.
 */
export function redirectRetiredPage(...slugs: (string | undefined)[]): void {
    const parts = slugs.filter((slug): slug is string => Boolean(slug))
    //most specific first: the course's own layout load sees a lecture's slugs too, so matching the
    //course before the lecture would send every page of a retired course to the same place
    for (let length = parts.length; length > 0; length--) {
        const target = RETIRED_PAGES[parts.slice(0, length).join('/')]
        if (target) redirect(301, target)
    }
}
