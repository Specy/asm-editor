import { LANGUAGE_THEMES } from '$lib/Config'
import type { AvailableLanguages } from '$lib/Project.svelte'
import { BUILTIN_THEMES, DEFAULT_THEME } from '$stores/themeStore.svelte'

/**
 * The colour that stands for each language, read out of the theme that language already owns rather
 * than written down a second time here.
 *
 * `/documentation/mips` turns the whole editor purple by selecting `default-mips`, and the MIPS card
 * on a page that is not showing that theme has to be the same purple or the two are telling the
 * reader different things. Deriving the colour means they cannot drift apart when a theme is
 * retouched.
 */
function accentOf(themeId: string): string {
    const theme = BUILTIN_THEMES.find((candidate) => candidate.id === themeId)
    //every id in LANGUAGE_THEMES is a built-in theme; the default is what the store itself falls
    //back to when it cannot find one
    return (theme ?? DEFAULT_THEME).theme.accent.color
}

export const LANGUAGE_ACCENTS = Object.fromEntries(
    Object.entries(LANGUAGE_THEMES).map(([language, themeId]) => [language, accentOf(themeId)])
) as Record<AvailableLanguages, string>

export function languageAccent(language: AvailableLanguages): string {
    return LANGUAGE_ACCENTS[language]
}

/**
 * Which language each Course teaches. The General course is absent on purpose: it uses whichever
 * language makes each point clearest and belongs to none of them, so it keeps the reader's own
 * theme and gets no colour of its own.
 *
 * Written out rather than derived from the slug, because `risc-v` is `RISC-V` and a Course added
 * later may not be named after its language at all.
 */
const COURSE_LANGUAGES: Record<string, AvailableLanguages> = {
    m68k: 'M68K',
    mips: 'MIPS',
    'risc-v': 'RISC-V',
    z80: 'Z80',
    x86: 'X86'
}

export function courseLanguage(slug: string): AvailableLanguages | null {
    return COURSE_LANGUAGES[slug] ?? null
}

/** The colour of the Course's language, or null for the General course. */
export function courseAccent(slug: string): string | null {
    const language = courseLanguage(slug)
    return language ? LANGUAGE_ACCENTS[language] : null
}

/** The theme a Course's pages show, which for the General course is the default one. */
export function courseTheme(slug: string): string {
    const language = courseLanguage(slug)
    return language ? LANGUAGE_THEMES[language] : DEFAULT_THEME.id
}
