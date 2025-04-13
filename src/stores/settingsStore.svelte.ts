import { browser } from '$app/environment'
import type { AvailableLanguages } from '$lib/Project.svelte'

export type SettingValue<T> = {
    name: string
    type: 'boolean' | 'number' | 'string'
    value: T,
    onlyFor?: AvailableLanguages
}
export type SettingValues = {
    useDecimalAsDefault: SettingValue<boolean>
    autoScrollStackTab: SettingValue<boolean>
    instructionsLimit: SettingValue<number>
    autoSave: SettingValue<boolean>
    showMemory: SettingValue<boolean>
    maxHistorySize: SettingValue<number>
    maxVisibleHistoryModifications: SettingValue<number>
    showPseudoInstructions: SettingValue<boolean>
}
export type Settings = {
    meta: {
        version: string
    }
    values: SettingValues
}
function createValue<T>(name: string, value: T, onlyFor?: AvailableLanguages) {
    return {
        name,
        value,
        type: typeof value,
        onlyFor
    } as SettingValue<T>
}
const baseValues = {
    useDecimalAsDefault: createValue('Use decimal as default for registers', false),
    autoScrollStackTab: createValue('Auto scroll the stack memory tab', true),
    autoSave: createValue('Auto save', true),
    showPseudoInstructions: createValue('Show pseudo instructions', true, 'MIPS'),
    showMemory: createValue('Show memory tab', true),
    instructionsLimit: createValue('Instruction execution limit, 0 to ignore', 50_000_000),
    maxHistorySize: createValue('Maximum undo steps, 0 to disable', 100),
    maxVisibleHistoryModifications: createValue('Maximum visible history steps', 10),
} satisfies SettingValues

const CURRENT_VERSION = '1.1.7'
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
        store()
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
