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
        const values = readStoredPreferences(
            JSON.stringify({ autoScrollStackTab: false, unknown: 1 })
        )
        expect(values.autoScrollStackTab.value).toBe(false)
        expect(values.showDrawingBuffer.value).toBe(false)
    })

    it('drops the Preferences the Workbench retired', () => {
        const values = readStoredPreferences(
            JSON.stringify({ showMemory: false, showScreen: false })
        )
        expect('showMemory' in values).toBe(false)
        expect('showScreen' in values).toBe(false)
    })

    it('drops a value of the wrong type and survives junk', () => {
        expect(readStoredPreferences(JSON.stringify({ autoSave: 'yes' })).autoSave.value).toBe(true)
        expect(readStoredPreferences('null')).toEqual(defaultPreferences())
        expect(readStoredPreferences(null)).toEqual(defaultPreferences())
    })

    it('keeps a layout choice only when it is still one of the options', () => {
        const values = readStoredPreferences(
            JSON.stringify({ panelStyle: 'lines', debugTools: 'docked' })
        )
        expect(values.panelStyle.value).toBe('lines')
        //not an option (the brief's word for sections), so the default stays
        expect(values.debugTools.value).toBe('floating')
    })

    it('starts the layout Preferences on cards and floating windows', () => {
        const values = defaultPreferences()
        expect(values.panelStyle).toMatchObject({
            value: 'cards',
            type: 'choice',
            section: 'layout'
        })
        expect(values.debugTools).toMatchObject({
            value: 'floating',
            type: 'choice',
            section: 'layout'
        })
        expect(values.autoSave.section).toBe('preferences')
    })
})
