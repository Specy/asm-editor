import type { Component, Snippet } from 'svelte'
import type { Project } from '$lib/Project.svelte'
import type { Emulator } from '$lib/languages/Emulator'

/**
 * What a page hosting the **Workbench** can give it and ask of it
 * ([ADR 0024](../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)). The Workbench edits
 * one Project and owns nothing around it: saving, leaving and sharing are the host's, and a control
 * for one of them appears only when the host passed the action.
 */

/** A built-in panel is shown, shown but not editable, or not offered at all. */
export type PanelAccess = 'on' | 'readonly' | 'off'

export type BuiltinPanelId = 'explorer' | 'testcases' | 'documentation' | 'agent' | 'settings'

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

/** The sections of the Settings panel, in their order. */
export type SettingsSectionId =
    'project' | 'display' | 'preferences' | 'layout' | 'shortcuts' | 'theme'
