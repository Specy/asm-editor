import { browser } from '$app/environment'
import type { AvailableLanguages } from '$lib/Project.svelte'

/**
 * The Preferences: what the person sees and how the editor behaves for them, the same in every
 * Project and kept in localStorage. Anything that changes what the Emulator or the program does is
 * a Setting of the Project instead, see `$lib/projectSettings`
 * ([ADR 0014](../../docs/adr/0014-settings-split-by-effect.md)).
 */

/** Where a Preference is listed in the Workbench's Settings panel. */
export type PreferenceSection = 'preferences' | 'layout'

export type PreferenceOption<T> = {
    value: T
    label: string
}

export type PreferenceValue<T> = {
    name: string
    type: 'boolean' | 'number' | 'string' | 'choice'
    value: T
    onlyFor?: AvailableLanguages
    section: PreferenceSection
    /** The values a `choice` can take, in the order the panel lists them. */
    options?: PreferenceOption<T>[]
}

/** Panels as separate rounded cards, or edge to edge with dividers. */
export type PanelStyle = 'cards' | 'lines'
/** The Debug tools as draggable windows, or as sections of the debug column. */
export type DebugToolsPlacement = 'floating' | 'sections'

export type PreferenceValues = {
    useDecimalAsDefault: PreferenceValue<boolean>
    autoScrollStackTab: PreferenceValue<boolean>
    autoSave: PreferenceValue<boolean>
    showDrawingBuffer: PreferenceValue<boolean>
    showPseudoInstructions: PreferenceValue<boolean>
    panelStyle: PreferenceValue<PanelStyle>
    debugTools: PreferenceValue<DebugToolsPlacement>
}
export type PreferenceKey = keyof PreferenceValues

/** The key the settings store used before the split, kept so nothing is lost on upgrade. */
const STORAGE_KEY = 'asm-editor_settings'

function createValue<T>(name: string, value: T, onlyFor?: AvailableLanguages) {
    return {
        name,
        value,
        type: typeof value,
        onlyFor,
        section: 'preferences'
    } as PreferenceValue<T>
}

function createChoice<T extends string>(
    name: string,
    value: T,
    options: PreferenceOption<T>[],
    section: PreferenceSection
): PreferenceValue<T> {
    return { name, value, type: 'choice', options, section }
}

/** A fresh set of defaults, never shared, because the store mutates the one it holds. */
export function defaultPreferences(): PreferenceValues {
    return {
        useDecimalAsDefault: createValue('Use decimal as default for registers', false),
        autoScrollStackTab: createValue('Auto scroll the stack memory tab', true),
        autoSave: createValue('Auto save', true),
        showPseudoInstructions: createValue('Show pseudo instructions', true, 'MIPS'),
        showDrawingBuffer: createValue(
            'Show the drawing buffer of a double buffered screen',
            false
        ),
        //the two variants the redesign brief explored, kept as the person's choice
        //([the design record](../../docs/design/workbench.md), Layout Preferences)
        panelStyle: createChoice<PanelStyle>(
            'Panel style',
            'cards',
            [
                { value: 'cards', label: 'Cards' },
                { value: 'lines', label: 'Lines' }
            ],
            'layout'
        ),
        debugTools: createChoice<DebugToolsPlacement>(
            'Stack pointer, History and Call stack',
            'floating',
            [
                { value: 'floating', label: 'Floating' },
                { value: 'sections', label: 'Sections' }
            ],
            'layout'
        )
    }
}

/**
 * Stored preferences read tolerantly: the shape the settings store wrote (`{ meta, values: { key:
 * { value } } }`) and the flat `{ key: value }` map written now both load; an unknown key is
 * dropped, a missing key keeps its default, a value of the wrong type is dropped. There is no
 * version and nothing resets, so a release never wipes anyone's preferences.
 */
export function readStoredPreferences(
    json: string | null,
    defaults: PreferenceValues = defaultPreferences()
): PreferenceValues {
    if (!json) return defaults
    const stored: unknown = JSON.parse(json)
    if (typeof stored !== 'object' || stored === null) return defaults
    const record = stored as Record<string, unknown>
    const values =
        typeof record.values === 'object' && record.values !== null
            ? (record.values as Record<string, unknown>)
            : record
    for (const key of Object.keys(defaults) as PreferenceKey[]) {
        const entry = values[key]
        const value =
            typeof entry === 'object' && entry !== null
                ? (entry as Record<string, unknown>).value
                : entry
        const preference = defaults[key] as PreferenceValue<unknown>
        if (preference.type === 'choice') {
            //a choice keeps only a value it still offers, so a renamed option falls back to the default
            if (preference.options?.some((option) => option.value === value)) {
                preference.value = value
            }
        } else if (typeof value === preference.type) {
            preference.value = value
        }
    }
    return defaults
}

function createPreferencesStore() {
    let data = $state(defaultPreferences())

    function store() {
        const values = Object.fromEntries(
            Object.entries(data).map(([key, entry]) => [key, entry.value])
        )
        localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
    }

    function fetch() {
        try {
            data = readStoredPreferences(localStorage.getItem(STORAGE_KEY))
        } catch (e) {
            console.error(e)
        }
    }

    function setValue<K extends PreferenceKey>(key: K, value: PreferenceValues[K]['value']) {
        ;(data[key] as PreferenceValue<unknown>).value = value
        store()
    }

    if (browser) fetch()
    return {
        get values() {
            return data
        },
        setValue
    }
}

export const preferencesStore = createPreferencesStore()
