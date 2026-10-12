import type monaco from 'monaco-editor'
import type { WorkbenchSession } from './WorkbenchSession.svelte'
import { initialTabs, type FileTabs } from './fileTabs'
import {
    liveSource,
    canEditProjectBreakpoints,
    isCurrentBuildLocation,
    type ProjectSourceSelection
} from '#lib/monaco/projectSourceSelection.ts'
import { projectSourceModelKey, type ProjectModelIdentity } from '#lib/languages/service/uri.ts'
import { isLineBreakpoint } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { lineOfAddress } from '#lib/listing/listing.ts'
import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import { isLibraryListingPath } from '#lib/listing/listingPaths.ts'
import { RUNTIME_NAMESPACE } from '#lib/runtimeAbi.ts'
import { hasRuntimeLibraryFor } from '#lib/sourceRuntime/runtimeLibrary.ts'
import { isEnvironmentHeaderPath } from '#lib/sourceRuntime/environmentLibrary.ts'
import { assemblyLinesOf } from '#lib/sourceCompilation/mappingSelection.ts'
import {
    compilationStatus,
    defaultSourceCompiler,
    editorFileLanguage,
    fileFingerprint,
    isCompilationTarget,
    sourceLanguage,
    type Optimization,
    type SourceCompiler
} from '#lib/sourceCompilation/records.ts'

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
    /**
     * The Listing the displayed File is shown as: an Executable's, or that of a library the running
     * program loaded, under `@lib/` ([binary-import.md](../../../../../docs/design/binary-import.md),
     * decisions 5 and 18). It is read-only and is no File of the Project.
     */
    declare readonly displayedListing: ListingDocument | undefined

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
        this.displayedListing = $derived(this.session.listingFor(this.sourceSelection))
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
    /**
     * Whether the displayed File is `<sim.h>`: read-only like a library member, but its functions
     * are compiled into the program's own Generated assembly, so Breakpoints stop in them.
     */
    get displayedEnvironmentHeader() {
        return isEnvironmentHeaderPath(this.displayedPath)
    }
    /** Whether the displayed library member's C source can open beside it and is not open yet. */
    get libraryMemberSourceAvailable() {
        const map = this.session.runtimeSourceMap(this.displayedPath)
        return !!map && !this.session.groups.some((group) => group.displayedPath === map.sourcePath)
    }
    /** Whether the displayed Listing is a library's, which takes no Breakpoints (decision 11). */
    get displayedLibraryListing() {
        return isLibraryListingPath(this.displayedPath)
    }
    get displayedFile() {
        //a member of the Runtime library the Build linked: read-only, and outside the Project
        if (this.displayedLibraryMember) return this.session.runtimeMemberFile(this.displayedPath)
        //a library's Listing is no File at all
        if (this.displayedLibraryListing) return undefined
        return this.sourceView === 'snapshot'
            ? this.session.emulator.buildSources?.files[this.displayedPath]
            : this.session.project.files[this.displayedPath]
    }
    get displayedCode() {
        const listing = this.displayedListing
        if (listing) return listing.listing?.text ?? ''
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
     * Whether the displayed Generated assembly requires a Runtime ABI whose library this editor
     * does not ship for the Project's Target, such as an ABI from a newer editor. Its Build is
     * blocked until it is compiled again
     * ([ADR 0031](../../../../../docs/adr/0031-projects-pin-the-runtime-abi-not-its-implementation.md)).
     */
    get unsupportedRuntimeAbi() {
        const abi = this.displayedCompilation?.runtimeAbi
        return abi !== undefined && !hasRuntimeLibraryFor(abi, this.session.project.language)
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
        //a Listing's model is made once its text exists, never filled in afterwards: Monaco decides
        //at a model's creation whether it is too large to highlight
        if (this.displayedListing && this.displayedListing.status !== 'ready') return undefined
        return { sessionId: this.session.languageSessionId, ...this.sourceSelection }
    }
    get modelKey() {
        return this.modelIdentity ? projectSourceModelKey(this.modelIdentity) : `empty:${this.id}`
    }
    get displayedDiagnostics() {
        const s = this.session
        const diagnostics =
            this.sourceView === 'live' ? s.liveViewDiagnostics : s.emulator.compilerDiagnostics
        return diagnostics.filter((item) => !item.file || item.file === this.displayedPath)
    }
    get breakpointsEditable() {
        const s = this.session
        //`<sim.h>` reads the same in every Build, so like a Build's own File it takes Breakpoints
        //during a Debug session
        if (this.displayedEnvironmentHeader) return !s.host.readonly && !s.building
        //an Executable's Listing takes them on its instructions, a library's none: a Breakpoint
        //is only ever in the Executable (decision 11)
        const listing = this.displayedListing
        if (listing)
            return (
                !this.displayedLibraryListing &&
                listing.status === 'ready' &&
                canEditProjectBreakpoints(this.sourceSelection, {
                    readonly: s.host.readonly,
                    building: s.building,
                    fileSystemLocked: s.fileSystemLocked
                })
            )
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
        //a Listing's Breakpoints are addresses, drawn on the line that holds them now
        const listing = this.displayedListing?.listing
        return (
            this.sourceView === 'snapshot' || !s.fileSystemLocked || this.displayedEnvironmentHeader
                ? s.emulator.breakpoints
                : []
        )
            .filter((item) => item.file === this.displayedPath)
            .flatMap((item) => {
                if (isLineBreakpoint(item)) return [item.line]
                const line = listing ? lineOfAddress(listing, item.address) : -1
                return line >= 0 ? [line] : []
            })
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
            this.displayedListing !== undefined ||
            this.displayedFile?.encoding !== 'plain' ||
            s.fileSystemLocked ||
            (s.emulator.canExecute && !s.emulator.terminated)
        )
    }
}
