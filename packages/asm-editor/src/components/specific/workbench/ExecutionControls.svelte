<script lang="ts">
    /**
     * The Workbench's execution dock: Build, and once built Stop, Run, Undo and Step, with Test at
     * the far end in both. Once the program has ended, Restart takes Run's place. The Workbench has
     * no mode switch, the Build becoming Stop in its place is what says a Debug session is on
     * ([the design record](../../../../../../docs/design/workbench.md)).
     * Build and Test act on the Program whose Entry file the pane shows, and select it; a pane
     * showing any other File, a C or C++ one included, has neither, only the session's controls
     * once one is on ([programs.md](../../../../../../docs/design/programs.md), decision 5). The
     * Testcases run on the same Emulator, so Test during a Debug session ends it first, and tests
     * the session's Program. Edge to edge in the bottom corners of the editor on a desktop and a
     * tablet, along its bottom edge on a phone. A pane showing a File in more than one way carries
     * the view switch, during a Debug session too
     * ([file-views.md](../../../../../../docs/design/file-views.md), decisions 4 and 8). While a
     * Build goes on, its run to `main` included, Build says what it waits for and offers Cancel
     * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 2): the session's controls come once it is done. For an Executable, which is loaded
     * rather than assembled, Build reads Debug (decision 10).
     */
    import ExecutionDock, {
        type DockBuildButton,
        type DockCompilation,
        type DockView,
        type DockStepButtons,
        type DockViews
    } from '#cmp/specific/project/ExecutionDock.svelte'
    import { shortcutsStore, ShortcutAction } from '#stores/shortcutsStore.ts'
    import { DockSoundState } from '#cmp/specific/project/dockSound.svelte.ts'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import type { FileView } from '#lib/fileViews.ts'
    import FaTh from '~icons/fa-solid/th'
    import FaListOl from '~icons/fa-solid/list-ol'
    import FaEye from '~icons/fa-solid/eye'
    import FaRedo from '~icons/fa-solid/redo'
    import FaPaintBrush from '~icons/fa-solid/paint-brush'
    import FaFileCode from '~icons/fa-solid/file-code'
    import FaAlignLeft from '~icons/fa-solid/align-left'
    import {
        isCompilationTarget,
        OPTIMIZATIONS,
        sourceLanguage,
        type Optimization,
        type SourceCompiler
    } from '#lib/sourceCompilation/records.ts'
    import { useWorkbench } from './workbenchContext'
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'

    interface Props {
        fill?: boolean
        attached?: boolean
        group?: EditorGroup
        execution?: boolean
        /** How the dock draws Step over and Step out: as parts of the Step button when left out. */
        stepButtons?: DockStepButtons
    }

    let {
        fill = false,
        attached = false,
        group,
        execution = true,
        stepButtons = 'normal'
    }: Props = $props()

    /** The keys the three Steps are bound to, which their tooltips and the Step menu show. */
    const stepShortcuts = $derived.by(() => {
        const keys = new Map([...$shortcutsStore].map(([key, shortcut]) => [shortcut.type, key]))
        return {
            step: keys.get(ShortcutAction.Step),
            over: keys.get(ShortcutAction.StepOver),
            out: keys.get(ShortcutAction.StepOut)
        }
    })

    /** The view switch's button for each view a File can be switched to. */
    const VIEW_BUTTONS: Partial<Record<FileView, Omit<DockView, 'id'>>> = {
        //a Markdown File's, beside its rendered Preview
        text: { label: 'Text', title: "Show the File's text", icon: FaAlignLeft },
        hex: { label: 'Hex', title: "Show the File's bytes in the Hex editor", icon: FaTh },
        listing: {
            label: 'Disassemble',
            title: 'Show the Executable as its Listing, an instruction a line',
            icon: FaListOl
        },
        pseudocode: {
            label: 'Decompile',
            title: "Show the Pseudocode of the function at the Listing's cursor, beside the Listing",
            icon: FaFileCode
        },
        preview: { label: 'Preview', title: 'Show the File as the browser shows it', icon: FaEye },
        pixels: {
            label: 'Pixels',
            title: 'Draw and edit pixels in this image',
            icon: FaPaintBrush
        }
    }

    /** The title of a view switch button whose view the other pane already shows. */
    const SHOWN_BESIDE: Record<'listing' | 'pseudocode', string> = {
        listing: 'The other pane already shows the Listing',
        pseudocode: 'The other pane already shows the Pseudocode'
    }

    /**
     * Build for a Program whose Entry file is an Executable, which nothing assembles: a Build
     * loads it and starts debugging it
     * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 10).
     */
    const DEBUG_BUTTON: DockBuildButton = {
        label: 'Debug',
        title: 'Load the program and start debugging it'
    }

    const { session } = useWorkbench()
    /**
     * Build, where the Core did not load: Reload, which is what brings it, since nothing builds
     * without it.
     */
    const RELOAD_BUTTON = $derived<DockBuildButton>({
        label: 'Reload',
        title: `The ${languageLabel(session.project.language)} emulator didn't load. Reload the page to try again.`,
        icon: FaRedo
    })
    const pane = $derived(group ?? session.controlsGroup)
    const source = $derived(!!sourceLanguage(pane.displayedPath))
    /**
     * The Program Build and Test act on: the one whose Entry the pane shows, which a C or C++ pane
     * leaves to its Compile; during a Debug session, Test's is the session's.
     */
    const program = $derived(
        session.debugSession
            ? session.emulator?.buildSources?.entry
            : source
              ? undefined
              : pane.displayedProgram
    )
    const loadsExecutable = $derived(
        program !== undefined && session.kindAt(program) === 'executable'
    )
    const compilation = $derived.by<DockCompilation | undefined>(() => {
        if (!source && !pane.recompilationNeeded) return undefined
        const supported = isCompilationTarget(session.project.language)
        const busy = session.compiling && session.compilingGroupId === pane.id
        return {
            label: busy ? 'Compiling…' : source ? 'Compile' : 'Recompile',
            disabled: pane.sourceCompileDisabled,
            busy,
            warning: supported
                ? undefined
                : `Source compilation is unavailable for ${session.project.language}.`,
            optimization:
                supported && source
                    ? {
                          value: pane.optimization,
                          levels: OPTIMIZATIONS,
                          onChange: (value) => {
                              pane.optimization = value as Optimization
                          }
                      }
                    : undefined,
            compiler:
                supported && source
                    ? {
                          value: pane.sourceCompiler,
                          //x86's translation to NASM is verified on GCC's output alone
                          options:
                              session.project.language === 'X86'
                                  ? [{ value: 'gcc', label: 'GCC' }]
                                  : [
                                        { value: 'clang', label: 'Clang' },
                                        { value: 'gcc', label: 'GCC' }
                                    ],
                          onChange: (value) => {
                              pane.sourceCompiler = value as SourceCompiler
                          }
                      }
                    : undefined,
            onCompile: () => void session.compileDisplayedSource(pane),
            onCancel: () => session.cancelSourceCompilation()
        }
    })

    const views = $derived.by<DockViews | undefined>(() => {
        const options = pane.viewSwitch.flatMap((view) => {
            const button = VIEW_BUTTONS[view]
            if (!button) return []
            //the Listing and the Pseudocode sit side by side: a pane does not switch to the one
            //the other pane already shows
            const beside =
                (view === 'listing' || view === 'pseudocode') &&
                pane.displayedView !== view &&
                session.shownBeside(pane, view)
            return [
                {
                    id: view,
                    ...button,
                    title: beside
                        ? SHOWN_BESIDE[view]
                        : view === 'hex' && pane.displayedKind === 'executable'
                          ? "Show the file's bytes in Hex. Changes made while debugging appear in the Memory view."
                          : button.title,
                    disabled: beside
                }
            ]
        })
        if (options.length < 2) return undefined
        return {
            options,
            value: pane.displayedView,
            //Decompile also opens the Listing beside the Pseudocode
            onChange: (view) =>
                view === 'pseudocode'
                    ? session.decompile(pane)
                    : pane.setView(pane.displayedPath, view as FileView)
        }
    })

    const sound = new DockSoundState(() => session.emulator?.audioActivity)

    function test() {
        //the session's Program, read before Stop forgets which it was
        const entry = program
        if (session.debugSession) session.stop()
        void session.test(entry, pane)
    }
</script>

<ExecutionDock
    {fill}
    {attached}
    roundedStart={session.groups.length > 1 && session.groups[0] !== pane}
    roundedEnd={session.groups.length > 1 && session.groups[0] === pane}
    {compilation}
    {views}
    compileOnly={!execution || source}
    showExecution={execution && (session.debugSession || program !== undefined)}
    debugging={session.debugSession && !session.building}
    building={session.building || session.testWaitingForCore}
    buildProgress={{
        phase: session.buildPhase,
        //a test run waiting for the Core ends as Stop ends it
        onCancel: () => (session.building ? session.cancelBuild() : session.stop())
    }}
    buildButton={session.coreStatus === 'failed'
        ? RELOAD_BUTTON
        : loadsExecutable
          ? DEBUG_BUTTON
          : undefined}
    running={session.running ||
        session.emulator?.stepWaiting === true ||
        session.emulator?.stepRunning === true}
    buildDisabled={session.coreStatus !== 'failed' && session.buildDisabledFor(program)}
    executionDisabled={session.executionDisabled}
    ended={session.emulator?.terminated ?? false}
    undoDisabled={session.undoDisabled}
    canUndo={session.emulator?.canUndo ?? false}
    sound={sound.value}
    hasTests={program !== undefined && !!session.project.program(program)?.testcases.length}
    onBuild={() =>
        session.coreStatus === 'failed' ? location.reload() : session.build(program, pane)}
    onStop={() => session.stop()}
    onRun={() => session.run()}
    onRestart={() => void session.restart()}
    onPause={() => session.pause()}
    onUndo={() => session.undo()}
    onStep={() => session.step()}
    onStepOver={() => session.stepOver()}
    onStepOut={() => session.stepOut()}
    canStepOut={session.emulator?.canStepOut === true}
    {stepButtons}
    {stepShortcuts}
    onTest={test}
/>
