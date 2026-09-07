import type { AvailableLanguages } from './Project.svelte'
import { languageHasScreen } from './languages/peripherals/peripheralSet'

/**
 * The Settings of a Project: the configuration that changes what the Emulator or the program does,
 * as opposed to the Preferences of `$stores/preferencesStore.svelte`, which only change what the
 * person sees ([ADR 0014](../../docs/adr/0014-settings-split-by-effect.md)).
 *
 * Each Setting is declared once, here: its name in the panel, its type, its default per language
 * and the languages it applies to. A Project stores only the values that were decided for it,
 * keyed by id, never these descriptors; `resolveProjectSettings` puts the two together. Loading is
 * tolerant, see `cleanProjectSettings`: nothing here has a version number, and nothing resets.
 */

export type ProjectSettingValues = {
    /** Undo steps the Core keeps; 0 disables the history. A Build argument. */
    maxHistorySize: number
    /**
     * Bytes the Screen's undo journal may hold, in megabytes: a clear, a present or a resize journals
     * a whole image, so this has its own budget rather than a step count
     * ([ADR 0005](../../docs/adr/0005-restore-screen-state-on-undo.md)).
     */
    screenHistoryBudgetMb: number
}

export type ProjectSettingId = keyof ProjectSettingValues

/** What a Project stores: only the Settings somebody decided for it. */
export type ProjectSettingsDecisions = Partial<ProjectSettingValues>

export type ProjectSettingDeclaration<T> = {
    id: ProjectSettingId
    /** The label the panel shows. */
    name: string
    type: T extends number ? 'number' : 'boolean'
    /** The app's default, which may depend on the language. */
    defaultFor: (language: AvailableLanguages) => T
    appliesTo: (language: AvailableLanguages) => boolean
    /** Whether a stored value can be used at all; a value that cannot is dropped on load. */
    accepts: (value: unknown) => value is T
}

const wholeNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0

export const PROJECT_SETTINGS: {
    [K in ProjectSettingId]: ProjectSettingDeclaration<ProjectSettingValues[K]>
} = {
    maxHistorySize: {
        id: 'maxHistorySize',
        name: 'Maximum undo steps, 0 to disable',
        type: 'number',
        defaultFor: () => 100,
        appliesTo: () => true,
        accepts: wholeNumber
    },
    screenHistoryBudgetMb: {
        id: 'screenHistoryBudgetMb',
        name: 'Screen undo history budget (MB)',
        type: 'number',
        //provisional default, see the measurement rows of docs/manual-verification.md
        defaultFor: () => 64,
        appliesTo: languageHasScreen,
        accepts: wholeNumber
    }
}

export const PROJECT_SETTING_IDS = Object.keys(PROJECT_SETTINGS) as ProjectSettingId[]

/** The declarations that apply to a language, in panel order. */
export function projectSettingsFor(
    language: AvailableLanguages
): ProjectSettingDeclaration<number>[] {
    return PROJECT_SETTING_IDS.map((id) => PROJECT_SETTINGS[id]).filter((declaration) =>
        declaration.appliesTo(language)
    )
}

export function projectSettingDefault<K extends ProjectSettingId>(
    id: K,
    language: AvailableLanguages
): ProjectSettingValues[K] {
    return PROJECT_SETTINGS[id].defaultFor(language)
}

/**
 * The values a Project runs with: its decisions where it made some, the language's defaults
 * everywhere else. Settings that do not apply to the language are resolved too, at their default,
 * so a consumer can read any key without checking applicability first.
 */
export function resolveProjectSettings(
    language: AvailableLanguages,
    decisions: ProjectSettingsDecisions | undefined
): ProjectSettingValues {
    const resolved = {} as ProjectSettingValues
    for (const id of PROJECT_SETTING_IDS) {
        const decided = decisions?.[id]
        resolved[id] =
            decided !== undefined && PROJECT_SETTINGS[id].accepts(decided)
                ? decided
                : PROJECT_SETTINGS[id].defaultFor(language)
    }
    return resolved
}

/**
 * Decisions read back from storage, a shared link or an imported file, which can be anything: an
 * unknown key is dropped, a value the Setting cannot use is dropped, and what remains is kept as
 * decided, whether or not it applies to the language (it is harmless there, and a language never
 * changes after creation).
 */
export function cleanProjectSettings(raw: unknown): ProjectSettingsDecisions {
    const decisions: ProjectSettingsDecisions = {}
    if (typeof raw !== 'object' || raw === null) return decisions
    const record = raw as Record<string, unknown>
    for (const id of PROJECT_SETTING_IDS) {
        const value = record[id]
        if (value === undefined) continue
        if (PROJECT_SETTINGS[id].accepts(value)) decisions[id] = value
    }
    return decisions
}

/** Whether a Project decided anything about a Setting, which the panel shows beside the value. */
export function isProjectSettingDecided(
    decisions: ProjectSettingsDecisions | undefined,
    id: ProjectSettingId
): boolean {
    return decisions?.[id] !== undefined
}
