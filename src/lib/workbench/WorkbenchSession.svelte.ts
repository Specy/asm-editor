import { tick, untrack } from 'svelte'
import {
    compiledLanguages,
    resolveAssemblyProfile,
    resolveRuntimeLink,
    resolveX86Start
} from '$lib/sourceCompilation/assemblyProfile'
import { hasRuntimeLibrary, RUNTIME_NAMESPACE } from '$lib/runtimeAbi'
import {
    linksX86StartUnit,
    X86_START_UNIT_FILES,
    X86_START_UNIT_PATH
} from '$lib/languages/X86/x86StartUnit'
import {
    loadedRuntimeLibrary,
    loadedRuntimeSources,
    loadRuntimeSources,
    parseRuntimeSourcePath,
    runtimeSourcePath
} from '$lib/sourceRuntime/runtimeLibrary'
import {
    isEnvironmentHeaderPath,
    loadedEnvironmentHeader
} from '$lib/sourceRuntime/environmentLibrary'
import type { ProjectFile } from '$lib/projectFiles'
import type { Project, TestcaseResult } from '$lib/Project.svelte'
import type { Emulator } from '$lib/languages/Emulator'
import { CompilationFailedError } from '$lib/languages/BaseEmulator.svelte'
import {
    makeRegister,
    type Diagnostic,
    type RegisterPoke,
    type SourceBreakpoint
} from '$lib/languages/commonLanguageFeatures.svelte'
import { TESTCASE_INSTRUCTION_LIMIT } from '$lib/Config'
import { getM68kErrorMessage } from '$lib/languages/M68K/M68kUtils'
import {
    type ProjectSettingsDecisions,
    resolveProjectSettings,
    undoHistorySize
} from '$lib/projectSettings'
import { rewriteScreenDirective } from '$lib/languages/mars/screenDirective'
import {
    DEFAULT_PROJECT_DISPLAY,
    type MarsDisplayOrigin,
    marsDisplayEquals,
    normalizeMarsDisplay,
    type ProjectDisplay
} from '$lib/languages/mars/marsDisplay'
import type { BuildSources } from '$lib/projectFiles'
import {
    buildSource,
    isSameProjectSourceSelection,
    liveSource,
    selectProjectFile,
    type ProjectSourceSelection
} from '$lib/monaco/projectSourceSelection'
import { createProjectLanguageSessionId, projectSourceModelKey } from '$lib/languages/service/uri'
import { ProjectLanguageSession } from '$lib/languages/service/ProjectLanguageSession'
import type { ProjectAnalysisSnapshot } from '$lib/languages/service/protocol'
import { languageDiagnosticToDiagnostic } from '$lib/languages/service/diagnosticBridge'
import { registerProjectNavigation } from '$lib/languages/service/navigation'
import { zeroBasedLineToMonaco } from '$lib/languages/service/monacoConversions'
import { preferencesStore } from '$stores/preferencesStore.svelte'
import {
    modShortcutKey,
    ShortcutAction,
    shortcutRecording,
    shortcutsStore
} from '$stores/shortcutsStore'
import { toast } from '$stores/toastStore'
import { Prompt } from '$stores/promptStore.svelte'
import { compileProjectSource } from '$lib/sourceCompilation/compileProjectSource'
import { SourceCompilationError } from '$lib/sourceCompilation/compilerExplorer'
import {
    coreBreakpoints,
    currentSourceMaps,
    isSourceBreakpoint,
    mappedBreakpoints
} from '$lib/sourceCompilation/sourceBreakpoints'
import {
    colorSourceMap,
    sourceMapColorIndices,
    type SourceMapColoring
} from '$lib/sourceCompilation/sourceColoring'
import {
    assemblyLinesOf,
    sameLocations,
    sourceLocationsOf,
    type MappingSelection
} from '$lib/sourceCompilation/mappingSelection'
import {
    editorFileLanguage,
    type CompilationSourceMap,
    type SourceLocation
} from '$lib/sourceCompilation/records'
import { serializer } from '$lib/json'
import { createDebouncer } from '$lib/utils'
import { terminationSummary } from '$lib/languages/termination'
import { closeTab, initialTabs, openTab, renameTab, retainTabs, removeTab } from './fileTabs'
import {
    appendLog,
    buildEntry,
    exitEntry,
    testRunEntry,
    type LogDraft,
    type LogEntry
} from './workbenchLog'
import { EditorGroup } from './EditorGroup.svelte'
import { EditorModels } from './editorModels'
import { resolveMappingPair } from './mappingPair'
import { editorGroupForFile, editorFileKind } from './editorFileRouting'
import {
    EDITOR_FILE_DRAG_TYPE,
    readEditorFileDrag,
    writeEditorFileDrag,
    type EditorFileDrag
} from './editorFileDrag'

/** The tabs of the bottom panel. */
export type BottomTab = 'terminal' | 'log' | 'problems'

/**
 * What a host passes the session, as getters so that it stays reactive to the host's props
 * ([ADR 0024](../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)).
 */
export type WorkbenchSessionHost = {
    readonly readonly: boolean
    readonly canEditTestcases: boolean
    /** Called with `silent: true` by autosave, with `false` by the Save shortcut. */
    readonly onSave?: (options: { silent: boolean }) => void
    /** Every change to the Project, whether or not autosave saves it. */
    readonly onChange?: () => void
}

/** Panel toggles the keyboard shortcuts reach, which only the view knows how to open. */
export type WorkbenchSessionPanels = {
    toggleDocumentation?: () => void
    toggleSettings?: () => void
    /** Opens the Documentation panel with its search box focused (Ctrl+K). */
    searchDocumentation?: () => void
}

/**
 * The state and the actions of one Project being edited, built and debugged: everything the project
 * editor did between its props and its markup, so that one arrangement of panels or another can be
 * drawn over the same behaviour. Create it while a component initialises, so the effects it sets up
 * belong to that component, and call `mount` from its `onMount`.
 *
 * The source is always the Project's Files: a host with a single string makes a one-file Project
 * of it ([ADR 0024](../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)).
 */
export class WorkbenchSession {
    readonly project: Project
    readonly emulator: Emulator
    readonly host: WorkbenchSessionHost
    panels: WorkbenchSessionPanels = {}

    //The source being shown, and the version of it: the live Files or the Build snapshot
    groups = $state.raw<readonly EditorGroup[]>([])
    draggedFile = $state.raw<EditorFileDrag | undefined>()
    executionGroupId = $state('editor-1')
    editorRatio = $state(0.5)
    private nextGroupId = 1
    readonly models: EditorModels

    /**
     * A Runtime library member as the editor shows it, read-only: the one the running Build linked,
     * or else the one the live sources would link, once that library has loaded.
     */
    runtimeMemberFile(path: string): ProjectFile | undefined {
        const built = this.emulator.buildLibraryFiles?.[path]
        if (built) return built
        //x86 has no Runtime library yet, only the start unit its compiled programs link
        if (path === X86_START_UNIT_PATH && this.project.language === 'X86')
            return linksX86StartUnit(this.sourceInput) ? X86_START_UNIT_FILES[path] : undefined
        const source = parseRuntimeSourcePath(path)
        if (source) {
            //`<sim.h>`, which compiling for this Target loaded, or one of the library's C sources
            const text =
                source.kind === 'environment'
                    ? loadedEnvironmentHeader(this.project.language)
                    : loadedRuntimeSources(source.abi)?.[source.source]
            return text === undefined ? undefined : { encoding: 'plain', content: text }
        }
        const abi = this.sourceInput.runtimeAbi
        const content = abi
            ? loadedRuntimeLibrary(abi, this.project.language)?.members[path]
            : undefined
        return content === undefined ? undefined : { encoding: 'plain', content }
    }

    /** The ABI whose library a Runtime library path belongs to: the Build's, else the live one. */
    private runtimeAbiFor(path: string): string | undefined {
        const abi = /^@runtime\/(v\d+)\//.exec(path)?.[1]
        return abi ?? this.emulator.buildSources?.runtimeAbi ?? this.sourceInput.runtimeAbi
    }

    /**
     * Where a library member came from in the library's C source, as a Source map the mapped split
     * view reads like a Compilation's, or undefined when the member has none (startup code).
     */
    runtimeSourceMap(path: string): CompilationSourceMap | undefined {
        if (!path.startsWith(RUNTIME_NAMESPACE)) return undefined
        const abi = this.runtimeAbiFor(path)
        const library = abi ? loadedRuntimeLibrary(abi, this.project.language) : undefined
        const origin = library?.memberSources[path]
        if (!abi || !origin) return undefined
        const source = runtimeSourcePath(abi, origin.source)
        return {
            sourcePath: source,
            outputFingerprint: '',
            lines: origin.lines.map((line) => (line === null ? null : { path: source, line }))
        }
    }

    /** Opens a library member's C source beside it, so the two read as a mapped pair. */
    async showRuntimeSource(group: EditorGroup) {
        const map = this.runtimeSourceMap(group.displayedPath)
        const abi = this.runtimeAbiFor(group.displayedPath)
        if (!map || !abi) return
        await loadRuntimeSources(abi)
        const other = this.groups.find((candidate) => candidate !== group) ?? this.createGroup()
        this.show(liveSource(map.sourcePath), other)
    }

    groupForFile(path: string) {
        return editorGroupForFile(path, this.groups)
    }
    get executionGroup() {
        return (
            this.groups.find((group) => group.id === this.executionGroupId) ??
            this.groups[this.groups.length - 1]
        )
    }
    get controlsGroup() {
        const assembly = this.groups.filter(
            (group) => editorFileKind(group.displayedPath) === 'assembly'
        )
        return (
            assembly.find((group) => group.id === this.executionGroupId) ??
            assembly[assembly.length - 1] ??
            [...this.groups].reverse().find((group) => group.displayedPath) ??
            this.groups[this.groups.length - 1]
        )
    }
    buildGeneration = $state(0)
    private previousBuildSources = $state.raw<BuildSources | undefined>(undefined)
    fileSystemLocked = $state(false)

    //The live analysis of the Files by the language service, in a worker
    readonly languageSessionId = createProjectLanguageSessionId()
    private languageSession = $state.raw<ProjectLanguageSession>()
    languageAnalysis = $state.raw<ProjectAnalysisSnapshot>()
    liveLanguageDiagnostics = $state.raw<Diagnostic[]>([])
    languageAnalysisPending = $state(false)
    analysisSpinnerVisible = $state(false)

    running = $state(false)
    building = $state(false)
    compiling = $state(false)
    compilingGroupId = $state<string | undefined>()
    sourceDiagnostics = $state.raw<Diagnostic[]>([])
    /**
     * What the last Build reported when it failed, and the sources it built. Live checking cannot
     * see everything a Build can, such as a symbol two x86 Files define, and a failed Build leaves
     * no snapshot to show them in, so the live view adds them for as long as the sources are those.
     */
    private failedBuild = $state.raw<{ sources: BuildSources; diagnostics: Diagnostic[] }>()
    mappingSelection = $state.raw<MappingSelection | undefined>()
    private compilationController: AbortController | undefined
    /**
     * A test run is in flight: the Emulator builds and runs every Testcase, and none of those is a
     * program exit or a Build of the person's own. Not reactive: the effects that ask read it at the
     * moment they run.
     */
    testing = false
    testcasesResult = $state<TestcaseResult[]>([])

    /** Whether the display on screen came from the program's own `@screen` comment, see `syncDisplay`. */
    displayOrigin = $state<MarsDisplayOrigin>('user')
    displayBaseLabel = $state<string | undefined>(undefined)

    log = $state.raw<LogEntry[]>([])
    private logId = 0
    bottomTab = $state<BottomTab>('terminal')

    readonly pc

    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Imperative window callbacks consume this accumulator; it has no tracked consumer.
    private readonly pressedKeys = new Map<string, boolean>()
    private readonly debouncedFileSave = createDebouncer(250)[0]
    private knownTestcases: string | undefined

    constructor(project: Project, emulator: Emulator, host: WorkbenchSessionHost) {
        this.project = project
        this.emulator = emulator
        this.host = host
        const start = project.entry ?? Object.keys(project.files)[0] ?? ''
        this.groups = [new EditorGroup(this, 'editor-1', start)]
        this.models = new EditorModels((path, value) => this.fileEdited(path, value))
        this.effectiveSettings = $derived(
            resolveProjectSettings(this.project.language, this.project.settings)
        )
        this.sourceInput = $derived.by<BuildSources>(() => {
            const sources = {
                files: $state.snapshot(this.project.files),
                compiledLanguages: compiledLanguages(
                    { files: this.project.files, entry: this.project.entry },
                    this.project.compilations
                ),
                entry: this.project.entry
            }
            const x86 = this.project.language === 'X86'
            if (!hasRuntimeLibrary(this.project.language) && !x86) return sources
            try {
                //x86 has no Runtime library yet: compiled code links the editor's start unit
                if (x86)
                    return { ...sources, ...resolveX86Start(sources, this.project.compilations) }
                return {
                    ...sources,
                    //the profile Setting chooses between RISC-V dialects; MIPS has only MARS's own
                    //and the GNU compiler profile its Generated assembly requires
                    assemblerProfile: resolveAssemblyProfile(
                        sources,
                        this.project.compilations,
                        this.project.language === 'MIPS' ? undefined : this.project.settings
                    ),
                    ...resolveRuntimeLink(
                        sources,
                        this.project.compilations,
                        this.project.settings?.linkRuntimeLibrary
                    )
                }
            } catch (error) {
                return {
                    ...sources,
                    assemblyError: error instanceof Error ? error.message : String(error)
                }
            }
        })
        this.displayedPath = $derived(this.groups[0].displayedPath)
        this.sourceView = $derived<'snapshot' | 'live'>(this.groups[0].sourceView)
        this.debugSession = $derived(this.emulator.canExecute)
        this.mappingPair = $derived(
            resolveMappingPair(
                this.groups,
                this.project.sourceMaps,
                this.project.compilations,
                this.project.files,
                this.project.language,
                (path) => this.runtimeSourceMap(path)
            )
        )
        this.mappingColors = $derived.by<SourceMapColoring | undefined>(() => {
            const map = this.mappingPair?.map
            return map ? colorSourceMap(map) : undefined
        })
        this.retainedModelKeys = $derived.by(() => {
            const liveKeys = Object.keys(this.project.files).map((path) =>
                projectSourceModelKey({
                    sessionId: this.languageSessionId,
                    sourceKind: 'live',
                    path
                })
            )
            const buildKeys = Object.keys(this.emulator.buildSources?.files ?? {}).map((path) =>
                projectSourceModelKey({
                    sessionId: this.languageSessionId,
                    sourceKind: 'build',
                    buildGeneration: this.buildGeneration,
                    path
                })
            )
            return [...liveKeys, ...buildKeys]
        })
        this.liveViewDiagnostics = $derived.by(() => {
            const live = [...this.liveLanguageDiagnostics, ...this.sourceDiagnostics]
            //any change to what a Build builds makes what it said about the old sources stale
            const failed = this.failedBuild
            if (failed?.sources !== this.sourceInput) return live
            return [...live, ...buildOnlyDiagnostics(live, failed.diagnostics)]
        })
        this.activeDiagnostics = $derived(
            this.sourceView === 'live'
                ? this.liveViewDiagnostics
                : this.emulator.compilerDiagnostics
        )
        this.liveBuildHasErrors = $derived(
            this.languageAnalysis?.diagnostics.some(
                (diagnostic) =>
                    diagnostic.severity === 'error' &&
                    editorFileLanguage(diagnostic.location.path, this.project.language) ===
                        this.project.language
            ) ?? false
        )
        this.languageErrorCount = $derived(
            this.languageAnalysis?.diagnostics.filter(
                (diagnostic) =>
                    diagnostic.severity === 'error' &&
                    editorFileLanguage(diagnostic.location.path, this.project.language) ===
                        this.project.language
            ).length ?? 0
        )
        this.diagnosticCounts = $derived.by(() => {
            const counts: Record<string, { errors: number; warnings: number }> = Object.create(null)
            for (const diagnostic of this.activeDiagnostics) {
                if (!diagnostic.file) continue
                const count = (counts[diagnostic.file] ??= { errors: 0, warnings: 0 })
                if (diagnostic.severity === 'error') count.errors += 1
                else if (diagnostic.severity === 'warning') count.warnings += 1
            }
            return counts
        })
        this.worstSeverity = $derived.by<Diagnostic['severity'] | undefined>(() => {
            let worst: Diagnostic['severity'] | undefined
            for (const diagnostic of this.activeDiagnostics) {
                if (diagnostic.severity === 'error') return 'error'
                if (diagnostic.severity === 'warning') worst = 'warning'
                else worst ??= diagnostic.severity
            }
            return worst
        })
        this.configurableDisplay = $derived(this.emulator.setDisplay !== undefined)
        this.currentDisplay = $derived(
            normalizeMarsDisplay(this.project.display ?? DEFAULT_PROJECT_DISPLAY)
        )
        this.testcasesEditable = $derived(this.host.canEditTestcases && !this.host.readonly)
        this.pokeable = $derived(
            !this.host.readonly && !this.running && !this.building && this.emulator.canPoke
        )
        this.errorStrings = $derived(this.emulator.errors.join('\n'))
        //the Log's wording, without an error's message, which the Terminal tab shows itself
        this.runInfo = $derived(
            this.emulator.terminated
                ? terminationSummary(this.emulator.termination, this.emulator.executionTime, {
                      errorMessage: false
                  })
                : ''
        )
        this.executionDisabled = $derived(
            this.host.readonly || this.emulator.terminated || this.emulator.interrupt !== undefined
        )
        this.undoDisabled = $derived(this.host.readonly || this.emulator.interrupt !== undefined)
        this.buildDisabled = $derived(
            this.host.readonly || this.liveBuildHasErrors || this.compiling
        )
        //a Debug session runs the Build's Files, so its Breakpoints expand through the maps that
        //describe those rather than the live Files
        const breakpointSourceMaps = $derived(
            currentSourceMaps(
                this.project.sourceMaps,
                this.project.compilations,
                this.debugSession && this.emulator.buildSources
                    ? this.emulator.buildSources.files
                    : this.project.files,
                this.project.language
            )
        )
        this.mappedBreakpoints = $derived(
            //fingerprinting the Files is skipped while no Breakpoint is on a source File
            this.emulator.breakpoints.some((item) =>
                isSourceBreakpoint(item, this.project.language)
            )
                ? mappedBreakpoints(
                      this.emulator.breakpoints,
                      breakpointSourceMaps,
                      this.project.language
                  )
                : []
        )
        emulator.setBreakpointResolver((breakpoints) =>
            breakpoints.some((item) => isSourceBreakpoint(item, this.project.language))
                ? coreBreakpoints(breakpoints, breakpointSourceMaps, this.project.language)
                : [...breakpoints]
        )
        this.executionSourceLocation = $derived(
            this.mappingPair?.map.lines[this.mappingPair.assembly.instructionLine] ?? undefined
        )
        this.activeMappingColors = $derived.by(() => {
            const coloring = this.mappingColors
            const execution = this.executionSourceLocation
            if (!coloring) return undefined
            const colors = sourceMapColorIndices(
                coloring,
                this.mappingSelection ?? (execution ? [execution] : [])
            )
            //Nothing to emphasize leaves every section at its default strength.
            return colors.size ? colors : undefined
        })
        this.previousBuildSources = emulator.buildSources
        this.pc = makeRegister('PC', emulator.pc, emulator.systemSize)

        $effect(() => {
            const pageSize = preferencesStore.values.memoryPanelSize.value
            untrack(() => this.emulator.setGlobalMemorySize(pageSize, pageSize / 16))
        })

        let previousPairKey = ''
        let previousPairMap: CompilationSourceMap | undefined
        $effect(() => {
            const pair = this.mappingPair
            const key = pair
                ? `${pair.source.id}:${pair.source.displayedPath}:${pair.assembly.id}:${pair.assembly.displayedPath}`
                : ''
            if (key !== previousPairKey || pair?.map !== previousPairMap) {
                untrack(() => {
                    this.mappingSelection = undefined
                })
            }
            previousPairKey = key
            previousPairMap = pair?.map
        })
        $effect(() => {
            const map = this.mappingPair?.map
            const executionLocation = this.executionSourceLocation
            untrack(() => {
                //Keep the selected correspondence through Build's unmapped startup wrapper.
                //Execution takes over once an instruction has a source location.
                if (!map || executionLocation) this.mappingSelection = undefined
            })
        })

        $effect(() => {
            const keys = [...this.retainedModelKeys, ...this.groups.map((group) => group.modelKey)]
            const files = this.project.files
            untrack(() => {
                this.models.retain(keys)
                this.models.synchronize(files)
            })
        })

        //Testcases are edited in place, so a change is noticed by watching their content; the first
        //run only remembers what was loaded
        $effect(() => {
            const current = serializer.stringify($state.snapshot(this.project.testcases))
            if (this.knownTestcases !== undefined && current !== this.knownTestcases) {
                untrack(() => this.changed())
            }
            this.knownTestcases = current
        })

        $effect(() => {
            //`sourceInput` is read here, outside `untrack`, so the effect re-runs on every edit and
            //the Emulator's live semantic check sees the current text. Only the call is untracked, to
            //keep the state it writes from re-entering this effect.
            const sources = this.sourceInput
            untrack(() => this.emulator.setSources(sources))
        })

        $effect(() => {
            const session = this.languageSession
            const sources = this.sourceInput
            if (session) session.update(sources)
        })

        $effect(() => {
            const pending = this.languageAnalysisPending && this.sourceView === 'live'
            this.analysisSpinnerVisible = false
            if (!pending) return
            const timer = setTimeout(() => {
                this.analysisSpinnerVisible = true
            }, 500)
            return () => clearTimeout(timer)
        })

        $effect(() => {
            this.languageSession?.setBuild(this.buildGeneration, this.emulator.buildSources)
        })

        $effect(() => {
            this.synchronizeBuildGeneration(this.emulator.buildSources)
        })

        $effect(() => {
            const fileSystem = this.project.fileSystem
            this.fileSystemLocked = fileSystem.locked
            return fileSystem.subscribe((filesChanged) => {
                this.fileSystemLocked = fileSystem.locked
                if (filesChanged) this.debouncedFileSave(() => this.changed())
            })
        })

        $effect(() => {
            this.pc.setValue(this.emulator.pc)
            this.pc.setSize(this.emulator.systemSize)
        })

        //An input wait suspends Run or Step before its usual reveal. Show the waiting
        //instruction now, including when it is in another File, without taking focus.
        $effect(() => {
            if (this.emulator.interrupt && !this.testing) {
                untrack(() => this.revealCurrentInstruction())
            }
        })

        //each exit of the program goes in the Log with its running time and how it ended, whether
        //a Run, a Step or a runtime error ended it
        let wasTerminated = untrack(() => this.emulator.terminated)
        $effect(() => {
            const terminated = this.emulator.terminated && this.emulator.canExecute
            if (terminated && !wasTerminated && !this.testing) {
                untrack(() =>
                    this.appendLog(
                        exitEntry({
                            executionTimeMs: this.emulator.executionTime,
                            termination: this.emulator.termination
                        })
                    )
                )
            }
            wasTerminated = terminated
        })
    }

    // ---- derived state, assigned in the constructor once the Project and the Emulator are set

    // ---- derived state -------------------------------------------------------------------------
    /** The values a Build and a Test run with: the Project's decisions, the language's defaults elsewhere. */
    declare readonly effectiveSettings: ReturnType<typeof resolveProjectSettings>
    declare readonly sourceInput: BuildSources
    declare readonly displayedPath: string
    declare readonly sourceView: 'snapshot' | 'live'
    /** Whether a program is built and retained: from a successful Build until Stop. */
    declare readonly debugSession: boolean
    declare readonly mappingColors: SourceMapColoring | undefined
    declare readonly mappingPair: ReturnType<typeof resolveMappingPair<EditorGroup>>
    declare readonly executionSourceLocation: SourceLocation | undefined
    /**
     * The assembly lines that Breakpoints on C and C++ Files stand for: the first instruction of
     * each block of Generated assembly mapped to the line. The Core stops on these.
     */
    declare readonly mappedBreakpoints: SourceBreakpoint[]
    /** Palette indices of the selected or executing source lines, which the others dim around. */
    declare readonly activeMappingColors: ReadonlySet<number> | undefined
    declare readonly retainedModelKeys: string[]
    /** The live view's Diagnostics: live checking's, then Compile's, then a failed Build's own. */
    declare readonly liveViewDiagnostics: Diagnostic[]
    declare readonly activeDiagnostics: Diagnostic[]
    declare readonly liveBuildHasErrors: boolean
    declare readonly languageErrorCount: number
    declare readonly diagnosticCounts: Record<string, { errors: number; warnings: number }>
    /** The worst severity among the Diagnostics, for the colour of the Problems badge. */
    declare readonly worstSeverity: Diagnostic['severity'] | undefined
    //only MARS and RARS put the screen's geometry in the user's hands: every other environment's
    //program sizes its own screen, so there is nothing to configure
    declare readonly configurableDisplay: boolean
    declare readonly currentDisplay: ProjectDisplay
    declare readonly testcasesEditable: boolean
    //the page's half of the Poke availability rule ([the design record](../../../docs/design/pokes.md)):
    //a read-only Project takes no Pokes, and neither does one whose Core is building or running.
    //The Emulator owns the other half
    declare readonly pokeable: boolean
    /** The Emulator's runtime errors, which the Terminal tab shows before what the program wrote. */
    declare readonly errorStrings: string
    declare readonly runInfo: string
    declare readonly executionDisabled: boolean
    declare readonly undoDisabled: boolean
    declare readonly buildDisabled: boolean

    // ---- lifecycle -----------------------------------------------------------------------------

    /** Starts what needs the page: the language worker, cross-file navigation and the shortcuts. */
    mount(): () => void {
        const unregisterNavigation = registerProjectNavigation(
            this.languageSessionId,
            async (identity, selection, originatingEditor) => {
                const group =
                    this.groups.find((group) => group.editor === originatingEditor) ??
                    this.groupForFile(identity.path)
                if (identity.sourceKind === 'build') {
                    if (
                        identity.buildGeneration !== this.buildGeneration ||
                        !this.existsInBuild(identity.path)
                    ) {
                        return false
                    }
                    this.show(buildSource(identity.path, identity.buildGeneration), group)
                } else if (identity.path.startsWith(RUNTIME_NAMESPACE)) {
                    //a Runtime library member, opened read-only from go to definition
                    if (!this.runtimeMemberFile(identity.path)) return false
                    this.show(liveSource(identity.path), group)
                } else {
                    if (!this.project.files[identity.path]) return false
                    this.show(liveSource(identity.path), group)
                }
                await tick()
                if (selection) {
                    const lineNumber =
                        'lineNumber' in selection ? selection.lineNumber : selection.startLineNumber
                    const column = 'column' in selection ? selection.column : selection.startColumn
                    this.revealEditorLine(lineNumber, column, group)
                }
                return true
            }
        )
        const sources = untrack(() => this.sourceInput)
        const session = new ProjectLanguageSession(
            this.languageSessionId,
            sources,
            this.project.language
        )
        this.languageSession = session
        const unsubscribeLanguageSession = session.subscribe((snapshot, pending) => {
            // A pending revision deliberately retains the previous snapshot, so diagnostics and
            // their Monaco ranges remain stable until their replacements are ready.
            if (snapshot && !pending) {
                const current = untrack(() => this.sourceInput)
                this.languageAnalysis = snapshot
                this.liveLanguageDiagnostics = snapshot.diagnostics
                    .filter(
                        (diagnostic) =>
                            editorFileLanguage(diagnostic.location.path, this.project.language) ===
                            this.project.language
                    )
                    .map((diagnostic) => languageDiagnosticToDiagnostic(diagnostic, current))
            }
            this.languageAnalysisPending = pending
        })
        const keydown = (e: KeyboardEvent) => this.handleKeyDown(e)
        const commandKey = (e: KeyboardEvent) => this.handleCommandKey(e)
        const keyup = (e: KeyboardEvent) => {
            this.pressedKeys.delete(e.code)
            //macOS sends no keyup for a key released while ⌘ is held: let go of ⌘, let go of all
            if (e.key === 'Meta') this.pressedKeys.clear()
        }
        const blur = () => this.pressedKeys.clear()
        window.addEventListener('keydown', keydown)
        window.addEventListener('keydown', commandKey, { capture: true })
        window.addEventListener('keyup', keyup)
        window.addEventListener('blur', blur)
        return () => {
            window.removeEventListener('keydown', keydown)
            window.removeEventListener('keydown', commandKey, { capture: true })
            window.removeEventListener('keyup', keyup)
            window.removeEventListener('blur', blur)
            unsubscribeLanguageSession()
            unregisterNavigation()
            session.dispose()
            this.languageSession = undefined
            this.emulator.dispose()
            this.compilationController?.abort()
            this.models.dispose()
        }
    }

    // ---- saving --------------------------------------------------------------------------------

    /**
     * The one save rule (docs/design/project-format.md): a change to any part of the Project is
     * saved at once under autosave and otherwise waits for Save, when the prompt on leaving compares
     * the whole Project.
     */
    changed() {
        this.host.onChange?.()
        if (preferencesStore.values.autoSave.value) this.host.onSave?.({ silent: true })
    }

    save() {
        this.host.onSave?.({ silent: false })
    }

    /** Gives the Project a new name, which the Explorer shows at the root of its Files. */
    rename(name: string) {
        const next = name.trim()
        if (!next || next === this.project.name || this.host.readonly) return
        this.project.name = next
        this.changed()
    }

    // ---- Settings, Display configuration -------------------------------------------------------

    /** A decision or a reset from the panel; it takes effect at the next Build. */
    applySettings(next: ProjectSettingsDecisions) {
        this.project.settings = next
        const resolved = resolveProjectSettings(this.project.language, next)
        this.emulator.setScreenHistoryBudgetMb(resolved.screenHistoryBudgetMb)
        this.emulator.setFileSystemHistoryBudgetMb(resolved.fileSystemHistoryBudgetMb)
        this.changed()
    }

    /** Whether the Display configuration can change now: never during a Debug session. */
    get displayEditable() {
        return !this.fileSystemLocked && !this.host.readonly
    }

    applyDisplay(next: ProjectDisplay) {
        if (this.fileSystemLocked) {
            toast.warn('Stop execution before changing the display')
            return
        }
        //a program that states its display in a @screen comment gets that comment rewritten to say
        //what was chosen, so the code and the popover agree and the next Build reads it back; a
        //program without one keeps the choice in the Project alone
        const rewritten = rewriteScreenDirective(this.project.code, this.currentDisplay, next)
        const baseChanged = next.baseAddress !== this.currentDisplay.baseAddress
        if (rewritten !== null) this.project.code = rewritten
        this.project.display = next
        this.displayOrigin = rewritten !== null ? 'directive' : 'user'
        if (rewritten === null || baseChanged) this.displayBaseLabel = undefined
        //applied at once and with a re-sync from memory, as MARS does
        this.emulator.setDisplay?.(next)
        this.changed()
    }

    /**
     * A Build reads the program's `@screen` directive, so the emulator may have configured itself
     * from the source; the section and the saved project follow it. A program without a directive
     * leaves everything as the user set it.
     */
    private syncDisplay() {
        const configured = this.emulator.getDisplay?.()
        if (!configured) return
        this.displayOrigin = configured.origin
        this.displayBaseLabel = configured.baseLabel
        if (configured.origin !== 'directive') return
        if (marsDisplayEquals(this.currentDisplay, configured.display)) return
        this.project.display = configured.display
        this.changed()
    }

    // ---- Pokes ---------------------------------------------------------------------------------

    /**
     * One commit of a register chunk, which is one Poke. A value too wide for the register it was
     * typed into throws rather than being truncated, and this is the only place that says so: the
     * Emulator does not put it among its errors.
     */
    pokeRegisters(fileId: string, writes: RegisterPoke[]) {
        try {
            this.emulator.pokeRegisters(fileId, writes)
        } catch (e) {
            toast.error(getM68kErrorMessage(e))
        }
    }

    /**
     * One commit of a memory selection, which is one Poke however many bytes it covers. A value
     * that does not fit the selection never reaches here, the panel refuses it; what throws here is
     * the Emulator refusing the write itself.
     */
    pokeMemory(address: bigint, bytes: Uint8Array) {
        try {
            this.emulator.pokeMemory(address, bytes)
        } catch (e) {
            toast.error(getM68kErrorMessage(e))
        }
    }

    // ---- which File is shown -------------------------------------------------------------------

    /** Shows a version of a File, opening its tab. */
    private show(selection: ProjectSourceSelection, group = this.groupForFile(selection.path)) {
        const changedPath = group.displayedPath !== selection.path
        if (!isSameProjectSourceSelection(group.sourceSelection, selection)) {
            group.sourceSelection = selection
        }
        group.tabs = openTab(group.tabs, selection.path)
        if (changedPath) group.resetCompilationOptions()
    }

    /**
     * Opens the second pane. With a single tab it starts empty, since showing the same File twice
     * is rarely wanted; with several tabs the shown File moves over, leaving the rest behind.
     */
    splitEditor() {
        if (this.groups.length > 1) return this.groups[1]
        const origin = this.groups[0]
        const path = origin.displayedPath
        if (!path) return origin
        const other = this.createGroup()
        if (origin.tabs.paths.length > 1) void this.transferTab(path, origin, other)
        return other
    }

    startFileDrag(event: DragEvent, path: string, origin?: EditorGroup) {
        if (!event.dataTransfer || (!this.project.files[path] && !this.existsInBuild(path))) return
        const file = {
            sessionId: this.languageSessionId,
            path,
            ...(origin ? { groupId: origin.id } : {})
        }
        writeEditorFileDrag(event.dataTransfer, file)
        this.draggedFile = file
    }

    endFileDrag() {
        this.draggedFile = undefined
    }

    canDropFile(event: DragEvent) {
        return (
            !!this.draggedFile &&
            Array.from(event.dataTransfer?.types ?? []).includes(EDITOR_FILE_DRAG_TYPE)
        )
    }

    async dropFile(event: DragEvent, destination: EditorGroup) {
        if (!event.dataTransfer) return
        const file = readEditorFileDrag(event.dataTransfer, this.languageSessionId)
        this.endFileDrag()
        if (!file || !this.groups.includes(destination)) return
        if (file.groupId) {
            const origin = this.groups.find((group) => group.id === file.groupId)
            if (origin) await this.transferTab(file.path, origin, destination)
        } else if (this.project.files[file.path]) this.selectFile(file.path, destination)
    }

    /**
     * Whether the File being dragged can open a second pane: there is only one, and the File is
     * not that pane's last tab, which would leave it empty and closed rather than split.
     */
    canSplitWithDrop() {
        const file = this.draggedFile
        if (!file || this.groups.length > 1) return false
        if (!file.groupId) return !!this.project.files[file.path]
        return this.groups[0].tabs.paths.length > 1
    }

    /** Drops the dragged File into a new pane on the right of the only one. */
    async dropFileIntoSplit(event: DragEvent) {
        if (!event.dataTransfer || !this.canSplitWithDrop()) return this.endFileDrag()
        const file = readEditorFileDrag(event.dataTransfer, this.languageSessionId)
        this.endFileDrag()
        if (!file) return
        const origin = this.groups[0]
        const other = this.createGroup()
        if (file.groupId) await this.transferTab(file.path, origin, other)
        else this.selectFile(file.path, other)
    }

    async transferTab(path: string, origin: EditorGroup, destination: EditorGroup) {
        if (
            !this.groups.includes(origin) ||
            !this.groups.includes(destination) ||
            !origin.tabs.paths.includes(path)
        )
            return
        if (origin === destination) {
            this.activateTab(path, origin)
            return
        }
        const viewState = origin.displayedPath === path ? origin.editor?.saveViewState() : undefined
        const selection = selectProjectFile(
            origin.sourceSelection,
            path,
            this.buildGeneration,
            this.existsInBuild(path)
        )
        this.show(selection, destination)
        this.closeTab(path, origin)
        await tick()
        if (viewState && this.groups.includes(destination) && destination.displayedPath === path)
            destination.editor?.restoreViewState(viewState)
    }

    private createGroup() {
        const group = new EditorGroup(this, `editor-${++this.nextGroupId}`)
        this.groups = [...this.groups, group]
        return group
    }

    closeGroup(group: EditorGroup) {
        if (!this.groups.includes(group)) return
        if (this.groups.length === 1) {
            group.tabs = initialTabs('')
            group.sourceSelection = liveSource('')
            return
        }
        this.groups = this.groups.filter((candidate) => candidate !== group)
        if (this.executionGroupId === group.id) this.executionGroupId = this.groups[0].id
    }

    /** Whether the Build has this File: its own, or a Runtime library member it linked. */
    private existsInBuild(path: string) {
        return (
            this.emulator.buildSources?.files[path] !== undefined ||
            this.emulator.buildLibraryFiles?.[path] !== undefined
        )
    }

    revealEditorLine(lineNumber: number, column: number, group = this.groups[0]) {
        if (!this.groups.includes(group)) return
        const editor = group.editor
        if (!editor) return
        editor.revealLineInCenter(lineNumber)
        editor.setPosition({ lineNumber, column })
    }

    /** Explorer navigation: changes the File, not which version of the Project is being looked at. */
    selectFile(path: string, group = this.groupForFile(path)) {
        this.show(
            selectProjectFile(
                group.sourceSelection,
                path,
                this.buildGeneration,
                this.existsInBuild(path)
            ),
            group
        )
    }

    /** Clicking a tab: the same rule as the Explorer. */
    activateTab(path: string, group = this.groupForFile(path)) {
        this.selectFile(path, group)
    }

    closeTab(path: string, group = this.groups[0]) {
        const next = closeTab(group.tabs, path)
        if (next === group.tabs) return
        group.tabs = next
        if (!next.paths.length) {
            this.closeGroup(group)
            return
        }
        if (next.active !== group.displayedPath) this.selectFile(next.active, group)
    }

    private synchronizeBuildGeneration(buildSources: BuildSources | undefined): void {
        if (buildSources && buildSources !== this.previousBuildSources) this.buildGeneration += 1
        this.previousBuildSources = buildSources
    }

    async revealSourceLocation(file: string, line: number, column = 1) {
        const buildSources = this.emulator.buildSources
        if (!buildSources || !this.existsInBuild(file)) return
        // A compile can reveal its first instruction before Svelte flushes the observer above.
        // Synchronize here as well so the selection and model URI always use the new Build.
        this.synchronizeBuildGeneration(buildSources)
        const group =
            this.groups.find((group) => group.displayedPath === file) ?? this.executionGroup
        this.executionGroupId = group.id
        this.show(buildSource(file, this.buildGeneration), group)
        //Both file editors retain the exact versions used by this Build.
        for (const other of this.groups) {
            if (other !== group && this.existsInBuild(other.displayedPath)) {
                const next = buildSource(other.displayedPath, this.buildGeneration)
                if (!isSameProjectSourceSelection(other.sourceSelection, next)) {
                    other.sourceSelection = next
                }
            }
        }
        await tick()
        this.revealEditorLine(zeroBasedLineToMonaco(line), column, group)
        this.followExecutionSource()
    }

    /**
     * The mapped pair's source pane follows the current instruction to the File it was compiled
     * from, as a debugger shows an inlined function's source: into `<sim.h>` for the instructions an
     * inlined `sim_` function contributed, and back to the caller's File after them.
     */
    private followExecutionSource() {
        const pair = this.mappingPair
        const location = this.executionSourceLocation
        if (!pair || !location || location.path === pair.source.displayedPath) return
        if (isEnvironmentHeaderPath(location.path)) {
            if (this.runtimeMemberFile(location.path))
                this.show(liveSource(location.path), pair.source)
        } else if (this.existsInBuild(location.path)) {
            this.show(buildSource(location.path, this.buildGeneration), pair.source)
        }
    }

    async revealDiagnostic(diagnostic: Diagnostic) {
        const path =
            diagnostic.file ??
            this.emulator.buildSources?.entry ??
            this.project.entry ??
            this.displayedPath
        const group = this.groupForFile(path)
        const selection =
            diagnostic.source !== 'Compiler Explorer' && this.existsInBuild(path)
                ? buildSource(path, this.buildGeneration)
                : liveSource(path)
        this.show(selection, group)
        await tick()
        this.revealEditorLine(zeroBasedLineToMonaco(diagnostic.lineIndex), diagnostic.column, group)
    }

    revealCurrentInstruction() {
        if (this.emulator.line < 0) return
        void this.revealSourceLocation(this.emulator.currentFile, this.emulator.line)
    }

    /** After Stop: every tab shows the live File again, and tabs of Files that are gone close. */
    returnToLiveFiles() {
        const files = this.project.files
        for (const group of this.groups) {
            group.tabs = retainTabs(group.tabs, (path) => files[path] !== undefined, '')
            const next = liveSource(group.tabs.active)
            if (!isSameProjectSourceSelection(group.sourceSelection, next)) {
                group.sourceSelection = next
            }
        }
    }

    // ---- the Files -----------------------------------------------------------------------------

    private moveFileBreakpoints(from: string, to?: string) {
        const moved = this.emulator.breakpoints.filter((breakpoint) => breakpoint.file === from)
        for (const breakpoint of moved) this.emulator.toggleBreakpoint(breakpoint.line, from)
        if (!to) return
        for (const breakpoint of moved) {
            if (
                !this.emulator.breakpoints.some(
                    (candidate) => candidate.file === to && candidate.line === breakpoint.line
                )
            ) {
                this.emulator.toggleBreakpoint(breakpoint.line, to)
            }
        }
    }

    fileRenamed(from: string, to: string) {
        this.project.renameCompilationFile(from, to)
        this.moveFileBreakpoints(from, to)
        for (const group of this.groups) {
            group.tabs = renameTab(group.tabs, from, to)
            if (group.displayedPath === from) this.show(liveSource(to), group)
        }
    }

    fileDeleted(path: string) {
        this.moveFileBreakpoints(path)
        for (const group of this.groups) {
            group.tabs = removeTab(group.tabs, path, '')
            if (group.displayedPath === path) {
                const next = liveSource(group.tabs.active)
                if (!isSameProjectSourceSelection(group.sourceSelection, next)) {
                    group.sourceSelection = next
                }
            }
            if (!group.tabs.paths.length && this.groups.length > 1) this.closeGroup(group)
        }
    }

    setEntry(path: string) {
        this.project.entry = path
        this.changed()
    }

    /**
     * A change to one Project File's model. Monaco applies a rename or a code action to every
     * resource it touches, including Files the editor is not showing, so this is driven per model
     * rather than from the editor's active text.
     */
    fileEdited(path: string, nextCode: string) {
        if (
            this.host.readonly ||
            this.fileSystemLocked ||
            this.running ||
            this.building ||
            (this.emulator.canExecute && !this.emulator.terminated)
        )
            return
        //A File the Project no longer has is not recreated by typing into a stale model.
        if (this.project.files[path]?.encoding !== 'plain') return
        try {
            this.project.fileSystem.writeText(path, nextCode)
        } catch (error) {
            console.error(error)
            toast.error(getM68kErrorMessage(error))
        }
        if (this.emulator.canExecute && this.emulator.terminated && this.emulator.line >= 0) {
            this.emulator.resetSelectedLine()
        }
    }

    toggleBreakpoint(line: number, group = this.groups[0]) {
        this.emulator.toggleBreakpoint(line, group.displayedPath)
    }

    // ---- execution -----------------------------------------------------------------------------

    /** Select the source lines behind any set of lines in either pane of the mapped pair. */
    selectMappedLines(group: EditorGroup, lines: readonly number[]) {
        const pair = this.mappingPair
        if (!pair || (group !== pair.source && group !== pair.assembly)) return
        const locations =
            group === pair.assembly
                ? sourceLocationsOf(pair.map, lines)
                : lines.map((line) => ({ path: group.displayedPath, line }))
        const selection = locations.length ? locations : undefined
        //Dragging a selection repeats the same lines; keep the value so nothing recomputes.
        if (!sameLocations(selection, this.mappingSelection)) this.mappingSelection = selection
        if (!selection) return
        const other = group === pair.source ? pair.assembly : pair.source
        const otherLines =
            other === pair.source
                ? selection.flatMap((location) =>
                      location.path === other.displayedPath ? [location.line] : []
                  )
                : assemblyLinesOf(pair.map, selection)
        const editor = other.editor
        if (!editor || !otherLines.length) return
        //Leave the other pane alone while any related line is in view, so growing a selection
        //does not scroll it on every step.
        const visible = editor.getVisibleRanges()
        const inView = otherLines.some((line) =>
            visible.some(
                (range) => range.startLineNumber <= line + 1 && line + 1 <= range.endLineNumber
            )
        )
        if (!inView) editor.revealLineInCenter(otherLines[0] + 1)
    }

    cancelSourceCompilation() {
        this.compilationController?.abort()
    }

    async compileDisplayedSource(origin = this.groups[0]) {
        const path = origin.compilablePath
        if (origin.sourceCompileDisabled || !path) return
        const optimization = origin.optimization
        const compiler = origin.sourceCompiler
        const recompileOutput = !!origin.displayedCompilation
        const replaced = origin.displayedPath
        const existingDestination = this.groups.find((group) => group !== origin)
        const controller = new AbortController()
        this.compilationController = controller
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)])
        this.compiling = true
        this.compilingGroupId = origin.id
        this.sourceDiagnostics = []
        this.failedBuild = undefined
        try {
            const result = await compileProjectSource(this.project, path, optimization, {
                signal,
                sourceAnnotations: preferencesStore.values.sourceAnnotations.value,
                compiler,
                confirm: (question) => {
                    const pending = Prompt.confirm(question)
                    const id = Prompt.id
                    const cancel = () => {
                        if (Prompt.id === id && Prompt.promise) Prompt.cancel()
                    }
                    signal.addEventListener('abort', cancel, { once: true })
                    return pending.finally(() => signal.removeEventListener('abort', cancel))
                }
            })
            if (!result) return
            this.sourceDiagnostics = result.diagnostics
            const originStillOpen = this.groups.includes(origin)
            const destinationClosed =
                existingDestination && !this.groups.includes(existingDestination)
            if (!originStillOpen || destinationClosed) {
                this.show(
                    liveSource(result.record.outputPath),
                    this.groupForFile(result.record.outputPath)
                )
            } else if (recompileOutput && !existingDestination) {
                //the only pane shows assembly: the source takes that pane on the left, and the new
                //assembly opens beside it on the right, as a split of a source File does
                const assembly = this.createGroup()
                this.show(liveSource(path), origin)
                this.show(liveSource(result.record.outputPath), assembly)
                this.closeTab(replaced, origin)
                this.executionGroupId = assembly.id
            } else {
                const other = existingDestination ?? this.createGroup()
                const source = recompileOutput ? other : origin
                const assembly = recompileOutput ? origin : other
                this.show(liveSource(path), source)
                this.show(liveSource(result.record.outputPath), assembly)
                this.executionGroupId = assembly.id
            }
            for (const group of this.groups) {
                if (
                    group.displayedPath === path ||
                    group.displayedPath === result.record.outputPath
                )
                    group.resetCompilationOptions()
            }
            this.changed()
        } catch (error) {
            if (controller.signal.aborted) return
            if (error instanceof SourceCompilationError) this.sourceDiagnostics = error.diagnostics
            if (this.sourceDiagnostics.length) this.bottomTab = 'problems'
            toast.error(
                signal.aborted
                    ? 'Source compilation timed out. Try again.'
                    : error instanceof SourceCompilationError
                      ? error.message
                      : 'Could not reach Compiler Explorer. Check your connection and try again.'
            )
        } finally {
            this.compiling = false
            this.compilingGroupId = undefined
            this.compilationController = undefined
        }
    }

    private appendLog(draft: LogDraft) {
        this.log = appendLog(this.log, draft, ++this.logId, Date.now())
    }

    async build() {
        if (this.host.readonly || this.building || this.running || this.compiling) return
        if (this.fileSystemLocked) {
            //The Build button is hidden in this state, but the shortcut is not, and returning here
            //without a word left the key looking broken.
            toast.warn('Stop the current Debug session before building again')
            return
        }
        const started = performance.now()
        const sources = this.sourceInput
        this.failedBuild = undefined
        let failure: Diagnostic[] | undefined
        try {
            this.running = false
            this.building = true
            await this.emulator.compile(undoHistorySize(this.effectiveSettings), sources)
        } catch (e) {
            console.error(e)
            //only a compilation failure carries this Build's own findings: any other error leaves the
            //emulator's list as an earlier Build or check left it
            if (e instanceof CompilationFailedError) failure = e.diagnostics
            toast.error('Error compiling code. ' + getM68kErrorMessage(e))
        } finally {
            this.building = false
            //also after a failed build: the directive is read before the program is assembled
            this.syncDisplay()
            const ok = this.emulator.canExecute
            const diagnostics = ok ? this.emulator.compilerDiagnostics : (failure ?? [])
            if (!ok && diagnostics.length)
                this.failedBuild = { sources, diagnostics: $state.snapshot(diagnostics) }
            this.appendLog(
                buildEntry({
                    ok,
                    errors: diagnostics.filter((d) => d.severity === 'error').length,
                    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
                    durationMs: performance.now() - started,
                    entry: this.project.entry
                })
            )
            this.bottomTab = ok ? 'terminal' : 'problems'
            if (ok) this.revealCurrentInstruction()
        }
    }

    private async runCode() {
        try {
            //no limit: a Run is sliced, so Pause and Stop answer even in an infinite loop (ADR 0007)
            await this.emulator.run(0)
        } catch (e) {
            console.error(e)
            toast.error('Error executing code. ' + getM68kErrorMessage(e))
        }
    }

    /**
     * The whole run, from the button and from the shortcut alike: `running` has to be true for as
     * long as the program is in flight, because that is what turns the Run button into Pause and
     * keeps Step and Undo out of a run they would re-enter the Core inside of.
     */
    async run() {
        if (this.building || this.running || this.compiling) return
        this.running = true
        this.testcasesResult = []
        try {
            await this.runCode()
        } finally {
            this.running = false
            this.revealCurrentInstruction()
        }
    }

    pause() {
        this.emulator.pause()
    }

    async step() {
        try {
            await this.emulator.step()
            this.revealCurrentInstruction()
        } catch (e) {
            console.error(e)
            toast.error('Error executing code. ' + getM68kErrorMessage(e))
        }
    }

    undo() {
        try {
            this.emulator.undo()
            this.revealCurrentInstruction()
        } catch (e) {
            console.error(e)
            toast.error('Error executing undo ' + getM68kErrorMessage(e))
        }
    }

    /** "Undo to here" in the History: `amount` steps back, Pokes counted among them. */
    undoSteps(amount: number) {
        const undone = this.emulator.undo(amount)
        if (undone < amount) {
            //The Screen or FileSystem journal ran out before the Core did. Saying so beats a
            //History panel that silently stops part way back.
            toast.warn(
                `Undid ${undone} of ${amount} instructions: the history for the ones before that has been discarded`,
                6000
            )
        }
        this.revealCurrentInstruction()
    }

    /** Ends the Debug session: the program is dropped and the editor goes back to the live Files. */
    clearExecution() {
        this.emulator.clear()
        this.emulator.setSources(this.sourceInput)
        this.returnToLiveFiles()
    }

    stop() {
        this.clearExecution()
        this.running = false
        this.testcasesResult = []
    }

    async test() {
        if (this.building || this.running || this.compiling) return
        this.running = true
        //a frame for the buttons to show the run before the Cores take the thread
        await new Promise((resolve) => setTimeout(resolve, 50))
        const started = performance.now()
        this.testing = true
        try {
            this.testcasesResult = await this.emulator.test(
                this.sourceInput,
                $state.snapshot(this.project.testcases),
                TESTCASE_INSTRUCTION_LIMIT,
                undoHistorySize(this.effectiveSettings)
            )
            this.appendLog(testRunEntry(this.testcasesResult, performance.now() - started))
            this.bottomTab = 'log'
        } catch (e) {
            console.error(e)
            toast.error('Error executing tests. ' + getM68kErrorMessage(e))
        } finally {
            this.running = false
            //the effects that saw the Testcases run flush before this is cleared
            await tick()
            this.testing = false
        }
    }

    // ---- keyboard ------------------------------------------------------------------------------

    /**
     * A shortcut held with the platform's command key (Ctrl+K, ⌘K) works from anywhere in the
     * Workbench, the editor and every input included, so it is caught on the way down, before
     * Monaco, which would take Ctrl+K as the start of one of its chords, and before the browser's
     * own Ctrl+K. Keys typed into the AI assistant never reach the page: it is another origin's frame.
     */
    private handleCommandKey(e: KeyboardEvent) {
        if (shortcutRecording.active) return
        const key = modShortcutKey(e)
        const shortcut = key ? shortcutsStore.get(key) : undefined
        if (!shortcut) return
        e.preventDefault()
        e.stopPropagation()
        this.pressedKeys.delete(e.code)
        if (e.repeat && shortcut.type !== ShortcutAction.Step) return
        this.runShortcut(shortcut.type)
    }

    private handleKeyDown(e: KeyboardEvent) {
        this.pressedKeys.set(e.code, true)
        const code = Array.from(this.pressedKeys.keys()).join('+')
        const shortcut = shortcutsStore.get(code)
        if (e.repeat && shortcut?.type !== ShortcutAction.Step) return
        const target = e.target as HTMLElement | null
        if (
            target?.tagName === 'INPUT' ||
            target?.tagName === 'TEXTAREA' ||
            e
                .composedPath()
                .some((el) => (el as HTMLElement)?.className?.includes?.('monaco-editor'))
        ) {
            if (e.code === 'Escape') target?.blur()
            return
        }
        if (shortcut) this.runShortcut(shortcut.type)
    }

    private runShortcut(type: ShortcutAction) {
        const emulator = this.emulator
        switch (type) {
            case ShortcutAction.SearchDocumentation: {
                this.panels.searchDocumentation?.()
                break
            }
            case ShortcutAction.ToggleDocs: {
                this.panels.toggleDocumentation?.()
                break
            }
            case ShortcutAction.ToggleSettings: {
                this.panels.toggleSettings?.()
                break
            }
            case ShortcutAction.BuildCode: {
                void this.build()
                break
            }
            case ShortcutAction.RunCode: {
                if (emulator.terminated || emulator.interrupt !== undefined || !emulator.canExecute)
                    break
                if (this.running) emulator.pause()
                else void this.run()
                break
            }
            case ShortcutAction.SaveCode: {
                this.save()
                break
            }
            case ShortcutAction.ClearExecution: {
                this.clearExecution()
                break
            }
            case ShortcutAction.Step: {
                if (this.running || this.building) break
                if (emulator.terminated || emulator.interrupt !== undefined || !emulator.canExecute)
                    break
                void this.step()
                break
            }
            case ShortcutAction.Undo: {
                if (this.running || this.building) break
                if (emulator.interrupt !== undefined || !emulator.canExecute || !emulator.canUndo)
                    break
                emulator.undo()
                this.revealCurrentInstruction()
                break
            }
        }
    }
}

/**
 * Those of a failed Build's diagnostics the live view does not show already: one on the same File
 * and line with the same message is the same finding, which live checking made first.
 */
function buildOnlyDiagnostics(
    live: readonly Diagnostic[],
    build: readonly Diagnostic[]
): Diagnostic[] {
    const key = (diagnostic: Diagnostic) =>
        `${diagnostic.file ?? ''}\0${diagnostic.lineIndex}\0${diagnostic.message}`
    const shown = new Set(live.map(key))
    return build.filter((diagnostic) => !shown.has(key(diagnostic)))
}
