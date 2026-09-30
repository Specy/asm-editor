import { SvelteSet } from 'svelte/reactivity'
import { canFloat } from './deviceClass'
import type { Viewport } from './viewport.svelte'
import type { SettingsSectionId } from './hostApi'
import { preferencesStore } from '$stores/preferencesStore.svelte'

/** Reads and writes the open panel where the host keeps it, so a host can bind it. */
export type ActivePanelAccess = {
    get: () => string | null
    set: (id: string | null) => void
}

/**
 * The Workbench's own UI state, beside the session's: which panel is open beside the rail, whether
 * it is maximized, the phone drawer, and the arrangement the viewport and the Preferences call for.
 * Nothing here is saved; sizes and collapsed sections are the layout store's.
 */
export class WorkbenchUi {
    readonly viewport: Viewport
    private readonly access: ActivePanelAccess
    /** Panels opened at least once: they stay mounted, so a conversation or a search survives. */
    readonly opened = new SvelteSet<string>()
    maximized = $state(false)
    /** The phone's drawer, which holds the rail and the open panel. */
    drawerOpen = $state(false)
    /** The Settings section to bring into view when Settings is opened for it. */
    settingsSection = $state<SettingsSectionId | null>(null)

    constructor(viewport: Viewport, access: ActivePanelAccess) {
        this.viewport = viewport
        this.access = access
        const initial = access.get()
        if (initial) this.opened.add(initial)
    }

    get activePanel(): string | null {
        return this.access.get()
    }

    get deviceClass() {
        return this.viewport.deviceClass
    }

    get compact() {
        return this.viewport.deviceClass !== 'desktop'
    }

    /** Whether the Debug tools are floating windows: the Preference, where the screen allows it. */
    get floatingDebugTools() {
        return (
            preferencesStore.values.debugTools.value === 'floating' &&
            canFloat(this.viewport.deviceClass, this.viewport.canHover)
        )
    }

    get panelStyle() {
        return preferencesStore.values.panelStyle.value
    }

    open(id: string) {
        this.opened.add(id)
        this.access.set(id)
        this.maximized = false
        if (this.viewport.deviceClass === 'phone') this.drawerOpen = true
    }

    close() {
        this.access.set(null)
        this.maximized = false
        if (this.viewport.deviceClass === 'phone') this.drawerOpen = false
    }

    /** A rail icon: opens its panel, or closes it when it is the open one. */
    toggle(id: string) {
        if (this.activePanel === id) this.close()
        else this.open(id)
    }

    openSettings(section: SettingsSectionId) {
        this.settingsSection = section
        this.open('settings')
    }

    toggleMaximized() {
        this.maximized = !this.maximized
    }
}
