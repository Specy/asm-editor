import { describe, expect, it } from 'vitest'
import {
    cleanProjectSettings,
    projectSettingsFor,
    resolveProjectSettings
} from '$lib/projectSettings'

/**
 * The Settings of a Project are decisions only ([ADR 0014](../../docs/adr/0014-settings-split-by-effect.md)):
 * a Project stores what somebody chose for it and follows the language's default for the rest, so
 * resolving is where the two meet, and cleaning is what keeps a stored value from breaking a load.
 */

describe('resolveProjectSettings', () => {
    it('follows the defaults where nothing was decided', () => {
        expect(resolveProjectSettings('M68K', {})).toEqual({
            maxHistorySize: 100,
            screenHistoryBudgetMb: 64,
            fileSystemHistoryBudgetMb: 64
        })
        expect(resolveProjectSettings('Z80', undefined).maxHistorySize).toBe(100)
    })

    it('lets a decision win over the default', () => {
        expect(resolveProjectSettings('M68K', { maxHistorySize: 5 }).maxHistorySize).toBe(5)
        expect(resolveProjectSettings('MIPS', { maxHistorySize: 0 }).maxHistorySize).toBe(0)
    })

    it('ignores a decision the Setting cannot use', () => {
        expect(resolveProjectSettings('M68K', { maxHistorySize: -1 }).maxHistorySize).toBe(100)
        expect(
            resolveProjectSettings('M68K', { screenHistoryBudgetMb: Number.NaN })
                .screenHistoryBudgetMb
        ).toBe(64)
    })

    it('resolves a Setting that does not apply to the language, at its default', () => {
        expect(resolveProjectSettings('X86', {}).screenHistoryBudgetMb).toBe(64)
    })
})

describe('projectSettingsFor', () => {
    it('lists only the Settings that apply: x86 has no Screen, so no Screen budget', () => {
        expect(projectSettingsFor('X86').map((setting) => setting.id)).toEqual([
            'maxHistorySize',
            'fileSystemHistoryBudgetMb'
        ])
        expect(projectSettingsFor('M68K').map((setting) => setting.id)).toEqual([
            'maxHistorySize',
            'screenHistoryBudgetMb',
            'fileSystemHistoryBudgetMb'
        ])
    })
})

describe('cleanProjectSettings', () => {
    it('drops unknown keys and unusable values, keeps the rest as decided', () => {
        expect(
            cleanProjectSettings({
                maxHistorySize: 20,
                screenHistoryBudgetMb: 'lots',
                autoSave: false,
                somethingNew: 1
            })
        ).toEqual({ maxHistorySize: 20 })
    })

    it('reads nothing into anything that is not an object', () => {
        expect(cleanProjectSettings(undefined)).toEqual({})
        expect(cleanProjectSettings(null)).toEqual({})
        expect(cleanProjectSettings('{}')).toEqual({})
    })
})
