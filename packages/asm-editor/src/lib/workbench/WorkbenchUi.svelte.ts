import { SvelteSet } from 'svelte/reactivity'
import { canFloat } from './deviceClass'
import type { Viewport } from './viewport.svelte'
import type { SettingsTarget } from './hostApi'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'

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
    /** The Settings section, or part of one, to bring into view when Settings is opened for it. */
    settingsSection = $state<SettingsTarget | null>(null)
    /**
     * A request for the Documentation panel: to focus its search box (Ctrl+K), with a query when
     * one is given, or to show a Chapter or an entry by its link (`href`); each request is a new
     * token, which the panel answers once.
     */
    documentationRequest = $state<{ token: number; query?: string; href?: string } | null>(null)
    /**
     * A request for the Search panel to focus its query (Ctrl+Shift+F), filled with `query` when
     * one is given; each request is a new token, which the panel answers once
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
     * 23).
     */
    searchRequest = $state<{ token: number; query?: string } | null>(null)
    /**
     * The address a pointer menu or a register's name last moved the memory view to, which the
     * view marks on its page until it is moved by hand. `build` is the Build it was read in, as the
     * next Build's memory belongs to another run (`markedMemoryAddress` in `pointerMenu.ts`).
     */
    memoryMark = $state.raw<{ address: bigint; build: unknown } | null>(null)

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

    /**
     * Ctrl+K: the Documentation panel with its search box focused. It is opened if another panel
     * is, and left as it is otherwise: neither closed, as a rail toggle would, nor restored from
     * maximized, as opening would.
     */
    searchDocumentation(query?: string) {
        this.requestDocumentation({ query })
    }

    /**
     * The Documentation panel at a link into it, `/documentation/x86/executables#pseudocode`, as
     * the "?" of a notice or a hover's link asks
     * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision
     * 9): opened as Ctrl+K opens it, without the keyboard going to its search box.
     */
    showDocumentation(href: string) {
        this.requestDocumentation({ href })
    }

    private requestDocumentation(request: { query?: string; href?: string }) {
        if (this.activePanel !== 'documentation') {
            this.opened.add('documentation')
            this.access.set('documentation')
        }
        if (this.viewport.deviceClass === 'phone') this.drawerOpen = true
        this.documentationRequest = {
            token: (this.documentationRequest?.token ?? 0) + 1,
            ...request
        }
    }

    /**
     * Ctrl+Shift+F: the Search panel with its query focused, and filled with `query` when given.
     * Opened if another panel is, and otherwise left as it is, as Ctrl+K leaves the Documentation.
     */
    searchProject(query?: string) {
        if (this.activePanel !== 'search') {
            this.opened.add('search')
            this.access.set('search')
        }
        if (this.viewport.deviceClass === 'phone') this.drawerOpen = true
        this.searchRequest = {
            token: (this.searchRequest?.token ?? 0) + 1,
            ...(query !== undefined ? { query } : {})
        }
    }

    openSettings(section: SettingsTarget) {
        this.settingsSection = section
        this.open('settings')
    }

    toggleMaximized() {
        this.maximized = !this.maximized
    }
}
