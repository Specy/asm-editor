<script lang="ts" module>
    import type { Component } from 'svelte'

    /** A control of the caller's own at the far end of the dock, beside Test. */
    export interface DockAction {
        label: string
        title: string
        icon: Component
        /**
         * A colour that says how the thing it opens went, such as failing Testcases in the danger
         * colour.
         */
        tone?: 'danger' | 'success'
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
        /** In place of Build's wrench, for a button that does something else: Reload. */
        icon?: Component
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
    /**
     * How the dock draws Step over and Step out, when its host offers them: `normal` as two parts
     * of the Step button, `dropdown` in a menu opened from an arrow beside Step, `none` not at all.
     */
    export type DockStepButtons = 'normal' | 'dropdown' | 'none'

    /**
     * The keys of Step, Step over and Step out, in the shortcut store's form (`ShiftLeft+ArrowRight`),
     * for their tooltips and the menu. A host passes those that work in it.
     */
    export interface DockStepShortcuts {
        step?: string
        over?: string
        out?: string
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
     * shows a File in more than one way. Run turns into Pause while the program runs, and into
     * Restart once it has ended, when the host offers one. It only draws the
     * controls and says which was pressed; what a press does, and when the program counts as built,
     * is the host's: the Workbench's `ExecutionControls` and the documentation's Playground. It is a
     * bar with nothing of its own to draw, laid over the bottom of an editor or stuck under it,
     * whose clicks between the two ends reach what is under it. With `fill`, the compact layouts',
     * one tray spans the bar and the buttons share its width.
     */
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import SegmentedControl from '#cmp/shared/input/SegmentedControl.svelte'
    import { tooltip, type TooltipContent } from '#cmp/shared/floating/tooltip.svelte.ts'
    import FaPlay from '~icons/fa-solid/play'
    import FaPause from '~icons/fa-solid/pause'
    import FaWrench from '~icons/fa-solid/wrench'
    import FaStepForward from '~icons/fa-solid/step-forward'
    import FaShare from '~icons/fa-solid/share'
    import FaLevelUpAlt from '~icons/fa-solid/level-up-alt'
    import FaAngleDown from '~icons/fa-solid/angle-down'
    import ContextMenu, { type ContextMenuEntry } from '#cmp/shared/menu/ContextMenu.svelte'
    import type { Box } from '#cmp/shared/floating/floating.ts'
    import FaClock from '~icons/fa-solid/clock'
    import FaStop from '~icons/fa-solid/stop'
    import FaFastBackward from '~icons/fa-solid/fast-backward'
    import FaUndo from '~icons/fa-solid/undo'
    import FaFlask from '~icons/fa-solid/flask'
    import FaCode from '~icons/fa-solid/code'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
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
        /** The program has ended: Restart takes Run's place, when there is `onRestart`. */
        ended?: boolean
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
        /** Back to the program's start, as a new Build of it would leave it. */
        onRestart?: () => void
        onPause: () => void
        onUndo: () => void
        onStep: () => void
        /**
         * Step over and Step out, drawn with Step when the host offers them, as `stepButtons` says
         * ([stepping-plan.md](../../../../../../docs/design/stepping-plan.md)).
         */
        onStepOver?: () => void
        onStepOut?: () => void
        /** Whether there is a routine for Step out to leave. */
        canStepOut?: boolean
        /** How Step over and Step out are drawn: as parts of the Step button when left out. */
        stepButtons?: DockStepButtons
        stepShortcuts?: DockStepShortcuts
        onTest?: () => void
        /**
         * The dock as a picture, for a backdrop nothing can point at (the home page's): the same
         * buttons, words and states, without their Tooltips.
         */
        decorative?: boolean
    }

    let {
        debugging,
        building,
        running,
        buildDisabled,
        executionDisabled,
        ended = false,
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
        onRestart,
        onPause,
        onUndo,
        onStep,
        onStepOver,
        onStepOut,
        canStepOut = false,
        stepButtons = 'normal',
        stepShortcuts = {},
        onTest,
        decorative = false
    }: Props = $props()

    /** A control's Tooltip, with its key when it has one, which a decorative dock leaves out. */
    const tip = (content: TooltipContent, shortcut?: string) =>
        !decorative && tooltip(content, { shortcut })

    const hasEnd = $derived(showExecution && (hasTests || actions.length > 0 || !!sound))
    /** Whether anything precedes the view switch in its tray, which a divider then sets apart. */
    const beforeViews = $derived(
        debugging ? showExecution : (showExecution && !compileOnly) || !!compilation
    )
    /** Whether the dock holds the view switch and nothing else, as a pane's beside the controls. */
    const switchOnly = $derived(!!views && !beforeViews && !hasEnd)
    const progress = $derived(building ? buildProgress : undefined)
    const stepDisabled = $derived(executionDisabled || running || building)
    /** Whether Step has Step over or Step out with it, as parts or behind its arrow. */
    const moreSteps = $derived(stepButtons !== 'none' && (!!onStepOver || !!onStepOut))
    /**
     * The buttons Step is drawn as, joined in one: Step and each of Step over and Step out, or
     * Step and its arrow; a share each in one tray across a phone's pane, the arrow's counted out.
     */
    const stepParts = $derived(
        !moreSteps || stepButtons === 'dropdown'
            ? 1
            : 1 + (onStepOver ? 1 : 0) + (onStepOut ? 1 : 0)
    )

    /** The arrow's box while the Step menu is open, which the menu opens beside. */
    let stepMenuAt = $state<Box | null>(null)
    let stepMenuButton = $state<HTMLElement>()
    function toggleStepMenu(event: MouseEvent) {
        if (stepMenuAt) {
            stepMenuAt = null
            return
        }
        const { left, top, width, height } = (
            event.currentTarget as HTMLElement
        ).getBoundingClientRect()
        stepMenuAt = { left, top, width, height }
    }
    //a menu left open as the Debug session ends would open again with the next one
    $effect(() => {
        if (!debugging || !showExecution || !moreSteps) stepMenuAt = null
    })
    /** The menu behind Step's arrow: Step first, in its accent, then the others the host offers. */
    const stepMenu = $derived<ContextMenuEntry[]>([
        {
            label: 'Step',
            icon: FaStepForward,
            accent: true,
            disabled: stepDisabled,
            shortcut: stepShortcuts.step,
            onSelect: onStep
        },
        ...(onStepOver
            ? [
                  {
                      label: 'Step over',
                      icon: FaShare,
                      disabled: stepDisabled,
                      shortcut: stepShortcuts.over,
                      onSelect: onStepOver
                  }
              ]
            : []),
        ...(onStepOut
            ? [
                  {
                      label: 'Step out',
                      icon: FaLevelUpAlt,
                      disabled: stepDisabled || !canStepOut,
                      shortcut: stepShortcuts.out,
                      onSelect: onStepOut
                  }
              ]
            : [])
    ])

    /** The program has ended and the host offers Restart, which takes Run's place. */
    const restartable = $derived(ended && !running && !!onRestart)
    /**
     * What the button in Run's place is for now. It holds each of its faces, the ones not shown
     * keeping their room, so it is as wide as the widest and Undo and Step do not move as it turns
     * from Run to Pause to Restart.
     */
    const runFace = $derived(restartable ? 'Restart' : running ? 'Pause' : 'Run')
    const runFaces = $derived([
        { word: 'Run', icon: FaPlay },
        { word: 'Pause', icon: FaPause },
        ...(onRestart ? [{ word: 'Restart', icon: FaFastBackward }] : [])
    ])

    /**
     * Hides labels while the dock is too narrow for them and only then, after the widths below have
     * taken away what they foresee: first it draws every button with less padding, as the widths
     * below do, then takes the words of Step's over and out parts, leaving their icons, then the
     * caller's actions' labels, whose words no width can know in advance, then the rest of the
     * far end's, then the room Run keeps for its other faces, then every one, Step's with the
     * others. A button without its label is still named by its tooltip and to a screen reader.
     * Where even bare buttons do not fit, a phone's narrowest, their padding goes next, by how much
     * each matters: Stop, Undo and the far end's buttons (`minor`) narrow first, then Run and Step
     * with them, then the minor ones again, and last all of them. It measures on every change of
     * the dock's size and of what it holds, all at once, so a cut label is never drawn and then
     * put right. The steps taken so far are a list in an attribute, `[data-squeeze~=…]` matching
     * each from the step that takes it on, rather than classes, which Svelte would write over with
     * the class directives.
     */
    const SQUEEZE_STEPS = [
        'tight',
        'steps',
        'actions',
        'end',
        'run',
        'all',
        'minor',
        'snug',
        'minor-bare',
        'bare'
    ]

    function fitLabels(dock: HTMLElement) {
        //jsdom lays nothing out, so there is nothing to measure
        if (typeof ResizeObserver === 'undefined') return
        const fit = () => {
            delete dock.dataset.squeeze
            const taken: string[] = []
            for (const step of SQUEEZE_STEPS) {
                if (dock.scrollWidth <= dock.clientWidth) return
                taken.push(step)
                dock.dataset.squeeze = taken.join(' ')
            }
        }
        const resizes = new ResizeObserver(fit)
        resizes.observe(dock)
        //buttons come and go and labels change their words while the dock keeps its size; the
        //attribute it writes is no change of these, so measuring does not set it off again
        const changes = new MutationObserver(fit)
        changes.observe(dock, { childList: true, subtree: true, characterData: true })
        return () => {
            resizes.disconnect()
            changes.disconnect()
        }
    }
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
    {@attach fitLabels}
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
                    {@attach tip(progress?.phase ?? buildButton.title)}
                    aria-label={buildButton.label}
                    aria-busy={building}
                >
                    <Icon size="body">
                        {#if progress}
                            <Spinner />
                        {:else if building}
                            <FaClock />
                        {:else if buildButton.icon}
                            <buildButton.icon />
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
                        {@attach tip('Stop building and go back to editing')}
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
                    {@attach tip(
                        compilation.warning ??
                            'Compile the source and the Files it includes with Compiler Explorer'
                    )}
                    onclick={compilation.onCompile}
                >
                    <Icon size="small">
                        {#if compilation.busy}
                            <Spinner />
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
                        {@attach tip('Compiler optimization')}
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
                        {@attach tip('Source compiler')}
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
                        {@attach tip('Cancel source compilation')}
                        aria-label="Cancel source compilation"
                        onclick={compilation.onCancel}>Cancel</button
                    >
                {/if}
            {/if}
        {:else if showExecution}
            <!-- the narrow layouts drop the words, so each button is also named -->
            <button
                type="button"
                class="tool minor"
                onclick={onStop}
                {@attach tip('End the Debug session')}
                aria-label="Stop"
            >
                <Icon size="small">
                    <FaStop />
                </Icon>
                <span class="label">Stop</span>
            </button>
            <!-- Restart is plain, not the accent: once the program has ended it is one choice
                 beside Undo -->
            <button
                type="button"
                class="tool run"
                class:primary={!restartable}
                onclick={() => (restartable ? onRestart?.() : running ? onPause() : onRun())}
                disabled={restartable ? buildDisabled || building : executionDisabled || building}
                {@attach tip(
                    restartable
                        ? 'Reset the program to the start'
                        : running
                          ? 'Pause the program'
                          : 'Run to the end or the next breakpoint'
                )}
                aria-label={runFace}
            >
                {#each runFaces as face (face.word)}
                    <span
                        class="run-face"
                        class:reserved={face.word !== runFace}
                        aria-hidden={face.word !== runFace}
                    >
                        <Icon size="small">
                            <face.icon />
                        </Icon>
                        <span class="label">{face.word}</span>
                    </span>
                {/each}
            </button>
            <span class="divider" aria-hidden="true"></span>
            <button
                type="button"
                class="tool minor"
                disabled={undoDisabled || running || !canUndo}
                onclick={onUndo}
                {@attach tip('Undo the last step')}
                aria-label="Undo"
            >
                <Icon size="small">
                    <FaUndo />
                </Icon>
                <span class="label">Undo</span>
            </button>
            <!-- Step, Step over and Step out as one button in parts, read "Step | over | out", or
                 Step and an arrow that opens a menu of the three. Step alone, for a host that offers
                 neither of the others, is a tool as Undo is -->
            <div
                class="steps"
                class:joined={moreSteps}
                style:--parts={stepParts}
                role={moreSteps ? 'group' : undefined}
                aria-label={moreSteps ? 'Step' : undefined}
            >
                <button
                    type="button"
                    class="tool emphasis"
                    disabled={stepDisabled}
                    onclick={onStep}
                    {@attach tip('Run one instruction', stepShortcuts.step)}
                    aria-label="Step"
                >
                    <Icon size="small">
                        <FaStepForward />
                    </Icon>
                    <span class="label">Step</span>
                </button>
                {#if moreSteps && stepButtons === 'normal'}
                    {#if onStepOver}
                        <button
                            type="button"
                            class="tool"
                            disabled={stepDisabled}
                            onclick={onStepOver}
                            {@attach tip(
                                'Run this line and any subroutine it calls',
                                stepShortcuts.over
                            )}
                            aria-label="Step over"
                        >
                            <Icon size="small">
                                <FaShare />
                            </Icon>
                            <span class="label">over</span>
                        </button>
                    {/if}
                    {#if onStepOut}
                        <button
                            type="button"
                            class="tool"
                            disabled={stepDisabled || !canStepOut}
                            onclick={onStepOut}
                            {@attach tip(
                                'Run the rest of this subroutine and stop in the code that called it',
                                stepShortcuts.out
                            )}
                            aria-label="Step out"
                        >
                            <Icon size="small">
                                <FaLevelUpAlt />
                            </Icon>
                            <span class="label">out</span>
                        </button>
                    {/if}
                {:else if moreSteps}
                    <!-- kept pressable while the menu is open, which it closes -->
                    <button
                        type="button"
                        class="tool more"
                        disabled={stepDisabled && !stepMenuAt}
                        onclick={toggleStepMenu}
                        bind:this={stepMenuButton}
                        {@attach tip('Show Step over and Step out')}
                        aria-label="More ways to step"
                        aria-haspopup="menu"
                        aria-expanded={!!stepMenuAt}
                    >
                        <Icon size="small">
                            <FaAngleDown />
                        </Icon>
                    </button>
                {/if}
            </div>
            {#if stepMenuAt && !decorative}
                <!-- open while its Steps are pressed, so a run of them takes one opening -->
                <ContextMenu
                    anchor={stepMenuAt}
                    side="top"
                    items={stepMenu}
                    label="Ways to step"
                    arrow
                    keepOpen
                    trigger={() => stepMenuButton}
                    onClose={() => (stepMenuAt = null)}
                />
            {/if}
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
                                <Icon size="small">
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
                    class="tool sound minor"
                    class:playing={sound.playing && !sound.muted}
                    onclick={sound.onToggle}
                    aria-pressed={!sound.muted}
                    {@attach tip(
                        sound.loading
                            ? 'Loading sounds…'
                            : sound.muted
                              ? 'Turn sound on'
                              : 'Turn sound off'
                    )}
                    aria-label="Sound"
                >
                    <Icon size="small">
                        {#if sound.loading}
                            <Spinner />
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
                    class="tool minor"
                    onclick={() => onTest?.()}
                    disabled={buildDisabled || building || running}
                    {@attach tip(
                        debugging
                            ? 'End the Debug session and run the Testcases'
                            : 'Run the Testcases'
                    )}
                    aria-label="Test"
                >
                    <Icon size="small">
                        <FaFlask />
                    </Icon>
                    <span class="label">Test</span>
                </button>
            {/if}
            {#each actions as action (action.label)}
                <button
                    type="button"
                    class="tool action minor {action.tone ?? ''}"
                    onclick={action.onClick}
                    {@attach tip(action.title)}
                    aria-label={action.label}
                >
                    <Icon size="small">
                        <action.icon />
                    </Icon>
                    <span class="label">{action.label}</span>
                </button>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    @use '../../shared/button/tray.scss';
    @use '../../../styles/radius.scss' as *;

    /* the two ends of a bar over what it sits on: the empty middle lets the clicks through */
    .execution-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
        pointer-events: none;
        container-type: inline-size;
        /* the tray's colour, which a disabled control sinks into: the code's darker shade, which
           it floats over */
        --tray: var(--primary);
    }

    /* each end one opaque tray lifted off the code by a shadow, its buttons sunk into it: the one
       action that moves the program on filled, the rest only their label */
    .toolbar {
        @include tray.frame;
        display: flex;
        align-items: center;
        gap: 0.2rem;
        height: var(--wb-control-height, 2.6rem);
        padding: 0.25rem;
        background-color: var(--tray);
        pointer-events: auto;
    }

    .divider {
        flex: none;
        align-self: center;
        width: 1px;
        height: 60%;
        margin: 0 0.2rem;
        background-color: var(--line);
    }

    .fill-only {
        display: none;
    }

    .tool {
        user-select: none;
        @include tray.tool(0.8rem, 0.95rem);
    }

    /* sunk into the tray, in its own colours rather than see-through as other tools are */
    .tool:disabled {
        opacity: 1;
        color: color-mix(in srgb, var(--primary-text) 35%, var(--tray));
        cursor: not-allowed;
    }

    /* a tool in a colour of its own gives it to its icon and label, and keeps the tray's text for
       its hover (tray.tool-look) */
    .emphasis:not(:disabled) > :global(*) {
        color: var(--accent);
    }

    .danger > :global(*) {
        color: var(--danger);
    }

    .sound.playing > :global(*) {
        color: var(--accent);
    }

    .success > :global(*) {
        color: var(--success);
    }

    .primary {
        @include tray.primary(null);
    }

    /* sunk into the tray rather than see-through, as everything in it */
    .primary:disabled {
        background-color: color-mix(in srgb, var(--accent) 30%, var(--tray));
        color: color-mix(in srgb, var(--accent-text) 50%, var(--tray));
    }

    .label {
        margin-left: 0.45rem;
    }

    /* the padding `fitLabels` takes away first, at every one of its steps, as the dock is
       measured too narrow for what it holds: the narrow widths' (below) */
    .execution-controls:global([data-squeeze]) .tool {
        padding: 0 0.6rem;
    }

    /* Step's arrow, already narrower, kept so */
    .execution-controls:global([data-squeeze]) .steps > .more {
        padding: 0 0.5rem;
    }

    /* the labels `fitLabels` takes away, as the dock is measured too narrow for them, and before
       the last of them the room Run keeps for its other faces; each from the step that takes it
       on, which stays in the list as the next steps are taken */
    .execution-controls:global([data-squeeze~='steps']) .steps .tool + .tool .label,
    .execution-controls:global([data-squeeze~='actions']) .action .label,
    .execution-controls:global([data-squeeze~='end']) .end .label,
    .execution-controls:global([data-squeeze~='run']) .run-face.reserved,
    .execution-controls:global([data-squeeze~='all']) .label {
        display: none;
    }

    /* and then the padding of bare buttons, the minor ones before the others: Stop, Undo and the
       far end's give way first, Run and Step last */
    .execution-controls:global([data-squeeze~='minor']) .minor,
    .execution-controls:global([data-squeeze~='snug']) .tool,
    .execution-controls:global([data-squeeze~='snug']) .steps > .more {
        padding: 0 0.35rem;
    }

    .execution-controls:global([data-squeeze~='minor-bare']) .minor,
    .execution-controls:global([data-squeeze~='bare']) .tool,
    .execution-controls:global([data-squeeze~='bare']) .steps > .more {
        padding: 0 0.15rem;
    }

    /* Step, Step over and Step out as one button in parts, "Step | over | out": one edge round
       the three and a rule between each, every part its own hover. Step alone is a tool among the
       others, its group no box at all */
    .steps {
        display: contents;
    }

    .steps.joined {
        display: flex;
        align-items: stretch;
        height: 100%;
        border: 1px solid var(--line);
        border-radius: var(--r-control);

        > .tool {
            border-radius: 0;
        }

        > .tool + .tool {
            border-left: 1px solid var(--line);
        }

        > .tool:first-child {
            border-top-left-radius: nested-radius(var(--r-control), $border: 1px);
            border-bottom-left-radius: nested-radius(var(--r-control), $border: 1px);
        }

        > .tool:last-child {
            border-top-right-radius: nested-radius(var(--r-control), $border: 1px);
            border-bottom-right-radius: nested-radius(var(--r-control), $border: 1px);
        }
    }

    /* the arrow that opens the Step menu, narrower than a button with a word */
    .steps > .more {
        padding: 0 0.5rem;
    }

    /* Run, Pause and Restart in one place, the face shown centred in the room of the widest */
    .run {
        display: grid;
        place-items: center;
    }

    .run-face {
        grid-area: 1 / 1;
        display: flex;
        align-items: center;

        &.reserved {
            visibility: hidden;
        }
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
    }

    .optimization,
    .compiler {
        font-size: var(--fs-small);
        background: var(--tray);
    }

    .compile-warning {
        max-width: 17rem;
        padding: 0 0.45rem;
        color: var(--hint);
        font-size: 0.7rem;
        line-height: 1.2;
    }

    /* in the compact layouts one tray across the bar, every button an equal share of it, Test and
       the caller's actions with the others behind a divider */
    .fill {
        @include tray.frame;
        gap: 0.2rem;
        height: var(--wb-control-height, 2.6rem);
        padding: 0.25rem;
        background-color: var(--tray);
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

        /* a Debug session's buttons, Step's three parts among them, too many for every share to
           hold its words: none narrower than what it holds, so a bar too narrow for them all
           overflows, which `fitLabels` measures and drops the words for */
        &.debugging .tool {
            min-width: auto;
        }

        /* Step's parts one share each, as if they were apart, and its arrow as wide as it is; never
           narrower than its parts, which would spill out of its edge */
        .steps.joined {
            flex: var(--parts) 1 0;
        }

        .steps > .more {
            flex: none;
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
        border-top: 1px solid var(--line);
        border-radius: 0;
        backdrop-filter: blur(4px);
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
