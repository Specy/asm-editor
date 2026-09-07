import { describe, expect, it } from 'vitest'
import { defaultPreferences, readStoredPreferences } from '$stores/preferencesStore.svelte'

/**
 * The Preferences store replaced a settings store that wiped everything whenever its version string
 * changed. Loading is tolerant now, in both directions: what that store wrote still loads, and what
 * a later version writes will not reset anything.
 */

describe('readStoredPreferences', () => {
    it('loads what the settings store wrote, descriptors and a version included', () => {
        const stored = JSON.stringify({
            meta: { version: '1.1.9' },
            values: {
                autoSave: { name: 'Auto save', type: 'boolean', value: false },
                maxVisibleHistoryModifications: { name: 'x', type: 'number', value: 25 },
                maxHistorySize: { name: 'moved to the project', type: 'number', value: 500 }
            }
        })
        const values = readStoredPreferences(stored)
        expect(values.autoSave.value).toBe(false)
        expect(values.maxVisibleHistoryModifications.value).toBe(25)
        expect(values.useDecimalAsDefault.value).toBe(false)
        expect('maxHistorySize' in values).toBe(false)
    })

    it('loads the flat map it writes itself', () => {
        const values = readStoredPreferences(JSON.stringify({ showMemory: false, unknown: 1 }))
        expect(values.showMemory.value).toBe(false)
        expect(values.showScreen.value).toBe(true)
    })

    it('drops a value of the wrong type and survives junk', () => {
        expect(readStoredPreferences(JSON.stringify({ autoSave: 'yes' })).autoSave.value).toBe(true)
        expect(readStoredPreferences('null')).toEqual(defaultPreferences())
        expect(readStoredPreferences(null)).toEqual(defaultPreferences())
    })
})
