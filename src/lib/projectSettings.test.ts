import { describe, expect, it } from 'vitest'
import {
    cleanProjectSettings,
    projectSettingsFor,
    resolveProjectSettings,
    UNDO_HISTORY_SIZE,
    undoHistorySize
} from '$lib/projectSettings'

/**
 * The Settings of a Project are decisions only ([ADR 0014](../../docs/adr/0014-settings-split-by-effect.md)):
 * a Project stores what somebody chose for it and follows the language's default for the rest, so
 * resolving is where the two meet, and cleaning is what keeps a stored value from breaking a load.
 */

describe('resolveProjectSettings', () => {
    it('follows the defaults where nothing was decided', () => {
        expect(resolveProjectSettings('M68K', {})).toEqual({
            undoEnabled: true,
            screenHistoryBudgetMb: 64,
            fileSystemHistoryBudgetMb: 64
        })
        expect(resolveProjectSettings('Z80', undefined).undoEnabled).toBe(true)
    })

    it('lets a decision win over the default', () => {
        expect(resolveProjectSettings('M68K', { undoEnabled: false }).undoEnabled).toBe(false)
        expect(
            resolveProjectSettings('MIPS', { fileSystemHistoryBudgetMb: 0 })
                .fileSystemHistoryBudgetMb
        ).toBe(0)
    })

    it('ignores a decision the Setting cannot use', () => {
        expect(
            resolveProjectSettings('M68K', { undoEnabled: 0 as unknown as boolean }).undoEnabled
        ).toBe(true)
        expect(
            resolveProjectSettings('M68K', { screenHistoryBudgetMb: Number.NaN })
                .screenHistoryBudgetMb
        ).toBe(64)
    })

    it('resolves a Setting that does not apply to the language, at its default', () => {
        expect(resolveProjectSettings('X86', {}).screenHistoryBudgetMb).toBe(64)
    })
})

describe('undoHistorySize', () => {
    it('gives a Build 200 undo steps with undo on and none with it off', () => {
        expect(UNDO_HISTORY_SIZE).toBe(200)
        expect(undoHistorySize(resolveProjectSettings('M68K', {}))).toBe(200)
        expect(undoHistorySize(resolveProjectSettings('M68K', { undoEnabled: false }))).toBe(0)
    })
})

describe('projectSettingsFor', () => {
    it('lists only the Settings that apply: x86 has no Screen, so no Screen budget', () => {
        expect(projectSettingsFor('X86').map((setting) => setting.id)).toEqual([
            'undoEnabled',
            'fileSystemHistoryBudgetMb'
        ])
        expect(projectSettingsFor('M68K').map((setting) => setting.id)).toEqual([
            'undoEnabled',
            'screenHistoryBudgetMb',
            'fileSystemHistoryBudgetMb'
        ])
    })
})

describe('cleanProjectSettings', () => {
    it('drops unknown keys and unusable values, keeps the rest as decided', () => {
        expect(
            cleanProjectSettings({
                undoEnabled: false,
                screenHistoryBudgetMb: 'lots',
                autoSave: false,
                somethingNew: 1
            })
        ).toEqual({ undoEnabled: false })
    })

    it('reads a Project that chose no undo steps, before undo was on or off, as undo off', () => {
        expect(cleanProjectSettings({ maxHistorySize: 0 })).toEqual({ undoEnabled: false })
        expect(cleanProjectSettings({ maxHistorySize: 50 })).toEqual({})
        expect(cleanProjectSettings({ maxHistorySize: 0, undoEnabled: true })).toEqual({
            undoEnabled: true
        })
    })

    it('reads nothing into anything that is not an object', () => {
        expect(cleanProjectSettings(undefined)).toEqual({})
        expect(cleanProjectSettings(null)).toEqual({})
        expect(cleanProjectSettings('{}')).toEqual({})
    })
})
