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
        compiler?: {
            value: string
            options: readonly { value: string; label: string }[]
            onChange: (value: string) => void
        }
        onCompile: () => void
        onCancel: () => void
    }

    /**
     * A Build that says what it is waiting for and can be cancelled, as the Workbench's
     * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 2): while `building`, Build reads `phase` beside a spinner, and Cancel follows it.
     */
    export interface DockBuildProgress {
        /** What the Build waits for, such as "Downloading libc.so.6…", or "Building…". */
        phase: string
        onCancel: () => void
    }

    /**
     * What Build is called, and what its tooltip says it does: "Debug" for a program that is
     * loaded rather than assembled, an Executable
     * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 10).
     */
    export interface DockBuildButton {
        label: string
        title: string
    }

    /**
     * The speaker button, at the far end: the host passes it once the program has made a sound
     * ([audio.md](../../../../../../docs/design/audio.md#autoplay-mute-and-volume)).
     */
    export interface DockSound {
        muted: boolean
        /** Something is heard right now, which lights the button. */
        playing: boolean
        /** The program waits while the sound bank loads. */
        loading: boolean
        onToggle: () => void
    }
    /** One button of the view switch: a way the pane can show its File. */
    export interface DockView {
        id: string
        label: string
        title: string
        icon: Component
    }

    /**
     * The view switch, beside Build: one option per view the pane's File offers, the picked one the
     * view it shows ([file-views.md](../../../../../../docs/design/file-views.md), decision 4).
     */
    export interface DockViews {
        options: readonly DockView[]
        value: string
        onChange: (id: string) => void
    }
</script>

<script lang="ts">
    /**
     * The execution dock: Build, and once built Stop, Run, Undo and Step, with Test and the caller's
     * own actions at the far end, and after them, in either case, the view switch of a pane that
     * shows a File in more than one way. Run turns into Pause while the program runs. It only draws the
     * controls and says which was pressed; what a press does, and when the program counts as built,
     * is the host's: the Workbench's `ExecutionControls` and the documentation's Playground. It is a
     * bar with nothing of its own to draw, laid over the bottom of an editor or stuck under it,
     * whose clicks between the two ends reach what is under it. With `fill`, the compact layouts',
     * one tray spans the bar and the buttons share its width.
     */
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import SegmentedControl from '#cmp/specific/project/cpu/SegmentedControl.svelte'
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
    import FaVolumeUp from '~icons/fa-solid/volume-up'
    import FaVolumeMute from '~icons/fa-solid/volume-mute'

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
        /** Round the end tray's top-right corner when it sits beside another editor. */
        roundedEnd?: boolean
        actions?: DockAction[]
        /** What a Build in progress waits for, and its Cancel; without it Build shows a clock. */
        buildProgress?: DockBuildProgress
        /** Build's name and tooltip, which a Build in progress replaces with what it waits for. */
        buildButton?: DockBuildButton
        compilation?: DockCompilation
        /** The pane's view switch, shown during a Debug session too. */
        views?: DockViews
        /** The speaker button, once the program has made a sound. */
        sound?: DockSound
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
        roundedEnd = false,
        actions = [],
        buildProgress,
        buildButton = { label: 'Build', title: 'Assemble the program and start debugging it' },
        compilation,
        views,
        sound,
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

    const hasEnd = $derived(showExecution && (hasTests || actions.length > 0 || !!sound))
    /** Whether anything precedes the view switch in its tray, which a divider then sets apart. */
    const beforeViews = $derived(
        debugging ? showExecution : (showExecution && !compileOnly) || !!compilation
    )
    /** Whether the dock holds the view switch and nothing else, as a pane's beside the controls. */
    const switchOnly = $derived(!!views && !beforeViews && !hasEnd)
    const progress = $derived(building ? buildProgress : undefined)
</script>

<div
    class="execution-controls"
    class:fill
    class:attached
    class:rounded-start={roundedStart}
    class:rounded-end={roundedEnd}
    class:debugging
    class:with-end={debugging && hasEnd}
    class:with-far-end={hasEnd}
    class:with-session={debugging && showExecution}
    class:with-actions={debugging && actions.length > 0}
    class:with-compilation={!!compilation}
    class:with-views={!!views}
    class:with-wide-views={(views?.options.length ?? 0) > 2}
    class:switch-only={switchOnly}
>
    <div class="toolbar">
        {#if !debugging}
            {#if showExecution && !compileOnly}
                <button
                    type="button"
                    class="tool primary"
                    class:progress={!!progress}
                    onclick={onBuild}
                    disabled={buildDisabled || building || running}
                    title={progress?.phase ?? buildButton.title}
                    aria-label={buildButton.label}
                    aria-busy={building}
                >
                    <Icon size={1}>
                        {#if progress}
                            <span class="busy-spinner"><FaSpinner /></span>
                        {:else if building}
                            <FaRegClock />
                        {:else}
                            <FaWrench />
                        {/if}
                    </Icon>
                    <span class="label">{progress?.phase ?? buildButton.label}</span>
                </button>
                {#if progress}
                    <button
                        type="button"
                        class="tool"
                        title="Stop building and go back to editing"
                        aria-label="Cancel the Build"
                        onclick={progress.onCancel}>Cancel</button
                    >
                {/if}
            {/if}
            {#if compilation}
                <button
                    type="button"
                    class="tool compile"
                    class:primary={compileOnly}
                    disabled={compilation.disabled}
                    aria-label={compilation.label}
                    aria-busy={compilation.busy}
                    title={compilation.warning ??
                        'Compile the source and the Files it includes with Compiler Explorer'}
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
                {#if compilation.compiler && !compilation.warning}
                    <div class="divider" aria-hidden="true"></div>
                    <select
                        class="tool compiler"
                        aria-label="Source compiler"
                        title="Source compiler"
                        value={compilation.compiler.value}
                        disabled={compilation.busy || compilation.disabled}
                        onchange={(event) =>
                            compilation?.compiler?.onChange(event.currentTarget.value)}
                    >
                        {#each compilation.compiler.options as option (option.value)}
                            <option value={option.value}>{option.label}</option>
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
                disabled={executionDisabled || building}
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
                disabled={executionDisabled || running || building}
                onclick={onStep}
                title="Run one instruction"
            >
                <Icon size={0.8}>
                    <FaStepForward />
                </Icon>
                <span class="label">Step</span>
            </button>
        {/if}
        {#if views}
            {#if beforeViews}
                <span class="divider" aria-hidden="true"></span>
            {/if}
            <!-- the choice every other switch in the editor is, drawn at the dock's height and in
                 its words, which drop as the dock narrows as the other buttons' do -->
            <div class="view-switch" style:--views={views.options.length}>
                <SegmentedControl
                    ariaLabel="View"
                    options={views.options}
                    selected={views.value}
                    onSelect={(id) => views?.onChange(id)}
                    {fill}
                    style="height: 100%"
                >
                    {#snippet face(option)}
                        <span class="view">
                            {#if option.icon}
                                <Icon size={0.85}>
                                    <option.icon />
                                </Icon>
                            {/if}
                            <span class="label">{option.label}</span>
                        </span>
                    {/snippet}
                </SegmentedControl>
            </div>
        {/if}
    </div>
    {#if hasEnd}
        <div class="toolbar end">
            <span class="divider fill-only" aria-hidden="true"></span>
            {#if sound}
                <button
                    type="button"
                    class="tool sound"
                    class:playing={sound.playing && !sound.muted}
                    onclick={sound.onToggle}
                    aria-pressed={!sound.muted}
                    title={sound.loading
                        ? 'Loading sounds…'
                        : sound.muted
                          ? 'Turn sound on'
                          : 'Turn sound off'}
                >
                    <Icon size={0.9}>
                        {#if sound.loading}
                            <span class="busy-spinner"><FaSpinner /></span>
                        {:else if sound.muted}
                            <FaVolumeMute />
                        {:else}
                            <FaVolumeUp />
                        {/if}
                    </Icon>
                    <span class="label">{sound.loading ? 'Loading…' : 'Sound'}</span>
                </button>
            {/if}
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

    .sound.playing {
        color: var(--accent);
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

    /* Build while it says what it waits for: busy rather than unavailable, so its words stay
       legible, and the first thing to give way, cut short, when the bar is too narrow for them */
    .progress {
        flex-shrink: 1;
        min-width: 0;
        cursor: progress;

        .label {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }

    .primary.progress:disabled {
        color: color-mix(in srgb, var(--accent-text) 80%, var(--tray));
    }

    .toolbar:has(> .progress) {
        min-width: 0;
    }

    /* in one tray across a phone's pane, beside an Executable's views, Build's equal share is too
       narrow for what it waits for: the spinner says it builds, and the tooltip what for */
    .fill.with-views .progress .label {
        display: none;
    }

    /* the views, the editor's one control for a choice: a strip as tall as the tray's buttons,
       whose highlight slides to the view shown, its faces in the tray's type */
    .view-switch {
        display: flex;
        height: 100%;
    }

    .view {
        display: flex;
        align-items: center;
        font-size: 0.95rem;
        font-weight: 500;
        user-select: none;

        :global(.icon) {
            cursor: inherit;
        }
    }

    .optimization,
    .compiler {
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

        /* the switch one item among the buttons, with a share for each of its options: its basis
           the narrow tools' padding, which each of their shares holds beyond its part of the
           width left over */
        .view-switch {
            flex: var(--views) 1 calc(var(--views) * 1.2rem);
            min-width: 0;
        }

        .fill-only {
            display: block;
            height: 1.4rem;
        }

        .tool {
            flex: 1 1 0;
            min-width: 0;
        }

        .optimization,
        .compiler {
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

        .optimization,
        .compiler {
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

    .attached.rounded-end {
        .end {
            border-top-right-radius: 0.6rem;
        }

        &.fill {
            border-top-right-radius: 0.6rem;
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

    @container (max-width: 38rem) {
        .with-compilation .end .label {
            display: none;
        }
    }

    @container (max-width: 28rem) {
        .with-compilation .label,
        .with-compilation .compiler,
        .with-compilation .compile-warning {
            display: none;
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

    /* The view switch drops its words first, then the rest go as above, Test's before the others'.
       Measured for a switch of two, as Hex · Disassemble was before Decompile joined it, and kept
       for Preview · Hex, which is narrower: Hex 4.7rem and Disassemble 8.7rem with their words,
       2.45rem bare; beside them Build 5.3rem, a Debug session's four 21.8rem and Test 5.5rem. A
       pane's dock with the switch alone keeps its words down to 14rem, in a Debug session too. A
       switch of three has its own steps below. These widths are the tool buttons the switch was
       before it became the segmented control, which is narrower: Hex 4.3rem, Disassemble 8.3rem
       and Decompile 7.4rem with their words, 2.05rem bare, and no gap between them, so each step
       comes a little before it has to */
    @container (max-width: 24rem) {
        .with-views:not(.switch-only) .view .label {
            display: none;
        }
    }

    @container (max-width: 30rem) {
        .with-views.with-far-end .view .label {
            display: none;
        }
    }

    @container (max-width: 20rem) {
        .with-views.with-far-end .end .label {
            display: none;
        }
    }

    @container (max-width: 37rem) {
        .with-views.with-session .view .label {
            display: none;
        }
    }

    @container (max-width: 43rem) {
        .with-views.with-session.with-far-end .view .label {
            display: none;
        }
    }

    @container (max-width: 33.5rem) {
        .with-views.with-session.with-far-end .end .label {
            display: none;
        }
    }

    @container (max-width: 27.5rem) {
        .with-views.with-session .label {
            display: none;
        }
    }

    @container (max-width: 31rem) {
        .with-views.with-session.with-far-end .label {
            display: none;
        }
    }

    /* in one tray across the bar every button has an equal share, so the widest word decides:
       Disassemble's needs 8.7rem a button, a Debug session's 5.5rem */
    @container (max-width: 27rem) {
        .fill.with-views:not(.switch-only) .view .label {
            display: none;
        }
    }

    @container (max-width: 36rem) {
        .fill.with-views.with-far-end .view .label {
            display: none;
        }
    }

    @container (max-width: 34rem) {
        .fill.with-views.with-session .label {
            display: none;
        }
    }

    @container (max-width: 39.5rem) {
        .fill.with-views.with-session.with-far-end .label {
            display: none;
        }
    }

    @container (max-width: 14rem) {
        .with-views .label {
            display: none;
        }
    }

    /* and one across a phone's pane, a share for each */
    @container (max-width: 18rem) {
        .fill.switch-only .label {
            display: none;
        }
    }

    /* An Executable's switch has a third button, Decompile, 7.77rem with its word and 2.45rem
       bare, so the same steps come later. Measured beside it: Build and the three views 28.31rem,
       14.47rem with the views bare; a Debug session's four and the views 44.17rem, 30.32rem with
       the views bare; Test's tray 5.51rem, 3.06rem bare, after a 0.4rem gap; the switch alone
       22.16rem */
    @container (max-width: 32rem) {
        .with-wide-views:not(.switch-only) .view .label {
            display: none;
        }
    }

    @container (max-width: 38rem) {
        .with-wide-views.with-far-end .view .label {
            display: none;
        }
    }

    @container (max-width: 23.5rem) {
        .with-wide-views.with-far-end .end .label {
            display: none;
        }
    }

    @container (max-width: 45rem) {
        .with-wide-views.with-session .view .label {
            display: none;
        }
    }

    @container (max-width: 51rem) {
        .with-wide-views.with-session.with-far-end .view .label {
            display: none;
        }
    }

    @container (max-width: 36.5rem) {
        .with-wide-views.with-session.with-far-end .end .label {
            display: none;
        }
    }

    @container (max-width: 30.5rem) {
        .with-wide-views.with-session .label {
            display: none;
        }
    }

    @container (max-width: 34rem) {
        .with-wide-views.with-session.with-far-end .label {
            display: none;
        }
    }

    /* in one tray across the bar, one more equal share: 8.7rem for Disassemble's word, 5.5rem in
       a Debug session */
    @container (max-width: 36rem) {
        .fill.with-wide-views:not(.switch-only) .view .label {
            display: none;
        }
    }

    @container (max-width: 45rem) {
        .fill.with-wide-views.with-far-end .view .label {
            display: none;
        }
    }

    @container (max-width: 39.5rem) {
        .fill.with-wide-views.with-session .label {
            display: none;
        }
    }

    @container (max-width: 45rem) {
        .fill.with-wide-views.with-session.with-far-end .label {
            display: none;
        }
    }

    @container (max-width: 22.5rem) {
        .with-wide-views .label {
            display: none;
        }
    }

    @container (max-width: 27rem) {
        .fill.switch-only.with-wide-views .label {
            display: none;
        }
    }

    @container (max-width: 12rem) {
        .label {
            display: none;
        }
    }
</style>
