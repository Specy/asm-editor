import { getContext, setContext, type Component, type Snippet } from 'svelte'
import type { WorkbenchSession } from '$lib/workbench/WorkbenchSession.svelte'
import type { WorkbenchUi } from '$lib/workbench/WorkbenchUi.svelte'
import type { SearchScope } from '$lib/search/scope'
import type {
    PanelAccess,
    WorkbenchHostLink,
    WorkbenchHostPanel,
    WorkbenchPanelContext
} from '$lib/workbench/hostApi'

/** One entry of the icon rail: a panel it opens, or an action it runs. */
export type RailEntry = {
    id: string
    title: string
    icon: Component
    group: 'top' | 'bottom'
    /** An action (Share, a host link) runs `onClick` instead of opening a panel. */
    action?: () => void
    maximizable: boolean
    access: PanelAccess
    /** A host panel's content. */
    content?: Snippet<[WorkbenchPanelContext]>
    /** The rail icon's dot, for the Testcases result. */
    dot?: 'success' | 'error'
}

export type WorkbenchContext = {
    session: WorkbenchSession
    ui: WorkbenchUi
    /** The rail's entries in order, top group first. */
    readonly rail: RailEntry[]
    readonly title: string
    readonly unsaved: boolean
    readonly documentationLinks: boolean
    /** The Search scope of the Documentation panel and of the AI assistant's search tool. */
    readonly searchScope: SearchScope
    readonly hostPanels: WorkbenchHostPanel[]
    readonly hostLinks: WorkbenchHostLink[]
    onBack?: () => void
    onSave?: (options: { silent: boolean }) => void
}

const KEY = Symbol('workbench')

export function setWorkbenchContext(context: WorkbenchContext) {
    setContext(KEY, context)
}

export function useWorkbench(): WorkbenchContext {
    return getContext<WorkbenchContext>(KEY)
}
