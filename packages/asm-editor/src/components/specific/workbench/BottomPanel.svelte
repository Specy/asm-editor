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
    import FaSpinner from '~icons/fa-solid/spinner'
    import FaTerminal from '~icons/fa-solid/terminal'
    import FaListUl from '~icons/fa-solid/list-ul'
    import FaExclamationCircle from '~icons/fa-solid/exclamation-circle'
    import type { Component } from 'svelte'
    import ProblemsList from '#cmp/specific/project/user-tools/ProblemsList.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import type { BottomTab } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import TerminalView from './TerminalView.svelte'
    import LogView from './LogView.svelte'
    import ProgramPicker from './ProgramPicker.svelte'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        style?: string
    }

    let { style = '' }: Props = $props()

    const { session, ui } = useWorkbench()
    const problems = $derived(session.activeDiagnostics.length)
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
</script>

<section class="bottom-panel" {style}>
    <div class="tab-strip" role="tablist" aria-label="Output">
        {#each tabs as tab (tab.id)}
            <button
                class="tab"
                class:active={session.bottomTab === tab.id}
                class:icon-only={iconTabs}
                role="tab"
                aria-selected={session.bottomTab === tab.id}
                aria-label={iconTabs ? tab.label : undefined}
                {@attach tooltip(iconTabs ? tab.label : undefined)}
                onclick={() => (session.bottomTab = tab.id)}
            >
                <span class="tab-icon"><tab.icon /></span>
                {#if !iconTabs}{tab.label}{/if}
                {#if tab.id === 'problems'}
                    {#if session.analysisSpinnerVisible}
                        <span class="badge pending" title="Analyzing">
                            <FaSpinner />
                        </span>
                    {:else}
                        <span
                            class="badge {problems > 0 ? session.worstSeverity : 'none'}"
                            title="{problems} problem{problems === 1 ? '' : 's'}"
                            >{problems > 99 ? '99+' : problems}</span
                        >
                    {/if}
                {/if}
            </button>
        {/each}
        <div class="spacer"></div>
        <ProgramPicker />
        <!-- a phone's strip has no room for it beside the tabs; the Log says it too -->
        {#if session.runInfo && ui.deviceClass !== 'phone'}
            <span class="run-info" title={session.runInfo}><span>{session.runInfo}</span></span>
        {/if}
    </div>
    <div class="tab-body" class:hidden={session.bottomTab !== 'terminal'} role="tabpanel">
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
    <div class="tab-body" class:hidden={session.bottomTab !== 'log'} role="tabpanel">
        <LogView entries={session.log} visible={session.bottomTab === 'log'} />
    </div>
    <div class="tab-body" class:hidden={session.bottomTab !== 'problems'} role="tabpanel">
        {#if problems > 0}
            <div class="problems">
                <ProblemsList
                    diagnostics={session.activeDiagnostics}
                    onDiagnosticSelect={(diagnostic) => void session.revealDiagnostic(diagnostic)}
                />
            </div>
        {:else}
            <p class="empty">
                {session.sourceView === 'live'
                    ? 'No problems in the Files.'
                    : 'The Build reported no problems.'}
            </p>
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

    /* the mockup's tab strip: a shade darker than the panel, ruled underneath, each tab ruled on
       its right, and the shown tab in the panel's colour, open at the bottom onto the panel. The
       rule is each part's own bottom border rather than the strip's with the tabs laid over it,
       which at a fractional screen scale could land a pixel apart and draw it twice */
    .tab-strip {
        display: flex;
        align-items: stretch;
        flex: none;
        height: 2rem;
        background-color: var(--wb-strip);

        > :global(*) {
            border-bottom: 1px solid var(--wb-line);
        }
    }

    .tab {
        display: flex;
        flex: none;
        align-items: center;
        gap: 0.45rem;
        padding: 0 1rem;
        background: transparent;
        color: var(--secondary-text);
        font-size: 0.8rem;
        font-weight: 600;
        border-right: 1px solid var(--wb-line);
        cursor: pointer;

        &:not(.active) {
            color: color-mix(in srgb, var(--secondary-text) 60%, transparent);
        }

        &:not(.active):hover {
            color: var(--secondary-text);
        }

        &.active {
            background-color: var(--secondary);
            border-bottom-color: var(--secondary);
        }

        &.icon-only {
            gap: 0.35rem;
            padding: 0 0.75rem;
        }
    }

    .tab-icon {
        display: grid;
        place-items: center;
        width: 0.9rem;
        height: 0.9rem;
    }

    .badge {
        display: grid;
        place-items: center;
        min-width: 1.1rem;
        height: 1.1rem;
        padding: 0 0.3rem;
        border-radius: 999px;
        font-size: 0.65rem;
        font-weight: 700;
        background-color: var(--accent2);
        color: var(--accent2-text);

        &.none {
            background-color: var(--tertiary);
            color: var(--tertiary-text);
        }

        &.error {
            background-color: var(--red);
            color: var(--red-text);
        }

        &.warning {
            background-color: #d19a3f;
            color: #181818;
        }

        &.pending {
            background: transparent;
            color: var(--hint);
            padding: 0.15rem;
            animation: spin 650ms linear infinite;
        }
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .spacer {
        flex: 1;
        min-width: 0;
    }

    .run-info {
        display: flex;
        align-items: center;
        min-width: 0;
        padding: 0 0.9rem 0 0.6rem;
        font-size: 0.78rem;
        color: var(--hint);

        /* one line, cut short rather than wrapped in a strip one line tall */
        > span {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
    }

    .tab-body {
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

    .empty {
        margin: 0;
        padding: var(--wb-output-padding);
        font-size: 0.8rem;
        color: var(--hint);
    }
</style>
