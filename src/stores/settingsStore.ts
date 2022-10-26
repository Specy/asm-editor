import { browser } from "$app/environment"
import { get, writable } from "svelte/store"


export type SettingValue<T> = {
    name: string
    type: "boolean" | "number" | "string"
    value: T
}
export type SettingValues = {
    useDecimalAsDefault: SettingValue<boolean>
    autoScrollStackTab: SettingValue<boolean>
}
export type Settings = {
    meta: {
        version: string
    },
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
    useDecimalAsDefault: createValue("Use decimal as default for registers", false),
    autoScrollStackTab: createValue("Auto scroll stack memory tab", true)
}

const CURRENT_VERSION = "1.0.4"
function createSettingsStore() {
    const { subscribe, update, set } = writable<Settings>({
        meta: {
            version: CURRENT_VERSION
        },
        values: baseValues
    })

    function store(settings?: Settings) {
        settings = settings ?? get({ subscribe })
        localStorage.setItem("asm-editor_settings", JSON.stringify(settings))
    }

    function fetch() {
        try {
            const stored = JSON.parse(localStorage.getItem("asm-editor_settings"))
            if (!stored) return store()
            if (stored.meta.version !== CURRENT_VERSION) return store()
            set(stored)
        } catch (e) {
            console.error(e)
        }
    }
    //TODO improve typing here
    function setValue(key: keyof SettingValues, value: SettingValues[keyof SettingValues]["value"]) {
        update(settings => {
            //@ts-ignore - this should be fine
            settings.values[key].value = value
            store(settings)
            return settings
        })
    }

    if (browser) fetch()
    return {
        subscribe,
        setValue
    }
}

export const settingsStore = createSettingsStore()