<script lang="ts">
    /**
     * Build, and once built Stop, Run, Undo and Step, with Test at the far end in both: the
     * Workbench has no mode switch, the Build becoming Stop in its place is what says a Debug
     * session is on ([the design record](../../../../docs/design/workbench.md)). Run turns into
     * Pause while the program runs. The Testcases run on the same Emulator, so Test during a Debug
     * session ends it first. It is a bar with nothing of its own to draw, laid over the bottom of
     * the editor on a desktop and stuck under it in the compact layouts, whose clicks between the
     * two ends reach what is under it. On a phone, `fill`, the buttons share the bar's width.
     */
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaPlay from '~icons/fa-solid/play'
    import FaPause from '~icons/fa-solid/pause'
    import FaWrench from '~icons/fa-solid/wrench'
    import FaStepForward from '~icons/fa-solid/step-forward'
    import FaRegClock from '~icons/fa-regular/clock'
    import FaStop from '~icons/fa-solid/stop'
    import FaUndo from '~icons/fa-solid/undo'
    import FaFlask from '~icons/fa-solid/flask'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        fill?: boolean
    }

    let { fill = false }: Props = $props()

    const { session } = useWorkbench()
    const emulator = session.emulator
    const hasTests = $derived(session.project.testcases.length > 0)
    const style = 'height: var(--wb-control-height, 2.1rem); padding: 0 0.8rem;'

    function test() {
        if (session.debugSession) session.stop()
        void session.test()
    }
</script>

<div
    class="execution-controls"
    class:fill
    class:debugging={session.debugSession}
    class:with-test={session.debugSession && hasTests}
>
    <div class="group">
        {#if !session.debugSession}
            <Button
                style="{style} min-width: 6rem;"
                onClick={() => session.build()}
                disabled={session.buildDisabled || session.building || session.running}
                title="Assemble the program and start debugging it"
            >
                <Icon size={1}>
                    {#if session.building}
                        <FaRegClock />
                    {:else}
                        <FaWrench />
                    {/if}
                </Icon>
                <span class="label">Build</span>
            </Button>
        {:else}
            <Button
                style="{style} min-width: 6rem;"
                cssVar="accent2"
                onClick={() => session.stop()}
                title="End the Debug session"
            >
                <Icon size={1}>
                    <FaStop />
                </Icon>
                <span class="label">Stop</span>
            </Button>
            <Button
                {style}
                onClick={() => (session.running ? session.pause() : session.run())}
                disabled={session.executionDisabled}
                title={session.running
                    ? 'Pause the program'
                    : 'Run to the end or the next breakpoint'}
            >
                <Icon size={1}>
                    {#if session.running}
                        <FaPause />
                    {:else}
                        <FaPlay />
                    {/if}
                </Icon>
                <span class="label">{session.running ? 'Pause' : 'Run'}</span>
            </Button>
            <Button
                {style}
                disabled={session.undoDisabled || session.running || !emulator.canUndo}
                onClick={() => session.undo()}
                title="Undo the last step"
            >
                <Icon size={1}>
                    <FaUndo />
                </Icon>
                <span class="label">Undo</span>
            </Button>
            <Button
                {style}
                disabled={session.executionDisabled || session.running}
                onClick={() => session.step()}
                title="Run one instruction"
            >
                <Icon size={1}>
                    <FaStepForward />
                </Icon>
                <span class="label">Step</span>
            </Button>
        {/if}
    </div>
    {#if hasTests}
        <Button
            {style}
            cssVar="accent2"
            onClick={test}
            disabled={session.buildDisabled || session.building || session.running}
            title={session.debugSession
                ? 'End the Debug session and run the Testcases'
                : 'Run the Testcases'}
        >
            <Icon size={1}>
                <FaFlask />
            </Icon>
            <span class="label">Test</span>
        </Button>
    {/if}
</div>

<style lang="scss">
    .execution-controls,
    .group {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .label {
        margin-left: 0.4rem;
    }

    /* a disabled control is its own colour sunk into the panel's, rather than see-through: over
       the code, a translucent button would show the code through it */
    .execution-controls :global(button:disabled) {
        opacity: 1;
        background-color: color-mix(in srgb, var(--btn-color) 35%, var(--secondary));
        color: color-mix(in srgb, var(--btn-text) 45%, var(--secondary));
    }

    /* the two ends of a bar over what it sits on: the empty middle lets the clicks through, and
       the buttons are lifted off by a shadow */
    .execution-controls {
        justify-content: space-between;
        pointer-events: none;
        container-type: inline-size;

        :global(button) {
            pointer-events: auto;
            box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.35);
        }
    }

    /* every button an equal share of the bar, Test with the others */
    .fill {
        .group {
            display: contents;
        }

        :global(button) {
            flex: 1 1 0;
        }
    }

    /* A narrow bar, beside an open panel and the debug column or on a phone, tightens the buttons
       first and drops their labels only when even tight they would not fit, each button still named
       by its tooltip. The widths are what each set of buttons takes with tight labels: Build and
       Test, the four of a Debug session, and those four and Test */
    @container (max-width: 30rem) {
        .execution-controls :global(button) {
            min-width: 0 !important;
            padding: 0 0.6rem !important;
        }
    }

    @container (max-width: 26rem) {
        .with-test .label {
            display: none;
        }
    }

    @container (max-width: 21rem) {
        .debugging .label {
            display: none;
        }
    }

    @container (max-width: 11rem) {
        .label {
            display: none;
        }
    }
</style>
