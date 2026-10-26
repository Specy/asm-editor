import FaCopy from '~icons/fa-solid/copy'
import FaTags from '~icons/fa-solid/tags'
import FaSearch from '~icons/fa-solid/search'
import FaFlask from '~icons/fa-solid/flask'
import FaBook from '~icons/fa-solid/book'
import FaShareAlt from '~icons/fa-solid/share-alt'
import FaCog from '~icons/fa-solid/cog'
import FaHistory from '~icons/fa-solid/history'
import SparklesIcon from '#cmp/shared/agent/SparklesIcon.svelte'
import type {
    BuiltinPanelId,
    PanelAccess,
    WorkbenchHostLink,
    WorkbenchHostPanel
} from '#lib/workbench/hostApi.ts'
import type { RailEntry } from './workbenchContext'

/** What the rail is made from: the host's choices and what the Project offers. */
export type WorkbenchRailOptions = {
    /** Whether the host has a built-in panel on, read only or off; on when it says nothing. */
    access: Partial<Record<BuiltinPanelId, PanelAccess>>
    /** Whether the Project has an Executable, for which the Symbols panel is offered. */
    symbolsOffered: boolean
    /** Whether the Project has a File stored as bytes or a File with Edit steps, for which the Edit history is offered. */
    historyOffered?: boolean
    /** The Testcases icon's dot, for the last run's result. */
    testcasesDot?: RailEntry['dot']
    hostPanels: readonly WorkbenchHostPanel[]
    hostLinks: readonly WorkbenchHostLink[]
    onShare?: () => void
}

/**
 * The rail's entries in order
 * ([the design record](../../../../../../docs/design/workbench.md), Rail): on top Explorer, Search
 * in every Target
 * ([annotations-and-search.md](../../../../../../docs/design/annotations-and-search.md), decision
 * 23), Testcases, Documentation, the host's panels and, in a Project that has an Executable,
 * Symbols ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
 * decision 18), then in one that has a File stored as bytes or with Edit steps, the Edit history
 * ([pixel-editor.md](../../../../../../docs/design/pixel-editor.md), decision 12); at the bottom the AI assistant, Share, the host's links and panels, and Settings.
 * A built-in panel the host switched off is left out.
 */
export function workbenchRail(options: WorkbenchRailOptions): RailEntry[] {
    const entries: RailEntry[] = []
    const builtin = (
        id: BuiltinPanelId,
        title: string,
        icon: RailEntry['icon'],
        group: RailEntry['group'],
        extra: Partial<Pick<RailEntry, 'maximizable' | 'dot' | 'tooltip'>> = {}
    ) => {
        const access = options.access[id] ?? 'on'
        if (access === 'off') return
        entries.push({ id, title, icon, group, maximizable: false, access, ...extra })
    }
    const link = (id: string, title: string, icon: RailEntry['icon'], action: () => void) =>
        entries.push({ id, title, icon, group: 'bottom', maximizable: false, access: 'on', action })
    const host = (group: RailEntry['group']) => {
        for (const panel of options.hostPanels.filter((candidate) => candidate.group === group)) {
            entries.push({
                id: panel.id,
                title: panel.title,
                icon: panel.icon,
                group,
                maximizable: panel.maximizable ?? false,
                access: 'on',
                content: panel.content
            })
        }
    }
    builtin('explorer', 'Explorer', FaCopy, 'top')
    builtin('search', 'Search', FaSearch, 'top', {
        maximizable: true,
        tooltip: 'Search: find text in the Project'
    })
    builtin('testcases', 'Testcases', FaFlask, 'top', {
        maximizable: true,
        dot: options.testcasesDot
    })
    builtin('documentation', 'Documentation', FaBook, 'top', { maximizable: true })
    host('top')
    //last of the group, since it comes and goes with the Project's Executables: appearing, it
    //moves no other icon
    if (options.symbolsOffered)
        builtin('symbols', 'Symbols', FaTags, 'top', {
            tooltip: 'Symbols: the functions and strings of the program'
        })
    if (options.historyOffered)
        builtin('history', 'Edit history', FaHistory, 'top', {
            tooltip: 'View and restore edits made in the pixel and hex editors'
        })
    builtin('agent', 'AI assistant', SparklesIcon, 'bottom')
    if (options.onShare) link('share', 'Share', FaShareAlt, options.onShare)
    for (const hostLink of options.hostLinks)
        link(hostLink.id, hostLink.title, hostLink.icon, hostLink.onClick)
    host('bottom')
    builtin('settings', 'Settings', FaCog, 'bottom')
    return entries
}
