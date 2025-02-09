import { browser } from '$app/environment'

export type SettingValue<T> = {
    name: string
    type: 'boolean' | 'number' | 'string'
    value: T
}
export type SettingValues = {
    useDecimalAsDefault: SettingValue<boolean>
    autoScrollStackTab: SettingValue<boolean>
    instructionsLimit: SettingValue<number>
    autoSave: SettingValue<boolean>
    maxHistorySize: SettingValue<number>
    maxVisibleHistoryModifications: SettingValue<number>
}
export type Settings = {
    meta: {
        version: string
    }
    values: SettingValues
}
function createValue<T>(name: string, value: T) {
    return {
        name,
        value,
        type: typeof value
    } as SettingValue<T>
}
const baseValues: SettingValues = {
    useDecimalAsDefault: createValue('Use decimal as default for registers', false),
    autoScrollStackTab: createValue('Auto scroll stack memory tab', true),
    autoSave: createValue('Auto save', false),
    instructionsLimit: createValue('Maximum instructions iteration, 0 to ignore', 50_000_000),
    maxHistorySize: createValue('Maximum undo history size, 0 to disable', 100),
    maxVisibleHistoryModifications: createValue('Maximum visible history modifications', 10)
}
const CURRENT_VERSION = '1.1.4'
function createSettingsStore() {
    let data = $state({
        meta: {
            version: CURRENT_VERSION
        },
        values: baseValues
    })

    function store(settings?: Settings) {
        settings = settings ?? data
        localStorage.setItem('asm-editor_settings', JSON.stringify(settings))
    }

    function fetch() {
        try {
            const stored = JSON.parse(localStorage.getItem('asm-editor_settings'))
            if (!stored) return store()
            if (stored.meta.version !== CURRENT_VERSION) return store()
            data = stored
        } catch (e) {
            console.error(e)
        }
    }
    //TODO improve typing here
    function setValue(
        key: keyof SettingValues,
        value: SettingValues[keyof SettingValues]['value']
    ) {
        data.values[key].value = value
    }

    if (browser) fetch()
    return {
        get values() {
            return data.values
        },
        get meta() {
            return data.meta
        },
        setValue
    }
}

export const settingsStore = createSettingsStore()
