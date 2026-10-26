/**
 * The built-in themes, and the store that switches between them and keeps the ones a reader makes.
 *
 * The first tests pin every colour, name and flag of the built-in themes, in the order the theme
 * editor's rows, the CSS variables and a new theme's saved JSON all walk them. The store runs in
 * the DOM project because only the browser build of Svelte proxies `$state`: the server build would
 * write a selected theme's colours straight into the built-in default.
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { BUILTIN_THEMES, DEFAULT_THEME, ThemeStore } from '#stores/themeStore.svelte.ts'

/** Each colour's prop, CSS name and whether it is readonly, in the order a theme lists them. */
const PROPS = [
    ['background', 'background', false],
    ['primary', 'primary', false],
    ['secondary', 'secondary', false],
    ['tertiary', 'tertiary', false],
    ['accent', 'accent', false],
    ['accent2', 'accent2', false],
    ['hint', 'hint', true],
    ['textDarker', 'text-layered', true],
    ['scrollbar', 'scrollbar', false],
    ['red', 'red', true],
    ['green', 'green', true]
] as const

/** Every built-in theme's colours, as they were written out by hand. */
const BUILTINS = [
    {
        id: 'default',
        name: 'Default',
        colors: {
            background: '#171A21',
            primary: '#171A21',
            secondary: '#1d212a',
            tertiary: '#2d3950',
            accent: '#F2A65A',
            accent2: '#3b5364',
            hint: '#939393',
            textDarker: '#c1c1c1',
            scrollbar: '#3b5364',
            red: '#ed4f4f',
            green: '#356a59'
        }
    },
    {
        id: 'default-mips',
        name: 'Default mips',
        colors: {
            background: 'rgb(25 23 33)',
            primary: 'rgb(25 23 33)',
            secondary: '#201d29',
            tertiary: '#322d45',
            accent: '#9259c1',
            accent2: '#4e4456',
            hint: '#939393',
            textDarker: '#c1c1c1',
            scrollbar: '#433d6f',
            red: '#ed4f4f',
            green: '#356a59'
        }
    },
    {
        id: 'default-risc-v',
        name: 'Default risc-v',
        colors: {
            background: '#070915',
            primary: '#070915',
            secondary: '#121527',
            tertiary: '#1b1f39',
            accent: '#fdb515',
            accent2: '#283272',
            hint: '#939393',
            textDarker: '#c1c1c1',
            scrollbar: '#3d446f',
            red: '#ed4f4f',
            green: '#356a59'
        }
    },
    {
        id: 'default-z80',
        name: 'Default z80',
        colors: {
            background: '#0b1210',
            primary: '#0b1210',
            secondary: '#131d1a',
            tertiary: '#1b2a26',
            accent: '#4fd1a5',
            accent2: '#23403a',
            hint: '#939393',
            textDarker: '#c1c1c1',
            scrollbar: '#2f4a43',
            red: '#ed4f4f',
            green: '#356a59'
        }
    },
    {
        id: 'default-x86',
        name: 'Default x86-64',
        colors: {
            background: '#0a121a',
            primary: '#0a121a',
            secondary: '#111c26',
            tertiary: '#1a2c3a',
            accent: '#0f86dd',
            accent2: '#1d4a6b',
            hint: '#939393',
            textDarker: '#c1c1c1',
            scrollbar: '#2a5c80',
            red: '#ed4f4f',
            green: '#356a59'
        }
    }
]

function expectedTheme({ id, name, colors }: (typeof BUILTINS)[number]) {
    return {
        version: 1,
        id,
        name,
        extends: id,
        editable: false,
        theme: Object.fromEntries(
            PROPS.map(([prop, cssName, readonly]) => [
                prop,
                { color: colors[prop], name: cssName, prop, ...(readonly && { readonly }) }
            ])
        )
    }
}

describe('built-in themes', () => {
    it('keeps every colour, name and flag they were written with', () => {
        expect(BUILTIN_THEMES).toStrictEqual(BUILTINS.map(expectedTheme))
        expect(DEFAULT_THEME).toBe(BUILTIN_THEMES[0])
    })

    it('lists the colours, and each colour its fields, in the order they were written', () => {
        //toStrictEqual ignores the order of keys
        for (const [i, builtin] of BUILTIN_THEMES.entries()) {
            expect(JSON.stringify(builtin.theme)).toBe(
                JSON.stringify(expectedTheme(BUILTINS[i]).theme)
            )
        }
    })
})

describe('ThemeStore', () => {
    afterEach(() => {
        vi.useRealTimers()
        localStorage.clear()
    })

    it('starts on the default theme, with every built-in theme to choose from', () => {
        expect(ThemeStore.themes).toStrictEqual(BUILTIN_THEMES)
        expect(JSON.stringify(ThemeStore.theme)).toBe(JSON.stringify(DEFAULT_THEME.theme))
        expect(ThemeStore.themeList.map(({ prop }) => prop)).toEqual(PROPS.map(([prop]) => prop))
        expect(ThemeStore.meta).toStrictEqual({
            name: 'Default',
            textForDark: '#dbdbdb',
            textForLight: '#181818',
            textMutedForDark: '#d4d4d4',
            textMutedForLight: '#3a3a3a',
            version: 1,
            id: 'default',
            extends: 'default',
            editable: false
        })
    })

    it('selects a built-in theme by its id', () => {
        ThemeStore.select('default-x86', true)
        expect(JSON.stringify(ThemeStore.theme)).toBe(JSON.stringify(BUILTIN_THEMES[4].theme))
        expect(ThemeStore.meta).toMatchObject({
            id: 'default-x86',
            extends: 'default-x86',
            name: 'Default x86-64',
            editable: false,
            textForDark: '#dbdbdb'
        })
    })

    it('copies the current colours into a new theme, which it selects and saves', () => {
        vi.useFakeTimers()
        ThemeStore.select('default-mips', true)
        ThemeStore.createNewAndSet('Mine')
        expect(ThemeStore.meta).toMatchObject({
            name: 'Mine',
            editable: true,
            extends: 'default-mips',
            textForDark: '#dbdbdb'
        })
        const created = ThemeStore.themes.at(-1)!
        expect(created.id).toBe(ThemeStore.meta.id)
        expect(JSON.stringify(created.theme)).toBe(JSON.stringify(BUILTIN_THEMES[1].theme))

        vi.runAllTimers()
        expect(localStorage.getItem('selected_theme')).toBe(created.id)
        expect(JSON.parse(localStorage.getItem('themes')!)).toEqual([
            JSON.parse(JSON.stringify(created))
        ])
    })

    it('tells a colour from, and resets it to, the one of the theme it extends', () => {
        ThemeStore.select('default-mips', true)
        ThemeStore.createNewAndSet('Retouched')
        ThemeStore.set('accent', '#123456')
        expect(ThemeStore.isDefault('accent', '#123456')).toBe(false)
        expect(ThemeStore.isDefault('accent', '#9259C1')).toBe(true)

        ThemeStore.reset('accent')
        expect(ThemeStore.theme.accent.color).toBe('#9259c1')
        expect(ThemeStore.themes.at(-1)!.theme.accent.color).toBe('#9259c1')
    })
})
