<script lang="ts" module>
    import type { Component } from 'svelte'

    /** A control of the caller's own at the far end of the dock, beside Test. */
    export interface DockAction {
        label: string
        title: string
        icon: Component
        /** A colour that says how the thing it opens went, such as failing Testcases in red. */
        tone?: 'red' | 'green'
        onClick: () => void
    }

    /** Source compilation uses the same tray as assembly Build. */
    export interface DockCompilation {
        label: string
        disabled: boolean
        busy: boolean
        warning?: string
        optimization?: {
            value: string
            levels: readonly string[]
            onChange: (value: string) => void
        }
        onCompile: () => void
        onCancel: () => void
    }
</script>

<script lang="ts">
    /**
     * The execution dock: Build, and once built Stop, Run, Undo and Step, with Test and the caller's
     * own actions at the far end. Run turns into Pause while the program runs. It only draws the
     * controls and says which was pressed; what a press does, and when the program counts as built,
     * is the host's: the Workbench's `ExecutionControls` and the documentation's Playground. It is a
     * bar with nothing of its own to draw, laid over the bottom of an editor or stuck under it,
     * whose clicks between the two ends reach what is under it. With `fill`, the compact layouts',
     * one tray spans the bar and the buttons share its width.
     */
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaPlay from '~icons/fa-solid/play'
    import FaPause from '~icons/fa-solid/pause'
    import FaWrench from '~icons/fa-solid/wrench'
    import FaStepForward from '~icons/fa-solid/step-forward'
    import FaRegClock from '~icons/fa-regular/clock'
    import FaStop from '~icons/fa-solid/stop'
    import FaUndo from '~icons/fa-solid/undo'
    import FaFlask from '~icons/fa-solid/flask'
    import FaCode from '~icons/fa-solid/code'
    import FaSpinner from '~icons/fa-solid/spinner'

    interface Props {
        /** Built: Stop, Run, Undo and Step in place of Build. */
        debugging: boolean
        building: boolean
        running: boolean
        /** The program cannot be built, or tested, as it stands. */
        buildDisabled: boolean
        /** The program cannot go on: it ended, or waits on input. */
        executionDisabled: boolean
        undoDisabled?: boolean
        canUndo: boolean
        hasTests?: boolean
        fill?: boolean
        /**
         * Edge to edge in the bottom corners of the editor it sits in, rather than floating clear of
         * them: no shadow, and each tray rounded only at the corner that faces the code.
         */
        attached?: boolean
        /** Round the start tray's top-left corner when it sits beside another editor. */
        roundedStart?: boolean
        actions?: DockAction[]
        compilation?: DockCompilation
        /** The displayed File is source, so Compile takes the place of Build. */
        compileOnly?: boolean
        /** Compilation-only docks in another pane share one project execution dock. */
        showExecution?: boolean
        onBuild: () => void
        onStop: () => void
        onRun: () => void
        onPause: () => void
        onUndo: () => void
        onStep: () => void
        onTest?: () => void
    }

    let {
        debugging,
        building,
        running,
        buildDisabled,
        executionDisabled,
        undoDisabled = false,
        canUndo,
        hasTests = false,
        fill = false,
        attached = false,
        roundedStart = false,
        actions = [],
        compilation,
        compileOnly = false,
        showExecution = true,
        onBuild,
        onStop,
        onRun,
        onPause,
        onUndo,
        onStep,
        onTest
    }: Props = $props()

    const hasEnd = $derived(showExecution && (hasTests || actions.length > 0))
</script>

<div
    class="execution-controls"
    class:fill
    class:attached
    class:rounded-start={roundedStart}
    class:debugging
    class:with-end={debugging && hasEnd}
    class:with-actions={debugging && actions.length > 0}
>
    <div class="toolbar">
        {#if !debugging}
            {#if showExecution && !compileOnly}
                <button
                    type="button"
                    class="tool primary"
                    onclick={onBuild}
                    disabled={buildDisabled || building || running}
                    title="Assemble the program and start debugging it"
                >
                    <Icon size={1}>
                        {#if building}
                            <FaRegClock />
                        {:else}
                            <FaWrench />
                        {/if}
                    </Icon>
                    <span class="label">Build</span>
                </button>
            {/if}
            {#if compilation}
                <button
                    type="button"
                    class="tool compile"
                    class:primary={compileOnly}
                    disabled={compilation.disabled}
                    aria-label={compilation.label}
                    aria-busy={compilation.busy}
                    title="Compile source and local headers with Compiler Explorer"
                    onclick={compilation.onCompile}
                >
                    <Icon size={0.9}>
                        {#if compilation.busy}
                            <span class="busy-spinner"><FaSpinner /></span>
                        {:else}
                            <FaCode />
                        {/if}
                    </Icon>
                    <span class="label">{compilation.label}</span>
                </button>
                {#if compilation.warning}
                    <span class="compile-warning" role="status">{compilation.warning}</span>
                {:else if compilation.optimization}
                    <div class="divider" aria-hidden="true"></div>
                    <select
                        class="tool optimization"
                        aria-label="Optimization"
                        title="Compiler optimization"
                        value={compilation.optimization.value}
                        disabled={compilation.busy || compilation.disabled}
                        onchange={(event) =>
                            compilation?.optimization?.onChange(event.currentTarget.value)}
                    >
                        {#each compilation.optimization.levels as level (level)}
                            <option value={level}>-O{level}</option>
                        {/each}
                    </select>
                {/if}
                {#if compilation.busy}
                    <button
                        type="button"
                        class="tool"
                        title="Cancel source compilation"
                        aria-label="Cancel source compilation"
                        onclick={compilation.onCancel}>Cancel</button
                    >
                {/if}
            {/if}
        {:else if showExecution}
            <button type="button" class="tool" onclick={onStop} title="End the Debug session">
                <Icon size={0.8}>
                    <FaStop />
                </Icon>
                <span class="label">Stop</span>
            </button>
            <button
                type="button"
                class="tool primary"
                onclick={() => (running ? onPause() : onRun())}
                disabled={executionDisabled}
                title={running ? 'Pause the program' : 'Run to the end or the next breakpoint'}
            >
                <Icon size={0.8}>
                    {#if running}
                        <FaPause />
                    {:else}
                        <FaPlay />
                    {/if}
                </Icon>
                <span class="label">{running ? 'Pause' : 'Run'}</span>
            </button>
            <span class="divider" aria-hidden="true"></span>
            <button
                type="button"
                class="tool"
                disabled={undoDisabled || running || !canUndo}
                onclick={onUndo}
                title="Undo the last step"
            >
                <Icon size={0.8}>
                    <FaUndo />
                </Icon>
                <span class="label">Undo</span>
            </button>
            <button
                type="button"
                class="tool emphasis"
                disabled={executionDisabled || running}
                onclick={onStep}
                title="Run one instruction"
            >
                <Icon size={0.8}>
                    <FaStepForward />
                </Icon>
                <span class="label">Step</span>
            </button>
        {/if}
    </div>
    {#if hasEnd}
        <div class="toolbar end">
            <span class="divider fill-only" aria-hidden="true"></span>
            {#if hasTests}
                <button
                    type="button"
                    class="tool"
                    onclick={() => onTest?.()}
                    disabled={buildDisabled || building || running}
                    title={debugging
                        ? 'End the Debug session and run the Testcases'
                        : 'Run the Testcases'}
                >
                    <Icon size={0.9}>
                        <FaFlask />
                    </Icon>
                    <span class="label">Test</span>
                </button>
            {/if}
            {#each actions as action (action.label)}
                <button
                    type="button"
                    class="tool {action.tone ?? ''}"
                    onclick={action.onClick}
                    title={action.title}
                >
                    <Icon size={0.9}>
                        <action.icon />
                    </Icon>
                    <span class="label">{action.label}</span>
                </button>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    /* the two ends of a bar over what it sits on: the empty middle lets the clicks through */
    .execution-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
        pointer-events: none;
        container-type: inline-size;
        /* the tray's colour, which a disabled control sinks into: the code's darker shade where it
           floats over the editor, the cards' own where a layout lays it out among them */
        --tray: var(--execution-tray, var(--primary));
        --dock-line: var(--wb-line, color-mix(in srgb, var(--tertiary) 60%, transparent));
    }

    /* each end one opaque tray lifted off the code by a shadow, its buttons sunk into it: the one
       action that moves the program on filled, the rest only their label */
    .toolbar {
        display: flex;
        align-items: center;
        gap: 0.2rem;
        height: var(--wb-control-height, 2.6rem);
        padding: 0.25rem;
        border: 1px solid var(--dock-line);
        border-radius: 0.6rem;
        background-color: var(--tray);
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.35);
        pointer-events: auto;
    }

    .divider {
        flex: none;
        align-self: center;
        width: 1px;
        height: 60%;
        margin: 0 0.2rem;
        background-color: var(--dock-line);
    }

    .fill-only {
        display: none;
    }

    .tool {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 0 0.8rem;
        border: none;
        border-radius: 0.4rem;
        background-color: transparent;
        color: var(--primary-text);
        font-family: Rubik;
        font-size: 0.95rem;
        font-weight: 500;
        white-space: nowrap;
        user-select: none;
        cursor: pointer;
        transition:
            background-color 0.15s,
            color 0.15s;

        :global(.icon) {
            cursor: inherit;
        }
    }

    .tool:hover:not(:disabled) {
        background-color: color-mix(in srgb, var(--tertiary) 55%, transparent);
    }

    .tool:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }

    .tool:disabled {
        color: color-mix(in srgb, var(--primary-text) 35%, var(--tray));
        cursor: not-allowed;
    }

    .emphasis:not(:disabled) {
        color: var(--accent);
    }

    .red {
        color: var(--red);
    }

    .green {
        color: var(--green);
    }

    .primary {
        background-color: var(--accent);
        color: var(--accent-text);
    }

    .primary:hover:not(:disabled) {
        background-color: color-mix(in srgb, var(--accent) 85%, white);
    }

    .primary:focus-visible {
        outline-color: var(--accent-text);
    }

    /* sunk into the tray rather than see-through, as everything in it */
    .primary:disabled {
        background-color: color-mix(in srgb, var(--accent) 30%, var(--tray));
        color: color-mix(in srgb, var(--accent-text) 50%, var(--tray));
    }

    .label {
        margin-left: 0.45rem;
    }

    .optimization {
        font-size: 0.85rem;
        background: var(--tray);
    }

    .compile-warning {
        max-width: 17rem;
        padding: 0 0.45rem;
        color: var(--hint);
        font-size: 0.7rem;
        line-height: 1.2;
    }

    .busy-spinner {
        display: flex;
        animation: compile-spin 1s linear infinite;
    }

    @keyframes compile-spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* in the compact layouts one tray across the bar, every button an equal share of it, Test and
       the caller's actions with the others behind a divider */
    .fill {
        gap: 0.2rem;
        height: var(--wb-control-height, 2.6rem);
        padding: 0.25rem;
        border: 1px solid var(--dock-line);
        border-radius: 0.6rem;
        background-color: var(--tray);
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.35);
        pointer-events: auto;

        .toolbar {
            display: contents;
        }

        .fill-only {
            display: block;
            height: 1.4rem;
        }

        .tool {
            flex: 1 1 0;
            min-width: 0;
        }

        .optimization {
            flex: 0 0 auto;
        }
    }

    /* tucked into the editor's corners: the trays keep only the edges that face the code, and the
       host's own frame rounds the outer corners. A translucent tint blurs the code beneath it. */
    .execution-controls.attached {
        --tray: color-mix(in srgb, var(--primary) 80%, transparent);
    }

    .attached {
        align-items: flex-end;

        .toolbar {
            border-bottom: none;
            border-radius: 0;
            backdrop-filter: blur(4px);
            box-shadow: 0 -0.1rem 0.6rem rgb(0 0 0 / 0.25);
        }

        .optimization {
            background: transparent;

            option {
                background: var(--background);
            }
        }

        .toolbar:first-child {
            border-left: none;
            border-top-right-radius: 0.6rem;
        }

        .end {
            border-right: none;
            border-top-left-radius: 0.6rem;
        }
    }

    .attached.fill {
        border: none;
        border-top: 1px solid var(--dock-line);
        border-radius: 0;
        backdrop-filter: blur(4px);
        box-shadow: 0 -0.1rem 0.6rem rgb(0 0 0 / 0.25);
    }

    .attached.rounded-start {
        .toolbar:first-child {
            border-top-left-radius: 0.6rem;
        }

        &.fill {
            border-top-left-radius: 0.6rem;
        }
    }

    /* A narrow bar, beside an open panel and the debug column, in a documentation page or on a
       phone, tightens the buttons first, then drops the far end's labels, and the four of a Debug
       session's only when even beside a bare far end they would not fit, each button still named by
       its tooltip. The widths are what each set takes, measured: the four 21.8rem loose and 20.2rem
       tight, a caller's action such as "Try in the editor" 10.4rem with its label, Test 5.5rem, and
       either 2.7rem bare */
    @container (max-width: 30rem) {
        .tool {
            padding: 0 0.6rem;
        }
    }

    @container (max-width: 33.5rem) {
        .with-actions .tool {
            padding: 0 0.6rem;
        }
    }

    @container (max-width: 31.5rem) {
        .with-actions .end .label {
            display: none;
        }
    }

    @container (max-width: 26.5rem) {
        .with-end .end .label {
            display: none;
        }
    }

    @container (max-width: 23.5rem) {
        .with-end .label {
            display: none;
        }
    }

    @container (max-width: 22rem) {
        .debugging .label {
            display: none;
        }
    }

    @container (max-width: 12rem) {
        .label {
            display: none;
        }
    }
</style>
