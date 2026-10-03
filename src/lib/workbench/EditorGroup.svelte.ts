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
import {
    compilationStatus,
    editorFileLanguage,
    fileFingerprint,
    isCompilationTarget,
    sourceLanguage,
    type Optimization
} from '$lib/sourceCompilation/records'

/** One editor widget and its tabs; file contents and execution belong to the session. */
export class EditorGroup {
    tabs = $state.raw<FileTabs>(initialTabs(''))
    sourceSelection = $state<ProjectSourceSelection>(liveSource(''))
    editor = $state.raw<monaco.editor.IStandaloneCodeEditor>()
    optimization = $state<Optimization>('0')

    constructor(
        readonly session: WorkbenchSession,
        readonly id: string,
        path = ''
    ) {
        this.tabs = initialTabs(path)
        this.sourceSelection = liveSource(path)
        this.resetOptimization()
    }

    resetOptimization() {
        this.optimization =
            this.session.project.compilations.find(
                (record) =>
                    record.sourcePath === this.displayedPath ||
                    record.outputPath === this.displayedPath
            )?.optimization ?? '0'
    }

    get displayedPath() {
        return this.sourceSelection.path
    }
    get sourceView() {
        return this.sourceSelection.sourceKind === 'build' ? 'snapshot' : 'live'
    }
    get displayedFile() {
        return this.sourceView === 'snapshot'
            ? this.session.emulator.buildSources?.files[this.displayedPath]
            : this.session.project.files[this.displayedPath]
    }
    get displayedCode() {
        return this.displayedFile?.encoding === 'plain' ? this.displayedFile.content : ''
    }
    get displayedLanguage() {
        return editorFileLanguage(this.displayedPath, this.session.project.language)
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
        const status = compilationStatus(
            record,
            this.session.project.files,
            this.session.project.language
        )
        if (status.stale)
            return 'Stale assembly: source or headers changed. Recompile to update this File.'
        if (status.edited)
            return 'Assembly edited manually. The Source map was removed; recompilation will replace your edits.'
        if (!this.compilationMap)
            return 'Source mapping is not available in this session. Recompile to restore source mapping.'
        return ''
    }
    get recompilationNeeded() {
        const record = this.displayedCompilation
        if (!record) return false
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
            this.displayedLanguage === s.project.language &&
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
        if (pair.source === this) return selected.path === this.displayedPath ? [selected.line] : []
        if (pair.assembly !== this) return []
        return pair.map.lines.flatMap((location, line) =>
            location?.path === selected.path && location.line === selected.line ? [line] : []
        )
    }
    get lineColoring() {
        const s = this.session
        if (s.mappingPair?.assembly === this) return s.mappingColors?.assembly
        if (s.mappingPair?.source === this) return s.mappingColors?.source.get(this.displayedPath)
        return undefined
    }
    get editorDisabled() {
        const s = this.session
        return (
            s.host.readonly ||
            s.running ||
            s.building ||
            this.sourceView === 'snapshot' ||
            this.displayedFile?.encoding !== 'plain' ||
            s.fileSystemLocked ||
            (s.emulator.canExecute && !s.emulator.terminated)
        )
    }
}
