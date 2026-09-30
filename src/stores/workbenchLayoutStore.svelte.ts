import { browser } from '$app/environment'

/**
 * How the person has arranged the Workbench: panel sizes, collapsed sections and the floating
 * Debug tools' windows. A Preference by the glossary's rule (it changes only what the person sees),
 * kept apart from the Preferences listed in Settings because nobody edits these values by name: the
 * splitters, the section headers and the windows themselves are the editor. Per person, never per
 * Project ([the design record](../../docs/design/workbench.md), Layout Preferences).
 */

export type FloatingWindowState = {
    open: boolean
    left: number
    top: number
}

export type WorkbenchLayout = {
    /** Width of each side panel in pixels, by panel id; a panel not listed has its default. */
    panelWidths: Record<string, number>
    /** Height of the bottom panel (Terminal, Log, Problems) in pixels. */
    bottomHeight: number
    /** Width of the debug column; `null` until dragged, when it fits the registers and memory. */
    debugWidth: number | null
    /** Height of the registers and memory above the Screen and the Debug tools; `null` is automatic. */
    debugTopHeight: number | null
    /** Whether each collapsible section is collapsed, by section id; missing ones use their default. */
    collapsed: Record<string, boolean>
    /** Each floating Debug tool's window, by tool id. */
    floating: Record<string, FloatingWindowState>
}

const STORAGE_KEY = 'asm-editor_workbench_layout'

export const LAYOUT_LIMITS = {
    panelWidth: { min: 180, max: 1200 },
    bottomHeight: { min: 72, max: 1600 },
    debugWidth: { min: 320, max: 2400 },
    debugTopHeight: { min: 120, max: 2400 }
} as const

/** A side panel's width before it is dragged, in pixels (the rem sizes of the plan at 16px). */
export const DEFAULT_PANEL_WIDTHS: Readonly<Record<string, number>> = {
    explorer: 256,
    testcases: 448,
    documentation: 448,
    agent: 448,
    settings: 416
}
/** The default width of a panel a host adds. */
export const DEFAULT_HOST_PANEL_WIDTH = 384
export const DEFAULT_BOTTOM_HEIGHT = 96

export function defaultLayout(): WorkbenchLayout {
    return {
        panelWidths: {},
        bottomHeight: DEFAULT_BOTTOM_HEIGHT,
        debugWidth: null,
        debugTopHeight: null,
        collapsed: {},
        floating: {}
    }
}

function clamp(value: number, limits: { min: number; max: number }) {
    return Math.min(limits.max, Math.max(limits.min, Math.round(value)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function readSize(value: unknown, limits: { min: number; max: number }, fallback: number) {
    return finite(value) ? clamp(value, limits) : fallback
}

function readOptionalSize(value: unknown, limits: { min: number; max: number }) {
    return finite(value) ? clamp(value, limits) : null
}

/**
 * The stored layout read tolerantly, like the Preferences: an unknown key is dropped, a value of the
 * wrong type keeps its default, a size is clamped to what the Workbench can lay out. Nothing is
 * versioned and nothing resets, so a release never throws anyone's arrangement away.
 */
export function readStoredLayout(json: string | null): WorkbenchLayout {
    const layout = defaultLayout()
    if (!json) return layout
    let stored: unknown
    try {
        stored = JSON.parse(json)
    } catch {
        return layout
    }
    if (!isRecord(stored)) return layout
    if (isRecord(stored.panelWidths)) {
        for (const [id, width] of Object.entries(stored.panelWidths)) {
            if (finite(width)) layout.panelWidths[id] = clamp(width, LAYOUT_LIMITS.panelWidth)
        }
    }
    layout.bottomHeight = readSize(
        stored.bottomHeight,
        LAYOUT_LIMITS.bottomHeight,
        layout.bottomHeight
    )
    layout.debugWidth = readOptionalSize(stored.debugWidth, LAYOUT_LIMITS.debugWidth)
    layout.debugTopHeight = readOptionalSize(stored.debugTopHeight, LAYOUT_LIMITS.debugTopHeight)
    if (isRecord(stored.collapsed)) {
        for (const [id, collapsed] of Object.entries(stored.collapsed)) {
            if (typeof collapsed === 'boolean') layout.collapsed[id] = collapsed
        }
    }
    if (isRecord(stored.floating)) {
        for (const [id, window] of Object.entries(stored.floating)) {
            if (
                isRecord(window) &&
                typeof window.open === 'boolean' &&
                finite(window.left) &&
                finite(window.top)
            ) {
                layout.floating[id] = {
                    open: window.open,
                    left: Math.round(window.left),
                    top: Math.round(window.top)
                }
            }
        }
    }
    return layout
}

function createWorkbenchLayoutStore() {
    let data = $state(defaultLayout())
    let pendingWrite: ReturnType<typeof setTimeout> | undefined

    //a drag moves a size or a window on every pointer event; the write waits for it to settle
    function store() {
        if (!browser) return
        clearTimeout(pendingWrite)
        pendingWrite = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(data)))
            } catch (e) {
                console.error(e)
            }
        }, 200)
    }

    if (browser) {
        try {
            data = readStoredLayout(localStorage.getItem(STORAGE_KEY))
        } catch (e) {
            console.error(e)
        }
    }

    return {
        get values(): WorkbenchLayout {
            return data
        },
        panelWidth(id: string): number {
            return data.panelWidths[id] ?? DEFAULT_PANEL_WIDTHS[id] ?? DEFAULT_HOST_PANEL_WIDTH
        },
        setPanelWidth(id: string, width: number) {
            data.panelWidths[id] = clamp(width, LAYOUT_LIMITS.panelWidth)
            store()
        },
        setBottomHeight(height: number) {
            data.bottomHeight = clamp(height, LAYOUT_LIMITS.bottomHeight)
            store()
        },
        setDebugWidth(width: number | null) {
            data.debugWidth = width === null ? null : clamp(width, LAYOUT_LIMITS.debugWidth)
            store()
        },
        setDebugTopHeight(height: number | null) {
            data.debugTopHeight =
                height === null ? null : clamp(height, LAYOUT_LIMITS.debugTopHeight)
            store()
        },
        /** Whether a section is collapsed, or `fallback` for one the person never touched. */
        isCollapsed(id: string, fallback: boolean): boolean {
            return data.collapsed[id] ?? fallback
        },
        setCollapsed(id: string, collapsed: boolean) {
            data.collapsed[id] = collapsed
            store()
        },
        floating(id: string): FloatingWindowState | undefined {
            return data.floating[id]
        },
        setFloating(id: string, window: FloatingWindowState) {
            data.floating[id] = {
                open: window.open,
                left: Math.round(window.left),
                top: Math.round(window.top)
            }
            store()
        }
    }
}

export const workbenchLayout = createWorkbenchLayoutStore()
