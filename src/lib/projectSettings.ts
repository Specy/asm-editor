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
    /**
     * Whether the Core keeps an undo history, of `UNDO_HISTORY_SIZE` steps when it does: what a
     * Build is given is `undoHistorySize`. It replaced a number of steps on 2026-10-01, and a
     * Project that had chosen none loads with it off, see `cleanProjectSettings`.
     */
    undoEnabled: boolean
    /**
     * Bytes the Screen's undo journal may hold, in megabytes: a clear, a present or a resize journals
     * a whole image, so this has its own budget rather than a step count
     * ([ADR 0005](../../docs/adr/0005-restore-screen-state-on-undo.md)).
     */
    screenHistoryBudgetMb: number
    /** Bytes retained to reverse FileSystem effects, in megabytes. */
    fileSystemHistoryBudgetMb: number
}

export type ProjectSettingId = keyof ProjectSettingValues

/** What a Project stores: only the Settings somebody decided for it. */
export type ProjectSettingsDecisions = Partial<ProjectSettingValues>

/** The undo steps a Build keeps when the Project's undo is on. */
export const UNDO_HISTORY_SIZE = 200

/** The history size a Build is given: the undo steps of a Project whose undo is on, else none. */
export function undoHistorySize(settings: Pick<ProjectSettingValues, 'undoEnabled'>): number {
    return settings.undoEnabled ? UNDO_HISTORY_SIZE : 0
}

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

const onOrOff = (value: unknown): value is boolean => typeof value === 'boolean'

/** Any one Setting's declaration, whatever its type. */
export type AnyProjectSettingDeclaration =
    ProjectSettingDeclaration<number> | ProjectSettingDeclaration<boolean>

export const PROJECT_SETTINGS: {
    [K in ProjectSettingId]: ProjectSettingDeclaration<ProjectSettingValues[K]>
} = {
    undoEnabled: {
        id: 'undoEnabled',
        name: 'Undo enabled',
        type: 'boolean',
        defaultFor: () => true,
        appliesTo: () => true,
        accepts: onOrOff
    },
    screenHistoryBudgetMb: {
        id: 'screenHistoryBudgetMb',
        name: 'Screen undo history budget (MB)',
        type: 'number',
        //provisional default, see the measurement rows of docs/manual-verification.md
        defaultFor: () => 64,
        appliesTo: languageHasScreen,
        accepts: wholeNumber
    },
    fileSystemHistoryBudgetMb: {
        id: 'fileSystemHistoryBudgetMb',
        name: 'FileSystem undo history budget (MB)',
        type: 'number',
        defaultFor: () => 64,
        appliesTo: () => true,
        accepts: wholeNumber
    }
}

export const PROJECT_SETTING_IDS = Object.keys(PROJECT_SETTINGS) as ProjectSettingId[]

/** The declarations that apply to a language, in panel order. */
export function projectSettingsFor(language: AvailableLanguages): AnyProjectSettingDeclaration[] {
    return PROJECT_SETTING_IDS.map(
        (id): AnyProjectSettingDeclaration => PROJECT_SETTINGS[id]
    ).filter((declaration) => declaration.appliesTo(language))
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
    //written through a plain record: the Settings are of more than one type, which TypeScript
    //cannot follow across a loop over their ids
    const resolved: Record<string, unknown> = {}
    for (const id of PROJECT_SETTING_IDS) {
        const decided = decisions?.[id]
        resolved[id] =
            decided !== undefined && PROJECT_SETTINGS[id].accepts(decided)
                ? decided
                : PROJECT_SETTINGS[id].defaultFor(language)
    }
    return resolved as ProjectSettingValues
}

/**
 * Decisions read back from storage, a shared link or an imported file, which can be anything: an
 * unknown key is dropped, a value the Setting cannot use is dropped, and what remains is kept as
 * decided, whether or not it applies to the language (it is harmless there, and a language never
 * changes after creation).
 */
export function cleanProjectSettings(raw: unknown): ProjectSettingsDecisions {
    const decisions: Record<string, unknown> = {}
    if (typeof raw !== 'object' || raw === null) return decisions
    const record = raw as Record<string, unknown>
    for (const id of PROJECT_SETTING_IDS) {
        const value = record[id]
        if (value === undefined) continue
        if (PROJECT_SETTINGS[id].accepts(value)) decisions[id] = value
    }
    //undo was a number of steps before it was on or off: a Project that chose none chose it off,
    //and any other number is what on means now
    if (decisions.undoEnabled === undefined && record.maxHistorySize === 0) {
        decisions.undoEnabled = false
    }
    return decisions as ProjectSettingsDecisions
}

/** Whether a Project decided anything about a Setting, which the panel shows beside the value. */
export function isProjectSettingDecided(
    decisions: ProjectSettingsDecisions | undefined,
    id: ProjectSettingId
): boolean {
    return decisions?.[id] !== undefined
}
