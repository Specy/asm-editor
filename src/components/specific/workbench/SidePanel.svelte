<script lang="ts">
    /**
     * The panel beside the rail. Every panel opened once stays mounted and is only hidden when
     * another one is shown, so the AI conversation, a documentation search or a half-typed Testcase
     * survive switching. Documentation and Testcases can be maximized over the rest of the Workbench
     * ([the design record](../../../../docs/design/workbench.md), Maximized panels).
     */
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from '~icons/fa-solid/times'
    import FaExpand from '~icons/fa-solid/expand'
    import FaCompress from '~icons/fa-solid/compress'
    import Explorer from '$cmp/specific/project/Explorer.svelte'
    import TestcasesList from '$cmp/specific/project/testcases/TestcasesList.svelte'
    import TestcasesSummary from '$cmp/specific/project/testcases/TestcasesSummary.svelte'
    import DocumentationBrowser from '$cmp/documentation/browser/DocumentationBrowser.svelte'
    import { documentationLanguageOf } from '$lib/search/scope'
    import AgentPanel from './AgentPanel.svelte'
    import SettingsPanel from './SettingsPanel.svelte'
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
    aria-label={active?.title}
>
    <header class="panel-header">
        <span class="panel-title ellipsis">{active?.title ?? ''}</span>
        {#if active?.id === 'testcases'}
            <TestcasesSummary
                testcases={project.testcases}
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
            class:gutterless={entry.id === 'explorer' || entry.id === 'testcases'}
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
                        entry={project.entry}
                        fileSystem={project.fileSystem}
                        selectedPath={session.displayedPath}
                        selectedPaths={session.groups.map((group) => group.displayedPath)}
                        onFileDragStart={(event, path) => session.startFileDrag(event, path)}
                        onFileDragEnd={() => session.endFileDrag()}
                        locked={session.fileSystemLocked || entry.access === 'readonly'}
                        diagnosticCounts={session.diagnosticCounts}
                        onSelect={(path) => {
                            session.selectFile(path)
                            if (ui.deviceClass === 'phone') ui.drawerOpen = false
                        }}
                        onEntryChange={(path) => session.setEntry(path)}
                        onRenamed={(from, to) => session.fileRenamed(from, to)}
                        onDeleted={(path) => session.fileDeleted(path)}
                        libraryFiles={Object.keys(emulator.buildLibraryFiles ?? {})}
                    />
                {:else if entry.id === 'testcases'}
                    <TestcasesList
                        bind:testcases={project.testcases}
                        testcasesResult={session.testcasesResult}
                        editable={session.testcasesEditable}
                        systemSize={emulator.systemSize}
                        language={project.language}
                        registerNames={emulator.registers.map((r) => r.name)}
                        registerSizes={Object.fromEntries(
                            emulator.registers.map((r) => [r.name, Number(r.size)])
                        )}
                        startingRegisterNames={emulator.startingRegisterNames}
                        hiddenRegistersNames={emulator.hiddenRegisters}
                        style="flex: 1; min-height: 0;"
                    />
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

        /* the Explorer seldom scrolls; Testcases reserves room on its own scrolling list */
        &.gutterless {
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
    }
</style>
