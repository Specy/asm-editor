import { browser } from '$app/environment'
import { writable } from 'svelte/store'

export enum ShortcutAction {
    SaveCode,
    ToggleDocs,
    ToggleSettings,
    RunCode,
    BuildCode,
    ClearExecution,
    Step,
    Undo
}
type Shortcut = {
    type: ShortcutAction
    description: string
    defaultValue: string
    id: number
}
function createShortcut(
    type: ShortcutAction,
    defaultValue: string,
    description: string,
    id: number
): Shortcut {
    return { type, description, defaultValue, id }
}

const shortcutDefinitions = [
    createShortcut(ShortcutAction.SaveCode, 'ShiftLeft+KeyS', 'Save code', 1),
    createShortcut(ShortcutAction.ToggleDocs, 'ShiftLeft+KeyD', 'Toggle docs', 2),
    createShortcut(ShortcutAction.ToggleSettings, 'ShiftLeft+KeyP', 'Toggle settings', 3),
    createShortcut(ShortcutAction.RunCode, 'ShiftLeft+KeyR', 'Run code', 4),
    createShortcut(ShortcutAction.BuildCode, 'ShiftLeft+KeyB', 'Build code', 5),
    createShortcut(ShortcutAction.ClearExecution, 'ShiftLeft+KeyC', 'Clear execution', 6),
    createShortcut(ShortcutAction.Step, 'ShiftLeft+ArrowDown', 'Step', 7),
    createShortcut(ShortcutAction.Undo, 'ShiftLeft+ArrowUp', 'Undo', 8)
]

const definitionsById = new Map(shortcutDefinitions.map((shortcut) => [shortcut.id, shortcut]))

type StoredSettings = {
    meta: {
        version: string
    }
    overrides: Array<[number, string]>
}

const CURRENT_VERSION = '2.0.0'
const LEGACY_VERSION = '1.0.2'

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function parseOverridePairs(value: unknown): Map<number, string> {
    const overrides = new Map<number, string>()
    if (!Array.isArray(value)) return overrides

    for (const entry of value) {
        if (!Array.isArray(entry) || entry.length !== 2) continue
        const [id, assignedKey] = entry
        if (!Number.isInteger(id) || typeof assignedKey !== 'string' || overrides.has(id)) continue
        overrides.set(id, assignedKey)
    }
    return overrides
}

function parseStoredSettings(
    value: unknown
): { overrides: Map<number, string>; legacy: boolean } | null {
    if (!isRecord(value) || !isRecord(value.meta)) return null
    const version = value.meta.version

    if (version === CURRENT_VERSION) {
        return { overrides: parseOverridePairs(value.overrides), legacy: false }
    }
    if (version !== LEGACY_VERSION || !Array.isArray(value.shortcuts)) return null

    const legacyOverrides: Array<[number, string]> = []
    for (const entry of value.shortcuts) {
        if (!Array.isArray(entry) || entry.length !== 2) continue
        const [assignedKey, metadata] = entry
        if (typeof assignedKey !== 'string' || !isRecord(metadata)) continue
        const { id, defaultValue } = metadata
        if (typeof id !== 'number' || !Number.isInteger(id) || typeof defaultValue !== 'string')
            continue
        if (assignedKey !== defaultValue) legacyOverrides.push([id, assignedKey])
    }
    return { overrides: parseOverridePairs(legacyOverrides), legacy: true }
}

function makeShortcutMap(storedOverrides = new Map<number, string>()): Map<string, Shortcut> {
    const overrides = new Map<number, string>()
    const assignedKeys = new Map<number, string>()

    for (const shortcut of shortcutDefinitions) {
        const assignedKey = storedOverrides.get(shortcut.id)
        if (assignedKey !== undefined && assignedKey !== shortcut.defaultValue) {
            overrides.set(shortcut.id, assignedKey)
        }
        assignedKeys.set(shortcut.id, assignedKey ?? shortcut.defaultValue)
    }

    while (true) {
        const idsByKey = new Map<string, number[]>()
        for (const [id, assignedKey] of assignedKeys) {
            const ids = idsByKey.get(assignedKey) ?? []
            ids.push(id)
            idsByKey.set(assignedKey, ids)
        }

        let removedCollision = false
        for (const ids of idsByKey.values()) {
            if (ids.length < 2) continue
            for (const id of ids) {
                if (!overrides.delete(id)) continue
                assignedKeys.set(id, definitionsById.get(id)!.defaultValue)
                removedCollision = true
            }
        }
        if (!removedCollision) break
    }

    return new Map(
        shortcutDefinitions.map((shortcut) => [assignedKeys.get(shortcut.id)!, shortcut] as const)
    )
}

function createShortcutStore() {
    let shortcuts = makeShortcutMap()
    const { subscribe, set, update } = writable(shortcuts)

    function get(key: string): Shortcut | undefined {
        return shortcuts.get(key)
    }
    function updateKey(prev: string, next: string) {
        update((current) => {
            const shortcut = current.get(prev)
            if (shortcut && !current.has(next)) {
                current.set(next, shortcut)
                current.delete(prev)
            }
            shortcuts = current
            return current
        })
        saveStorage()
    }
    function saveStorage() {
        if (!browser) return
        const storedSettings: StoredSettings = {
            meta: {
                version: CURRENT_VERSION
            },
            overrides: Array.from(shortcuts.entries())
                .filter(([assignedKey, shortcut]) => assignedKey !== shortcut.defaultValue)
                .map(([assignedKey, shortcut]) => [shortcut.id, assignedKey] as [number, string])
                .sort(([a], [b]) => a - b)
        }
        try {
            localStorage.setItem('shortcuts', JSON.stringify(storedSettings))
        } catch (error) {
            console.error(error)
        }
    }
    function loadFromStorage() {
        try {
            const storedShortcuts = localStorage.getItem('shortcuts')
            if (!storedShortcuts) return
            const storedSettings = parseStoredSettings(JSON.parse(storedShortcuts))
            if (!storedSettings) return

            shortcuts = makeShortcutMap(storedSettings.overrides)
            set(shortcuts)
            if (storedSettings.legacy) saveStorage()
        } catch (error) {
            console.error(error)
        }
    }
    if (browser) loadFromStorage()
    return {
        subscribe,
        get,
        updateKey
    }
}

export const shortcutsStore = createShortcutStore()
