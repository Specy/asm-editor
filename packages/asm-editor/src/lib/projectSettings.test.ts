import { describe, expect, it } from 'vite-plus/test'
import { makeProject } from '#lib/Project.svelte.ts'
import {
    cleanProjectSettings,
    PROJECT_SETTINGS,
    projectSettingsFor,
    resolveProjectSettings,
    UNDO_HISTORY_SIZE,
    undoHistorySize
} from '#lib/projectSettings.ts'

/**
 * The Settings of a Project are decisions only ([ADR 0014](../../../../docs/adr/0014-settings-split-by-effect.md)):
 * a Project stores what somebody chose for it and follows the language's default for the rest, so
 * resolving is where the two meet, and cleaning is what keeps a stored value from breaking a load.
 */

describe('resolveProjectSettings', () => {
    it('follows the defaults where nothing was decided', () => {
        expect(resolveProjectSettings('M68K', {})).toEqual({
            riscvAssemblerProfile: 'rars',
            linkRuntimeLibrary: 'off',
            undoEnabled: true,
            screenHistoryBudgetMb: 64,
            fileSystemHistoryBudgetMb: 64,
            programArguments: ''
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
    it('gives a Build 200,000 undo steps with undo on and none with it off', () => {
        expect(UNDO_HISTORY_SIZE).toBe(200_000)
        expect(undoHistorySize(resolveProjectSettings('M68K', {}))).toBe(200_000)
        expect(undoHistorySize(resolveProjectSettings('M68K', { undoEnabled: false }))).toBe(0)
    })
})

describe('projectSettingsFor', () => {
    it('lists only the Settings that apply: x86 has no Screen, so no Screen budget', () => {
        expect(projectSettingsFor('X86').map((setting) => setting.id)).toEqual([
            'linkRuntimeLibrary',
            'undoEnabled',
            'fileSystemHistoryBudgetMb',
            'programArguments'
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

describe('the Arguments Setting', () => {
    const declaration = PROJECT_SETTINGS.programArguments

    it('is a line of text, named Arguments, of x86, MIPS and RISC-V Projects, empty by default', () => {
        expect(declaration).toMatchObject({ name: 'Arguments', type: 'text' })
        for (const language of ['X86', 'MIPS', 'RISC-V', 'RISC-V-64'] as const) {
            expect(declaration.defaultFor(language)).toBe('')
            expect(projectSettingsFor(language).map((setting) => setting.id)).toContain(
                'programArguments'
            )
        }
        for (const language of ['M68K', 'Z80'] as const)
            expect(projectSettingsFor(language).map((setting) => setting.id)).not.toContain(
                'programArguments'
            )
    })

    it('keeps the text as typed, quotes and spaces included', () => {
        const typed = `hunter2  "two words" 'it''s' a\\ b `
        expect(resolveProjectSettings('X86', { programArguments: typed }).programArguments).toBe(
            typed
        )
    })

    it('says what is wrong with text that does not parse', () => {
        expect(declaration.problem?.('hunter2')).toBeUndefined()
        expect(declaration.problem?.('"unterminated')).toBe(
            'The double quote (") at column 1 is never closed'
        )
    })

    it('loads back from a saved Project, and drops what is not text', () => {
        expect(cleanProjectSettings({ programArguments: 'a "b c"' })).toEqual({
            programArguments: 'a "b c"'
        })
        expect(cleanProjectSettings({ programArguments: ['a', 'b'] })).toEqual({})
        expect(cleanProjectSettings({ programArguments: 3 })).toEqual({})
        expect(cleanProjectSettings({ programArguments: 'x'.repeat(256 * 1024 + 1) })).toEqual({})
    })

    it('survives a round trip through a stored Project', () => {
        const project = makeProject({ language: 'X86', settings: { programArguments: 'hunter2' } })
        const stored = JSON.parse(JSON.stringify(project.toObject()))
        const reloaded = makeProject(stored)
        expect(reloaded.settings).toEqual({ programArguments: 'hunter2' })
        expect(resolveProjectSettings('X86', reloaded.settings).programArguments).toBe('hunter2')
    })
})
