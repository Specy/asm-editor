<script lang="ts">
    /**
     * The panel beside the rail. Every panel opened once stays mounted and is only hidden when
     * another one is shown, so the AI conversation, a documentation search or a half-typed Testcase
     * survive switching. Documentation and Testcases can be maximized over the rest of the Workbench
     * ([the design record](../../../../../../docs/design/workbench.md), Maximized panels). The
     * Testcases are the Selected program's, and with two Programs or more the Testcases and Settings
     * headers name it, `Settings · sort.c`, so whose they are shows with the bottom panel folded
     * ([programs.md](../../../../../../docs/design/programs.md), decision 10). Symbols lists the
     * functions and strings of an Executable
     * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 18). Search finds text in the Project's Files, Listings and Pseudocode, and can be
     * maximized too ([annotations-and-search.md](../../../../../../docs/design/annotations-and-search.md),
     * decisions 23 to 29).
     */
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaTimes from '~icons/fa-solid/times'
    import FaExpand from '~icons/fa-solid/expand'
    import FaCompress from '~icons/fa-solid/compress'
    import Explorer from '#cmp/specific/project/Explorer.svelte'
    import TestcasesList from '#cmp/specific/project/testcases/TestcasesList.svelte'
    import TestcasesSummary from '#cmp/specific/project/testcases/TestcasesSummary.svelte'
    import { testcaseRegisters } from '#lib/testcases.ts'
    import DocumentationBrowser from '#cmp/documentation/browser/DocumentationBrowser.svelte'
    import { documentationLanguageOf } from '#lib/search/scope.ts'
    import { NO_PROGRAM_MESSAGE } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import AgentPanel from './AgentPanel.svelte'
    import SettingsPanel from './SettingsPanel.svelte'
    import SymbolsPanel from './SymbolsPanel.svelte'
    import EditHistoryPanel from './EditHistoryPanel.svelte'
    import SearchPanel from './SearchPanel.svelte'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        /** A phone's drawer has no room to maximize into. */
        allowMaximize?: boolean
        /** A card of its own; a desktop's panel shares one with the rail instead. */
        framed?: boolean
        /** Keep the centered content width until the panel finishes returning from full width. */
        restoring?: boolean
    }

    let { allowMaximize = true, framed = true, restoring = false }: Props = $props()

    const context = useWorkbench()
    const { session, ui } = context
    const emulator = session.emulator
    const project = session.project
    const phone = $derived(ui.deviceClass === 'phone')
    const active = $derived(context.rail.find((entry) => entry.id === ui.activePanel))
    const mounted = $derived(
        context.rail.filter((entry) => !entry.action && ui.opened.has(entry.id))
    )
    /** The Selected program's label in the headers of the panels that are about it. */
    const programLabel = $derived(
        session.programChoices.length > 1 &&
            (active?.id === 'settings' || active?.id === 'testcases')
            ? session.programChoices.find((choice) => choice.entry === project.selectedProgram)
                  ?.label
            : undefined
    )
    const title = $derived(
        active ? (programLabel ? `${active.title} · ${programLabel}` : active.title) : undefined
    )

    /** Run all, which like Test ends a Debug session first: the Testcases run on its Emulator. */
    function runTestcases() {
        if (session.debugSession) session.stop()
        void session.test()
    }

    /**
     * Minimum widths on larger screens, where narrow panels can scroll sideways. A phone's
     * drawer lets the content wrap to the available width instead.
     */
    const MIN_WIDTHS: Record<string, string> = {
        explorer: '13rem',
        symbols: '16rem',
        history: '16rem',
        search: '18rem',
        testcases: '24rem',
        documentation: '24rem',
        agent: '20rem',
        settings: '22rem'
    }
</script>

<svelte:window
    onkeydown={(event) => {
        if (event.key === 'Escape' && ui.maximized) {
            ui.maximized = false
            event.stopPropagation()
        }
    }}
/>

<section
    class="side-panel"
    class:phone
    class:framed
    class:maximized={ui.maximized || restoring}
    aria-label={title}
>
    <header class="panel-header">
        <span class="panel-title ellipsis" {title}
            >{active?.title ?? ''}{#if programLabel}<span class="program-label"
                    >{` · ${programLabel}`}</span
                >{/if}</span
        >
        {#if active?.id === 'testcases' && project.selected}
            <TestcasesSummary
                testcases={project.selected.testcases}
                results={session.testcasesResult}
                onRun={runTestcases}
                onClear={() => (session.testcasesResult = [])}
                disabled={session.buildDisabled || session.building || session.running}
                style={phone
                    ? 'flex-wrap: wrap; flex-basis: 100%; min-width: 0; order: 1;'
                    : 'margin-right: 0.3rem'}
            />
        {/if}
        {#if active?.maximizable && allowMaximize}
            <button
                class="panel-action"
                title={ui.maximized ? 'Restore the panel' : 'Maximize the panel'}
                aria-label={ui.maximized ? 'Restore the panel' : 'Maximize the panel'}
                aria-pressed={ui.maximized}
                onclick={() => ui.toggleMaximized()}
            >
                {#if ui.maximized}
                    <FaCompress />
                {:else}
                    <FaExpand />
                {/if}
            </button>
        {/if}
        <button
            class="panel-action"
            title="Close the panel"
            aria-label="Close the panel"
            onclick={() => {
                if (phone) ui.drawerOpen = false
                else ui.close()
            }}
        >
            <Icon size={0.9}>
                <FaTimes />
            </Icon>
        </button>
    </header>
    {#each mounted as entry (entry.id)}
        {@const shown = entry.id === ui.activePanel}
        <div
            class="panel-body"
            class:shown
            class:gutterless={entry.id === 'explorer' ||
                entry.id === 'symbols' ||
                entry.id === 'search' ||
                entry.id === 'testcases' ||
                entry.id === 'documentation'}
        >
            <div
                class="panel-content"
                style:min-width={phone ? '0' : (MIN_WIDTHS[entry.id] ?? '16rem')}
            >
                {#if entry.id === 'explorer'}
                    <Explorer
                        name={project.name}
                        files={project.files}
                        language={project.language}
                        programs={session.programChoices}
                        selectedProgram={project.selectedProgram}
                        fileSystem={project.fileSystem}
                        selectedPath={session.displayedPath}
                        selectedPaths={session.groups.map((group) => group.displayedPath)}
                        onFileDragStart={(event, path) => session.startFileDrag(event, path)}
                        onFileDragEnd={() => session.endFileDrag()}
                        locked={session.filesLocked || entry.access === 'readonly'}
                        diagnosticCounts={session.diagnosticCounts}
                        onSelect={(path) => {
                            session.selectFile(path)
                            if (ui.deviceClass === 'phone') ui.drawerOpen = false
                        }}
                        onPreview={(path) => {
                            session.previewFile(path)
                            if (ui.deviceClass === 'phone') ui.drawerOpen = false
                        }}
                        onNewProgram={(path) => session.createProgram(path)}
                        onRemoveProgram={(path) => session.removeProgram(path)}
                        programLoss={(path) => session.programLoss(path)}
                        onRenamed={(from, to) => session.fileRenamed(from, to)}
                        onDeleted={(path) => session.fileDeleted(path)}
                        onFilesAdded={(paths) => session.filesAdded(paths)}
                        onPictureCreated={(path) => {
                            session.openInPixelEditor(path)
                            if (ui.deviceClass === 'phone') ui.drawerOpen = false
                        }}
                        libraryFiles={Object.keys(emulator.buildLibraryFiles ?? {})}
                        buildOutputs={session.buildOutputs}
                        hints={context.documentationLinks}
                    />
                {:else if entry.id === 'symbols'}
                    <SymbolsPanel
                        {shown}
                        onReveal={() => {
                            if (ui.deviceClass === 'phone') ui.drawerOpen = false
                        }}
                    />
                {:else if entry.id === 'history'}
                    <EditHistoryPanel
                        onPick={() => {
                            if (ui.deviceClass === 'phone') ui.drawerOpen = false
                        }}
                    />
                {:else if entry.id === 'search'}
                    <!-- on a phone the drawer holds it: closing the drawer closes the panel -->
                    <SearchPanel
                        shown={shown && (!phone || ui.drawerOpen)}
                        onReveal={() => {
                            if (phone) ui.drawerOpen = false
                        }}
                    />
                {:else if entry.id === 'testcases'}
                    {#if project.selected}
                        <!-- the array itself, so that a Testcase edited in place is the Program's,
                        keyed by the Program so that which one is unfolded does not carry over -->
                        {#key project.selectedProgram}
                            <TestcasesList
                                bind:testcases={
                                    () => project.selected?.testcases ?? [],
                                    (next) => {
                                        const selected = project.selectedProgram
                                        if (selected !== undefined)
                                            project.setProgramTestcases(selected, next)
                                    }
                                }
                                testcasesResult={session.testcasesResult}
                                editable={session.testcasesEditable}
                                systemSize={emulator.systemSize}
                                language={project.language}
                                registers={testcaseRegisters(emulator)}
                                style="flex: 1; min-height: 0;"
                            />
                        {/key}
                    {:else}
                        <p class="no-program">{NO_PROGRAM_MESSAGE}</p>
                    {/if}
                {:else if entry.id === 'documentation'}
                    <DocumentationBrowser
                        language={documentationLanguageOf(project.language)}
                        scope={context.searchScope}
                        disableLinks={!context.documentationLinks}
                        request={ui.documentationRequest}
                    />
                {:else if entry.id === 'agent'}
                    <AgentPanel />
                {:else if entry.id === 'settings'}
                    <SettingsPanel readonly={entry.access === 'readonly'} />
                {:else if entry.content}
                    {@render entry.content({ project, emulator })}
                {/if}
            </div>
        </div>
    {/each}
</section>

<style lang="scss">
    .side-panel {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background-color: var(--wb-surface);
        color: var(--secondary-text);
    }

    .framed {
        border-radius: var(--wb-radius);
        border: var(--wb-card-edge);
    }

    .panel-header {
        display: flex;
        align-items: center;
        gap: 0.2rem;
        flex: none;
        height: 2.2rem;
        padding: 0 0.3rem 0 0.8rem;
        border-bottom: 1px solid var(--wb-line);
    }

    .panel-title {
        flex: 1;
        min-width: 0;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    /* a File's name, so not in capitals, which would name another one */
    .program-label {
        letter-spacing: normal;
        text-transform: none;
    }

    .no-program {
        margin: 0;
        padding: 0.8rem;
        font-size: 0.8rem;
        line-height: 1.4;
        color: var(--hint);
    }

    .panel-action {
        display: grid;
        place-items: center;
        flex: none;
        width: 1.7rem;
        height: 1.7rem;
        padding: 0.4rem;
        border-radius: 0.3rem;
        background: transparent;
        color: inherit;
        cursor: pointer;

        &:hover {
            background-color: var(--tertiary);
        }
    }

    /* the scrollbar's room is kept whether the content scrolls or not, so a section opened in
       Settings does not push everything sideways when it starts to */
    .panel-body {
        display: none;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
        overflow: auto;
        scrollbar-gutter: stable;

        &.shown {
            display: flex;
        }

        /* The Explorer seldom scrolls; Symbols, Search, Testcases and Documentation reserve their
           own gutter. */
        &.gutterless {
            overflow-y: hidden;
            scrollbar-gutter: auto;
        }
    }

    .panel-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
    }

    .maximized .panel-content {
        width: 100%;
        max-width: 90ch;
        margin-inline: auto;
    }

    .phone .panel-header {
        flex-wrap: wrap;
        height: auto;
        min-height: 2.2rem;
        padding-block: 0.3rem;
    }

    .phone .panel-content {
        width: 100%;
        max-width: 100%;
        overflow-wrap: anywhere;

        :global(.settings-value) {
            flex-wrap: wrap;
        }

        /* a control wrapped under its name stays at the right, where the others are */
        :global(.settings-value > :last-child) {
            margin-left: auto;
        }
    }
</style>
