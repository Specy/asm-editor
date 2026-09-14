import { describe, expect, it } from 'vitest'
import { LANGUAGE_THEMES } from '$lib/Config'
import { AVAILABLE_LANGUAGES } from '$lib/Project.svelte'
import { BUILTIN_THEMES, DEFAULT_THEME } from '$stores/themeStore.svelte'
import {
    LANGUAGE_ACCENTS,
    courseAccent,
    courseLanguage,
    courseTheme,
    languageAccent
} from './languageColors'

/**
 * The colour a language wears on a card has to be the colour its pages actually show, and both come
 * from the theme named in `LANGUAGE_THEMES`. A theme id that names nothing resolves to the default
 * silently, in the store and here alike, so a typo would paint every card orange and break no build.
 */
describe('language colours', () => {
    it('names a real built-in theme for every language', () => {
        for (const language of AVAILABLE_LANGUAGES) {
            const id = LANGUAGE_THEMES[language]
            expect(
                BUILTIN_THEMES.some((theme) => theme.id === id),
                `${language} names the theme ${id}, which is not a built-in theme`
            ).toBe(true)
        }
    })

    it('reads each accent out of that theme', () => {
        for (const language of AVAILABLE_LANGUAGES) {
            const theme = BUILTIN_THEMES.find(
                (candidate) => candidate.id === LANGUAGE_THEMES[language]
            )
            expect(languageAccent(language)).toBe(theme!.theme.accent.color)
        }
    })

    it('gives the languages that do not share a theme different colours', () => {
        //RISC-V-64 shares the RISC-V theme on purpose; the rest are told apart by colour alone
        const distinct = new Set(
            AVAILABLE_LANGUAGES.filter((language) => language !== 'RISC-V-64').map(languageAccent)
        )
        expect(distinct.size).toBe(AVAILABLE_LANGUAGES.length - 1)
    })

    it('covers every language', () => {
        expect(Object.keys(LANGUAGE_ACCENTS).sort()).toEqual([...AVAILABLE_LANGUAGES].sort())
    })
})

describe('course colours', () => {
    /** Read from disk so a Course added later without an entry fails here rather than on the page. */
    const courseSlugs = Object.keys(import.meta.glob('/src/content/*/meta.json')).map((path) => {
        const parts = path.split('/')
        return parts[parts.length - 2]
    })

    it('finds a language for every Language course', () => {
        const withoutLanguage = courseSlugs.filter((slug) => courseLanguage(slug) === null)
        expect(withoutLanguage).toEqual(['assembly-basics'])
    })

    it('gives a Language course the theme and colour of its language', () => {
        expect(courseTheme('x86')).toBe(LANGUAGE_THEMES.X86)
        expect(courseAccent('x86')).toBe(languageAccent('X86'))
        expect(courseTheme('risc-v')).toBe(LANGUAGE_THEMES['RISC-V'])
    })

    it('leaves the General course on the default theme and with no colour', () => {
        expect(courseTheme('assembly-basics')).toBe(DEFAULT_THEME.id)
        expect(courseAccent('assembly-basics')).toBe(null)
    })
})
