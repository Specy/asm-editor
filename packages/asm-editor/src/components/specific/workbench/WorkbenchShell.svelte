<script lang="ts">
    import { onMount, untrack, type Snippet } from 'svelte'
    import type { Project } from '#lib/Project.svelte.ts'
    import type { Emulator } from '#lib/languages/Emulator.ts'
    import { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import type { EditJournalStore } from '#lib/editJournal.ts'
    import { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
    import { watchViewport } from '#lib/workbench/viewport.svelte.ts'
    import type {
        BuiltinPanelId,
        PanelAccess,
        WorkbenchHostLink,
        WorkbenchHostPanel
    } from '#lib/workbench/hostApi.ts'
    import { setWorkbenchContext, type RailEntry } from './workbenchContext'
    import WorkbenchDesktop from './WorkbenchDesktop.svelte'
    import WorkbenchCompact from './WorkbenchCompact.svelte'
    import DebugToolsFloating from './DebugToolsFloating.svelte'
    import { workbenchRail } from './workbenchRail'
    import { documentationLanguageOf, languageScope } from '#lib/search/scope.ts'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import { hasExecutable } from '#lib/executables.ts'
    import { registerDocumentationLinks } from '#lib/languages/service/navigation.ts'
    import { carriesComputerFiles } from '#lib/fileDrops.ts'
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
        editJournals?: EditJournalStore
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
        editJournals,
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
                },
                get editJournals() {
                    return editJournals
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
        },
        searchProject: (query) => {
            if (accessOf('search') !== 'off') ui.searchProject(query)
        }
    }

    /** What the Documentation panel's search, and the AI assistant's, look through. */
    const searchScope = $derived(
        languageScope(documentationLanguageOf(project.language), searchLectures)
    )

    onMount(() => {
        // The Documentation panel is one click away, so its index and the model start loading
        // once the Workbench has settled ([ADR 0026](../../../../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)).
        if (accessOf('documentation') !== 'off') searchClient.preload(searchScope)
        //a hover's link into the Documentation opens it in the panel, since the Workbench never
        //navigates; with the panel off, as an Exam may have it, the link goes nowhere, not to a tab
        const unregisterLinks = registerDocumentationLinks((href) => {
            if (accessOf('documentation') !== 'off') ui.showDocumentation(href)
            return true
        })
        const unmount = session.mount()
        return () => {
            unregisterLinks()
            unmount()
        }
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

    /**
     * The Symbols panel is offered only in a Project that has an Executable
     * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 18).
     */
    const symbolsOffered = $derived(project.language === 'X86' && hasExecutable(project.files))

    /**
     * The Edit history is offered in a Project with a File stored as bytes, which the Hex and Pixel
     * editors change, and in any whose Files have Edit steps, as typing over a text File in Hex
     * makes.
     */
    const historyOffered = $derived(
        Object.values(project.files).some((file) => file.encoding === 'base64') ||
            session.editedFiles().length > 0
    )

    const rail = $derived(
        workbenchRail({
            access,
            symbolsOffered,
            historyOffered,
            testcasesDot,
            hostPanels,
            hostLinks,
            onShare
        })
    )

    //the open Symbols panel goes with the Project's last Executable, the Edit history with its last
    //byte File
    $effect(() => {
        if (
            (activePanel === 'symbols' || activePanel === 'history') &&
            !rail.some((entry) => entry.id === activePanel)
        )
            ui.close()
    })

    /**
     * Files from the computer dropped where nothing takes them, such as the bottom panel or a
     * locked Explorer, are refused rather than opened by the browser in place of the Workbench.
     */
    function refuseFiles(event: DragEvent) {
        if (event.defaultPrevented || !carriesComputerFiles(event)) return
        event.preventDefault()
        event.dataTransfer!.dropEffect = 'none'
    }

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
    role="presentation"
    ondragenter={refuseFiles}
    ondragover={refuseFiles}
    ondrop={refuseFiles}
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
