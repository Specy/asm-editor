import { browser } from '$app/environment'
import { LANGUAGE_THEMES } from '$lib/Config'
import { id } from '$lib/storage/db'
import { createDebouncer } from '$lib/utils'
import { TinyColor } from '@ctrl/tinycolor'
import structuredClone from '@ungap/structured-clone'

//TODO redo this with a single writable object, it doesnt need to be this complicated
export const DEFAULT_THEME = {
    version: 1,
    id: LANGUAGE_THEMES.M68K,
    name: 'Default',
    extends: LANGUAGE_THEMES.M68K,
    editable: false,
    theme: {
        background: {
            color: '#171A21',
            name: 'background',
            prop: 'background'
        },
        primary: {
            color: '#171A21',
            name: 'primary',
            prop: 'primary'
        },
        secondary: {
            color: '#1d212a',
            name: 'secondary',
            prop: 'secondary'
        },
        tertiary: {
            color: '#2d3950',
            name: 'tertiary',
            prop: 'tertiary'
        },
        accent: {
            color: '#F2A65A',
            name: 'accent',
            prop: 'accent'
        },
        accent2: {
            color: '#3b5364',
            name: 'accent2',
            prop: 'accent2'
        },
        hint: {
            color: '#939393',
            name: 'hint',
            prop: 'hint',
            readonly: true
        },
        textDarker: {
            color: '#c1c1c1',
            name: 'text-layered',
            prop: 'textDarker',
            readonly: true
        },
        scrollbar: {
            color: '#3b5364',
            name: 'scrollbar',
            prop: 'scrollbar'
        },
        red: {
            color: '#ed4f4f',
            name: 'red', //TODO rename to warn
            prop: 'red',
            readonly: true
        },
        green: {
            color: '#356a59', //TODO rename to success
            name: 'green',
            prop: 'green',
            readonly: true
        }
    }
} as const

export const DEFAULT_MIPS_THEME = {
    version: 1,
    id: LANGUAGE_THEMES.MIPS,
    extends: LANGUAGE_THEMES.MIPS,
    name: 'Default mips',
    editable: false,
    theme: {
        background: {
            color: 'rgb(25 23 33)',
            name: 'background',
            prop: 'background'
        },
        primary: {
            color: 'rgb(25 23 33)',
            name: 'primary',
            prop: 'primary'
        },
        secondary: {
            color: '#201d29',
            name: 'secondary',
            prop: 'secondary'
        },
        tertiary: {
            color: '#322d45',
            name: 'tertiary',
            prop: 'tertiary'
        },
        accent: {
            color: '#9259c1',
            name: 'accent',
            prop: 'accent'
        },
        accent2: {
            color: '#4e4456',
            name: 'accent2',
            prop: 'accent2'
        },
        hint: {
            color: '#939393',
            name: 'hint',
            prop: 'hint',
            readonly: true
        },
        textDarker: {
            color: '#c1c1c1',
            name: 'text-layered',
            prop: 'textDarker',
            readonly: true
        },
        scrollbar: {
            color: '#433d6f',
            name: 'scrollbar',
            prop: 'scrollbar'
        },
        red: {
            color: '#ed4f4f',
            name: 'red', //TODO rename to warn
            prop: 'red',
            readonly: true
        },
        green: {
            color: '#356a59', //TODO rename to success
            name: 'green',
            prop: 'green',
            readonly: true
        }
    }
} as const

export const DEFAULT_RISCV_THEME = {
    version: 1,
    id: LANGUAGE_THEMES['RISC-V'],
    extends: LANGUAGE_THEMES['RISC-V'],
    name: 'Default risc-v',
    editable: false,
    theme: {
        background: {
            color: '#070915',
            name: 'background',
            prop: 'background'
        },
        primary: {
            color: '#070915',
            name: 'primary',
            prop: 'primary'
        },
        secondary: {
            color: '#121527',
            name: 'secondary',
            prop: 'secondary'
        },
        tertiary: {
            color: '#1b1f39',
            name: 'tertiary',
            prop: 'tertiary'
        },
        accent: {
            color: '#fdb515',
            name: 'accent',
            prop: 'accent'
        },
        accent2: {
            color: '#283272',
            name: 'accent2',
            prop: 'accent2'
        },
        hint: {
            color: '#939393',
            name: 'hint',
            prop: 'hint',
            readonly: true
        },
        textDarker: {
            color: '#c1c1c1',
            name: 'text-layered',
            prop: 'textDarker',
            readonly: true
        },
        scrollbar: {
            color: '#3d446f',
            name: 'scrollbar',
            prop: 'scrollbar'
        },
        red: {
            color: '#ed4f4f',
            name: 'red', //TODO rename to warn
            prop: 'red',
            readonly: true
        },
        green: {
            color: '#356a59', //TODO rename to success
            name: 'green',
            prop: 'green',
            readonly: true
        }
    }
} as const

export const DEFAULT_Z80_THEME = {
    version: 1,
    id: LANGUAGE_THEMES.Z80,
    extends: LANGUAGE_THEMES.Z80,
    name: 'Default z80',
    editable: false,
    theme: {
        background: {
            color: '#0b1210',
            name: 'background',
            prop: 'background'
        },
        primary: {
            color: '#0b1210',
            name: 'primary',
            prop: 'primary'
        },
        secondary: {
            color: '#131d1a',
            name: 'secondary',
            prop: 'secondary'
        },
        tertiary: {
            color: '#1b2a26',
            name: 'tertiary',
            prop: 'tertiary'
        },
        accent: {
            color: '#4fd1a5',
            name: 'accent',
            prop: 'accent'
        },
        accent2: {
            color: '#23403a',
            name: 'accent2',
            prop: 'accent2'
        },
        hint: {
            color: '#939393',
            name: 'hint',
            prop: 'hint',
            readonly: true
        },
        textDarker: {
            color: '#c1c1c1',
            name: 'text-layered',
            prop: 'textDarker',
            readonly: true
        },
        scrollbar: {
            color: '#2f4a43',
            name: 'scrollbar',
            prop: 'scrollbar'
        },
        red: {
            color: '#ed4f4f',
            name: 'red', //TODO rename to warn
            prop: 'red',
            readonly: true
        },
        green: {
            color: '#356a59', //TODO rename to success
            name: 'green',
            prop: 'green',
            readonly: true
        }
    }
} as const

export type ThemeKeys = keyof (typeof DEFAULT_THEME)['theme']
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

export const BUILTIN_THEMES: StoredTheme<ThemeKeys>[] = [
    DEFAULT_THEME,
    DEFAULT_MIPS_THEME,
    DEFAULT_RISCV_THEME,
    DEFAULT_Z80_THEME
]

function makeThemeStore(_theme: StoredTheme<ThemeKeys>) {
    const [debouncer] = createDebouncer(100)
    let themes: StoredTheme<ThemeKeys>[] = $state(structuredClone(BUILTIN_THEMES))
    let meta = $state({
        name: _theme.name,
        textForDark: '#dbdbdb',
        textForLight: '#181818',
        //the same text, dimmed: what long-form prose (a lecture, a documentation description) is
        //written in, so it sits a step below titles and interface text without losing contrast
        textMutedForDark: '#d4d4d4',
        textMutedForLight: '#3a3a3a',
        version: _theme.version,
        id: _theme.id,
        extends: _theme.extends,
        editable: _theme.editable
    })
    const theme: Record<ThemeKeys, ThemeProp<ThemeKeys>> = $state(_theme.theme)
    const themeArray = $derived(Object.values(theme))

    function isDefault(key: ThemeKeys, color: string) {
        const extended = BUILTIN_THEMES.find((t) => t.id === meta.extends)
        if (extended) {
            return (
                new TinyColor(extended.theme[key]?.color).toHex() === new TinyColor(color).toHex()
            )
        } else {
            return false
        }
    }

    function reset(key: ThemeKeys) {
        const extended = BUILTIN_THEMES.find((t) => t.id === meta.extends)
        if (extended) {
            set(key, extended.theme[key].color)
        }
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

    function getText(key: ThemeKeys) {
        const color = getColor(key)
        return color?.isDark() ? meta.textForDark : meta.textForLight
    }

    function layer(key: ThemeKeys, layer: number) {
        const color = getColor(key)
        const isDark = color.isDark()
        return isDark ? color.lighten(layer) : color.darken(layer)
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
            textForDark: '#dbdbdb',
            textForLight: '#181818',
            textMutedForDark: '#d4d4d4',
            textMutedForLight: '#3a3a3a',
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
        for (const themeProp of Object.values(newTheme.theme)) {
            set(themeProp.prop, themeProp.color)
        }
        meta = {
            textForDark: '#dbdbdb',
            textForLight: '#181818',
            textMutedForDark: '#d4d4d4',
            textMutedForLight: '#3a3a3a',
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
        getText,
        set,
        layer,
        getColor,
        save,
        select,
        createNewAndSet,
        delete: deleteTheme,
        getChosenTheme,
        textOfColor,
        isColorDark: (color: string) => new TinyColor(color).isDark()
    }
}

export const ThemeStore = makeThemeStore(BUILTIN_THEMES[0])
