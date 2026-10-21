import { tick, untrack } from 'svelte'
import type monaco from 'monaco-editor'
import { programBuildSources } from '#lib/buildSources.ts'
import { RUNTIME_NAMESPACE } from '#lib/runtimeAbi.ts'
import {
    linksX86StartUnit,
    X86_START_UNIT_FILES,
    X86_START_UNIT_PATH
} from '#lib/languages/X86/x86StartUnit.ts'
import {
    loadedRuntimeLibrary,
    loadedRuntimeSources,
    loadRuntimeSources,
    parseRuntimeSourcePath,
    runtimeSourcePath
} from '#lib/sourceRuntime/runtimeLibrary.ts'
import {
    isEnvironmentHeaderPath,
    loadedEnvironmentHeader
} from '#lib/sourceRuntime/environmentLibrary.ts'
import type { ByteEdit, ProjectFile, ProjectFiles } from '#lib/projectFiles.ts'
import {
    buildOutputCollision,
    buildOutputFile,
    buildOutputStale,
    type BuildOutput
} from '#lib/buildOutput.ts'
import { ByteEditHistory } from '#cmp/specific/workbench/hex/byteEditHistory.ts'
import {
    defaultEntryPath,
    type AvailableLanguages,
    type Project,
    type TestcaseResult
} from '#lib/Project.svelte.ts'
import type { Emulator } from '#lib/languages/Emulator.ts'
import { BuildDownloadError, CompilationFailedError } from '#lib/languages/BaseEmulator.svelte.ts'
import {
    isLineBreakpoint,
    makeRegister,
    sameBreakpoint,
    type Diagnostic,
    type LineBreakpoint,
    type RegisterPoke,
    type SourceBreakpoint
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import {
    functionAtLine,
    instructionAddressAt,
    lineOfFileOffset,
    type Listing,
    type ListingFunction
} from '#lib/listing/listing.ts'
import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import { PseudocodeDocuments } from '#lib/pseudocode/pseudocodeDocuments.svelte.ts'
import {
    defaultPseudocodeFunction,
    functionAt,
    pseudocodeBreakpointAddresses,
    pseudocodeBreakpointsOn,
    pseudocodeLinesOf
} from '#lib/pseudocode/pseudocodeMap.ts'
import type { PatchSite } from '#lib/listing/listingPatcher.svelte.ts'
import { TESTCASE_INSTRUCTION_LIMIT } from '#lib/Config.ts'
import { getM68kErrorMessage } from '#lib/languages/M68K/M68kUtils.ts'
import {
    hasDecidedSettings,
    type ProjectSettingsDecisions,
    resolveProjectSettings,
    undoHistorySize
} from '#lib/projectSettings.ts'
import { rewriteScreenDirective } from '#lib/languages/mars/screenDirective.ts'
import {
    DEFAULT_PROJECT_DISPLAY,
    type MarsDisplayOrigin,
    marsDisplayEquals,
    normalizeMarsDisplay,
    type ProjectDisplay
} from '#lib/languages/mars/marsDisplay.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import {
    buildSource,
    isCurrentBuildLocation,
    isSameProjectSourceSelection,
    liveSource,
    selectProjectFile,
    type ProjectSourceSelection
} from '#lib/monaco/projectSourceSelection.ts'
import {
    createProjectLanguageSessionId,
    parseProjectSourceUri,
    projectSourceModelKey,
    type ProjectModelIdentity
} from '#lib/languages/service/uri.ts'
import { ProjectLanguageSession } from '#lib/languages/service/ProjectLanguageSession.ts'
import type { ProjectAnalysisSnapshot } from '#lib/languages/service/protocol.ts'
import { languageDiagnosticToDiagnostic } from '#lib/languages/service/diagnosticBridge.ts'
import { registerProjectNavigation } from '#lib/languages/service/navigation.ts'
import { zeroBasedLineToMonaco } from '#lib/languages/service/monacoConversions.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import {
    modShortcutKey,
    ShortcutAction,
    shortcutRecording,
    shortcutsStore
} from '#stores/shortcutsStore.ts'
import { toast } from '#stores/toastStore.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { compileProjectSource } from '#lib/sourceCompilation/compileProjectSource.ts'
import { SourceCompilationError } from '#lib/sourceCompilation/compilerExplorer.ts'
import {
    coreBreakpoints,
    currentSourceMaps,
    isSourceBreakpoint,
    mappedBreakpoints
} from '#lib/sourceCompilation/sourceBreakpoints.ts'
import {
    sourceMapColorIndices,
    type SourceMapColoring
} from '#lib/sourceCompilation/sourceColoring.ts'
import { sameLocations, type MappingSelection } from '#lib/sourceCompilation/mappingSelection.ts'
import {
    editorFileLanguage,
    sourceLanguage,
    type CompilationSourceMap,
    type SourceLocation
} from '#lib/sourceCompilation/records.ts'
import { serializer } from '#lib/json.ts'
import {
    ARGUMENTS_DIAGNOSTIC_SOURCE,
    commandLineProgram,
    compiledEntrySource,
    languageTakesArguments,
    parseCommandLine,
    programsByLabel,
    type CommandLineParse
} from '#lib/commandLine.ts'
import { executableKind } from '#lib/executables.ts'
import { fileKind, type ProjectFileKind } from '#lib/fileKinds.ts'
import { defaultFileView, fileViewsOf, type FileView } from '#lib/fileViews.ts'
import { createDebouncer } from '#lib/utils.ts'
import { terminationSummary } from '#lib/languages/termination.ts'
import {
    closeTab,
    initialTabs,
    keepTab,
    openTab,
    previewTab,
    renameTab,
    retainTabs,
    removeTab
} from './fileTabs'
import {
    appendLog,
    buildEntry,
    exitEntry,
    noteEntry,
    testRunEntry,
    type LogDraft,
    type LogEntry
} from './workbenchLog'
import { EditorGroup } from './EditorGroup.svelte'
import type { NavigationPosition } from './navigationHistory.svelte'
import { PatchPrompt } from './patchPrompt.svelte'
import { EditorModels } from './editorModels'
import { resolveMappingPair } from './mappingPair'
import {
    pseudocodePairing,
    resolvePseudocodePair,
    sourceMapPairing,
    type LinePairing
} from './linePairing'
import { editorGroupForFile, editorFileKind } from './editorFileRouting'
import { firstProgramEntry, startsProgram } from './firstProgram'
import {
    EDITOR_FILE_DRAG_TYPE,
    readEditorFileDrag,
    writeEditorFileDrag,
    type EditorFileDrag
} from './editorFileDrag'

/** The tabs of the bottom panel. */
export type BottomTab = 'terminal' | 'log' | 'problems'

/**
 * What Build, Test and live checking say while the Project has no Program, which it may
 * ([programs.md](../../../../../docs/design/programs.md), decision 7).
 */
export const NO_PROGRAM_MESSAGE =
    'This Project has no program. Right-click an assembly File in the Explorer and choose New program from this file.'

/** A Program a picker lists: its Entry path, the label it goes by, and whether its Entry is missing. */
export type ProgramChoice = { entry: string; label: string; missing: boolean }

/** `monaco.editor.ScrollType`'s values, named here so that the session never loads Monaco. */
const SCROLL_TYPE = { smooth: 0, immediate: 1 } as const

/**
 * The **Command line** the Terminal shows, `$ ./crackme hunter2`
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 12): the name the
 * program starts under and its Arguments, as typed and as read. Locked during a Debug session, to
 * what that run started with.
 */
export type CommandLineState = {
    /** The program's name after `./`: an Executable's Entry path, else without its extension. */
    program: string
    /** The Arguments as typed. */
    text: string
    parsed: CommandLineParse
    locked: boolean
}

/**
 * What a host passes the session, as getters so that it stays reactive to the host's props
 * ([ADR 0024](../../../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)).
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
 * of it ([ADR 0024](../../../../../docs/adr/0024-workbench-is-a-host-agnostic-shell.md)).
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
    private activeTabGroupId = $state('editor-1')
    readonly models: EditorModels
    /** The Hex editor's Undo and Redo of each File, shared by both panes. */
    readonly byteEditHistory = new ByteEditHistory()
    /**
     * The Pseudocode the panes show, and the session's Pseudocode worker, started with the first
     * function decompiled ([file-views.md](../../../../../docs/design/file-views.md), decision 6).
     */
    readonly pseudocode = new PseudocodeDocuments()
    /**
     * How each open Hex editor saves what was typed and not saved yet: typing becomes a Byte edit
     * when it pauses, and a Build or a test run locks the Files, so it is saved before either
     * starts, while the Files still take it.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Called before a Build or a test run; nothing tracks it.
    private readonly typingFlushes = new Set<() => void>()

    /**
     * A Runtime library member as the editor shows it, read-only: the one the running Build linked,
     * or else the one the live sources would link, once that library has loaded.
     */
    runtimeMemberFile(path: string): ProjectFile | undefined {
        const built = this.emulator.buildLibraryFiles?.[path]
        if (built) return built
        //x86 programs compiled before x86 had a Runtime library link the start unit instead
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

    /**
     * The Listing a version of a File is shown as
     * ([binary-import.md](../../../../../docs/design/binary-import.md), decisions 5 and 18): in the
     * current Build, the running program's own, at the address it was loaded at, or a library's it
     * loaded, under `@lib/`; otherwise an Executable File's, at the address it will be loaded at.
     * Undefined for any other File.
     */
    listingFor(selection: ProjectSourceSelection): ListingDocument | undefined {
        const listings = this.emulator.listings
        const path = selection.path
        if (!listings || !path) return undefined
        if (
            selection.sourceKind === 'build' &&
            selection.buildGeneration === this.buildGeneration
        ) {
            const running = listings.session.get(path)
            if (running) return running
        }
        return listings.openExecutable(
            path,
            (selection.sourceKind === 'build'
                ? this.emulator.buildSources?.files[path]
                : this.project.files[path]) ?? this.buildOutputAt(path)
        )
    }

    groupForFile(path: string) {
        return editorGroupForFile(
            path,
            this.groups,
            this.project.files[path] ?? this.buildOutputAt(path)
        )
    }

    /**
     * What the File at `path` is, from its bytes, or for a text File its name, in this Project's
     * Target; undefined for no File.
     */
    fileKindOf(file: ProjectFile | undefined, path: string): ProjectFileKind | undefined {
        return file ? fileKind(file, this.project.language, path) : undefined
    }

    /** What the File at a path is, in the version a Debug session shows or else the live one. */
    kindAt(path: string): ProjectFileKind | undefined {
        const built = this.debugSession ? this.emulator.buildSources?.files[path] : undefined
        return this.fileKindOf(built ?? this.project.files[path] ?? this.buildOutputAt(path), path)
    }

    /**
     * The Build output's record when it is at `path`
     * ([ADR 0050](../../../../../docs/adr/0050-the-built-program-is-a-build-output-never-saved.md)):
     * read-only, outside the Project, and shown like an Executable.
     */
    buildOutputAt(path: string): ProjectFile | undefined {
        return this.buildOutput?.path === path ? this.buildOutputFile : undefined
    }

    /**
     * Saves the view a person chose for a File as its last, beside the open tabs; its default is
     * no choice to save ([file-views.md](../../../../../docs/design/file-views.md), decision 8).
     */
    viewChosen(path: string, view: FileView, kind = this.kindAt(path)) {
        if (this.host.readonly || !this.project.files[path]) return
        const saved = view === defaultFileView(kind) ? undefined : view
        if (this.project.fileViews?.[path] === saved) return
        //another pane with the File open keeps showing it as it does, rather than switching with
        //the saved view it fell back on
        for (const group of this.groups)
            if (group.tabs.paths.includes(path) && !Object.hasOwn(group.views, path))
                group.setView(path, group.viewOf(path, kind), false)
        this.project.setFileView(path, saved)
        this.changed()
    }
    get executionGroup() {
        return (
            this.groups.find((group) => group.id === this.executionGroupId) ??
            this.groups[this.groups.length - 1]
        )
    }
    /**
     * The pane that carries the execution controls where only one does
     * ([programs-plan.md](../../../../../docs/design/programs-plan.md), decision 8): during a Debug
     * session the pane execution is followed in, and otherwise, as a tablet's one bar builds its
     * Program, the pane showing the Selected program's Entry file, else the last showing any
     * Program's. Outside a session every pane showing an Entry has a dock of its own.
     */
    get controlsGroup() {
        if (this.debugSession) return this.executionGroup
        //of the panes showing one Program, one showing it as code before its bytes or Pseudocode
        const pick = (panes: EditorGroup[]) => {
            const code = panes.filter((group) => group.showsInstructions)
            return (
                code.find((group) => group.id === this.executionGroupId) ??
                code.at(-1) ??
                panes.find((group) => group.id === this.executionGroupId) ??
                panes.at(-1)
            )
        }
        const selected = this.project.selectedProgram
        //a C or C++ pane has Compile and no Build, even on an Entry from earlier data
        const programs = this.groups.filter(
            (group) => group.displayedProgram !== undefined && !sourceLanguage(group.displayedPath)
        )
        //an Executable's Listing reads as assembly, and the program it shows is what runs
        const assembly = this.groups.filter(
            (group) =>
                group.displayedView === 'listing' ||
                editorFileKind(group.displayedPath, group.displayedFile) === 'assembly'
        )
        return (
            pick(programs.filter((group) => group.displayedProgram === selected)) ??
            pick(programs) ??
            assembly.find((group) => group.id === this.executionGroupId) ??
            assembly.at(-1) ??
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
    /** Aborted by Cancel, which ends the Build in progress; see `cancelBuild`. */
    private buildController: AbortController | undefined
    /** The Emulator's work for the Build in progress, which Cancel leaves to finish unseen. */
    private buildCompiling: Promise<void> | undefined
    /** That work of a cancelled Build, until it settles: the next Build waits for it. */
    private cancelledBuild = $state.raw<Promise<void> | undefined>()
    /** Set once the component or effect that made the session is gone, and its deriveds with it. */
    private disposed = false
    /**
     * A test run is in flight: the Emulator builds and runs every Testcase, and none of those is a
     * program exit or a Build of the person's own. Reactive, as the picker and the Explorer are
     * locked while it lasts; the effects that only ask about it at the moment they run read it
     * untracked.
     */
    testing = $state(false)
    testcasesResult = $state<TestcaseResult[]>([])

    /** Whether the display on screen came from the program's own `@screen` comment, see `syncDisplay`. */
    displayOrigin = $state<MarsDisplayOrigin>('user')
    displayBaseLabel = $state<string | undefined>(undefined)

    log = $state.raw<LogEntry[]>([])
    private logId = 0
    /**
     * The Command line the Debug session's program started with, see `commandLine`: recorded by
     * a Build, and with `build` the Build snapshot it made, so a test run's or the coding agent's
     * Build, which make their own, never show it.
     */
    private startedCommandLine = $state.raw<{
        program: string
        text: string
        build?: BuildSources
    }>()
    /** Counts the ends of Debug sessions, so a Build knows that Stop ended it part way. */
    private executionClears = 0
    /** Counts requests for the Command line to take the keyboard, as a Problem about it makes. */
    commandLineFocus = $state(0)
    bottomTab = $state<BottomTab>('terminal')

    readonly pc

    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Imperative window callbacks consume this accumulator; it has no tracked consumer.
    private readonly pressedKeys = new Map<string, boolean>()
    private readonly debouncedFileSave = createDebouncer(250)[0]
    private knownTestcases: string | undefined
    /**
     * The Selected program whose Settings and Display configuration the Emulator was last given,
     * see `applySelection`; the Workbench made the Emulator with those of the one selected then.
     */
    private appliedSelection: string | undefined

    constructor(project: Project, emulator: Emulator, host: WorkbenchSessionHost) {
        this.project = project
        this.emulator = emulator
        this.host = host
        const start =
            project.activeTab ??
            project.openTabs?.[0] ??
            (project.openTabs ? '' : (project.selectedProgram ?? ''))
        const group = new EditorGroup(this, 'editor-1', start)
        if (project.openTabs) group.tabs = { paths: [...project.openTabs], active: start }
        this.groups = [group]
        this.models = new EditorModels((path, value) => this.fileEdited(path, value))
        this.appliedSelection = project.selectedProgram
        this.effectiveSettings = $derived(
            resolveProjectSettings(this.project.language, this.project.selected?.settings)
        )
        this.sourceInput = $derived.by<BuildSources>(() => {
            const files = $state.snapshot(this.project.files)
            const entry = this.project.selectedProgram
            //the Emulator and live checking always have sources: with no Program, the default
            //Entry path's, and why nothing builds
            if (entry === undefined)
                return {
                    files,
                    entry: defaultEntryPath(this.project.language),
                    assemblyError: NO_PROGRAM_MESSAGE
                }
            try {
                return programBuildSources(
                    {
                        files,
                        programs: this.project.programs,
                        language: this.project.language,
                        compilations: this.project.compilations
                    },
                    entry
                )
            } catch (error) {
                return {
                    files,
                    entry,
                    assemblyError: error instanceof Error ? error.message : String(error)
                }
            }
        })
        this.programChoices = $derived(
            programsByLabel(this.project).map(({ entry, label }) => ({
                entry,
                label,
                missing: !Object.hasOwn(this.project.files, entry)
            }))
        )
        this.buildOutput = $derived.by(() => {
            const output = this.emulator.buildOutput
            //a File or folder made at its path since the Build wins, as one there at the Build did
            return output && !buildOutputCollision(this.project.files, output.path)
                ? output
                : undefined
        })
        this.buildOutputFile = $derived(this.buildOutput && buildOutputFile(this.buildOutput))
        this.buildOutputStale = $derived(
            !!this.buildOutput && buildOutputStale(this.buildOutput, this.sourceInput)
        )
        this.displayedPath = $derived(this.groups[0].displayedPath)
        this.sourceView = $derived<'snapshot' | 'live'>(this.groups[0].sourceView)
        this.debugSession = $derived(this.emulator.canExecute)
        this.commandLine = $derived.by<CommandLineState | undefined>(() => {
            if (!languageTakesArguments(this.project.language)) return undefined
            const recorded = this.startedCommandLine
            //during the Build that recorded it (its run to `main` included), then while the
            //session it made lasts
            const started =
                recorded &&
                (this.building ||
                    (this.debugSession && recorded.build === this.emulator.buildSources))
                    ? recorded
                    : undefined
            if (started)
                return {
                    program: started.program,
                    text: started.text,
                    parsed: parseCommandLine(started.text),
                    locked: true
                }
            const entry = this.project.selectedProgram
            //no Program, no program to name nor Arguments to give it
            if (entry === undefined) return undefined
            const executable = executableKind(this.project.files[entry]) === 'supported'
            const text = this.effectiveSettings.programArguments
            return {
                program: commandLineProgram(
                    entry,
                    executable,
                    compiledEntrySource(entry, this.project.compilations)
                ),
                text,
                parsed: parseCommandLine(text),
                locked: this.host.readonly || this.debugSession || this.building || this.running
            }
        })
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
        this.pseudocodePair = $derived(resolvePseudocodePair(this.groups))
        this.linePairing = $derived.by<LinePairing<EditorGroup> | undefined>(() => {
            const pair = this.mappingPair
            if (pair) return sourceMapPairing(pair)
            const pseudocode = this.pseudocodePair
            return pseudocode ? pseudocodePairing(pseudocode) : undefined
        })
        this.mappingColors = $derived<SourceMapColoring | undefined>(this.linePairing?.coloring)
        this.retainedModelKeys = $derived.by(() => {
            //a File's text, and for a File of bytes its Listing, which an Executable has; a key
            //with no model behind it keeps nothing
            const keys = (files: ProjectFiles, selection: ProjectSourceSelection) =>
                Object.entries(files).flatMap(([path, file]) => {
                    const identity = { sessionId: this.languageSessionId, ...selection, path }
                    return file.encoding === 'plain'
                        ? [projectSourceModelKey(identity)]
                        : [
                              projectSourceModelKey(identity),
                              projectSourceModelKey({ ...identity, view: 'listing' })
                          ]
                })
            const build = buildSource('', this.buildGeneration)
            const output = this.buildOutput
            const outputFiles = output ? { [output.path]: this.buildOutputFile! } : {}
            return [
                ...keys(this.project.files, liveSource('')),
                ...keys(this.emulator.buildSources?.files ?? {}, build),
                ...keys(outputFiles, liveSource('')),
                ...(this.emulator.buildSources ? keys(outputFiles, build) : []),
                //the libraries' Listings, kept while the session lasts so a tab comes back as left
                ...[...(this.emulator.listings?.session.keys() ?? [])]
                    .filter((path) => this.emulator.listings!.isLibrary(path))
                    .map((path) =>
                        projectSourceModelKey({
                            sessionId: this.languageSessionId,
                            ...build,
                            path,
                            view: 'listing'
                        })
                    ),
                //and the Pseudocode each pane last showed of each Executable it has open, a
                //model of its own for each function
                ...this.groups.flatMap((group) => group.pseudocodeModelKeys)
            ]
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
            normalizeMarsDisplay(this.project.selected?.display ?? DEFAULT_PROJECT_DISPLAY)
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
        this.buildDisabled = $derived(this.buildDisabledFor(this.project.selectedProgram))
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
        this.executionSourceLocation = $derived.by(() => {
            const pair = this.linePairing
            return pair?.locationAt(pair.assembly.instructionLine)
        })
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

        //what waits on the session (a reveal for an editor still mounting) stops with it, rather
        //than reading deriveds that went inert with their owner
        $effect(() => () => {
            this.disposed = true
            this.pseudocode.dispose()
        })
        $effect(() => {
            const pageSize = preferencesStore.values.memoryPanelSize.value
            untrack(() => this.emulator.setGlobalMemorySize(pageSize, pageSize / 16))
        })

        let previousPairKey = ''
        let previousPairMap: object | undefined
        $effect(() => {
            const pair = this.linePairing
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
            const map = this.linePairing?.map
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

        //a Pseudocode never shows without its Listing beside it (decision 11): a pane that starts
        //showing one, as Decompile, a reopened Project or a moved tab make it, gets the Listing in
        //the other pane
        let showingPseudocode: readonly string[] = []
        $effect(() => {
            const panes = this.groups.filter(
                (group) => group.displayedView === 'pseudocode' && !!group.displayedFile
            )
            const keys = panes.map((group) => `${group.id}\0${group.displayedPath}`)
            const previous = showingPseudocode
            showingPseudocode = keys
            untrack(() => {
                panes.forEach((group, index) => {
                    if (!previous.includes(keys[index])) this.listingBeside(group)
                })
            })
        })
        //the worker decompiles only what panes show, and keeps the programs of those Executables
        $effect(() => {
            const shown = this.groups.flatMap((group) =>
                [group.requestedPseudocode, group.displayedPseudocode].filter(
                    (document) => document !== undefined
                )
            )
            const paths = this.groups
                .filter((group) => group.displayedView === 'pseudocode')
                .map((group) => group.displayedPath)
            untrack(() => this.pseudocode.retain(shown, paths))
        })
        //a function's Pseudocode, once decompiled, opens at the line the Listing's cursor is on,
        //rather than where the function shown before it was scrolled to
        const revealed = new WeakMap<EditorGroup, object>()
        //and the Listing it pairs with scrolls to that function, when it is a Listing new to the
        //pair
        const pairedListings = new WeakMap<EditorGroup, ListingDocument>()
        $effect(() => {
            const pair = this.pseudocodePair
            const document = pair?.assembly.displayedListing
            if (!pair || !document || pairedListings.get(pair.assembly) === document) return
            pairedListings.set(pair.assembly, document)
            untrack(() => void this.revealPseudocodeFunction(pair.assembly, pair.source))
        })
        $effect(() => {
            for (const group of this.groups) {
                const document = group.displayedPseudocode
                if (document?.status !== 'ready' || revealed.get(group) === document) continue
                revealed.set(group, document)
                untrack(() => void this.revealPseudocodeLine(group))
            }
        })

        //Batch tab moves and pane changes into one save. The initial view is only a restore;
        //opening an older Project does not itself create unsaved changes.
        let knownTabs = serializer.stringify(this.projectTabs())
        $effect(() => {
            const tabs = this.projectTabs()
            const key = serializer.stringify(tabs)
            if (key === knownTabs) return
            knownTabs = key
            untrack(() => {
                if (this.host.readonly) return
                this.project.setOpenTabs(tabs.openTabs, tabs.activeTab)
                this.changed()
            })
        })

        //Testcases are edited in place, so a change to any Program's is noticed by watching their
        //content; the first run only remembers what was loaded
        $effect(() => {
            const current = serializer.stringify(
                $state.snapshot(
                    Object.values(this.project.programs).map((program) => program.testcases)
                )
            )
            if (this.knownTestcases !== undefined && current !== this.knownTestcases) {
                untrack(() => this.changed())
            }
            this.knownTestcases = current
        })

        //one place applies a change of the Selected program, whatever made it (planning decision
        //10): the picker, a pane's Build or Test, Compile, a deletion, the first Program making
        //itself. A Debug session runs with what its Build was given, so it waits for Stop
        $effect(() => {
            const entry = this.project.selectedProgram
            if (entry === this.appliedSelection || this.debugSession) return
            untrack(() => this.applySelection())
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
            if (this.emulator.interrupt && !untrack(() => this.testing)) {
                untrack(() => this.revealCurrentInstruction())
            }
        })

        //each exit of the program goes in the Log with its running time and how it ended, whether
        //a Run, a Step or a runtime error ended it, followed by what the Emulator noted about the
        //run (a missing system call, an instruction it cannot run). A Build's own entry goes
        //first: what the program did while the Build ran it to `main` follows it. A test run's
        //entry says how each Testcase went, so what its runs met is not repeated
        let wasTerminated = untrack(() => this.emulator.terminated)
        let lastNote = untrack(() => this.emulator.notes.at(-1)?.id ?? 0)
        $effect(() => {
            const terminated = this.emulator.terminated && this.emulator.canExecute
            const notes = this.emulator.notes
            if (this.building) return
            untrack(() => {
                if (!this.testing) {
                    if (terminated && !wasTerminated)
                        this.appendLog(
                            exitEntry({
                                executionTimeMs: this.emulator.executionTime,
                                termination: this.emulator.termination
                            })
                        )
                    for (const note of notes)
                        if (note.id > lastNote) this.appendLog(noteEntry(note))
                }
                lastNote = Math.max(lastNote, notes.at(-1)?.id ?? 0)
            })
            wasTerminated = terminated
        })
    }

    // ---- derived state, assigned in the constructor once the Project and the Emulator are set

    // ---- derived state -------------------------------------------------------------------------
    /**
     * The values a Build and a Test run with: the Selected program's decisions, the language's
     * defaults elsewhere.
     */
    declare readonly effectiveSettings: ReturnType<typeof resolveProjectSettings>
    /** What a Build of the Selected program reads, and what live checking checks. */
    declare readonly sourceInput: BuildSources
    /**
     * The Programs as a picker and the Explorer list them, by label
     * ([programs.md](../../../../../docs/design/programs.md), decisions 9 and 10).
     */
    declare readonly programChoices: ProgramChoice[]
    /**
     * The program the last Build linked, listed beside the Project's Files and shown like an
     * Executable, read-only, until the next Build starts
     * ([ADR 0050](../../../../../docs/adr/0050-the-built-program-is-a-build-output-never-saved.md)).
     * None while a File or folder of the Project has its path.
     */
    declare readonly buildOutput: BuildOutput | undefined
    /** The Build output as the record the views read a File from, stored as bytes. */
    declare readonly buildOutputFile: ProjectFile | undefined
    /** Whether the live sources would no longer build the Build output, see `buildOutputStale`. */
    declare readonly buildOutputStale: boolean
    declare readonly displayedPath: string
    declare readonly sourceView: 'snapshot' | 'live'
    /** Whether a program is built and retained: from a successful Build until Stop. */
    declare readonly debugSession: boolean
    /**
     * The Selected program's Command line, in a Project whose programs take Arguments; undefined
     * for the others, and while the Project has no Program.
     */
    declare readonly commandLine: CommandLineState | undefined
    /** The colours of the panes whose lines are linked, see `linePairing`. */
    declare readonly mappingColors: SourceMapColoring | undefined
    /** A C File and its Generated assembly, shown side by side with a current Source map. */
    declare readonly mappingPair: ReturnType<typeof resolveMappingPair<EditorGroup>>
    /** A function's Pseudocode and the Listing beside it, once it is decompiled. */
    declare readonly pseudocodePair: ReturnType<typeof resolvePseudocodePair<EditorGroup>>
    /**
     * The panes whose lines are linked, as they are drawn and selected: the mapped pair, else the
     * Pseudocode pair.
     */
    declare readonly linePairing: LinePairing<EditorGroup> | undefined
    declare readonly executionSourceLocation: SourceLocation | undefined
    /**
     * The assembly lines that Breakpoints on C and C++ Files stand for: the first instruction of
     * each block of Generated assembly mapped to the line. The Core stops on these.
     */
    declare readonly mappedBreakpoints: LineBreakpoint[]
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
    //the page's half of the Poke availability rule ([the design record](../../../../../docs/design/pokes.md)):
    //a read-only Project takes no Pokes, and neither does one whose Core is building or running.
    //The Emulator owns the other half
    declare readonly pokeable: boolean
    /** The Emulator's runtime errors, which the Terminal tab shows before what the program wrote. */
    declare readonly errorStrings: string
    declare readonly runInfo: string
    declare readonly executionDisabled: boolean
    declare readonly undoDisabled: boolean
    /** Whether the Selected program's Build is refused as things stand, see `buildDisabledFor`. */
    declare readonly buildDisabled: boolean

    // ---- lifecycle -----------------------------------------------------------------------------

    /** Starts what needs the page: the language worker, cross-file navigation and the shortcuts. */
    mount(): () => void {
        const unregisterNavigation = registerProjectNavigation(
            this.languageSessionId,
            (identity, selection, originatingEditor) =>
                this.openResource(identity, selection, originatingEditor)
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
            this.pseudocode.dispose()
            this.models.dispose()
        }
    }

    /**
     * Opens a model Monaco asked for, as Go to Definition does, and a double-click on a name in a
     * Listing or a Pseudocode ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md),
     * decision 7): in the pane whose editor asked, else the File's, at the selection. A jump from a
     * Listing or a Pseudocode adds to that pane's navigation history.
     */
    async openResource(
        identity: ProjectModelIdentity,
        selection: monaco.IRange | monaco.IPosition | undefined,
        originatingEditor?: monaco.editor.ICodeEditor
    ): Promise<boolean> {
        const origin = this.groups.find((group) => group.editor === originatingEditor)
        //Go to Definition on a name in a Pseudocode moves both panes: the Listing to what it
        //names, and the Pseudocode to the function that is in
        if (
            origin?.displayedView === 'pseudocode' &&
            identity.view === 'listing' &&
            identity.path === origin.displayedPath &&
            selection
        ) {
            const lineNumber =
                'lineNumber' in selection ? selection.lineNumber : selection.startLineNumber
            return this.followPseudocodeTarget(origin, lineNumber - 1)
        }
        const group = origin ?? this.groupForFile(identity.path)
        let target: ProjectSourceSelection
        let view = identity.view
        if (identity.sourceKind === 'build') {
            if (
                identity.buildGeneration !== this.buildGeneration ||
                !this.existsInBuild(identity.path, identity.view)
            ) {
                return false
            }
            target = buildSource(identity.path, identity.buildGeneration)
        } else if (identity.path.startsWith(RUNTIME_NAMESPACE)) {
            //a Runtime library member, opened read-only from go to definition
            if (!this.runtimeMemberFile(identity.path)) return false
            target = liveSource(identity.path)
            view = undefined
        } else {
            if (!this.project.files[identity.path] && !this.buildOutputAt(identity.path))
                return false
            target = liveSource(identity.path)
        }
        this.recordJump(group)
        this.show(target, group, view)
        await tick()
        if (selection) {
            const lineNumber =
                'lineNumber' in selection ? selection.lineNumber : selection.startLineNumber
            const column = 'column' in selection ? selection.column : selection.startColumn
            this.revealEditorLine(lineNumber, column, group)
        }
        return true
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

    get languageEditable() {
        return (
            !this.host.readonly &&
            !this.fileSystemLocked &&
            !this.debugSession &&
            !this.building &&
            !this.running &&
            !this.compiling &&
            !this.testing
        )
    }

    /** The Workbench recreates its Emulator and session for the new ISA. Files keep their paths. */
    setLanguage(language: AvailableLanguages) {
        if (!this.languageEditable || language === this.project.language) return
        this.flushTyping()
        this.project.language = language
        this.changed()
    }

    /**
     * A decision or a reset from the panel, for the Selected program; it takes effect at the next
     * Build. Refused while the Project has no Program, whose Settings there are none of.
     */
    applySettings(next: ProjectSettingsDecisions) {
        const entry = this.project.selectedProgram
        if (entry === undefined) {
            toast.warn(NO_PROGRAM_MESSAGE)
            return
        }
        const argumentsChanged =
            next.programArguments !== this.project.selected?.settings.programArguments
        this.project.setProgramSettings(entry, next)
        const resolved = resolveProjectSettings(this.project.language, next)
        this.emulator.setScreenHistoryBudgetMb(resolved.screenHistoryBudgetMb)
        this.emulator.setFileSystemHistoryBudgetMb(resolved.fileSystemHistoryBudgetMb)
        this.emulator.setProgramArguments(resolved.programArguments)
        //a Build the Arguments stopped says nothing about Arguments typed since
        if (
            argumentsChanged &&
            this.failedBuild?.diagnostics.every(
                (diagnostic) => diagnostic.source === ARGUMENTS_DIAGNOSTIC_SOURCE
            )
        )
            this.failedBuild = undefined
        this.changed()
    }

    /**
     * The Arguments typed on the Command line, saved as the Selected program's Setting: empty is
     * none, which is the default, so nothing is recorded for it. Refused while the line is locked,
     * and with no Program, which has no Command line.
     */
    setProgramArguments(text: string) {
        if (this.commandLine?.locked !== false) return
        const next = { ...this.project.selected?.settings }
        if (text === '') delete next.programArguments
        else next.programArguments = text
        this.applySettings(next)
    }

    /** Whether the Display configuration can change now: never during a Debug session. */
    get displayEditable() {
        return !this.fileSystemLocked && !this.host.readonly
    }

    /** The Screen popover's choice, for the Selected program. */
    applyDisplay(next: ProjectDisplay) {
        if (this.fileSystemLocked) {
            toast.warn('Stop execution before changing the display')
            return
        }
        const entry = this.project.selectedProgram
        if (entry === undefined) {
            toast.warn(NO_PROGRAM_MESSAGE)
            return
        }
        //a program that states its display in its Entry file's @screen comment gets that comment
        //rewritten to say what was chosen, so the code and the popover agree and the next Build
        //reads it back; a program without one keeps the choice in its Program alone
        const rewritten = rewriteScreenDirective(this.project.code, this.currentDisplay, next)
        const baseChanged = next.baseAddress !== this.currentDisplay.baseAddress
        if (rewritten !== null) this.project.fileSystem.writeText(entry, rewritten)
        this.project.setProgramDisplay(entry, next)
        this.displayOrigin = rewritten !== null ? 'directive' : 'user'
        if (rewritten === null || baseChanged) this.displayBaseLabel = undefined
        //applied at once and with a re-sync from memory, as MARS does
        this.emulator.setDisplay?.(next)
        this.changed()
    }

    /**
     * A Build reads the program's `@screen` directive, so the emulator may have configured itself
     * from the source; the section and the built Program's saved display follow it. A program
     * without a directive leaves everything as the user set it.
     */
    private syncDisplay(sources: BuildSources) {
        const configured = this.emulator.getDisplay?.()
        if (!configured) return
        this.displayOrigin = configured.origin
        this.displayBaseLabel = configured.baseLabel
        if (configured.origin !== 'directive') return
        const program = this.project.program(sources.entry)
        const saved = normalizeMarsDisplay(program?.display ?? DEFAULT_PROJECT_DISPLAY)
        if (!program || marsDisplayEquals(saved, configured.display)) return
        this.project.setProgramDisplay(sources.entry, configured.display)
        this.changed()
    }

    // ---- Programs ------------------------------------------------------------------------------

    /**
     * Gives the Emulator the Selected program's undo budgets, Arguments and Display configuration,
     * which it reads at the next Build, and drops what was about the Program before: its test
     * results and a failed Build's findings ([programs-plan.md](../../../../../docs/design/programs-plan.md),
     * decision 10). The Screen shows the chosen display until a Build reads a `@screen` comment.
     */
    private applySelection() {
        this.appliedSelection = this.project.selectedProgram
        const settings = this.effectiveSettings
        this.emulator.setScreenHistoryBudgetMb(settings.screenHistoryBudgetMb)
        this.emulator.setFileSystemHistoryBudgetMb(settings.fileSystemHistoryBudgetMb)
        this.emulator.setProgramArguments(settings.programArguments)
        this.emulator.setDisplay?.(this.currentDisplay)
        this.displayOrigin = 'user'
        this.displayBaseLabel = undefined
        this.testcasesResult = []
        this.failedBuild = undefined
    }

    /**
     * Why the Programs cannot change now, or undefined when they can: a Debug session holds the
     * Files and belongs to its Program, so the picker is Stop, then switch
     * ([programs.md](../../../../../docs/design/programs.md), decision 10), and a Build or a test
     * run is reading them.
     */
    get programsLocked(): string | undefined {
        if (this.fileSystemLocked || this.debugSession)
            return 'Stop the Debug session before changing programs'
        if (this.building || this.running || this.testing)
            return 'Wait for the Build or the test run to end before changing programs'
        return undefined
    }

    /** Says why the Programs cannot change now, when they cannot. */
    private programsRefused(): boolean {
        const reason = this.programsLocked
        if (reason) toast.warn(reason)
        return reason !== undefined
    }

    /** Makes a Program the Selected program, saved as the open tabs are: not on a read-only host. */
    private select(entry: string) {
        if (entry === this.project.selectedProgram) return
        this.project.selectProgram(entry)
        if (!this.host.readonly) this.changed()
    }

    /**
     * The picker's choice (decision 10): the Program whose Settings and Testcases the panels show,
     * which Shift+B builds. The panes stay as they are. False when it was refused or names no
     * Program.
     */
    selectProgram(entry: string): boolean {
        if (!this.project.program(entry) || this.programsRefused()) return false
        this.select(entry)
        return true
    }

    /**
     * "New program from this file" (decision 6): a Program with nothing decided whose Entry is the
     * File at `entry`, and selected. A File is the Entry of one Program at most (decision 2), so an
     * Entry's own is selected instead.
     */
    createProgram(entry: string): boolean {
        if (this.host.readonly) return false
        if (this.project.program(entry)) return this.selectProgram(entry)
        if (this.programsRefused()) return false
        try {
            this.project.createProgram(entry)
        } catch (error) {
            toast.error(getM68kErrorMessage(error))
            return false
        }
        this.changed()
        return true
    }

    /**
     * "Remove program" (decision 11): the Program goes with its Settings and Testcases, its File
     * stays. Removing the Selected program selects the first one left by label (decision 7).
     */
    removeProgram(entry: string): boolean {
        if (this.host.readonly || !this.project.program(entry) || this.programsRefused())
            return false
        this.project.removeProgram(entry)
        this.changed()
        return true
    }

    /**
     * What deleting or replacing the File at `path` would take with it, for the prompt that names
     * it (decision 7): whether its Program has Settings decided and how many Testcases it has.
     * Undefined for a File that is no Entry.
     */
    programLoss(path: string): { settings: boolean; testcases: number } | undefined {
        const program = this.project.program(path)
        return (
            program && {
                settings: hasDecidedSettings(program.settings),
                testcases: program.testcases.length
            }
        )
    }

    /**
     * Whether the Build of the Program at `entry` is refused as things stand
     * ([programs-plan.md](../../../../../docs/design/programs-plan.md), decision 9): on a read-only
     * host, during a Compile, and for the Selected program while live checking finds errors in it.
     * Live checking follows the Selected program alone, so another Program's Build goes ahead and
     * reports its own.
     */
    buildDisabledFor(entry: string | undefined): boolean {
        return (
            this.host.readonly ||
            this.compiling ||
            (entry === this.project.selectedProgram && this.liveBuildHasErrors)
        )
    }

    /**
     * Selects the Program a Build or a test run is for (decision 5): the one at `entry`, as a
     * pane's Build and Test name theirs, else the Selected program, as Shift+B and the Testcases
     * panel's Run use. Its Settings reach the Emulator before the run reads them, rather than when
     * the effect that applies a selection runs. False, after saying why, when there is no such
     * Program or it cannot be selected now.
     */
    private selectForRun(entry = this.project.selectedProgram): boolean {
        if (entry === undefined) {
            toast.warn(NO_PROGRAM_MESSAGE)
            return false
        }
        if (!this.project.program(entry)) {
            toast.warn(`${entry} is the Entry of no program`)
            return false
        }
        if (entry !== this.project.selectedProgram) {
            if (this.programsRefused()) return false
            this.select(entry)
        }
        if (entry !== this.appliedSelection) this.applySelection()
        return true
    }

    /** Makes a pane still open the one execution is followed in, as a pane's Build or Test asks. */
    private followExecutionIn(group: EditorGroup | undefined) {
        if (group && this.groups.includes(group)) this.executionGroupId = group.id
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

    // ---- patching from a Listing ---------------------------------------------------------------

    /**
     * The Listing line of a pane that "Patch instruction…" may rewrite now
     * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13): an
     * instruction of the running Executable's own Listing, shown in the current Build, while a
     * Poke is possible (paused, not waiting for input, not ended, and the Project not read-only).
     * A library's Listing and any other line take none.
     */
    patchSite(group: EditorGroup, line: number): PatchSite | undefined {
        const patcher = this.emulator.patcher
        const selection = group.sourceSelection
        if (
            !patcher ||
            !this.pokeable ||
            group.displayedLibraryListing ||
            selection.sourceKind !== 'build' ||
            selection.buildGeneration !== this.buildGeneration
        )
            return undefined
        const site = patcher.site(line)
        return site?.path === group.displayedPath && site.document === group.displayedListing
            ? site
            : undefined
    }

    /** Opens the prompt over a line that takes a patch, with its instruction to retype. */
    openPatchPrompt(group: EditorGroup, line: number): boolean {
        const patcher = this.emulator.patcher
        const site = this.patchSite(group, line)
        if (!patcher || !site) return false
        group.patchPrompt?.dispose()
        const prompt = new PatchPrompt(site, patcher, this.buildGeneration)
        group.patchPrompt = prompt
        void prompt.update()
        return true
    }

    closePatchPrompt(group: EditorGroup) {
        group.patchPrompt?.dispose()
        group.patchPrompt = undefined
        group.editor?.focus()
    }

    /** Writes the prompt's previewed patch as one Poke, and closes it once written. */
    applyPatch(group: EditorGroup): boolean {
        const prompt = group.openPatchPrompt
        if (!prompt || !this.pokeable) return false
        try {
            if (!prompt.apply()) {
                prompt.failure = 'The patch could not be written'
                return false
            }
        } catch (e) {
            prompt.failure = getM68kErrorMessage(e)
            return false
        }
        this.closePatchPrompt(group)
        return true
    }

    // ---- which File is shown -------------------------------------------------------------------

    private projectTabs() {
        const files = this.project.files
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Temporary deduplication; the effect tracks the groups' reactive tab lists.
        const openTabs = [...new Set(this.groups.flatMap((group) => group.tabs.paths))].filter(
            (path) => Object.hasOwn(files, path)
        )
        const selected = this.groups.find((group) => group.id === this.activeTabGroupId)?.tabs
            .active
        //Library and Build-only Files cannot be restored without their running Build.
        const previous = untrack(() => this.project.activeTab)
        const activeTab =
            selected && openTabs.includes(selected)
                ? selected
                : previous && openTabs.includes(previous)
                  ? previous
                  : (openTabs[0] ?? '')
        return { openTabs, activeTab }
    }

    focusEditorGroup(group: EditorGroup) {
        if (this.groups.includes(group)) this.activeTabGroupId = group.id
    }

    /** The pane the person worked in last, which keeps that place while a side panel has focus. */
    get focusedGroup(): EditorGroup {
        return this.groups.find((group) => group.id === this.activeTabGroupId) ?? this.groups[0]
    }

    /**
     * Shows a version of a File, opening its tab, in the view the pane remembers for it or, with
     * `view`, in that one when the File offers it, as going to a definition in a Listing does.
     * With `preview` the tab opened is the pane's preview tab, in the place of the one before it.
     */
    private show(
        selection: ProjectSourceSelection,
        group = this.groupForFile(selection.path),
        view?: FileView,
        preview = false
    ) {
        const changedPath = group.displayedPath !== selection.path
        if (view) group.setView(selection.path, view, false)
        if (!isSameProjectSourceSelection(group.sourceSelection, selection)) {
            group.sourceSelection = selection
        }
        const replaced = group.tabs.preview
        group.tabs = (preview ? previewTab : openTab)(group.tabs, selection.path)
        //the File previewed before goes as a closed tab does
        if (replaced !== undefined && !group.tabs.paths.includes(replaced)) group.moveView(replaced)
        this.focusEditorGroup(group)
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
        //the Build output goes nowhere: it is no File of the Project to move, and a pane opens it
        //from the Explorer
        if (this.buildOutputAt(path)) return event.preventDefault()
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
        //the tab moves in the view it was shown in
        const view = origin.views[path]
        this.show(selection, destination, view)
        this.closeTab(path, origin)
        this.focusEditorGroup(destination)
        await tick()
        if (viewState && this.groups.includes(destination) && destination.displayedPath === path)
            destination.editor?.restoreViewState(viewState)
    }

    /** Opens a pane, on the right, or with `before` on that pane's left. */
    private createGroup(before?: EditorGroup) {
        const group = new EditorGroup(this, `editor-${++this.nextGroupId}`)
        const index = before ? this.groups.indexOf(before) : -1
        this.groups =
            index < 0
                ? [...this.groups, group]
                : [...this.groups.slice(0, index), group, ...this.groups.slice(index)]
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

    /**
     * Whether the Build has this File: its own, a Runtime library member it linked, the program it
     * linked (its Build output), or the Listing of a library the running program loaded. With a
     * view, whether it has the File in that view: a library's Listing is only ever a Listing, and
     * a File of the Build only in a view its kind offers.
     */
    private existsInBuild(path: string, view?: FileView) {
        const file =
            this.emulator.buildSources?.files[path] ??
            this.emulator.buildLibraryFiles?.[path] ??
            //while a Debug session lasts, the Build output is its Build's: a Build replaces it
            (this.emulator.buildSources ? this.buildOutputAt(path) : undefined)
        if (!file)
            return (view ?? 'listing') === 'listing' && !!this.emulator.listings?.session.has(path)
        return !view || fileViewsOf(this.fileKindOf(file, path)).includes(view)
    }

    revealEditorLine(
        lineNumber: number,
        column: number,
        group = this.groups[0],
        scroll: 'smooth' | 'immediate' = 'smooth'
    ) {
        if (!this.groups.includes(group)) return
        const editor = group.editor
        if (!editor) return
        editor.revealLineInCenter(lineNumber, SCROLL_TYPE[scroll])
        editor.setPosition({ lineNumber, column })
    }

    /** Explorer navigation: changes the File, not which version of the Project is being looked at. */
    selectFile(path: string, group = this.groupForFile(path), preview = false) {
        this.show(
            selectProjectFile(
                group.sourceSelection,
                path,
                this.buildGeneration,
                this.existsInBuild(path)
            ),
            group,
            undefined,
            preview
        )
    }

    /**
     * A single click on a File in the Explorer: opens it in the pane's preview tab, in the place of
     * the File previewed there before, as an IDE does, so that looking through Files does not fill
     * the row. A click on the File the preview tab already shows keeps it open, so a double click
     * opens a File for good.
     */
    previewFile(path: string) {
        const previewed = this.groups.find((group) => group.tabs.preview === path)
        if (previewed) {
            this.keepOpen(path, previewed)
            this.selectFile(path, previewed)
            return
        }
        this.selectFile(path, this.groupForFile(path), true)
    }

    /**
     * Keeps a File in preview open, in `group` or in every pane: a second click on it in the
     * Explorer, a double click on its tab, or an edit to it.
     */
    keepOpen(path: string, group?: EditorGroup) {
        for (const candidate of group ? [group] : this.groups) {
            candidate.tabs = keepTab(candidate.tabs, path)
        }
    }

    /** Clicking a tab: the same rule as the Explorer. */
    activateTab(path: string, group = this.groupForFile(path)) {
        this.selectFile(path, group)
    }

    closeTab(path: string, group = this.groups[0]) {
        const next = closeTab(group.tabs, path)
        if (next === group.tabs) return
        group.tabs = next
        group.moveView(path)
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
        const group = this.showBuildFile(file)
        if (!group) return
        //a Pseudocode of the running Executable shows the function the program is in
        for (const other of this.groups) {
            const listing = other.pseudocodeListing?.listing
            const fn = listing && functionAtLine(listing, line)
            if (fn && isCurrentBuildLocation(other.sourceSelection, this.buildGeneration, file))
                other.followFunction(file, fn.address)
        }
        await tick()
        if (this.disposed) return
        //a pane the Build moved from an Executable's bytes to its Listing mounts its editor first
        if (this.holdsModel(group))
            this.revealEditorLine(zeroBasedLineToMonaco(line), column, group)
        else void this.revealWhenShown(group, line, { column, focus: false })
        this.followExecutionSource()
    }

    /**
     * Shows the Build's version of a File in the pane execution is followed in, in a view that
     * draws the current instruction ([file-views.md](../../../../../docs/design/file-views.md),
     * decision 8): a pane showing it as text or as its Listing, else one showing an Executable's
     * bytes, which moves to its Listing, as debuggers switch to disassembly when a session
     * starts; else the execution pane opens it on its Listing. A pane on a Pseudocode, the
     * File's or another Executable's such as the Build output's, follows its program itself and
     * is left as it is.
     */
    private showBuildFile(file: string): EditorGroup | undefined {
        const buildSources = this.emulator.buildSources
        if (!buildSources || !this.existsInBuild(file)) return undefined
        // A compile can reveal its first instruction before Svelte flushes the observer above.
        // Synchronize here as well so the selection and model URI always use the new Build.
        this.synchronizeBuildGeneration(buildSources)
        const showing = this.groups.filter((group) => group.displayedPath === file)
        const movable = (group: EditorGroup) => group.displayedView !== 'pseudocode'
        const group =
            showing.find((group) => group.showsInstructions) ??
            showing.find(movable) ??
            (movable(this.executionGroup) ? this.executionGroup : this.groups.find(movable)) ??
            this.paneBesidePseudocode(file)
        this.executionGroupId = group.id
        //an Executable's Listing, which is no view the person chose, so it is not saved
        const view = group.displayedPath === file && group.showsInstructions ? undefined : 'listing'
        this.show(buildSource(file, this.buildGeneration), group, view)
        //Both file editors retain the exact versions used by this Build.
        for (const other of this.groups) {
            if (other !== group && this.existsInBuild(other.displayedPath, other.displayedView)) {
                const next = buildSource(other.displayedPath, this.buildGeneration)
                if (!isSameProjectSourceSelection(other.sourceSelection, next)) {
                    other.sourceSelection = next
                }
            }
        }
        return group
    }

    /**
     * Where the Build's version of a File opens when every pane shows a Pseudocode: as the Listing
     * beside the File's own Pseudocode, as Decompile opens it; beside another Executable's, in a
     * new pane while there is only one, else in the execution pane.
     */
    private paneBesidePseudocode(file: string): EditorGroup {
        const own = this.groups.find((group) => group.displayedPath === file)
        if (own) return this.listingBeside(own) ?? own
        return this.groups.length === 1 ? this.createGroup() : this.executionGroup
    }

    /**
     * Shows an address of the running program, from the Call stack or the History: its line, or,
     * in a Listing still being generated, that Listing with its progress and then the line.
     */
    async revealAddress(address: bigint) {
        let location = this.emulator.getSourceLocationFromAddress(address)
        if (location && location.line < 0) {
            const pending = this.emulator.listings?.session.get(location.file)
            if (pending?.status !== 'generating') return
            this.showBuildFile(location.file)
            await pending.ready.catch(() => undefined)
            await tick()
            location = this.emulator.getSourceLocationFromAddress(address)
        }
        if (location && location.line >= 0)
            await this.revealSourceLocation(location.file, location.line)
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
        //the Arguments are typed on the Command line, at the top of the Terminal
        if (diagnostic.source === ARGUMENTS_DIAGNOSTIC_SOURCE) {
            this.bottomTab = 'terminal'
            this.commandLineFocus++
            return
        }
        const path =
            diagnostic.file ??
            this.emulator.buildSources?.entry ??
            this.project.selectedProgram ??
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
        const file = this.emulator.currentFile
        if (this.emulator.line >= 0) {
            void this.revealSourceLocation(file, this.emulator.line)
            return
        }
        //in a library whose Listing is still being generated: shown with its progress at once,
        //and at the current line once the Emulator has read it from the finished Listing
        const pending = this.emulator.listings?.session.get(file)
        if (pending?.status === 'generating') void this.revealWhenListed(file, pending)
    }

    private async revealWhenListed(file: string, document: ListingDocument) {
        this.showBuildFile(file)
        await document.ready.catch(() => undefined)
        await tick()
        if (this.emulator.currentFile === file && this.emulator.line >= 0)
            await this.revealSourceLocation(file, this.emulator.line)
    }

    /**
     * After Stop: every tab shows the live File again, and tabs of Files that are gone close. The
     * Build output's stay, since it outlasts the session.
     */
    returnToLiveFiles() {
        const files = this.project.files
        for (const group of this.groups) {
            group.tabs = retainTabs(
                group.tabs,
                (path) => files[path] !== undefined || this.buildOutputAt(path) !== undefined,
                ''
            )
            const next = liveSource(group.tabs.active)
            if (!isSameProjectSourceSelection(group.sourceSelection, next)) {
                group.sourceSelection = next
            }
        }
    }

    // ---- the Files -----------------------------------------------------------------------------

    private moveFileBreakpoints(from: string, to?: string) {
        const moved = this.emulator.breakpoints.filter((breakpoint) => breakpoint.file === from)
        for (const breakpoint of moved) this.toggleEmulatorBreakpoint(breakpoint)
        if (!to) return
        for (const breakpoint of moved) {
            const renamed = { ...breakpoint, file: to }
            if (!this.emulator.breakpoints.some((candidate) => sameBreakpoint(candidate, renamed)))
                this.toggleEmulatorBreakpoint(renamed)
        }
    }

    private toggleEmulatorBreakpoint(breakpoint: SourceBreakpoint) {
        if (isLineBreakpoint(breakpoint))
            this.emulator.toggleBreakpoint(breakpoint.line, breakpoint.file)
        else this.emulator.toggleAddressBreakpoint(breakpoint.address, breakpoint.file)
    }

    /**
     * Whether a host's changes to the Files, the Explorer's create, rename, move, delete and upload,
     * are refused now: during a Debug session, which locks the Project's FileSystem, and during a
     * test run, which builds every Testcase on a FileSystem of its own and so locks none, although
     * deleting or renaming the Entry of the Program it tests would take that Program away mid-run.
     */
    get filesLocked() {
        return this.fileSystemLocked || this.running || this.testing
    }

    /** A host's rename of a File, as the Explorer makes one: what followed the File follows it. */
    fileRenamed(from: string, to: string) {
        this.project.renameCompilationFile(from, to)
        let changed = this.programFileRenamed(from, to)
        this.moveFileBreakpoints(from, to)
        this.byteEditHistory.move(from, to)
        const view = this.project.fileViews?.[from]
        if (view) {
            this.project.setFileView(from, undefined)
            this.project.setFileView(to, view)
            changed = true
        }
        if (changed) this.changed()
        for (const group of this.groups) {
            group.tabs = renameTab(group.tabs, from, to)
            group.moveView(from, to)
            if (group.displayedPath === from) this.show(liveSource(to), group)
        }
    }

    /**
     * A host's deletion of a File: the Explorer's, the Coding agent's, one before an upload. It
     * deletes the Program the File is the Entry of (decision 7), and the Selected program's
     * deletion selects the first one left by label; `programLoss` says beforehand what goes.
     */
    fileDeleted(path: string) {
        let changed = this.project.program(path) !== undefined
        this.project.removeProgram(path)
        this.moveFileBreakpoints(path)
        this.byteEditHistory.move(path)
        if (this.project.fileViews?.[path]) {
            this.project.setFileView(path, undefined)
            changed = true
        }
        if (changed) this.changed()
        for (const group of this.groups) {
            group.tabs = removeTab(group.tabs, path, '')
            group.moveView(path)
            if (group.displayedPath === path) {
                const next = liveSource(group.tabs.active)
                if (!isSameProjectSourceSelection(group.sourceSelection, next)) {
                    group.sourceSelection = next
                }
            }
            if (!group.tabs.paths.length && this.groups.length > 1) this.closeGroup(group)
        }
    }

    /**
     * Files a host action added: New file, an upload, a drop, Keep as File, the Coding agent's
     * writes. While the Project has no Program, the first one makes itself from them and is
     * selected ([programs.md](../../../../../docs/design/programs.md), decision 8); once it has
     * one, new Files make none on their own. A running program's writes never come here.
     */
    filesAdded(paths: readonly string[]) {
        if (this.makeFirstProgram(paths)) this.changed()
    }

    /** The first Program of a Project with none, from Files a host action added or renamed. */
    private makeFirstProgram(paths: readonly string[]): boolean {
        if (this.host.readonly || this.fileSystemLocked) return false
        if (Object.keys(this.project.programs).length) return false
        const files = this.project.files
        const language = this.project.language
        const entry = firstProgramEntry(
            paths,
            (path) => Object.hasOwn(files, path) && startsProgram(path, files[path], language)
        )
        if (entry === undefined) return false
        this.project.createProgram(entry)
        return true
    }

    /**
     * A host rename moves the Program whose Entry the File is (decision 7). A running program's
     * own rename never comes here, so its Program stays where instruction Undo brings the File
     * back. A host deletes a File a move replaces first, its Program with it
     * ([programs-plan.md](../../../../../docs/design/programs-plan.md), decision 6), so a Program
     * still at `to` is one whose Entry was missing: it finds its File, unless a moved Program takes
     * the path. A rename into a qualifying name makes the first Program of a Project with none;
     * a File that qualified under its old name already, such as `main.s` whose Program was
     * removed, is no new File and makes none.
     */
    private programFileRenamed(from: string, to: string): boolean {
        if (from === to) return false
        const moved = this.project.program(from) !== undefined
        if (moved) this.project.removeProgram(to)
        this.project.renameProgram(from, to)
        //the File has moved already: what it was is its content under the old name
        const qualified = startsProgram(from, this.project.files[to], this.project.language)
        return (!qualified && this.makeFirstProgram([to])) || moved
    }

    /** Adds a Hex editor's save of its unsaved typing; the function returned removes it. */
    registerTypingFlush(flush: () => void): () => void {
        this.typingFlushes.add(flush)
        return () => {
            this.typingFlushes.delete(flush)
        }
    }
    /** Saves what every open Hex editor has typed, before the Files are locked. */
    private flushTyping() {
        for (const flush of [...this.typingFlushes]) flush()
    }
    /**
     * Byte edits typed in the Hex editor ([ADR 0047](../../../../../docs/adr/0047-byte-edits-are-kept-apart-from-the-original-bytes.md)):
     * overwrites `bytes` at `offset`, or with `edits` puts back a whole list for Undo and Redo.
     * A File stored as text takes no Byte edits: the overwrite changes its text, which must stay
     * UTF-8. False when the edit is refused, as the Project's limit can refuse it, after saying why.
     */
    editFileBytes(path: string, offset: number, bytes: Uint8Array): boolean {
        return this.changeFileBytes(path, () => {
            const fileSystem = this.project.fileSystem
            if (this.project.files[path]?.encoding === 'plain')
                fileSystem.overwriteText(path, offset, bytes)
            else fileSystem.editBytes(path, offset, bytes)
        })
    }
    setFileByteEdits(path: string, edits: readonly ByteEdit[]): boolean {
        return this.changeFileBytes(path, () => this.project.fileSystem.setByteEdits(path, edits))
    }
    private changeFileBytes(path: string, change: () => void): boolean {
        if (this.host.readonly || this.fileSystemLocked || this.running || this.building)
            return false
        try {
            change()
            //an edited File in preview is kept open, as typing into it does
            this.keepOpen(path)
            return true
        } catch (error) {
            console.error(error)
            toast.error(getM68kErrorMessage(error))
            return false
        }
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
            const changed = this.project.files[path].content !== nextCode
            this.project.fileSystem.writeText(path, nextCode)
            //typing into a File in preview keeps it open, as an IDE does
            if (changed) this.keepOpen(path)
        } catch (error) {
            console.error(error)
            toast.error(getM68kErrorMessage(error))
        }
        if (this.emulator.canExecute && this.emulator.terminated && this.emulator.line >= 0) {
            this.emulator.resetSelectedLine()
        }
    }

    /**
     * Show in Listing ([file-views.md](../../../../../docs/design/file-views.md), decision 9): the
     * instruction holding a byte of the Executable a pane shows in the Hex editor, through the
     * file offset the Listing keeps for each line. In the other pane when it shows the Listing
     * already, else in this one, switched to it. False when no line holds the byte.
     */
    async showInListing(group: EditorGroup, offset: number): Promise<boolean> {
        const path = group.displayedPath
        const showing = (candidate: EditorGroup) =>
            candidate.displayedPath === path && candidate.displayedView === 'listing'
        const target = this.groups.find((candidate) => candidate !== group && showing(candidate))
        const pane = target ?? group
        //a pane already on the Listing leaves its line behind; the bytes are no place in it
        this.recordJump(pane)
        if (!target) group.setView(path, 'listing')
        this.focusEditorGroup(pane)
        await tick()
        const listing = await pane.displayedListing?.ready.catch(() => undefined)
        if (!listing || !showing(pane)) return false
        const line = lineOfFileOffset(listing, offset)
        if (line < 0) return false
        //a pane that already showed the Listing scrolls to the line; one switched to it jumps
        return this.revealWhenShown(pane, line, { scroll: target ? 'smooth' : 'immediate' })
    }

    /**
     * A line of the Listing of a version of an Executable, picked in the Symbols panel
     * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision
     * 18). When the focused pane shows that version's Pseudocode, the Listing beside it moves to the
     * line, as following a name there does. Otherwise the line is revealed in a pane showing the
     * Listing already, the focused one first, else in one showing the File's bytes, switched to the
     * Listing as Show in Listing switches it, else in the focused pane. A Pseudocode beside the
     * Listing follows its cursor. The keyboard stays in the panel.
     */
    async revealListingLine(selection: ProjectSourceSelection, line: number): Promise<boolean> {
        const focused = this.focusedGroup
        const showing = (candidate: EditorGroup, view: FileView) =>
            candidate.displayedView === view &&
            isSameProjectSourceSelection(candidate.sourceSelection, selection)
        if (showing(focused, 'pseudocode')) return this.followPseudocodeTarget(focused, line)
        const panes = [focused, ...this.groups.filter((candidate) => candidate !== focused)]
        const shown = panes.find((candidate) => showing(candidate, 'listing'))
        const bytes = panes.find((candidate) => showing(candidate, 'hex'))
        const pane = shown ?? bytes ?? focused
        this.recordJump(pane)
        if (bytes && !shown) bytes.setView(selection.path, 'listing')
        else if (!shown) this.show(selection, pane, 'listing')
        this.focusEditorGroup(pane)
        await tick()
        return this.revealWhenShown(pane, line, {
            focus: false,
            scroll: shown ? 'smooth' : 'immediate'
        })
    }

    /**
     * Whether a pane's editor holds the model the pane shows, as it does once mounted: for a
     * Pseudocode, the one made for the document shown, since a function's Pseudocode decompiled
     * again from edited bytes is a new document under the same key.
     */
    private holdsModel(group: EditorGroup): boolean {
        const model = group.editor?.getModel()
        const identity = model && !model.isDisposed() ? parseProjectSourceUri(model.uri) : null
        if (!identity || projectSourceModelKey(identity) !== group.modelKey) return false
        return (
            group.displayedView !== 'pseudocode' ||
            (this.models.modelOf(group.modelKey) === model &&
                this.models.originOf(group.modelKey) === group.displayedPseudocode)
        )
    }

    /**
     * Reveals a line once the pane's editor holds the model it shows: a pane switched from the
     * Hex editor mounts its editor, and Monaco may still be loading. With `focus`, as Show in
     * Listing asks, the editor takes the keyboard; the debugger's reveal leaves it where it is.
     * The editor jumps to the line unless asked to scroll: a smooth scroll in an editor just
     * mounted is stopped part of the way by the layouts that follow (its notice, the debug
     * column), as the current line's was (`CurrentLineReveal`), which left Show in Listing a
     * tenth of the way to its line. With `still`, the reveal is dropped once it no longer holds,
     * so a reveal waiting for an editor does not undo a move made meanwhile; with `unless`, it is
     * not made when the editor, holding the model, says so.
     */
    private async revealWhenShown(
        group: EditorGroup,
        line: number,
        {
            column = 1,
            focus = true,
            scroll = 'immediate',
            still,
            unless
        }: {
            column?: number
            focus?: boolean
            scroll?: 'smooth' | 'immediate'
            still?: () => boolean
            unless?: (editor: NonNullable<EditorGroup['editor']>) => boolean
        } = {}
    ): Promise<boolean> {
        if (this.disposed) return false
        const key = group.modelKey
        for (let attempt = 0; attempt < 200; attempt++) {
            if (
                this.disposed ||
                group.modelKey !== key ||
                !this.groups.includes(group) ||
                (still && !still())
            )
                return false
            const editor = group.editor
            if (editor && this.holdsModel(group) && editor.getModel()!.getLineCount() > line) {
                if (unless?.(editor)) return false
                this.revealEditorLine(zeroBasedLineToMonaco(line), column, group, scroll)
                if (focus) editor.focus()
                return true
            }
            await new Promise((resolve) => setTimeout(resolve, 50))
        }
        return false
    }

    // ---- Pseudocode ----------------------------------------------------------------------------

    /**
     * The pane showing the Listing a Pseudocode pane pairs with: the other one, on the same
     * version of the File.
     */
    listingPaneOf(group: EditorGroup): EditorGroup | undefined {
        return this.groups.find(
            (other) =>
                other !== group &&
                other.displayedView === 'listing' &&
                other.displayedPath === group.displayedPath &&
                other.displayedListing === group.pseudocodeListing
        )
    }

    /**
     * The function a pane shows the Pseudocode of, in the Listing it decompiles from: the one it
     * last followed, else the one the Listing's cursor beside it is in, else in a Debug session
     * the program counter's, else `main`, the entry point's or the first.
     */
    pseudocodeFunctionFor(group: EditorGroup, listing: Listing): ListingFunction | undefined {
        const followed = group.pseudocodeFunctions[group.displayedPath]
        const chosen = followed === undefined ? undefined : functionAt(listing, followed)
        if (chosen) return chosen
        const pane = this.listingPaneOf(group)
        const atCursor =
            pane && pane.cursorLine >= 0 ? functionAtLine(listing, pane.cursorLine) : undefined
        if (atCursor) return atCursor
        const running =
            this.emulator.line >= 0 &&
            isCurrentBuildLocation(
                group.sourceSelection,
                this.buildGeneration,
                this.emulator.currentFile
            )
                ? functionAtLine(listing, this.emulator.line)
                : undefined
        return running ?? defaultPseudocodeFunction(listing)
    }

    /**
     * Decompile, from the view switch ([file-views.md](../../../../../docs/design/file-views.md),
     * decision 6): the pane shows the Pseudocode of the function the Listing's cursor is in, in
     * this pane or the other, and the Listing opens in the other pane if it does not show it,
     * splitting the editor with the Listing on the left as Ghidra lays them out. Saved as the
     * File's last view, as any view a person picks.
     */
    decompile(group: EditorGroup) {
        const path = group.displayedPath
        if (
            !this.groups.includes(group) ||
            !fileViewsOf(group.displayedKind).includes('pseudocode')
        )
            return
        const reading =
            group.displayedView === 'listing'
                ? group
                : this.groups.find(
                      (other) =>
                          other !== group &&
                          other.displayedPath === path &&
                          other.displayedView === 'listing'
                  )
        const listing = reading?.displayedListing?.listing
        const fn =
            listing && reading.cursorLine >= 0
                ? functionAtLine(listing, reading.cursorLine)
                : undefined
        if (fn) group.followFunction(path, fn.address)
        group.setView(path, 'pseudocode')
        this.listingBeside(group)
    }

    /**
     * The Listing beside a pane showing the Pseudocode: the other pane, switched to the Listing of
     * the same version of the File unless it shows it, or a new pane on the left when there is
     * only one. A Listing opened here scrolls to the function the Pseudocode shows.
     */
    private listingBeside(group: EditorGroup): EditorGroup | undefined {
        const path = group.displayedPath
        if (!this.groups.includes(group) || !path) return undefined
        const shown = this.listingPaneOf(group)
        if (shown) return shown
        const other =
            this.groups.find((candidate) => candidate !== group) ?? this.createGroup(group)
        const selection = group.sourceSelection
        this.show(
            selection.sourceKind === 'build'
                ? buildSource(path, selection.buildGeneration)
                : liveSource(path),
            other,
            'listing'
        )
        this.focusEditorGroup(group)
        return other
    }

    /**
     * Scrolls a Listing that just paired with a Pseudocode (opened beside it, switched back to
     * from the bytes, or made again after a Byte edit) to the function the Pseudocode shows,
     * unless its cursor is in that function already.
     */
    private async revealPseudocodeFunction(listingPane: EditorGroup, pseudocodePane: EditorGroup) {
        const document = listingPane.displayedListing
        const fn = pseudocodePane.displayedPseudocode?.fn
        await tick()
        //the debugger puts the running program's Listing on the program counter itself
        const selection = listingPane.sourceSelection
        if (
            this.disposed ||
            !fn ||
            listingPane.displayedListing !== document ||
            isCurrentBuildLocation(selection, this.buildGeneration, this.emulator.currentFile)
        )
            return
        await this.revealWhenShown(listingPane, fn.line, {
            focus: false,
            still: () =>
                pseudocodePane.displayedPseudocode?.fn === fn &&
                listingPane.displayedListing === document,
            unless: (editor) => {
                const line = (editor.getPosition()?.lineNumber ?? 0) - 1
                return line >= fn.line && line < fn.endLine
            }
        })
    }

    /**
     * The cursor of a pane's editor moved, by the person or the debugger: a Pseudocode beside a
     * Listing follows it into another function.
     */
    cursorMoved(group: EditorGroup, line: number) {
        if (!this.groups.includes(group)) return
        if (group.cursorLine !== line) group.cursorLine = line
        const listing = group.displayedView === 'listing' ? group.displayedListing : undefined
        const fn = listing?.listing && functionAtLine(listing.listing, line)
        if (!fn) return
        for (const other of this.groups)
            if (
                other !== group &&
                other.displayedView === 'pseudocode' &&
                other.displayedPath === group.displayedPath &&
                other.pseudocodeListing === listing
            )
                other.followFunction(other.displayedPath, fn.address)
    }

    /**
     * Go to Definition on a name in a Pseudocode, whose target is on a line of its Listing: the
     * Listing beside it moves to that line, and the Pseudocode to the function it is in, as the
     * Listing's cursor going there does. A name of data moves the Listing alone. Both panes add
     * the place they leave to their navigation history.
     */
    async followPseudocodeTarget(group: EditorGroup, line: number): Promise<boolean> {
        const listing = group.pseudocodeListing?.listing
        if (group.displayedView !== 'pseudocode' || !listing || line < 0) return false
        //both panes move, and each keeps the place it left, the Listing's taking the Pseudocode's
        //with it: Back in either returns
        const shown = this.listingPaneOf(group)
        this.recordJump(shown ?? group)
        const fn = functionAtLine(listing, line)
        if (fn) group.followFunction(group.displayedPath, fn.address)
        const pane = this.listingBeside(group)
        if (!pane) return false
        await tick()
        //a Listing already shown scrolls to it; one opened for it jumps
        return this.revealWhenShown(pane, line, {
            focus: false,
            scroll: this.holdsModel(pane) ? 'smooth' : 'immediate'
        })
    }

    // ---- navigation history --------------------------------------------------------------------

    /**
     * Where a pane is, as its navigation history keeps it: the line of the Listing it shows, at
     * `line` (its cursor's by default), or the function of its Pseudocode. None in any other view.
     */
    navigationPosition(
        group: EditorGroup,
        line = group.cursorLine
    ): NavigationPosition | undefined {
        const selection = group.sourceSelection
        if (!this.groups.includes(group) || !selection.path) return undefined
        if (group.displayedView === 'listing' && group.displayedListing)
            return { selection, view: 'listing', line: Math.max(line, 0) }
        const fn = group.displayedView === 'pseudocode' ? group.pseudocodeFunction : undefined
        return fn ? { selection, view: 'pseudocode', functionAddress: fn.address } : undefined
    }

    /**
     * A jump is about to move a pane, or has just moved its cursor from `line`, as Go to Symbol
     * does: the place it leaves goes into its navigation history
     * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision
     * 8), when that is a Listing's line or a Pseudocode's function. A Listing's jump moves the
     * Pseudocode beside it too, which keeps its place as well.
     */
    recordJump(group: EditorGroup, line = group.cursorLine) {
        const position = this.navigationPosition(group, line)
        if (!position) return
        group.history.record(position)
        if (position.view !== 'listing') return
        for (const other of this.groups)
            if (
                other !== group &&
                other.displayedView === 'pseudocode' &&
                other.pseudocodeListing === group.displayedListing
            )
                this.recordJump(other)
    }

    /** Back, in a pane's navigation history (Alt+←, the mouse's back button, Go Back). */
    goBack(group: EditorGroup): Promise<boolean> {
        return this.travel(group, 'back')
    }

    /** Forward, in a pane's navigation history (Alt+→, the mouse's forward button, Go Forward). */
    goForward(group: EditorGroup): Promise<boolean> {
        return this.travel(group, 'forward')
    }

    private async travel(group: EditorGroup, direction: 'back' | 'forward'): Promise<boolean> {
        if (!this.groups.includes(group)) return false
        const current = this.navigationPosition(group)
        const usable = (position: NavigationPosition) =>
            this.historySelection(position) !== undefined
        const target =
            direction === 'back'
                ? group.history.back(current, usable)
                : group.history.forward(current, usable)
        return target ? this.showPlace(group, target) : false
    }

    /**
     * The version of a File a place of the history shows in now: the current Build's while a Debug
     * session has the File, as it had when the place was in a Build, else the live File, else none,
     * as for a File deleted since or a library's Listing once the session is over.
     */
    private historySelection({
        selection,
        view
    }: NavigationPosition): ProjectSourceSelection | undefined {
        const { path } = selection
        if (selection.sourceKind === 'build' && this.existsInBuild(path, view))
            return buildSource(path, this.buildGeneration)
        const file = this.project.files[path] ?? this.buildOutputAt(path)
        return file && fileViewsOf(this.fileKindOf(file, path)).includes(view)
            ? liveSource(path)
            : undefined
    }

    /**
     * Takes a pane back to a place of its history: a Listing to its line, a Pseudocode to its
     * function, with the Listing beside it moved to that function unless its cursor is in it
     * already, since the Pseudocode follows the Listing.
     */
    private async showPlace(group: EditorGroup, place: NavigationPosition): Promise<boolean> {
        const selection = this.historySelection(place)
        if (!selection) return false
        const shown =
            group.displayedView === place.view &&
            isSameProjectSourceSelection(group.sourceSelection, selection)
        if (place.view === 'listing') {
            if (!shown) this.show(selection, group, 'listing')
            await tick()
            return this.revealWhenShown(group, place.line, {
                scroll: shown ? 'smooth' : 'immediate'
            })
        }
        group.followFunction(selection.path, place.functionAddress)
        if (!shown) this.show(selection, group, 'pseudocode')
        const pane = this.listingBeside(group)
        this.focusEditorGroup(group)
        await tick()
        const listing = group.pseudocodeListing
        const fn = listing?.listing && functionAt(listing.listing, place.functionAddress)
        if (pane && fn)
            await this.revealWhenShown(pane, fn.line, {
                focus: false,
                scroll: this.holdsModel(pane) ? 'smooth' : 'immediate',
                still: () => pane.displayedListing === listing,
                unless: () => pane.cursorLine >= fn.line && pane.cursorLine < fn.endLine
            })
        return true
    }

    /**
     * A function's Pseudocode just decompiled in a pane: shown at the line holding the instruction
     * at the Listing's cursor beside it, else at the program counter's line, else at its top.
     */
    private async revealPseudocodeLine(group: EditorGroup) {
        const document = group.displayedPseudocode
        const map = document?.map
        if (!map) return
        const pane = this.listingPaneOf(group)
        const atCursor = pane ? pseudocodeLinesOf(map, pane.cursorLine)[0] : undefined
        const running = group.pseudocodeProgramLine
        const line = atCursor ?? (running >= 0 ? running : 0)
        await tick()
        await this.revealWhenShown(group, line, {
            focus: false,
            still: () => group.displayedPseudocode === document
        })
    }

    /**
     * The bytes of the instruction or data on a line of the Listing a pane shows, which Show in
     * Hex selects: none for a line without bytes, or a library's Listing, which is no File.
     */
    hexRangeOfLine(
        group: EditorGroup,
        line: number
    ): { offset: number; length: number } | undefined {
        const listing = group.displayedListingView
        if (!listing || group.displayedLibraryListing || !group.displayedFile) return undefined
        const offset = listing.lines.offsets[line]
        const length = listing.lines.sizes[line]
        return offset >= 0 && length > 0 ? { offset, length } : undefined
    }

    /**
     * Show in Hex: a Listing line's bytes, selected in the Hex editor, in the other pane when it
     * shows the File's bytes already, else in this one, switched to them.
     */
    showInHex(group: EditorGroup, line: number): boolean {
        const range = this.hexRangeOfLine(group, line)
        if (!range) return false
        const path = group.displayedPath
        const target =
            this.groups.find(
                (candidate) =>
                    candidate !== group &&
                    candidate.displayedPath === path &&
                    candidate.displayedView === 'hex'
            ) ?? group
        if (target === group) group.setView(path, 'hex')
        target.hexReveal = { path, ...range }
        this.focusEditorGroup(target)
        return true
    }

    toggleBreakpoint(line: number, group = this.groups[0]) {
        if (group.displayedView === 'pseudocode') {
            this.togglePseudocodeBreakpoint(line, group)
            return
        }
        const listing = group.displayedListing
        if (!listing) {
            this.emulator.toggleBreakpoint(line, group.displayedPath)
            return
        }
        //a Listing's Breakpoint is the address of the instruction on the line, in its Executable
        //(decision 5); a line without an instruction takes none, nor does a library (decision 11),
        //nor the Build output, whose program the debugger follows in its source
        if (!listing.listing || group.displayedLibraryListing || group.displayedBuildOutput) return
        const address = instructionAddressAt(listing.listing, line)
        if (address !== undefined)
            this.emulator.toggleAddressBreakpoint(address, group.displayedPath)
    }

    /**
     * A Breakpoint on a line of the Pseudocode a pane shows ([file-views.md](../../../../../docs/design/file-views.md),
     * decision 10): the Executable's own address Breakpoints, on the first instruction of each
     * block mapped to the line, so the Listing beside it shows them; or, when any instruction of
     * the line has one, wherever it was set, every one of those removed. Nothing else is kept, so
     * they outlive the Pseudocode being printed differently.
     */
    private togglePseudocodeBreakpoint(line: number, group: EditorGroup) {
        const document = group.displayedPseudocode
        const map = document?.map
        if (!map || !group.breakpointsEditable) return
        const path = group.displayedPath
        const set = pseudocodeBreakpointsOn(
            map,
            document.listing,
            line,
            group.shownAddressBreakpoints
        )
        const toggled = set.length
            ? set
            : pseudocodeBreakpointAddresses(map, document.listing, line)
        for (const address of toggled) this.emulator.toggleAddressBreakpoint(address, path)
    }

    // ---- execution -----------------------------------------------------------------------------

    /** Select the source lines behind any set of lines in either pane of the mapped pair. */
    selectMappedLines(group: EditorGroup, lines: readonly number[]) {
        const pair = this.linePairing
        if (!pair || (group !== pair.source && group !== pair.assembly)) return
        const locations =
            group === pair.assembly
                ? pair.sourceLocationsOf(lines)
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
                : pair.assemblyLinesOf(selection)
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
            //Compile makes a Program only of a source that defines `main` (programs-plan.md,
            //decision 1), so a forgotten one still says something
            if (result.program === 'none' && !result.definesMain)
                this.appendLog(
                    noteEntry({
                        tone: 'info',
                        text: `${path} defines no \`main\`, so no program was made for it.`
                    })
                )
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

    /**
     * Builds the Program at `entry`, as a pane's Build does for the Entry file it shows, and
     * selects it; with none, the Selected program, as Shift+B does
     * ([programs.md](../../../../../docs/design/programs.md), decision 5). The pane whose Build was
     * pressed, `group`, becomes the one execution is followed in, so the Debug session's controls
     * and its first stop open there rather than in a pane that may show another Program.
     */
    async build(entry?: string, group?: EditorGroup) {
        if (this.host.readonly || this.building || this.running || this.compiling) return
        if (this.fileSystemLocked) {
            //The Build button is hidden in this state, but the shortcut is not, and returning here
            //without a word left the key looking broken.
            toast.warn('Stop the current Debug session before building again')
            return
        }
        if (!this.selectForRun(entry)) return
        this.followExecutionIn(group)
        //bytes typed into a Hex editor go into the Files this Build reads
        this.flushTyping()
        const started = performance.now()
        //the Selected program's, read after selecting it: a derived is brought up to date as read
        const sources = this.sourceInput
        //the Build output this Build replaces, whose tabs it closes if it places none there
        const replaced = this.buildOutput?.path
        this.failedBuild = undefined
        let failure: Diagnostic[] | undefined
        //what the Debug session's Command line shows, locked, for as long as it lasts
        const commandLine = this.commandLine
        this.startedCommandLine = commandLine && {
            program: commandLine.program,
            text: commandLine.text
        }
        this.emulator.setProgramArguments(this.effectiveSettings.programArguments)
        const clears = this.executionClears
        const controller = new AbortController()
        this.buildController = controller
        //why a Build failed that its diagnostics do not say, such as a download that stalled
        let problem: string | undefined
        try {
            this.running = false
            this.building = true
            const compiling = this.emulator.compile(
                undoHistorySize(this.effectiveSettings),
                sources,
                controller.signal
            )
            this.buildCompiling = compiling
            await untilAborted(compiling, controller.signal)
        } catch (e) {
            console.error(e)
            //only a compilation failure carries this Build's own findings: any other error leaves the
            //emulator's list as an earlier Build or check left it
            if (e instanceof CompilationFailedError) failure = e.diagnostics
            //what could not be downloaded, and to Build again, as the Terminal says it too
            else problem = e instanceof BuildDownloadError ? e.message : getM68kErrorMessage(e)
            if (clears === this.executionClears)
                toast.error(
                    e instanceof BuildDownloadError
                        ? e.message
                        : 'Error compiling code. ' + getM68kErrorMessage(e)
                )
        } finally {
            this.building = false
            if (this.buildController === controller) {
                this.buildController = undefined
                this.buildCompiling = undefined
            }
            //also after a failed build: the directive is read before the program is assembled
            this.syncDisplay(sources)
            //Stop or Cancel during the Build, in a download or its run to `main` (an input wait
            //before it, or a long start): the person ended it, so it neither failed nor built, and
            //the Log says nothing
            if (clears === this.executionClears)
                this.finishBuild(sources, started, failure, replaced, problem)
        }
    }

    /**
     * What the Build in progress is waiting for, which the dock says in place of Build while it
     * lasts: what the Emulator says it waits for, such as a download, or "Building…"
     * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision 2).
     */
    get buildPhase(): string {
        return (
            this.emulator.buildPhase ??
            (this.cancelledBuild ? 'Waiting for the cancelled Build to end…' : 'Building…')
        )
    }

    /**
     * Cancel, while a Build goes on: it ends at once, whatever it waits for, even something that
     * never answers, its result is discarded and the Workbench goes back to editing, with no Debug
     * session begun, as Stop leaves it. A Core still busy with the cancelled Build finishes unseen,
     * and a Build pressed meanwhile waits for it, saying so, which for a stalled download is until
     * the Core gives the download up.
     */
    cancelBuild() {
        if (!this.building) return
        const unfinished = this.buildCompiling
        if (unfinished) {
            this.cancelledBuild = unfinished
            const settled = () => {
                if (this.cancelledBuild === unfinished) this.cancelledBuild = undefined
            }
            unfinished.then(settled, settled)
        }
        this.buildController?.abort()
        this.clearExecution()
    }

    /**
     * What a Build that was not stopped part way leaves: its Log entry, and where it is shown. The
     * tabs of the Build output it `replaced` close when it left no program at that path, as a
     * failed Build does.
     */
    private finishBuild(
        sources: BuildSources,
        started: number,
        failure: Diagnostic[] | undefined,
        replaced: string | undefined,
        problem: string | undefined
    ) {
        if (replaced && !this.buildOutputAt(replaced) && !this.project.files[replaced])
            for (const group of [...this.groups]) this.closeTab(replaced, group)
        const ok = this.emulator.canExecute
        if (this.startedCommandLine)
            this.startedCommandLine = ok
                ? { ...this.startedCommandLine, build: this.emulator.buildSources }
                : undefined
        const diagnostics = ok ? this.emulator.compilerDiagnostics : (failure ?? [])
        if (!ok && diagnostics.length)
            this.failedBuild = { sources, diagnostics: $state.snapshot(diagnostics) }
        this.appendLog(
            buildEntry({
                ok,
                errors: diagnostics.filter((d) => d.severity === 'error').length,
                warnings: diagnostics.filter((d) => d.severity === 'warning').length,
                durationMs: performance.now() - started,
                entry: sources.entry,
                problem: ok ? undefined : problem
            })
        )
        //a failure the Problems do not list is told in the Terminal, before the program's output
        this.bottomTab = ok || !diagnostics.length ? 'terminal' : 'problems'
        if (ok) this.revealCurrentInstruction()
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
        //the Build's run to `main` owns the Core until it stops there, as a Run does
        if (this.building || this.running) return
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
        this.executionClears += 1
        this.startedCommandLine = undefined
        //a prompt belongs to the session it was opened in: the next Build of the same Executable
        //must not show it again, let alone write its patch
        for (const group of this.groups) {
            group.patchPrompt?.dispose()
            group.patchPrompt = undefined
        }
        this.emulator.clear()
        this.emulator.setSources(this.sourceInput)
        this.returnToLiveFiles()
    }

    stop() {
        this.clearExecution()
        this.running = false
        this.testcasesResult = []
    }

    /**
     * Runs the Testcases of the Program at `entry`, as a pane's Test does, and selects it; with
     * none, the Selected program's, as the Testcases panel's Run does (decision 5). A pane's Test
     * makes that pane, `group`, the one execution is followed in, as its Build does.
     */
    async test(entry?: string, group?: EditorGroup) {
        if (this.building || this.running || this.compiling) return
        if (!this.selectForRun(entry)) return
        this.followExecutionIn(group)
        this.flushTyping()
        this.running = true
        //a frame for the buttons to show the run before the Cores take the thread
        await new Promise((resolve) => setTimeout(resolve, 50))
        const started = performance.now()
        this.testing = true
        this.emulator.setProgramArguments(this.effectiveSettings.programArguments)
        try {
            this.testcasesResult = await this.emulator.test(
                this.sourceInput,
                $state.snapshot(this.project.selected?.testcases ?? []),
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
 * `promise`, or nothing as soon as `signal` aborts: a cancelled Build ends at once, even while what
 * it waits for never settles, and how that settles later is dropped.
 */
function untilAborted(promise: Promise<void>, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return resolve()
        signal.addEventListener('abort', () => resolve(), { once: true })
        promise.then(resolve, reject)
    })
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
