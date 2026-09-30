import { tick, untrack } from 'svelte'
import type monaco from 'monaco-editor'
import type { Project, TestcaseResult } from '$lib/Project.svelte'
import type { Emulator } from '$lib/languages/Emulator'
import {
    makeRegister,
    type Diagnostic,
    type RegisterPoke
} from '$lib/languages/commonLanguageFeatures.svelte'
import { TESTCASE_INSTRUCTION_LIMIT } from '$lib/Config'
import { getM68kErrorMessage } from '$lib/languages/M68K/M68kUtils'
import { type ProjectSettingsDecisions, resolveProjectSettings } from '$lib/projectSettings'
import { rewriteScreenDirective } from '$lib/languages/mars/screenDirective'
import {
    DEFAULT_PROJECT_DISPLAY,
    type MarsDisplayOrigin,
    marsDisplayEquals,
    normalizeMarsDisplay,
    type ProjectDisplay
} from '$lib/languages/mars/marsDisplay'
import type { BuildSources, ProjectFile } from '$lib/projectFiles'
import {
    buildSource,
    canEditProjectBreakpoints,
    isCurrentBuildLocation,
    liveSource,
    selectProjectFile,
    type ProjectSourceSelection
} from '$lib/monaco/projectSourceSelection'
import {
    createProjectLanguageSessionId,
    projectSourceModelKey,
    type ProjectModelIdentity
} from '$lib/languages/service/uri'
import { ProjectLanguageSession } from '$lib/languages/service/ProjectLanguageSession'
import type { ProjectAnalysisSnapshot } from '$lib/languages/service/protocol'
import { languageDiagnosticToDiagnostic } from '$lib/languages/service/diagnosticBridge'
import { registerProjectNavigation } from '$lib/languages/service/navigation'
import { zeroBasedLineToMonaco } from '$lib/languages/service/monacoConversions'
import { preferencesStore } from '$stores/preferencesStore.svelte'
import { ShortcutAction, shortcutsStore } from '$stores/shortcutsStore'
import { toast } from '$stores/toastStore'
import { serializer } from '$lib/json'
import { createDebouncer, formatTime } from '$lib/utils'
import {
    closeTab,
    initialTabs,
    openTab,
    renameTab,
    retainTabs,
    removeTab,
    type FileTabs
} from './fileTabs'
import {
    appendLog,
    buildEntry,
    exitEntry,
    testRunEntry,
    type LogDraft,
    type LogEntry
} from './workbenchLog'

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
    sourceSelection = $state<ProjectSourceSelection>(liveSource(''))
    tabs = $state.raw<FileTabs>(initialTabs(''))
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
    /** A test run is in flight: the Emulator runs every Testcase, and none is a program exit. */
    private testing = false
    testcasesResult = $state<TestcaseResult[]>([])
    editor = $state.raw<monaco.editor.IStandaloneCodeEditor | undefined>(undefined)

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
        this.effectiveSettings = $derived(
            resolveProjectSettings(this.project.language, this.project.settings)
        )
        this.sourceInput = $derived<BuildSources>({
            files: $state.snapshot(this.project.files),
            entry: this.project.entry
        })
        this.displayedPath = $derived(this.sourceSelection.path)
        this.sourceView = $derived<'snapshot' | 'live'>(
            this.sourceSelection.sourceKind === 'build' ? 'snapshot' : 'live'
        )
        this.debugSession = $derived(this.emulator.canExecute)
        this.displayedFile = $derived.by<ProjectFile | undefined>(() =>
            this.sourceView === 'snapshot'
                ? this.emulator.buildSources?.files[this.displayedPath]
                : this.project.files[this.displayedPath]
        )
        this.displayedCode = $derived(
            this.displayedFile?.encoding === 'plain' ? this.displayedFile.content : ''
        )
        this.displayedLanguage = $derived(
            /\.(?:c|h)$/i.test(this.displayedPath) ? ('c' as const) : this.project.language
        )
        this.displayedModelIdentity = $derived.by<ProjectModelIdentity | undefined>(() => {
            if (!this.displayedPath) return undefined
            return this.sourceSelection.sourceKind === 'build'
                ? {
                      sessionId: this.languageSessionId,
                      sourceKind: 'build',
                      buildGeneration: this.sourceSelection.buildGeneration,
                      path: this.displayedPath
                  }
                : {
                      sessionId: this.languageSessionId,
                      sourceKind: 'live',
                      path: this.displayedPath
                  }
        })
        this.displayedModelKey = $derived(
            this.displayedModelIdentity
                ? projectSourceModelKey(this.displayedModelIdentity)
                : 'empty'
        )
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
        this.activeDiagnostics = $derived(
            this.sourceView === 'live'
                ? this.liveLanguageDiagnostics
                : this.emulator.compilerDiagnostics
        )
        this.liveBuildHasErrors = $derived(
            this.languageAnalysis?.diagnostics.some(
                (diagnostic) => diagnostic.severity === 'error'
            ) ?? false
        )
        this.displayedDiagnostics = $derived(
            this.activeDiagnostics.filter(
                (diagnostic) => !diagnostic.file || diagnostic.file === this.displayedPath
            )
        )
        this.analysisStatus = $derived(
            this.sourceView === 'live' ? this.languageAnalysis?.fileStatus : undefined
        )
        this.displayedAnalysisStatus = $derived(this.analysisStatus?.[this.displayedPath])
        this.languageErrorCount = $derived(
            this.languageAnalysis?.diagnostics.filter(
                (diagnostic) => diagnostic.severity === 'error'
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
        this.terminalText = $derived(
            this.errorStrings
                ? `${this.errorStrings}\n${this.emulator.stdOut}`
                : this.emulator.stdOut
        )
        this.runInfo = $derived(
            this.emulator.terminated && this.emulator.executionTime >= 0
                ? `Ran in ${formatTime(this.emulator.executionTime)}`
                : ''
        )
        this.executionDisabled = $derived(
            this.host.readonly || this.emulator.terminated || this.emulator.interrupt !== undefined
        )
        this.undoDisabled = $derived(this.host.readonly || this.emulator.interrupt !== undefined)
        this.buildDisabled = $derived(this.host.readonly || this.liveBuildHasErrors)
        this.breakpointsEditable = $derived(
            canEditProjectBreakpoints(this.sourceSelection, {
                readonly: this.host.readonly,
                building: this.building,
                fileSystemLocked: this.fileSystemLocked
            })
        )
        this.displayedBreakpoints = $derived(
            (this.sourceView === 'snapshot' || !this.fileSystemLocked
                ? this.emulator.breakpoints
                : []
            )
                .filter((breakpoint) => breakpoint.file === this.displayedPath)
                .map((breakpoint) => breakpoint.line)
        )
        this.highlightedLine = $derived(
            isCurrentBuildLocation(
                this.sourceSelection,
                this.buildGeneration,
                this.emulator.currentFile
            )
                ? this.emulator.line
                : -1
        )
        this.editorDisabled = $derived(
            this.host.readonly ||
                this.running ||
                this.building ||
                this.sourceView === 'snapshot' ||
                this.displayedFile?.encoding !== 'plain' ||
                this.fileSystemLocked ||
                (this.emulator.canExecute && !this.emulator.terminated)
        )
        const start = project.entry ?? Object.keys(project.files)[0] ?? ''
        this.sourceSelection = liveSource(start)
        this.tabs = initialTabs(start)
        this.previousBuildSources = emulator.buildSources
        this.pc = makeRegister('PC', emulator.pc, emulator.systemSize)

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

        //each exit of the program goes in the Log with its running time
        let wasTerminated = untrack(() => this.emulator.terminated)
        $effect(() => {
            const terminated = this.emulator.terminated && this.emulator.canExecute
            if (terminated && !wasTerminated && !this.testing) {
                untrack(() =>
                    this.appendLog(
                        exitEntry({
                            executionTimeMs: this.emulator.executionTime,
                            errors: this.emulator.errors
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
    declare readonly displayedFile: ProjectFile | undefined
    declare readonly displayedCode: string
    declare readonly displayedLanguage: Project['language'] | 'c'
    declare readonly displayedModelIdentity: ProjectModelIdentity | undefined
    declare readonly displayedModelKey: string
    declare readonly retainedModelKeys: string[]
    declare readonly activeDiagnostics: Diagnostic[]
    declare readonly liveBuildHasErrors: boolean
    declare readonly displayedDiagnostics: Diagnostic[]
    /** Whether each File is assembled from the Entry file, on the live Files only. */
    declare readonly analysisStatus: ProjectAnalysisSnapshot['fileStatus'] | undefined
    declare readonly displayedAnalysisStatus:
        ProjectAnalysisSnapshot['fileStatus'][string] | undefined
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
    declare readonly errorStrings: string
    /** The Terminal's text: the Emulator's runtime errors, then what the program wrote. */
    declare readonly terminalText: string
    declare readonly runInfo: string
    declare readonly executionDisabled: boolean
    declare readonly undoDisabled: boolean
    declare readonly buildDisabled: boolean
    declare readonly breakpointsEditable: boolean
    /** The breakpoint lines of the displayed File, hidden on live contents during a Debug session. */
    declare readonly displayedBreakpoints: number[]
    declare readonly highlightedLine: number
    declare readonly editorDisabled: boolean

    // ---- lifecycle -----------------------------------------------------------------------------

    /** Starts what needs the page: the language worker, cross-file navigation and the shortcuts. */
    mount(): () => void {
        const unregisterNavigation = registerProjectNavigation(
            this.languageSessionId,
            async (identity, selection) => {
                if (identity.sourceKind === 'build') {
                    if (
                        identity.buildGeneration !== this.buildGeneration ||
                        !this.emulator.buildSources?.files[identity.path]
                    ) {
                        return false
                    }
                    this.show(buildSource(identity.path, identity.buildGeneration))
                } else {
                    if (!this.project.files[identity.path]) return false
                    this.show(liveSource(identity.path))
                }
                await tick()
                if (selection) {
                    const lineNumber =
                        'lineNumber' in selection ? selection.lineNumber : selection.startLineNumber
                    const column = 'column' in selection ? selection.column : selection.startColumn
                    this.revealEditorLine(lineNumber, column)
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
                this.liveLanguageDiagnostics = snapshot.diagnostics.map((diagnostic) =>
                    languageDiagnosticToDiagnostic(diagnostic, current)
                )
            }
            this.languageAnalysisPending = pending
        })
        const keydown = (e: KeyboardEvent) => this.handleKeyDown(e)
        const keyup = (e: KeyboardEvent) => this.pressedKeys.delete(e.code)
        const blur = () => this.pressedKeys.clear()
        window.addEventListener('keydown', keydown)
        window.addEventListener('keyup', keyup)
        window.addEventListener('blur', blur)
        return () => {
            window.removeEventListener('keydown', keydown)
            window.removeEventListener('keyup', keyup)
            window.removeEventListener('blur', blur)
            unsubscribeLanguageSession()
            unregisterNavigation()
            session.dispose()
            this.languageSession = undefined
            this.emulator.dispose()
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
    private show(selection: ProjectSourceSelection) {
        this.sourceSelection = selection
        this.tabs = openTab(this.tabs, selection.path)
    }

    private existsInBuild(path: string) {
        return this.emulator.buildSources?.files[path] !== undefined
    }

    revealEditorLine(lineNumber: number, column: number) {
        const editor = this.editor
        if (!editor) return
        editor.revealLineInCenter(lineNumber)
        editor.setPosition({ lineNumber, column })
    }

    /** Explorer navigation: changes the File, not which version of the Project is being looked at. */
    selectFile(path: string) {
        this.show(
            selectProjectFile(
                this.sourceSelection,
                path,
                this.buildGeneration,
                this.existsInBuild(path)
            )
        )
    }

    /** Clicking a tab: the same rule as the Explorer. */
    activateTab(path: string) {
        this.selectFile(path)
    }

    closeTab(path: string) {
        const next = closeTab(this.tabs, path)
        if (next === this.tabs) return
        this.tabs = next
        if (next.active !== this.displayedPath) this.selectFile(next.active)
    }

    private synchronizeBuildGeneration(buildSources: BuildSources | undefined): void {
        if (buildSources && buildSources !== this.previousBuildSources) this.buildGeneration += 1
        this.previousBuildSources = buildSources
    }

    async revealSourceLocation(file: string, line: number, column = 1) {
        const buildSources = this.emulator.buildSources
        if (!buildSources?.files[file]) return
        // A compile can reveal its first instruction before Svelte flushes the observer above.
        // Synchronize here as well so the selection and model URI always use the new Build.
        this.synchronizeBuildGeneration(buildSources)
        this.show(buildSource(file, this.buildGeneration))
        await tick()
        this.revealEditorLine(zeroBasedLineToMonaco(line), column)
    }

    async revealDiagnostic(diagnostic: Diagnostic) {
        const path =
            diagnostic.file ??
            this.emulator.buildSources?.entry ??
            this.project.entry ??
            this.displayedPath
        if (this.existsInBuild(path)) {
            await this.revealSourceLocation(path, diagnostic.lineIndex, diagnostic.column)
            return
        }
        this.show(liveSource(path))
        await tick()
        this.revealEditorLine(zeroBasedLineToMonaco(diagnostic.lineIndex), diagnostic.column)
    }

    revealCurrentInstruction() {
        if (this.emulator.line < 0) return
        void this.revealSourceLocation(this.emulator.currentFile, this.emulator.line)
    }

    /** After Stop: every tab shows the live File again, and tabs of Files that are gone close. */
    returnToLiveFiles() {
        const files = this.project.files
        const fallback = this.project.entry ?? Object.keys(files)[0] ?? ''
        this.tabs = retainTabs(this.tabs, (path) => files[path] !== undefined, fallback)
        this.sourceSelection = liveSource(this.tabs.active)
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
        this.moveFileBreakpoints(from, to)
        this.tabs = renameTab(this.tabs, from, to)
        if (this.displayedPath === from) this.selectFile(to)
    }

    fileDeleted(path: string) {
        this.moveFileBreakpoints(path)
        const fallback = this.project.entry ?? Object.keys(this.project.files)[0] ?? ''
        const shown = this.displayedPath === path
        this.tabs = removeTab(this.tabs, path, fallback)
        if (shown) this.selectFile(this.tabs.active)
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
        if (this.sourceView !== 'live') return
        //A File the Project no longer has is not recreated by typing into a stale model.
        if (!(path in this.project.files)) return
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

    toggleBreakpoint(line: number) {
        this.emulator.toggleBreakpoint(line, this.displayedPath)
    }

    // ---- execution -----------------------------------------------------------------------------

    private appendLog(draft: LogDraft) {
        this.log = appendLog(this.log, draft, ++this.logId, Date.now())
    }

    async build() {
        if (this.host.readonly || this.building || this.running) return
        if (this.fileSystemLocked) {
            //The Build button is hidden in this state, but the shortcut is not, and returning here
            //without a word left the key looking broken.
            toast.warn('Stop the current Debug session before building again')
            return
        }
        const started = performance.now()
        try {
            this.running = false
            this.building = true
            await this.emulator.compile(this.effectiveSettings.maxHistorySize, this.sourceInput)
        } catch (e) {
            console.error(e)
            toast.error('Error compiling code. ' + getM68kErrorMessage(e))
        } finally {
            this.building = false
            //also after a failed build: the directive is read before the program is assembled
            this.syncDisplay()
            const diagnostics = this.emulator.compilerDiagnostics
            const ok = this.emulator.canExecute
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
        if (this.building || this.running) return
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
        if (this.building || this.running) return
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
                this.effectiveSettings.maxHistorySize
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
        const emulator = this.emulator
        switch (shortcut?.type) {
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
