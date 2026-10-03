<script lang="ts">
    import { onMount, untrack, type Snippet } from 'svelte'
    import type { Project } from '$lib/Project.svelte'
    import type { Emulator } from '$lib/languages/Emulator'
    import { WorkbenchSession } from '$lib/workbench/WorkbenchSession.svelte'
    import { WorkbenchUi } from '$lib/workbench/WorkbenchUi.svelte'
    import { watchViewport } from '$lib/workbench/viewport.svelte'
    import type {
        BuiltinPanelId,
        PanelAccess,
        WorkbenchHostLink,
        WorkbenchHostPanel
    } from '$lib/workbench/hostApi'
    import { setWorkbenchContext, type RailEntry } from './workbenchContext'
    import WorkbenchDesktop from './WorkbenchDesktop.svelte'
    import WorkbenchCompact from './WorkbenchCompact.svelte'
    import DebugToolsFloating from './DebugToolsFloating.svelte'
    import FaFolderOpen from '~icons/fa-solid/folder-open'
    import FaVial from '~icons/fa-solid/vial'
    import FaBook from '~icons/fa-solid/book'
    import FaShareAlt from '~icons/fa-solid/share-alt'
    import FaCog from '~icons/fa-solid/cog'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'
    import { documentationLanguageOf, languageScope } from '$lib/search/scope'
    import { searchClient } from '$lib/search/searchClient.svelte'
    import './workbench.css'

    interface Props {
        project: Project
        emulator: Emulator
        readonly?: boolean
        onBack?: () => void
        onSave?: (options: { silent: boolean }) => void
        onShare?: () => void
        onChange?: () => void
        unsaved?: boolean
        access?: Partial<Record<BuiltinPanelId, PanelAccess>>
        documentationLinks?: boolean
        searchLectures?: boolean
        hostPanels?: WorkbenchHostPanel[]
        hostLinks?: WorkbenchHostLink[]
        activePanel?: string | null
        header?: Snippet<[WorkbenchUi]>
    }

    let {
        project,
        emulator,
        readonly = false,
        onBack,
        onSave,
        onShare,
        onChange,
        unsaved = false,
        access = {},
        documentationLinks = true,
        searchLectures = true,
        hostPanels = [],
        hostLinks = [],
        activePanel = $bindable(null),
        header
    }: Props = $props()

    function accessOf(id: BuiltinPanelId): PanelAccess {
        return access[id] ?? 'on'
    }

    //one session for the Project and Emulator this component was mounted with: a host swaps
    //either by re-keying the component, never by changing them underneath it
    const session = untrack(
        () =>
            new WorkbenchSession(project, emulator, {
                get readonly() {
                    return readonly
                },
                get canEditTestcases() {
                    return accessOf('testcases') === 'on'
                },
                get onSave() {
                    return onSave
                },
                get onChange() {
                    return onChange
                }
            })
    )

    //a host panel that asks to be open when the Workbench appears, like the exam's prompt
    untrack(() => {
        if (activePanel === null) {
            const first = hostPanels.find((panel) => panel.defaultOpen)
            if (first) activePanel = first.id
        }
    })

    const viewport = watchViewport()
    const ui = new WorkbenchUi(viewport, {
        get: () => activePanel,
        set: (id) => (activePanel = id)
    })
    let headerHeight = $state(0)
    let debugged = false
    const debugToolsBuilt = $derived.by(() => {
        if (session.debugSession) debugged = true
        return debugged
    })

    session.panels = {
        toggleDocumentation: () => {
            if (accessOf('documentation') !== 'off') ui.toggle('documentation')
        },
        toggleSettings: () => {
            if (accessOf('settings') !== 'off') ui.toggle('settings')
        },
        searchDocumentation: () => {
            if (accessOf('documentation') !== 'off') ui.searchDocumentation()
        }
    }

    /** What the Documentation panel's search, and the AI assistant's, look through. */
    const searchScope = $derived(
        languageScope(documentationLanguageOf(project.language), searchLectures)
    )

    onMount(() => {
        // The Documentation panel is one click away, so its index and the model start loading
        // once the Workbench has settled ([ADR 0026](../../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)).
        if (accessOf('documentation') !== 'off') searchClient.preload(searchScope)
        return session.mount()
    })

    /**
     * The arrangement on screen. Crossing a breakpoint swaps it, and the old one is taken down a
     * frame before the new one mounts: two arrangements alive together would put two Monaco editors
     * on one session, both claiming the same models.
     */
    let arrangement = $state<'desktop' | 'compact' | null>(
        untrack(() => (ui.compact ? 'compact' : 'desktop'))
    )
    $effect(() => {
        const next = ui.compact ? 'compact' : 'desktop'
        if (untrack(() => arrangement) === next) return
        arrangement = null
        const frame = requestAnimationFrame(() => (arrangement = next))
        return () => cancelAnimationFrame(frame)
    })

    const testcasesDot = $derived.by<RailEntry['dot']>(() => {
        const results = session.testcasesResult
        if (results.length === 0) return undefined
        return results.every((result) => result.passed) ? 'success' : 'error'
    })

    const rail = $derived.by<RailEntry[]>(() => {
        const entries: RailEntry[] = []
        const builtin = (
            id: BuiltinPanelId,
            title: string,
            icon: RailEntry['icon'],
            group: RailEntry['group'],
            maximizable = false,
            dot?: RailEntry['dot']
        ) => {
            const panelAccess = accessOf(id)
            if (panelAccess === 'off') return
            entries.push({ id, title, icon, group, maximizable, access: panelAccess, dot })
        }
        const host = (group: RailEntry['group']) => {
            for (const panel of hostPanels.filter((candidate) => candidate.group === group)) {
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
        builtin('explorer', 'Explorer', FaFolderOpen, 'top')
        builtin('testcases', 'Testcases', FaVial, 'top', true, testcasesDot)
        builtin('documentation', 'Documentation', FaBook, 'top', true)
        host('top')
        builtin('agent', 'AI assistant', SparklesIcon, 'bottom')
        if (onShare) {
            entries.push({
                id: 'share',
                title: 'Share',
                icon: FaShareAlt,
                group: 'bottom',
                maximizable: false,
                access: 'on',
                action: onShare
            })
        }
        for (const link of hostLinks) {
            entries.push({
                id: link.id,
                title: link.title,
                icon: link.icon,
                group: 'bottom',
                maximizable: false,
                access: 'on',
                action: link.onClick
            })
        }
        host('bottom')
        builtin('settings', 'Settings', FaCog, 'bottom')
        return entries
    })

    setWorkbenchContext({
        session,
        ui,
        get rail() {
            return rail
        },
        get title() {
            return project.name
        },
        get unsaved() {
            return unsaved
        },
        get documentationLinks() {
            return documentationLinks
        },
        get searchScope() {
            return searchScope
        },
        get hostPanels() {
            return hostPanels
        },
        get hostLinks() {
            return hostLinks
        },
        get onBack() {
            return onBack
        },
        get onSave() {
            return onSave
        }
    })
</script>

<div
    class="workbench"
    class:lines={ui.panelStyle === 'lines'}
    class:compact={ui.compact}
    data-device={viewport.deviceClass}
>
    {#if header}
        <div class="header-slot" bind:clientHeight={headerHeight}>
            {@render header(ui)}
        </div>
    {/if}
    {#if arrangement === 'compact'}
        <WorkbenchCompact externalMenu={!!header} />
    {:else if arrangement === 'desktop'}
        <WorkbenchDesktop />
    {/if}
    {#if arrangement === 'desktop' && ui.floatingDebugTools && debugToolsBuilt}
        <div class="floating-tools" class:hidden={!session.debugSession}>
            <DebugToolsFloating {headerHeight} />
        </div>
    {/if}
</div>

<style lang="scss">
    .header-slot {
        display: flex;
        flex-direction: column;
        flex: none;
        min-width: 0;
    }

    .floating-tools {
        display: contents;

        &.hidden {
            display: none;
        }
    }

    /* The two surface styles of the design record's Layout Preferences are custom properties the
       containers read: Cards, set in workbench.css and shared with the Playgrounds, puts rounded
       panels on the page background with small gaps, Lines puts them edge to edge with 1px
       dividers. */
    .workbench {
        --wb-divider: transparent;
        --wb-rail-width: 3rem;
        --wb-top-height: 2.75rem;
        --splitter-size: var(--wb-gap);
        --splitter-line: transparent;
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        min-width: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background-color: var(--background);
        color: var(--background-text);
    }

    .lines {
        --wb-gap: 0px;
        --wb-radius: 0px;
        /* Lines divides with its splitters and rules instead */
        --wb-card-edge: none;
        --wb-card-inset: 0px;
        /* the panels inside the cards: memory, the Register files and the Screen */
        --panel-radius: 0px;
        --wb-divider: var(--wb-line);
        --wb-top-height: 2.65rem;
        --wb-section-rule: 1px solid var(--wb-line);
        --splitter-size: 1px;
        --splitter-line: var(--wb-line);
    }

    /* a little shorter than a desktop's bar, leaving the room to the code */
    .compact {
        --wb-top-height: 2.4rem;
        overflow: visible;
        height: auto;
    }
</style>
