<script lang="ts">
    import { onMount, untrack } from 'svelte'
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
    import FaFolderOpen from '~icons/fa-solid/folder-open'
    import FaVial from '~icons/fa-solid/vial'
    import FaBook from '~icons/fa-solid/book'
    import FaShareAlt from '~icons/fa-solid/share-alt'
    import FaCog from '~icons/fa-solid/cog'
    import SparklesIcon from '$cmp/shared/agent/SparklesIcon.svelte'

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
        hostPanels?: WorkbenchHostPanel[]
        hostLinks?: WorkbenchHostLink[]
        activePanel?: string | null
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
        hostPanels = [],
        hostLinks = [],
        activePanel = $bindable(null)
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

    session.panels = {
        toggleDocumentation: () => {
            if (accessOf('documentation') !== 'off') ui.toggle('documentation')
        },
        toggleSettings: () => {
            if (accessOf('settings') !== 'off') ui.toggle('settings')
        }
    }

    onMount(() => session.mount())

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
    {#if arrangement === 'compact'}
        <WorkbenchCompact />
    {:else if arrangement === 'desktop'}
        <WorkbenchDesktop />
    {/if}
</div>

<style lang="scss">
    /* The two surface styles of the design record's Layout Preferences are custom properties the
       containers read: Cards puts rounded panels on the page background with small gaps, Lines
       puts them edge to edge with 1px dividers. */
    .workbench {
        --wb-gap: 0.25rem;
        --wb-radius: 0.4rem;
        --wb-divider: transparent;
        --wb-rail-width: 3rem;
        --wb-top-height: 2.75rem;
        /* the height of the execution controls floating over the editor */
        --wb-control-height: 2.1rem;
        --wb-surface: var(--secondary);
        /* a band a shade lighter than the panel, so a section's header reads as one */
        --wb-section-header: color-mix(in srgb, var(--secondary) 72%, var(--tertiary));
        /* the rule a section draws under itself and beside its neighbour, and memory beside the
           registers: the card edge in Cards, a divider in Lines */
        --wb-section-rule: var(--wb-card-edge);
        /* a tab strip is a shade darker than the panel whose tabs it holds */
        --wb-strip: color-mix(in srgb, var(--background) 65%, var(--secondary));
        --wb-line: var(--tertiary);
        /* the 1px edge of every card: a border, so the card's content is clipped inside it, its
           corners included, and nothing it holds can paint over it */
        --wb-card-edge: 1px solid var(--wb-line);
        /* that edge's width, for what is placed against a card from outside it */
        --wb-card-inset: 1px;
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
