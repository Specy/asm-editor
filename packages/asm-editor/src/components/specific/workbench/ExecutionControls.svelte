<script lang="ts">
    /**
     * The Workbench's execution dock: Build, and once built Stop, Run, Undo and Step, with Test at
     * the far end in both. The Workbench has no mode switch, the Build becoming Stop in its place is
     * what says a Debug session is on ([the design record](../../../../../../docs/design/workbench.md)).
     * The Testcases run on the same Emulator, so Test during a Debug session ends it first. Edge to
     * edge in the bottom corners of the editor on a desktop, along its bottom edge on a phone, and
     * stuck under it on a tablet. A pane showing a File in more than one way carries the view
     * switch, during a Debug session too ([file-views.md](../../../../../../docs/design/file-views.md),
     * decisions 4 and 8).
     */
    import ExecutionDock, {
        type DockCompilation,
        type DockView,
        type DockViews
    } from '#cmp/specific/project/ExecutionDock.svelte'
    import type { FileView } from '#lib/fileViews.ts'
    import FaTh from '~icons/fa-solid/th'
    import FaListOl from '~icons/fa-solid/list-ol'
    import FaEye from '~icons/fa-solid/eye'
    import FaFileCode from '~icons/fa-solid/file-code'
    import {
        isCompilationTarget,
        OPTIMIZATIONS,
        sourceLanguage,
        type Optimization,
        type SourceCompiler
    } from '#lib/sourceCompilation/records.ts'
    import { useWorkbench } from './workbenchContext'
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'
    import { editorFileKind } from '#lib/workbench/editorFileRouting.ts'

    interface Props {
        fill?: boolean
        attached?: boolean
        group?: EditorGroup
        execution?: boolean
        showCompilation?: boolean
        /** The pane's view switch: a tablet's shared bar leaves it to each pane's own dock. */
        showViews?: boolean
    }

    let {
        fill = false,
        attached = false,
        group,
        execution = true,
        showCompilation = true,
        showViews = true
    }: Props = $props()

    /** The view switch's button for each view a File can be switched to. */
    const VIEW_BUTTONS: Partial<Record<FileView, Omit<DockView, 'id'>>> = {
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
        preview: { label: 'Preview', title: 'Show the File as the browser shows it', icon: FaEye }
    }

    const { session } = useWorkbench()
    const emulator = session.emulator
    const pane = $derived(group ?? session.controlsGroup)
    const compilation = $derived.by<DockCompilation | undefined>(() => {
        if (!showCompilation) return undefined
        const source = !!sourceLanguage(pane.displayedPath)
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
        if (!showViews) return undefined
        const options = pane.viewSwitch.flatMap((view) => {
            const button = VIEW_BUTTONS[view]
            return button ? [{ id: view, ...button }] : []
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

    //an assembly File of the Project's own that Build would not start from
    const entryCandidate = $derived.by(() => {
        const path = pane.displayedPath
        const file = session.project.files[path]
        return (
            !!file &&
            path !== session.project.entry &&
            editorFileKind(path, file) === 'assembly' &&
            !pane.displayedLibraryMember &&
            !session.fileSystemLocked
        )
    })

    function test() {
        if (session.debugSession) session.stop()
        void session.test()
    }
</script>

<ExecutionDock
    {fill}
    {attached}
    roundedStart={session.groups.length > 1 && session.groups[0] !== pane}
    roundedEnd={session.groups.length > 1 && session.groups[0] === pane}
    {compilation}
    {views}
    compileOnly={!execution ||
        (!!sourceLanguage(pane.displayedPath) && session.groups.length === 1)}
    showExecution={execution}
    debugging={session.debugSession}
    building={session.building}
    running={session.running}
    buildDisabled={session.buildDisabled}
    executionDisabled={session.executionDisabled}
    undoDisabled={session.undoDisabled}
    canUndo={emulator.canUndo}
    hasTests={session.project.testcases.length > 0}
    buildLabel={pane.displayedPath && pane.displayedPath !== session.project.entry
        ? 'Build entry'
        : 'Build'}
    onBuild={() => session.build()}
    onSetEntry={entryCandidate ? () => session.setEntry(pane.displayedPath) : undefined}
    onStop={() => session.stop()}
    onRun={() => session.run()}
    onPause={() => session.pause()}
    onUndo={() => session.undo()}
    onStep={() => session.step()}
    onTest={test}
/>
