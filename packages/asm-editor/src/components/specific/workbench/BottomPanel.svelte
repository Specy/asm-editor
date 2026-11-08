<script lang="ts">
    /**
     * Below the editor: the Terminal (the program's output and runtime errors), the Log, and the
     * Problems (the Diagnostics) ([the design record](../../../../../../docs/design/workbench.md), Bottom
     * panel). A failed Build shows the Problems, a successful one the Terminal, Test the Log.
     * All three stay built, and only the one picked is shown, so switching keeps each where it was.
     * The tab strip also carries the Program picker, on every tab, while the Project has two
     * Programs or more ([programs.md](../../../../../../docs/design/programs.md), decision 10).
     */
    import { untrack } from 'svelte'
    import FaTerminal from '~icons/fa-solid/terminal'
    import FaListUl from '~icons/fa-solid/list-ul'
    import FaExclamationCircle from '~icons/fa-solid/exclamation-circle'
    import type { Component } from 'svelte'
    import ProblemsList from '#cmp/specific/project/user-tools/ProblemsList.svelte'
    import TabStrip from '#cmp/shared/input/TabStrip.svelte'
    import type { BottomTab } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import TerminalView from './TerminalView.svelte'
    import LogView from './LogView.svelte'
    import ProgramPicker from './ProgramPicker.svelte'
    import Badge from '#cmp/shared/misc/Badge.svelte'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import EmptyState from '#cmp/shared/misc/EmptyState.svelte'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        style?: string
    }

    let { style = '' }: Props = $props()

    const { session, ui } = useWorkbench()
    const problems = $derived(session.activeDiagnostics.length)
    /**
     * The Problems tab's count wears the worst problem's colour (design-system.md, D9): errors and
     * warnings soft, which reads at 4.5:1; a suggestion's dark second accent and the zero count
     * filled.
     */
    const SEVERITY_TONES = { error: 'danger', warning: 'warning', suggestion: 'info' } as const
    const problemTone = $derived(
        problems === 0 || !session.worstSeverity ? 'neutral' : SEVERITY_TONES[session.worstSeverity]
    )
    const terminal = session.emulator.peripherals.terminal
    const interactive = $derived(session.emulator.canExecute && !session.emulator.terminated)
    const readWaiting = $derived(terminal.pendingRead?.source === 'terminal')

    //a read that starts while no console is on screen picks the Terminal's tab (the plan's decision
    //10); the caret then takes the keyboard
    $effect(() => {
        if (!readWaiting) return
        untrack(() => {
            if (!terminal.consoleAttached) session.bottomTab = 'terminal'
        })
    })
    //a phone's strip has no room for the tabs' names beside the Program picker, so they are icons
    //then, named by their tooltip and to a screen reader
    const iconTabs = $derived(ui.deviceClass === 'phone' && session.programChoices.length >= 2)
    const tabs: { id: BottomTab; label: string; icon: Component }[] = [
        { id: 'terminal', label: 'Terminal', icon: FaTerminal },
        { id: 'log', label: 'Log', icon: FaListUl },
        { id: 'problems', label: 'Problems', icon: FaExclamationCircle }
    ]
    //each tab names the body it shows, for a screen reader
    const panelIds = $props.id()
    const panelId = (id: string) => `${panelIds}-${id}`
    const shownTabs = $derived(
        tabs.map((tab) => ({ ...tab, title: iconTabs ? tab.label : undefined }))
    )
</script>

<section class="bottom-panel" {style}>
    <!-- the tabs keep their width, and the Program picker and the run info give way first -->
    <TabStrip
        tabs={shownTabs}
        selected={session.bottomTab}
        ariaLabel="Output"
        scroll={false}
        {panelId}
        onselect={(id) => (session.bottomTab = id as BottomTab)}
        tabAttributes={(item) =>
            iconTabs ? { 'aria-label': item.label, style: 'padding: 0 0.75rem' } : {}}
    >
        {#snippet tab(item)}
            <span class="tab-face" class:icon-only={iconTabs}>
                <span class="tab-icon"><item.icon /></span>
                {#if !iconTabs}{item.label}{/if}
                {#if item.id === 'problems'}
                    {#if session.analysisSpinnerVisible}
                        <span class="pending" title="Analyzing"><Spinner /></span>
                    {:else}
                        <Badge
                            tone={problemTone}
                            solid={problemTone === 'neutral' || problemTone === 'info'}
                            title="{problems} problem{problems === 1 ? '' : 's'}"
                            >{problems > 99 ? '99+' : problems}</Badge
                        >
                    {/if}
                {/if}
            </span>
        {/snippet}
        <ProgramPicker />
        <!-- a phone's strip has no room for it beside the tabs; the Log says it too -->
        {#if session.runInfo && ui.deviceClass !== 'phone'}
            <span class="run-info" title={session.runInfo}
                ><span class="ellipsis">{session.runInfo}</span></span
            >
        {/if}
    </TabStrip>
    <div
        class="tab-body"
        class:hidden={session.bottomTab !== 'terminal'}
        id={panelId('terminal')}
        role="tabpanel"
        aria-label="Terminal"
    >
        <TerminalView
            {terminal}
            errors={session.errorStrings}
            visible={session.bottomTab === 'terminal'}
            {interactive}
            escapes={session.project.language === 'X86'}
            commandLine={session.commandLine}
            onCommandLineChange={(text) => session.setProgramArguments(text)}
            commandLineFocus={session.commandLineFocus}
        />
    </div>
    <div
        class="tab-body"
        class:hidden={session.bottomTab !== 'log'}
        id={panelId('log')}
        role="tabpanel"
        aria-label="Log"
    >
        <LogView entries={session.log} visible={session.bottomTab === 'log'} />
    </div>
    <div
        class="tab-body"
        class:hidden={session.bottomTab !== 'problems'}
        id={panelId('problems')}
        role="tabpanel"
        aria-label="Problems"
    >
        {#if problems > 0}
            <div class="problems">
                <ProblemsList
                    diagnostics={session.activeDiagnostics}
                    onDiagnosticSelect={(diagnostic) => void session.revealDiagnostic(diagnostic)}
                />
            </div>
        {:else}
            <EmptyState>
                {session.sourceView === 'live'
                    ? 'No problems in the Files.'
                    : 'The Build reported no problems.'}
            </EmptyState>
        {/if}
    </div>
</section>

<style lang="scss">
    .bottom-panel {
        --wb-output-padding: 0.7rem 0.9rem;
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        background-color: var(--secondary);
        color: var(--secondary-text);
        border-radius: var(--wb-radius);
        border: var(--wb-card-edge);
        overflow: hidden;
    }

    /* the strip is TabStrip's; a tab here is its icon, its name and, for the Problems, their
       count */
    .tab-face {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-weight: 600;

        &.icon-only {
            gap: 0.35rem;
        }
    }

    .tab-icon {
        display: grid;
        place-items: center;
        width: 0.9rem;
        height: 0.9rem;
    }

    /* the spinner in the count's place while the source is analysed, as large as the count */
    .pending {
        display: grid;
        place-items: center;
        width: 1.1rem;
        height: 1.1rem;
        color: var(--hint);
        font-size: var(--fs-small);
    }

    .run-info {
        display: flex;
        align-items: center;
        min-width: 0;
        padding: 0 0.9rem 0 0.6rem;
        font-size: var(--fs-caption);
        color: var(--hint);

        /* one line, cut short rather than wrapped in a strip one line tall */
    }

    .tab-body {
        /* an empty state in line with the Terminal's and the Log's text */
        --empty-state-padding: var(--wb-output-padding);
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;

        &.hidden {
            display: none;
        }
    }

    .problems {
        --diagnostics-padding: 0;
        flex: 1;
        min-height: 0;
        overflow: auto;
        scrollbar-gutter: stable;
        padding: var(--wb-output-padding);
    }
</style>
