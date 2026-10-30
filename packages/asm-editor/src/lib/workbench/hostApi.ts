import type { Component, Snippet } from 'svelte'
import type { Project } from '#lib/Project.svelte.ts'
import type { Emulator } from '#lib/languages/Emulator.ts'
import type { EditJournalStore } from '#lib/editJournal.ts'
import type { WorkbenchUi } from './WorkbenchUi.svelte.ts'

/**
 * What a page hosting the **Workbench** can give it and ask of it
 * ([ADR 0024](../../../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)). The Workbench edits
 * one Project and owns nothing around it: saving, leaving and sharing are the host's, and a control
 * for one of them appears only when the host passed the action.
 */

/** A built-in panel is shown, shown but not editable, or not offered at all. */
export type PanelAccess = 'on' | 'readonly' | 'off'

/**
 * `symbols` is offered only in a Project that has an Executable, `history`, the Edit history, only
 * in one that has a File stored as bytes or a File with Edit steps. `search` is the Search panel
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 23), offered in every Target; an Exam switches it off with the Explorer.
 */
export type BuiltinPanelId =
    | 'explorer'
    | 'symbols'
    | 'history'
    | 'search'
    | 'testcases'
    | 'documentation'
    | 'agent'
    | 'settings'

/** What a host panel's content is drawn with. */
export type WorkbenchPanelContext = {
    project: Project
    emulator: Emulator
}

/** A rail entry of the host's own that opens a panel beside the rail. */
export type WorkbenchHostPanel = {
    id: string
    title: string
    icon: Component
    /** The rail's top group, with Explorer and Testcases, or its bottom one, with Settings. */
    group: 'top' | 'bottom'
    content: Snippet<[WorkbenchPanelContext]>
    /** Open when the Workbench first appears, like the exam's prompt. */
    defaultOpen?: boolean
    /** Whether the panel offers the maximize button. */
    maximizable?: boolean
}

/** A rail entry of the host's own that does something rather than open a panel, like Donate. */
export type WorkbenchHostLink = {
    id: string
    title: string
    icon: Component
    onClick: () => void
}

/** What the host gives the `Workbench` component. */
export interface WorkbenchProps {
    /** The Project being edited, its FileSystem included. */
    project: Project
    readonly?: boolean
    onBack?: () => void
    /** Saves the Project; autosave calls it with `silent: true`. */
    onSave?: (options: { silent: boolean }) => void
    onShare?: () => void
    /** Every change to the Project, for a host that tracks unsaved changes itself. */
    onChange?: () => void
    /** Whether the Project has changes nothing will save on its own; shows Save. */
    unsaved?: boolean
    /** Where the Edit journal is kept between visits; without one it lasts as long as the page. */
    editJournals?: EditJournalStore
    access?: Partial<Record<BuiltinPanelId, PanelAccess>>
    /** Whether the documentation's links may navigate; the exam turns them off. */
    documentationLinks?: boolean
    /**
     * Whether a documentation search looks through the Lectures too. An Exam searches the
     * Documentation alone, so no Example hands a student a finished program (the **Search
     * scope**); the AI assistant's search follows it.
     */
    searchLectures?: boolean
    hostPanels?: WorkbenchHostPanel[]
    hostLinks?: WorkbenchHostLink[]
    /** The panel open beside the rail, by id; bindable so the host's chrome can open one. */
    activePanel?: string | null
    /** Host actions above the workspace, with access to its responsive menu state. */
    header?: Snippet<[WorkbenchUi]>
    loading?: Snippet
    /** Host actions offered beside Reload when the Project's emulator fails to load. */
    failureActions?: Snippet
}

/** The sections of the Settings panel, in their order. */
export type SettingsSectionId =
    | 'project'
    | 'program'
    | 'preferences'
    | 'layout'
    | 'shortcuts'
    | 'theme'

/**
 * What Settings can be opened at: a section, or the Display configuration, a part of the Program
 * section ([programs-plan.md](../../../../../docs/design/programs-plan.md), decision 14).
 */
export type SettingsTarget = SettingsSectionId | 'display'
