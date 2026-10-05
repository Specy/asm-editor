import type monaco from 'monaco-editor'
import type { WorkbenchSession } from './WorkbenchSession.svelte'
import { initialTabs, type FileTabs } from './fileTabs'
import {
    liveSource,
    canEditProjectBreakpoints,
    isCurrentBuildLocation,
    type ProjectSourceSelection
} from '$lib/monaco/projectSourceSelection'
import { projectSourceModelKey, type ProjectModelIdentity } from '$lib/languages/service/uri'
import { isShippedRuntimeAbi, RUNTIME_NAMESPACE } from '$lib/runtimeAbi'
import { assemblyLinesOf } from '$lib/sourceCompilation/mappingSelection'
import {
    compilationStatus,
    defaultSourceCompiler,
    editorFileLanguage,
    fileFingerprint,
    isCompilationTarget,
    sourceLanguage,
    type Optimization,
    type SourceCompiler
} from '$lib/sourceCompilation/records'

/** One editor widget and its tabs; file contents and execution belong to the session. */
export class EditorGroup {
    tabs = $state.raw<FileTabs>(initialTabs(''))
    sourceSelection = $state<ProjectSourceSelection>(liveSource(''))
    editor = $state.raw<monaco.editor.IStandaloneCodeEditor>()
    optimization = $state<Optimization>('0')
    sourceCompiler = $state<SourceCompiler>('clang')

    declare readonly displayedPath: string
    declare readonly sourceView: 'snapshot' | 'live'
    declare readonly displayedLanguage: ReturnType<typeof editorFileLanguage>

    constructor(
        readonly session: WorkbenchSession,
        readonly id: string,
        path = ''
    ) {
        this.tabs = initialTabs(path)
        this.sourceSelection = liveSource(path)
        this.displayedPath = $derived(this.sourceSelection.path)
        this.sourceView = $derived<'snapshot' | 'live'>(
            this.sourceSelection.sourceKind === 'build' ? 'snapshot' : 'live'
        )
        this.displayedLanguage = $derived(
            editorFileLanguage(this.displayedPath, this.session.project.language)
        )
        this.resetCompilationOptions()
    }

    resetCompilationOptions() {
        const record = this.session.project.compilations.find(
            (record) =>
                record.sourcePath === this.displayedPath || record.outputPath === this.displayedPath
        )
        this.optimization = record?.optimization ?? '0'
        this.sourceCompiler = record
            ? record.compilerId.includes('clang')
                ? 'clang'
                : 'gcc'
            : defaultSourceCompiler(this.session.project.language)
    }

    /** Whether the displayed File is a Runtime library member, which no Project owns. */
    get displayedLibraryMember() {
        return this.displayedPath.startsWith(RUNTIME_NAMESPACE)
    }
    /** Whether the displayed library member's C source can open beside it and is not open yet. */
    get libraryMemberSourceAvailable() {
        const map = this.session.runtimeSourceMap(this.displayedPath)
        return !!map && !this.session.groups.some((group) => group.displayedPath === map.sourcePath)
    }
    get displayedFile() {
        //a member of the Runtime library the Build linked: read-only, and outside the Project
        if (this.displayedLibraryMember) return this.session.runtimeMemberFile(this.displayedPath)
        return this.sourceView === 'snapshot'
            ? this.session.emulator.buildSources?.files[this.displayedPath]
            : this.session.project.files[this.displayedPath]
    }
    get displayedCode() {
        return this.displayedFile?.encoding === 'plain' ? this.displayedFile.content : ''
    }
    get displayedCompilation() {
        return this.session.project.compilations.find(
            (record) => record.outputPath === this.displayedPath
        )
    }
    get compilablePath() {
        return sourceLanguage(this.displayedPath)
            ? this.displayedPath
            : this.displayedCompilation?.sourcePath
    }
    get sourceCompileDisabled() {
        const s = this.session
        return (
            s.host.readonly ||
            s.compiling ||
            s.building ||
            s.running ||
            s.fileSystemLocked ||
            !isCompilationTarget(s.project.language) ||
            !this.compilablePath ||
            s.project.files[this.compilablePath]?.encoding !== 'plain'
        )
    }
    get compilationMap() {
        const maps = this.session.project.sourceMaps
        const map = Object.prototype.hasOwnProperty.call(maps, this.displayedPath)
            ? maps[this.displayedPath]
            : undefined
        return map && map.outputFingerprint === fileFingerprint(this.displayedFile)
            ? map
            : undefined
    }
    get compilationNotice() {
        const record = this.displayedCompilation
        if (!record) return ''
        if (this.unsupportedRuntimeAbi)
            return `Compiled against Runtime ABI ${record.runtimeAbi}, which this editor does not provide. Recompile to build it.`
        const status = compilationStatus(
            record,
            this.session.project.files,
            this.session.project.language
        )
        if (status.stale)
            return 'Stale assembly: source or headers changed. Recompile to update this File.'
        if (status.edited)
            return 'Assembly edited manually. The Source map was removed; recompilation will replace your edits.'
        if (this.sourceMappingLost)
            return 'Source mapping is not available in this session. Click here to recompile and restore it.'
        return ''
    }
    /**
     * Whether the displayed Generated assembly is current but has no Source map to draw, which only
     * compiling it again restores; the notice for it is itself the button that does.
     */
    get sourceMappingLost() {
        const record = this.displayedCompilation
        if (!record || this.unsupportedRuntimeAbi || this.compilationMap) return false
        const status = compilationStatus(
            record,
            this.session.project.files,
            this.session.project.language
        )
        return !status.stale && !status.edited
    }
    /**
     * Whether the displayed Generated assembly requires a Runtime ABI this editor does not ship, as
     * after opening a Project saved by a newer editor: its Build is blocked until it is compiled
     * again ([ADR 0031](../../../docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)).
     */
    get unsupportedRuntimeAbi() {
        const abi = this.displayedCompilation?.runtimeAbi
        return abi !== undefined && !isShippedRuntimeAbi(abi)
    }
    get recompilationNeeded() {
        const record = this.displayedCompilation
        if (!record) return false
        if (this.unsupportedRuntimeAbi) return true
        const status = compilationStatus(
            record,
            this.session.project.files,
            this.session.project.language
        )
        return status.stale || status.edited
    }
    get modelIdentity(): ProjectModelIdentity | undefined {
        if (!this.displayedPath) return undefined
        return { sessionId: this.session.languageSessionId, ...this.sourceSelection }
    }
    get modelKey() {
        return this.modelIdentity ? projectSourceModelKey(this.modelIdentity) : `empty:${this.id}`
    }
    get displayedDiagnostics() {
        const s = this.session
        const diagnostics =
            this.sourceView === 'live'
                ? [...s.liveLanguageDiagnostics, ...s.sourceDiagnostics]
                : s.emulator.compilerDiagnostics
        return diagnostics.filter((item) => !item.file || item.file === this.displayedPath)
    }
    get breakpointsEditable() {
        const s = this.session
        return (
            //a C or C++ File's Breakpoints stop on its Generated assembly; the library's C source
            //is not the user's code, and Step does not stop in it
            (this.displayedLanguage === s.project.language ||
                (isCompilationTarget(s.project.language) && !this.displayedLibraryMember)) &&
            canEditProjectBreakpoints(this.sourceSelection, {
                readonly: s.host.readonly,
                building: s.building,
                fileSystemLocked: s.fileSystemLocked
            })
        )
    }
    get displayedBreakpoints() {
        const s = this.session
        return (this.sourceView === 'snapshot' || !s.fileSystemLocked ? s.emulator.breakpoints : [])
            .filter((item) => item.file === this.displayedPath)
            .map((item) => item.line)
    }
    /** Lines of this assembly where a Breakpoint set on its C or C++ source stops. */
    get displayedMappedBreakpoints() {
        const s = this.session
        if (this.sourceView !== 'snapshot' && s.fileSystemLocked) return []
        const own = this.displayedBreakpoints
        return s.mappedBreakpoints
            .filter((item) => item.file === this.displayedPath && !own.includes(item.line))
            .map((item) => item.line)
    }
    get instructionLine() {
        const s = this.session
        return isCurrentBuildLocation(
            this.sourceSelection,
            s.buildGeneration,
            s.emulator.currentFile
        )
            ? s.emulator.line
            : -1
    }
    get highlightedLine() {
        const pair = this.session.mappingPair
        if (pair?.source === this) {
            const location = this.session.executionSourceLocation
            return location?.path === this.displayedPath ? location.line : -1
        }
        return this.instructionLine
    }
    get mappedLines() {
        const s = this.session
        const pair = s.mappingPair
        const selected = s.mappingSelection
        if (!pair || !selected) return []
        if (pair.source === this)
            return selected.flatMap((location) =>
                location.path === this.displayedPath ? [location.line] : []
            )
        if (pair.assembly !== this) return []
        return assemblyLinesOf(pair.map, selected)
    }
    get lineColoring() {
        const s = this.session
        if (s.mappingPair?.assembly === this) return s.mappingColors?.assembly
        if (s.mappingPair?.source === this) return s.mappingColors?.source.get(this.displayedPath)
        return undefined
    }
    get activeLineColors() {
        return this.session.activeMappingColors
    }
    get editorDisabled() {
        const s = this.session
        return (
            s.host.readonly ||
            s.running ||
            s.building ||
            this.sourceView === 'snapshot' ||
            this.displayedLibraryMember ||
            this.displayedFile?.encoding !== 'plain' ||
            s.fileSystemLocked ||
            (s.emulator.canExecute && !s.emulator.terminated)
        )
    }
}
