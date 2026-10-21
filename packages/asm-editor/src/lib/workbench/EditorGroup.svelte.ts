import type monaco from 'monaco-editor'
import { ARGUMENTS_DIAGNOSTIC_SOURCE } from '#lib/commandLine.ts'
import type { WorkbenchSession } from './WorkbenchSession.svelte'
import { initialTabs, type FileTabs } from './fileTabs'
import {
    liveSource,
    canEditProjectBreakpoints,
    isCurrentBuildLocation,
    type ProjectSourceSelection
} from '#lib/monaco/projectSourceSelection.ts'
import { projectSourceModelKey, type ProjectModelIdentity } from '#lib/languages/service/uri.ts'
import type { ProjectFileKind } from '#lib/fileKinds.ts'
import { textFileLanguage, type TextFileLanguage } from '#lib/textFileLanguages.ts'
import { overwritesOnly } from '#lib/projectFiles.ts'
import { fileViewsOf, resolveFileView, type FileView } from '#lib/fileViews.ts'
import type { HexViewState } from '#cmp/specific/workbench/hex/hexGrid.ts'
import {
    isLineBreakpoint,
    type SourceBreakpoint
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import {
    LINE_KIND,
    lineOfAddress,
    type Listing,
    type ListingFunction
} from '#lib/listing/listing.ts'
import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
import type { PseudocodeDocument } from '#lib/pseudocode/pseudocodeDocuments.svelte.ts'
import {
    pseudocodeBreakpointLines,
    pseudocodeLineOfAddress
} from '#lib/pseudocode/pseudocodeMap.ts'
import type { PatchedListing } from '#lib/listing/listingPatcher.svelte.ts'
import type { PatchPrompt } from './patchPrompt.svelte'
import { RUNTIME_NAMESPACE } from '#lib/runtimeAbi.ts'
import { hasRuntimeLibraryFor } from '#lib/sourceRuntime/runtimeLibrary.ts'
import { isEnvironmentHeaderPath } from '#lib/sourceRuntime/environmentLibrary.ts'
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

    /**
     * The view this pane last showed each File in
     * ([file-views.md](../../../../../docs/design/file-views.md), decision 8), while its tab is
     * open; a File it has none for opens in the view the Project saved for it, or its default.
     */
    views = $state.raw<Readonly<Record<string, FileView>>>({})
    /**
     * Where this pane was in each File it showed in the Hex editor, while its tab is open: not
     * reactive, since only the Hex editor reads it, when it opens the File again.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Read once when a Hex editor opens a File; nothing tracks it.
    readonly hexViews = new Map<string, HexViewState>()
    /** The bytes Show in Hex asked this pane to select, until its Hex editor has. */
    hexReveal = $state.raw<{ path: string; offset: number; length: number } | undefined>()
    /**
     * Why this pane shows a File in the Hex editor where its Preview was asked for: the browser
     * could not show it after all (decision 14). The note stands over the bytes until a view is
     * chosen for the File again, and the Preview is tried anew when that view is the Preview.
     */
    previewNotes = $state.raw<Readonly<Record<string, string>>>({})
    /**
     * The function this pane shows each Executable's Pseudocode of, by its link-time address,
     * while its tab is open: the one the Listing's cursor was last in, a call followed to, or the
     * program counter's ([file-views.md](../../../../../docs/design/file-views.md), decision 6).
     */
    pseudocodeFunctions = $state.raw<Readonly<Record<string, number>>>({})
    /** The 0-based line of the editor's cursor, in whatever the pane shows; -1 before it has one. */
    cursorLine = $state(-1)

    declare readonly displayedPath: string
    declare readonly sourceView: 'snapshot' | 'live'
    /** What the displayed File is, from its bytes; undefined for a library's Listing or no File. */
    declare readonly displayedKind: ProjectFileKind | undefined
    /** How the displayed File is shown: as text, in the Hex editor, as a Listing, as a Preview. */
    declare readonly displayedView: FileView
    declare readonly displayedLanguage: ReturnType<typeof editorFileLanguage> | TextFileLanguage
    /**
     * The Listing the displayed File is shown as: an Executable's, or that of a library the running
     * program loaded, under `@lib/` ([binary-import.md](../../../../../docs/design/binary-import.md),
     * decisions 5 and 18). It is read-only and is no File of the Project.
     */
    declare readonly displayedListing: ListingDocument | undefined
    /**
     * The running Executable's patched lines, when this group shows its Listing in the current
     * Build ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13).
     */
    declare readonly displayedPatches: PatchedListing | undefined
    /** The displayed Listing as shown: with its patched lines, if any, in place. */
    declare readonly displayedListingView: Listing | undefined
    /**
     * The Listing a pane showing an Executable's Pseudocode decompiles from and pairs with: the
     * one a Listing pane of the same version of the File shows, generated for it even when no
     * pane shows the Listing. Undefined in every other view, so a pane showing the bytes makes no
     * Listing.
     */
    declare readonly pseudocodeListing: ListingDocument | undefined
    /** The function whose Pseudocode the pane shows, once the Listing is ready. */
    declare readonly pseudocodeFunction: ListingFunction | undefined
    /** That function's Pseudocode, decompiling or decompiled. */
    declare readonly requestedPseudocode: PseudocodeDocument | undefined
    /**
     * The Pseudocode the pane shows: the function's once it is decompiled or has failed, and until
     * then the one it showed before, of the same Listing, so that moving between functions neither
     * empties the pane nor resizes the pair for the moment a function takes. A function that takes
     * longer is covered by "Decompiling…".
     */
    declare readonly displayedPseudocode: PseudocodeDocument | undefined
    /**
     * The model key of the Pseudocode this pane last showed of each File it has open, whatever it
     * shows now: kept, so that the File shown again finds its model and scroll position as it was.
     */
    declare readonly pseudocodeModelKeys: readonly string[]
    /** The "Patch instruction…" prompt opened over this group's Listing; see `openPatchPrompt`. */
    patchPrompt = $state.raw<PatchPrompt | undefined>()

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
        //Pseudocode reads like C, and a Listing like the Target's assembly, whatever the
        //Executable's name; a File's text like what its name says it is
        this.displayedLanguage = $derived(
            this.displayedView === 'pseudocode'
                ? 'c'
                : (this.displayedView === 'text' && textFileLanguage(this.displayedPath)) ||
                      editorFileLanguage(this.displayedPath, this.session.project.language)
        )
        this.displayedKind = $derived(
            this.session.fileKindOf(this.displayedFile, this.displayedPath)
        )
        this.displayedView = $derived(this.viewOf(this.displayedPath, this.displayedKind))
        //generated only for a pane that shows it: an Executable in the Hex editor needs none
        this.displayedListing = $derived(
            this.displayedView === 'listing'
                ? this.session.listingFor(this.sourceSelection)
                : undefined
        )
        this.displayedPatches = $derived.by(() => {
            const patched = this.session.emulator.patcher?.patched
            const selection = this.sourceSelection
            return patched &&
                patched.document === this.displayedListing &&
                patched.path === this.displayedPath &&
                selection.sourceKind === 'build' &&
                selection.buildGeneration === this.session.buildGeneration
                ? patched
                : undefined
        })
        this.displayedListingView = $derived(
            this.displayedPatches?.listing ?? this.displayedListing?.listing
        )
        this.pseudocodeListing = $derived(
            this.displayedView === 'pseudocode'
                ? this.session.listingFor(this.sourceSelection)
                : undefined
        )
        this.pseudocodeFunction = $derived.by(() => {
            const listing = this.pseudocodeListing?.listing
            return listing ? this.session.pseudocodeFunctionFor(this, listing) : undefined
        })
        this.requestedPseudocode = $derived.by(() => {
            const document = this.pseudocodeListing
            const fn = this.pseudocodeFunction
            const file = this.displayedFile
            return document && fn && file
                ? this.session.pseudocode.open(this.displayedPath, file, document, fn)
                : undefined
        })
        let settled: PseudocodeDocument | undefined
        this.displayedPseudocode = $derived.by(() => {
            const requested = this.requestedPseudocode
            if (requested?.status !== 'decompiling') return (settled = requested)
            return settled?.listingDocument === requested.listingDocument &&
                settled.path === requested.path
                ? settled
                : requested
        })
        let shown: Readonly<Record<string, string>> = {}
        this.pseudocodeModelKeys = $derived.by(() => {
            const paths = this.tabs.paths
            const identity = this.modelIdentity
            const kept = Object.entries(shown).filter(([path]) => paths.includes(path))
            if (identity?.view === 'pseudocode')
                kept.push([identity.path, projectSourceModelKey(identity)])
            shown = Object.fromEntries(kept)
            return Object.values(shown)
        })
        this.resetCompilationOptions()
    }

    /**
     * The view this pane shows a File of this kind in: the one it last showed it in, else the one
     * last chosen for it anywhere, which the Project saves, when the kind offers it; else the
     * kind's default. A library's Listing is no File and is only ever a Listing.
     */
    viewOf(path: string, kind: ProjectFileKind | undefined): FileView {
        if (!kind && this.session.emulator.listings?.isLibrary(path)) return 'listing'
        return resolveFileView(kind, this.views[path], this.session.project.fileViews?.[path])
    }

    /**
     * Shows a File in another view in this pane, when its kind offers that view. With `remember`,
     * as when a person picks it, the Project saves it as the File's last view.
     */
    setView(path: string, view: FileView, remember = true) {
        const kind = path === this.displayedPath ? this.displayedKind : this.session.kindAt(path)
        if (resolveFileView(kind, view) !== view) return
        if (remember) this.forgetPreviewNote(path)
        if (this.views[path] !== view) this.views = { ...this.views, [path]: view }
        if (remember) this.session.viewChosen(path, view, kind)
    }

    /**
     * The browser could not preview the File at `path` after all: this pane shows its bytes
     * instead, under the note that says why, without that counting as a view anyone chose.
     */
    previewUnavailable(path: string, note: string) {
        this.previewNotes = { ...this.previewNotes, [path]: note }
        this.setView(path, 'hex', false)
    }

    private forgetPreviewNote(path: string, to?: string) {
        if (!Object.hasOwn(this.previewNotes, path)) return
        const notes = Object.entries(this.previewNotes).filter(([key]) => key !== path)
        if (to !== undefined) notes.push([to, this.previewNotes[path]])
        this.previewNotes = Object.fromEntries(notes)
    }

    /** Shows the Pseudocode of the function at a link-time address, when this pane shows one. */
    followFunction(path: string, address: number) {
        if (this.pseudocodeFunctions[path] !== address)
            this.pseudocodeFunctions = { ...this.pseudocodeFunctions, [path]: address }
    }

    /** Forgets the view of a File whose tab closed here, or carries it to a renamed path. */
    moveView(from: string, to?: string) {
        this.forgetPreviewNote(from, to)
        if (Object.hasOwn(this.pseudocodeFunctions, from)) {
            const functions = Object.entries(this.pseudocodeFunctions).filter(
                ([path]) => path !== from && path !== to
            )
            if (to !== undefined) functions.push([to, this.pseudocodeFunctions[from]])
            this.pseudocodeFunctions = Object.fromEntries(functions)
        }
        const place = this.hexViews.get(from)
        this.hexViews.delete(from)
        if (place && to !== undefined) this.hexViews.set(to, place)
        if (!Object.hasOwn(this.views, from)) return
        const views = Object.entries(this.views).filter(([path]) => path !== from && path !== to)
        if (to !== undefined) views.push([to, this.views[from]])
        this.views = Object.fromEntries(views)
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
    /**
     * The open "Patch instruction…" prompt, while the Listing line it patches is still shown in
     * the Debug session it was opened in.
     */
    get openPatchPrompt(): PatchPrompt | undefined {
        const prompt = this.patchPrompt
        const selection = this.sourceSelection
        return prompt &&
            prompt.site.document === this.displayedListing &&
            prompt.site.path === this.displayedPath &&
            selection.sourceKind === 'build' &&
            selection.buildGeneration === this.session.buildGeneration &&
            prompt.buildGeneration === this.session.buildGeneration
            ? prompt
            : undefined
    }
    /**
     * Whether the displayed Listing is a library's the running program loaded, which takes no
     * Breakpoints (decision 11); a Project File under `@lib/` is an ordinary File.
     */
    get displayedLibraryListing() {
        return this.session.emulator.listings?.isLibrary(this.displayedPath) ?? false
    }
    get displayedFile() {
        //a member of the Runtime library the Build linked: read-only, and outside the Project
        if (this.displayedLibraryMember) return this.session.runtimeMemberFile(this.displayedPath)
        //a library's Listing is no File at all
        if (this.displayedLibraryListing) return undefined
        //the Build output is outside the Project too, and the same in either version
        return (
            (this.sourceView === 'snapshot'
                ? this.session.emulator.buildSources?.files[this.displayedPath]
                : this.session.project.files[this.displayedPath]) ??
            this.session.buildOutputAt(this.displayedPath)
        )
    }
    /**
     * Whether the displayed File is the Build output: the program the last Build linked, which
     * shows like an Executable but is read-only, takes no Breakpoints and never shows where the
     * program is, since the debugger follows its source
     * ([ADR 0050](../../../../../docs/adr/0050-the-built-program-is-a-build-output-never-saved.md)).
     */
    get displayedBuildOutput() {
        const output = this.session.buildOutputAt(this.displayedPath)
        return output !== undefined && this.displayedFile === output
    }
    get displayedCode() {
        if (this.displayedListing) return this.displayedListingView?.text ?? ''
        if (this.displayedView === 'pseudocode')
            return this.displayedPseudocode?.status === 'ready' ? this.displayedPseudocode.text : ''
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
    /**
     * The views the displayed File can be switched between, in the order the view switch offers
     * them (decision 4): Hex · Disassemble · Decompile for an Executable, Preview · Hex for a File
     * the browser can show, and none where there is only one view, as for text and other bytes. A
     * library's Listing is no File and has none.
     */
    get viewSwitch(): readonly FileView[] {
        if (!this.displayedFile || this.displayedLibraryMember) return []
        const views = fileViewsOf(this.displayedKind)
        return views.length > 1 ? views : []
    }
    /**
     * The Entry path of the Program whose Entry file the pane shows, which its Build and Test act
     * on ([programs.md](../../../../../docs/design/programs.md), decision 5): a File of the live
     * Project, so no Runtime library member, library Listing or Build output, and never a
     * Program whose Entry is missing, which there is nothing to show of. Undefined for any other
     * File, which has no Build outside a Debug session.
     */
    get displayedProgram(): string | undefined {
        const path = this.displayedPath
        const project = this.session.project
        if (!path || this.displayedLibraryMember || this.displayedLibraryListing) return undefined
        return project.program(path) && Object.hasOwn(project.files, path) ? path : undefined
    }
    /**
     * Whether the execution dock floats over this pane. `controls` says whether the layout puts
     * the execution controls in a pane, as a desktop and a phone do; a tablet has one bar for
     * them. During a Debug session the controls group has it, and outside one every pane showing
     * an Entry file, for its Program's Build ([programs-plan.md](../../../../../docs/design/programs-plan.md),
     * decision 8); a source File its compile dock outside a Debug session, and on every device a
     * File shown in more than one way its view switch.
     */
    hasDock(controls: boolean): boolean {
        const s = this.session
        if (!this.displayedPath) return false
        return (
            (controls &&
                (s.debugSession
                    ? s.controlsGroup === this
                    : this.displayedProgram !== undefined)) ||
            ((!!sourceLanguage(this.displayedPath) || this.recompilationNeeded) &&
                !s.debugSession) ||
            this.viewSwitch.length > 1
        )
    }
    /** Whether the displayed view is text in the code editor: a File's, a Listing or Pseudocode. */
    get showsCode() {
        const view = this.displayedView
        return view === 'text' || view === 'listing' || view === 'pseudocode'
    }
    get modelIdentity(): ProjectModelIdentity | undefined {
        if (!this.displayedPath || !this.showsCode) return undefined
        const view = this.displayedView
        //a Listing's model is made once its text exists, never filled in afterwards: Monaco decides
        //at a model's creation whether it is too large to highlight
        if (this.displayedListing && this.displayedListing.status !== 'ready') return undefined
        //and a function's Pseudocode once it is decompiled, a model of its own for each function
        const pseudocode = view === 'pseudocode' ? this.displayedPseudocode : undefined
        if (view === 'pseudocode' && pseudocode?.status !== 'ready') return undefined
        return {
            sessionId: this.session.languageSessionId,
            ...this.sourceSelection,
            //a Listing's model is the File's as much as its text's is, so the view tells them apart
            ...(view === 'listing' || view === 'pseudocode' ? { view } : {}),
            ...(pseudocode ? { functionAddress: pseudocode.fn.address } : {})
        }
    }
    get modelKey() {
        return this.modelIdentity ? projectSourceModelKey(this.modelIdentity) : `empty:${this.id}`
    }
    get displayedDiagnostics() {
        const s = this.session
        //a Pseudocode is the decompiler's, which no Build or check reports on
        if (this.displayedView === 'pseudocode') return []
        const diagnostics =
            this.sourceView === 'live' ? s.liveViewDiagnostics : s.emulator.compilerDiagnostics
        //a Diagnostic of no File belongs to whichever File is shown, except the Arguments', which
        //belong to the Command line
        return diagnostics.filter(
            (item) =>
                (!item.file && item.source !== ARGUMENTS_DIAGNOSTIC_SOURCE) ||
                item.file === this.displayedPath
        )
    }
    get breakpointsEditable() {
        const s = this.session
        //a Pseudocode line's go on its instructions, in the Executable's Listing (decision 10): as
        //the Listing's, none for the Build output, whose program the debugger follows in its source
        if (this.displayedView === 'pseudocode')
            return (
                this.displayedPseudocode?.map !== undefined &&
                !this.displayedLibraryListing &&
                !this.displayedBuildOutput &&
                canEditProjectBreakpoints(this.sourceSelection, {
                    readonly: s.host.readonly,
                    building: s.building,
                    fileSystemLocked: s.fileSystemLocked
                })
            )
        //`<sim.h>` reads the same in every Build, so like a Build's own File it takes Breakpoints
        //during a Debug session
        if (this.displayedEnvironmentHeader) return !s.host.readonly && !s.building
        //an Executable's Listing takes them on its instructions, a library's none: a Breakpoint
        //is only ever in the Executable (decision 11)
        const listing = this.displayedListing
        if (listing)
            return (
                !this.displayedLibraryListing &&
                !this.displayedBuildOutput &&
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
    /**
     * The displayed File's Breakpoints, as this pane draws them: during a Debug session only in
     * the Build's version, where they apply.
     */
    get shownBreakpoints(): SourceBreakpoint[] {
        const s = this.session
        return (
            this.sourceView === 'snapshot' || !s.fileSystemLocked || this.displayedEnvironmentHeader
                ? s.emulator.breakpoints
                : []
        ).filter((item) => item.file === this.displayedPath)
    }
    /** The link-time addresses of those Breakpoints that are an Executable's. */
    get shownAddressBreakpoints(): number[] {
        return this.shownBreakpoints.flatMap((item) =>
            isLineBreakpoint(item) ? [] : [item.address]
        )
    }
    get displayedBreakpoints(): number[] {
        //a Pseudocode marks each line whose instructions carry one, wherever it was set
        //(decision 10); its Build output's Listing takes none, so neither does it
        if (this.displayedView === 'pseudocode') {
            const document = this.displayedPseudocode
            return document?.map && !this.displayedBuildOutput
                ? pseudocodeBreakpointLines(
                      document.map,
                      document.listing,
                      this.shownAddressBreakpoints
                  )
                : []
        }
        //a Listing's Breakpoints are addresses, drawn on the line that holds them now
        const listing = this.displayedListing?.listing
        return this.shownBreakpoints.flatMap((item) => {
            if (isLineBreakpoint(item)) return [item.line]
            const line = listing ? lineOfAddress(listing, item.address) : -1
            return line >= 0 ? [line] : []
        })
    }
    /** Lines of this assembly where a Breakpoint set on its C or C++ source stops. */
    get displayedMappedBreakpoints() {
        const s = this.session
        if (this.sourceView !== 'snapshot' && s.fileSystemLocked) return []
        if (this.displayedView === 'pseudocode') return []
        const own = this.displayedBreakpoints
        return s.mappedBreakpoints
            .filter((item) => item.file === this.displayedPath && !own.includes(item.line))
            .map((item) => item.line)
    }
    /**
     * Whether the displayed view draws the program's current instruction on its line: a File's
     * text or its Listing, not its bytes or a Preview.
     */
    get showsInstructions() {
        return this.displayedView === 'text' || this.displayedView === 'listing'
    }
    get instructionLine() {
        const s = this.session
        return this.showsInstructions &&
            isCurrentBuildLocation(this.sourceSelection, s.buildGeneration, s.emulator.currentFile)
            ? s.emulator.line
            : -1
    }
    /**
     * A note on the current line of a Listing when the program runs from inside the instruction
     * the line shows, not at its first byte: a jump into the middle of an instruction, or data
     * decoded as code, as CTF binaries do on purpose. What runs is not the line's text, so the note
     * says how far in and what the Core decodes there.
     */
    get runningWithin(): { line: number; text: string } | undefined {
        const s = this.session
        const document = this.displayedListing
        const listing = this.displayedListingView
        const line = this.instructionLine
        if (!document || !listing || line < 0 || !s.debugSession || s.emulator.terminated)
            return undefined
        if (listing.lines.kinds[line] !== LINE_KIND.instruction) return undefined
        const offset = Number(s.emulator.pc) - (listing.lines.addresses[line] + document.base)
        if (offset <= 0 || offset >= listing.lines.sizes[line]) return undefined
        const code = s.emulator.instructionCodeAt?.(s.emulator.pc)
        return {
            line,
            text: `running from inside this instruction, at +${offset}${code ? `: ${code}` : ''}`
        }
    }
    /**
     * The program counter's line in a Pseudocode of the running Executable: the first whose
     * instructions hold it, by its link-time address; -1 when none does, and always for the Build
     * output, whose program the debugger follows in its source (plan decision 15).
     */
    get pseudocodeProgramLine() {
        const s = this.session
        const document = this.displayedPseudocode
        const map = document?.map
        if (
            !map ||
            this.displayedBuildOutput ||
            !isCurrentBuildLocation(this.sourceSelection, s.buildGeneration, s.emulator.currentFile)
        )
            return -1
        const address = Number(s.emulator.pc) - document.listingDocument.base
        return pseudocodeLineOfAddress(map, document.listing, address)
    }
    get highlightedLine() {
        if (this.displayedView === 'pseudocode') return this.pseudocodeProgramLine
        const pair = this.session.linePairing
        if (pair?.source === this) {
            const location = this.session.executionSourceLocation
            return location?.path === this.displayedPath ? location.line : -1
        }
        return this.instructionLine
    }
    get mappedLines() {
        const s = this.session
        const pair = s.linePairing
        const selected = s.mappingSelection
        if (!pair || !selected) return []
        if (pair.source === this)
            return selected.flatMap((location) =>
                location.path === this.displayedPath ? [location.line] : []
            )
        if (pair.assembly !== this) return []
        return pair.assemblyLinesOf(selected)
    }
    get lineColoring() {
        const pair = this.session.linePairing
        if (pair?.assembly === this) return pair.coloring.assembly
        if (pair?.source === this) return pair.coloring.source.get(this.displayedPath)
        return undefined
    }
    get activeLineColors() {
        return this.session.activeMappingColors
    }
    /**
     * Why the displayed File's bytes cannot be typed over now, or undefined when they can: whatever
     * keeps a File's text read-only, and saved edits that insert or delete bytes, since only
     * overwrites can be added to. A File stored as text has its text overwritten instead.
     */
    get bytesReadOnly(): string | undefined {
        const s = this.session
        if (s.host.readonly) return 'This Project is read-only'
        if (this.displayedBuildOutput)
            return 'The Build output is read-only: Keep as File copies it into the Project'
        if (this.displayedLibraryMember) return 'A Runtime library member is read-only'
        if (s.debugSession || s.fileSystemLocked || this.sourceView === 'snapshot')
            return 'The Files are read-only during a Debug session: Stop to edit them'
        if (s.running || s.building) return 'The Files are read-only while a Build runs'
        if (this.displayedFile && !overwritesOnly(this.displayedFile))
            return 'This File has Byte edits that insert or delete bytes, which this editor cannot add to'
        return undefined
    }
    /** Why a File the browser could not preview is shown in the Hex editor instead. */
    get bytesNotice(): string | undefined {
        if (this.displayedView === 'hex' && Object.hasOwn(this.previewNotes, this.displayedPath))
            return this.previewNotes[this.displayedPath]
        return undefined
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
