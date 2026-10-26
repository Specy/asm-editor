import { browser } from '$app/env'
import { LANGUAGE_THEMES } from '#lib/Config.ts'
import { id } from '#lib/id.ts'
import { createDebouncer } from '#lib/debounce.ts'
import { TinyColor } from '@ctrl/tinycolor'
import structuredClone from '@ungap/structured-clone'

/**
 * The colours a theme is made of, in the order the theme editor and the CSS variables list them,
 * each with the name its custom properties take. The readonly ones are not offered for editing.
 */
const THEME_PROPS = {
    background: { name: 'background' },
    primary: { name: 'primary' },
    secondary: { name: 'secondary' },
    tertiary: { name: 'tertiary' },
    accent: { name: 'accent' },
    accent2: { name: 'accent2' },
    hint: { name: 'hint', readonly: true },
    textDarker: { name: 'text-layered', readonly: true },
    scrollbar: { name: 'scrollbar' },
    red: { name: 'red', readonly: true }, //TODO rename to warn
    green: { name: 'green', readonly: true } //TODO rename to success
} as const

export type ThemeKeys = keyof typeof THEME_PROPS
export type ThemeProp<T = ThemeKeys> = {
    name: string
    color: string
    prop: T
    readonly?: boolean
}
const version = 1
type StoredTheme<T extends string = string> = {
    version: number
    id: string
    name: string
    extends: string
    editable: boolean
    theme: Record<T, ThemeProp<T>>
}

/** The colours every built-in theme shares, which are the readonly ones. */
const SHARED_COLORS = { hint: '#939393', textDarker: '#c1c1c1', red: '#ed4f4f', green: '#356a59' }

/** The colours a built-in theme picks for itself; its primary is its background. */
type BuiltinColors = Record<Exclude<ThemeKeys, 'primary' | keyof typeof SHARED_COLORS>, string>

function builtinTheme(
    themeId: string,
    name: string,
    colors: BuiltinColors
): StoredTheme<ThemeKeys> {
    const all: Record<ThemeKeys, string> = {
        ...SHARED_COLORS,
        ...colors,
        primary: colors.background
    }
    const theme = Object.fromEntries(
        Object.entries(THEME_PROPS).map(([prop, { name: cssName, ...flags }]) => [
            prop,
            { color: all[prop as ThemeKeys], name: cssName, prop, ...flags }
        ])
    ) as StoredTheme<ThemeKeys>['theme']
    return { version, id: themeId, name, extends: themeId, editable: false, theme }
}

export const DEFAULT_THEME = builtinTheme(LANGUAGE_THEMES.M68K, 'Default', {
    background: '#171A21',
    secondary: '#1d212a',
    tertiary: '#2d3950',
    accent: '#F2A65A',
    accent2: '#3b5364',
    scrollbar: '#3b5364'
})

export const BUILTIN_THEMES: StoredTheme<ThemeKeys>[] = [
    DEFAULT_THEME,
    builtinTheme(LANGUAGE_THEMES.MIPS, 'Default mips', {
        background: 'rgb(25 23 33)',
        secondary: '#201d29',
        tertiary: '#322d45',
        accent: '#9259c1',
        accent2: '#4e4456',
        scrollbar: '#433d6f'
    }),
    builtinTheme(LANGUAGE_THEMES['RISC-V'], 'Default risc-v', {
        background: '#070915',
        secondary: '#121527',
        tertiary: '#1b1f39',
        accent: '#fdb515',
        accent2: '#283272',
        scrollbar: '#3d446f'
    }),
    builtinTheme(LANGUAGE_THEMES.Z80, 'Default z80', {
        background: '#0b1210',
        secondary: '#131d1a',
        tertiary: '#1b2a26',
        accent: '#4fd1a5',
        accent2: '#23403a',
        scrollbar: '#2f4a43'
    }),
    builtinTheme(LANGUAGE_THEMES.X86, 'Default x86-64', {
        background: '#0a121a',
        secondary: '#111c26',
        tertiary: '#1a2c3a',
        accent: '#0f86dd',
        accent2: '#1d4a6b',
        scrollbar: '#2a5c80'
    })
]

/** The text colours a theme dresses its colours with, which no theme chooses for itself. */
type ThemeTextColors = {
    textForDark: string
    textForLight: string
    textMutedForDark: string
    textMutedForLight: string
}

const TEXT_COLORS: ThemeTextColors = {
    textForDark: '#dbdbdb',
    textForLight: '#181818',
    //the same text, dimmed: what long-form prose (a lecture, a documentation description) is
    //written in, so it sits a step below titles and interface text without losing contrast
    textMutedForDark: '#d4d4d4',
    textMutedForLight: '#3a3a3a'
}

function toRgbChannels(color: string) {
    const { r, g, b } = new TinyColor(color).toRgb()
    return `${r}, ${g}, ${b}`
}

/**
 * The custom properties a theme stands for, as the body of a `style` attribute.
 *
 * Written once and read both by the provider that dresses the whole app and by the scope that
 * dresses a single subtree, so that a language's pages and the rest of the app cannot end up
 * defining different sets of variables.
 */
export function themeCssVariables(
    theme: Record<ThemeKeys, ThemeProp<ThemeKeys>>,
    text: ThemeTextColors
) {
    const declarations = Object.values(theme).map(({ name, color }) => {
        const isDark = new TinyColor(color).isDark()
        const foreground = isDark ? text.textForDark : text.textForLight
        //the dimmed variant of the same text, for prose sitting on this color
        const muted = isDark ? text.textMutedForDark : text.textMutedForLight
        return `
    --${name}: ${color};
    --${name}-text: ${foreground};
    --${name}-text-muted: ${muted};
    --RGB-${name}: ${toRgbChannels(color)};
    --RGB-${name}-text: ${toRgbChannels(foreground)};
    --RGB-${name}-text-muted: ${toRgbChannels(muted)};
`
    })
    return `${declarations.join('\n')}
    --scroll-accent: ${theme.scrollbar.color};
`
}

function makeThemeStore(_theme: StoredTheme<ThemeKeys>) {
    const [debouncer] = createDebouncer(100)
    let themes: StoredTheme<ThemeKeys>[] = $state(structuredClone(BUILTIN_THEMES))
    let meta = $state({
        name: _theme.name,
        ...TEXT_COLORS,
        version: _theme.version,
        id: _theme.id,
        extends: _theme.extends,
        editable: _theme.editable
    })

    const theme: Record<ThemeKeys, ThemeProp<ThemeKeys>> = $state(_theme.theme)
    const themeArray = $derived(Object.values(theme))

    /** The built-in theme the current one was made from, whose colours are its defaults. */
    function extendedTheme() {
        return BUILTIN_THEMES.find((t) => t.id === meta.extends)
    }

    function isDefault(key: ThemeKeys, color: string) {
        const extended = extendedTheme()
        if (!extended) return false
        return new TinyColor(extended.theme[key]?.color).toHex() === new TinyColor(color).toHex()
    }

    function reset(key: ThemeKeys) {
        const extended = extendedTheme()
        if (extended) set(key, extended.theme[key].color)
    }

    function set(key: ThemeKeys, color: string) {
        theme[key].color = color
        save()
    }

    function get(key: ThemeKeys) {
        return theme[key]
    }

    function getChosenTheme() {
        if (!browser) return BUILTIN_THEMES[0].id
        return localStorage.getItem('selected_theme') || BUILTIN_THEMES[0].id
    }

    function getColor(key: ThemeKeys) {
        return new TinyColor(theme[key].color)
    }

    function save() {
        if (!browser) return
        themes = themes.map((t) => {
            if (t.id === meta.id) {
                t.theme = structuredClone($state.snapshot(theme))
            }
            return t
        })
        debouncer(() => {
            localStorage.setItem(
                'themes',
                JSON.stringify($state.snapshot(themes.filter((t) => t.editable)))
            )
            localStorage.setItem('selected_theme', meta.id)
        })
    }

    function load() {
        try {
            if (!browser) return
            const savedThemesJson = localStorage.getItem('themes')
            if (savedThemesJson === null) return
            const savedThemes: StoredTheme<ThemeKeys>[] | null = JSON.parse(savedThemesJson)
            if (!savedThemes) return
            themes = [...BUILTIN_THEMES, ...savedThemes]
            select(getChosenTheme())
        } catch (e) {
            console.error(e)
        }
    }

    function setTheme(selected: StoredTheme<ThemeKeys>, dontSave = false) {
        for (const selectedProp of Object.values(selected.theme)) {
            const key = selectedProp.prop
            if (!theme[key]) {
                theme[key] = selectedProp
            } else {
                theme[key].color = selectedProp.color
            }
        }
        meta = {
            ...TEXT_COLORS,
            version: selected.version,
            id: selected.id,
            extends: selected.extends,
            editable: selected.editable,
            name: selected.name
        }
        if (dontSave) return
        save()
    }

    function textOfColor(color: string) {
        const tiny = new TinyColor(color)
        return tiny.isDark() ? meta.textForDark : meta.textForLight
    }

    function select(id: string, dontSave = false) {
        const selected = themes.find((t) => t.id === id)
        if (!selected) return
        setTheme(selected, dontSave)
    }

    function createNewAndSet(name: string) {
        const themeId = id()
        const newTheme = {
            version,
            id: themeId,
            editable: true,
            name,
            extends: meta.extends,
            theme: structuredClone($state.snapshot(theme))
        } satisfies StoredTheme<ThemeKeys>
        meta = {
            ...TEXT_COLORS,
            name: newTheme.name,
            id: newTheme.id,
            version: newTheme.version,
            editable: newTheme.editable,
            extends: newTheme.extends
        }
        themes.push(newTheme)
        save()
        return theme
    }

    function deleteTheme(themeId: string) {
        const theme = themes.find((t) => t.id === themeId)
        if (!theme || !theme.editable) return
        themes = themes.filter((t) => t.id !== themeId)
        if (meta.id === themeId) {
            setTheme(BUILTIN_THEMES[0])
        }
        save()
    }

    load()

    return {
        get theme() {
            return theme
        },
        get meta() {
            return meta
        },
        get themes() {
            return themes
        },
        get themeList() {
            return themeArray
        },
        isDefault,
        reset,
        get,
        set,
        getColor,
        select,
        createNewAndSet,
        delete: deleteTheme,
        textOfColor,
        isColorDark: (color: string) => new TinyColor(color).isDark()
    }
}

export const ThemeStore = makeThemeStore(BUILTIN_THEMES[0])

/**
 * The built-in theme one subtree of the app is dressed in, when a layout asks for one.
 *
 * The colours themselves are custom properties that layout writes into its own markup — that is
 * what keeps them from flashing — so this exists for what that markup cannot reach: the
 * `theme-color` meta tag, which colours the browser's own chrome on mobile and lives in a head
 * the root layout owns, and the prompt and toasts, which the root layout draws above the subtree.
 */
let scopedThemeId: string | null = $state(null)

export const ScopedTheme = {
    get id() {
        return scopedThemeId
    },
    get theme() {
        return BUILTIN_THEMES.find((t) => t.id === scopedThemeId) ?? null
    },
    /** The subtree's custom properties, for an element drawn outside it; empty when there is none. */
    get variables() {
        const scoped = this.theme
        return scoped ? themeCssVariables(scoped.theme, ThemeStore.meta) : ''
    },
    set(id: string | null) {
        scopedThemeId = id
    }
}
