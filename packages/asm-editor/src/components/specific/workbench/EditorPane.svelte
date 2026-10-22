<script lang="ts">
    import Editor from '#cmp/specific/project/Editor.svelte'
    import BelowLineContent from '#cmp/specific/project/user-tools/BelowLineContent.svelte'
    import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'
    import FileTabs from './FileTabs.svelte'
    import LibraryMemberNotice from './LibraryMemberNotice.svelte'
    import ListingNotice from './ListingNotice.svelte'
    import PseudocodeNotice from './PseudocodeNotice.svelte'
    import PseudocodeStatus from './PseudocodeStatus.svelte'
    import type { PseudocodeModel } from '#lib/monaco/pseudocodeModels.ts'
    import { fileViewIdentity } from '#lib/languages/service/uri.ts'
    import { LINE_KIND } from '#lib/listing/listing.ts'
    import type { ListingModel } from '#lib/monaco/listingModels.ts'
    import {
        annotationActions,
        debuggingActions,
        type EditorLineAction,
        type EditorNavigation
    } from '#lib/monaco/editorLineActions.ts'
    import {
        LISTING_DOCUMENTATION,
        PSEUDOCODE_DOCUMENTATION
    } from '#lib/documentation/x86/executableSections.ts'
    import { watchFindWidget } from '#lib/monaco/findWidget.ts'
    import PatchPromptView from './PatchPrompt.svelte'
    import AnnotationPromptView from './AnnotationPrompt.svelte'
    import CompilationNotice from './CompilationNotice.svelte'
    import ExecutionControls from './ExecutionControls.svelte'
    import EmptyEditor from './EmptyEditor.svelte'
    import HexEditor from './hex/HexEditor.svelte'
    import type { HexViewState } from './hex/hexGrid'
    import FilePreview from './preview/FilePreview.svelte'
    import MarkdownPreview from './preview/MarkdownPreview.svelte'
    import { isPreviewKind } from '#lib/fileKinds.ts'
    import { useWorkbench } from './workbenchContext'

    let {
        group,
        share = 1,
        controls = false,
        fill = false
    }: { group: EditorGroup; share?: number; controls?: boolean; fill?: boolean } = $props()
    const workbench = useWorkbench()
    const { session, ui } = workbench
    const emulator = session.emulator
    let dragDepth = $state(0)
    /**
     * Whether a drop would open the File in a new pane on the right rather than in this one: over
     * the right third of the only pane, as in VS Code, which previews the pane it would open.
     */
    let splitTarget = $state(false)
    $effect(() => {
        if (!session.draggedFile) {
            dragDepth = 0
            splitTarget = false
        }
    })
    const SPLIT_ZONE = 1 / 3

    /**
     * The displayed Listing, once generated, as the editor and the Listing providers read it: with
     * the lines a Debug session patched as memory holds them.
     */
    const listingModel = $derived.by<ListingModel | undefined>(() => {
        const document = group.displayedListing
        const listing = group.displayedListingView
        return document && listing
            ? {
                  listing,
                  bytes: document.bytes,
                  library: group.displayedLibraryListing,
                  patches: group.displayedPatches?.lines,
                  //a phone's editor is narrow: the gutter prints the low digits of addresses
                  shortAddresses: ui.deviceClass === 'phone'
              }
            : undefined
    })
    const patchedLines = $derived([...(group.displayedPatches?.lines.keys() ?? [])])
    /**
     * The displayed Pseudocode, once decompiled, as its navigation reads it: its names' targets go
     * to the Listing's model of the same version of the File.
     */
    const pseudocodeModel = $derived.by<PseudocodeModel | undefined>(() => {
        const document = group.displayedPseudocode
        const identity = group.modelIdentity
        return document?.status === 'ready' && identity && group.displayedView === 'pseudocode'
            ? {
                  lines: document.lines,
                  firstLine: document.firstLine,
                  listing: document.listing,
                  listingIdentity: fileViewIdentity(identity, 'listing'),
                  variables: document.variables,
                  locals: document.annotations.locals,
                  functionAddress: document.fn.address
              }
            : undefined
    })
    /** The Listing being generated or failed, for this pane's Listing or its Pseudocode's. */
    const pendingListing = $derived(group.displayedListing ?? group.pseudocodeListing)
    /** A Pseudocode has no Build artifacts or pseudo-instructions of its own. */
    const showsFileLines = $derived(group.displayedView !== 'pseudocode')
    /**
     * "Patch instruction…" on an instruction of the running Executable's Listing
     * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13): in the context
     * menu, and on Space, as x64dbg's disassembly assembles; the Listing is read-only, so Space
     * types nothing there. "Show in Hex" on any line with bytes of an Executable's own Listing.
     */
    const listingActions: EditorLineAction[] = [
        {
            id: 'asm-editor.patchInstruction',
            label: 'Patch instruction…',
            keybindings: (monaco) => [monaco.KeyCode.Space],
            available: (line) => session.patchSite(group, line) !== undefined,
            run: (line) => void session.openPatchPrompt(group, line)
        },
        //the line's bytes in the Executable's File ([file-views.md](../../../../../docs/design/file-views.md), decision 9)
        {
            id: 'asm-editor.showInHex',
            label: 'Show in Hex',
            menuGroup: 'navigation',
            menuOrder: 100,
            available: (line) => session.hexRangeOfLine(group, line) !== undefined,
            run: (line) => void session.showInHex(group, line)
        }
    ]
    /**
     * Back and forward through the pane's navigation history, which a Listing and a Pseudocode
     * offer ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 8).
     */
    const navigation: EditorNavigation = {
        get canGoBack() {
            return group.history.canGoBack
        },
        get canGoForward() {
            return group.history.canGoForward
        },
        back: () => void session.goBack(group),
        forward: () => void session.goForward(group)
    }
    const navigable = $derived(
        group.displayedView === 'listing' || group.displayedView === 'pseudocode'
    )
    /**
     * The "?" of the Listing's and the Pseudocode's notices: their section of the x86 Executables
     * Chapter in the Documentation panel (decision 9), where the Workbench has that panel.
     */
    const hasDocumentation = $derived(workbench.rail.some((entry) => entry.id === 'documentation'))
    const documentationAt = (href: string) =>
        hasDocumentation ? () => ui.showDocumentation(href) : undefined

    /**
     * A Listing's Breakpoints go on its instructions, no other line, and a Pseudocode's on the
     * lines the decompiler gave instructions.
     */
    const breakable = $derived.by(() => {
        const kinds = listingModel?.listing.lines.kinds
        if (kinds) return (line: number) => kinds[line] === LINE_KIND.instruction
        const map =
            group.displayedView === 'pseudocode' ? group.displayedPseudocode?.map : undefined
        return map ? (line: number) => (map.listingLines[line]?.length ?? 0) > 0 : undefined
    })

    /**
     * Toggle Breakpoint on a line of a Listing or a Pseudocode that takes one, and during a Debug
     * session Run to Cursor ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 11): to the line's instruction, a Pseudocode line's where a Breakpoint set on it
     * would go, as a Breakpoint of its own that is gone once it stops, or to an earlier Breakpoint.
     */
    const debugActions = debuggingActions({
        canToggleBreakpoint: (line) => group.breakpointsEditable && (breakable?.(line) ?? false),
        toggleBreakpoint: (line) => session.toggleBreakpoint(line, group),
        canRunToCursor: (line) => session.runToCursorTargets(group, line) !== undefined,
        runToCursor: (line) => void session.runToCursor(group, line)
    })
    /**
     * Rename…, Comment… and the rest on the Executable's own Listing
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions
     * 18 and 19), offered where the pane's File takes them; refused with the reason while a Build,
     * a Run or the Testcases run.
     */
    const annotating = annotationActions({
        canRename: (line, column) => session.renameTargetAt(group, line, column) !== undefined,
        rename: (line, column) => void session.openRenamePrompt(group, line, column),
        canResetName: (line, column) => session.canResetNameAt(group, line, column),
        resetName: (line, column) => void session.resetNameAt(group, line, column),
        canComment: (line) => session.commentTargetAt(group, line) !== undefined,
        comment: (line) => void session.openCommentPrompt(group, line),
        canCommentFunction: (line) => session.commentTargetAt(group, line, true) !== undefined,
        commentFunction: (line) => void session.openCommentPrompt(group, line, true),
        canDeleteComment: (line) => session.canDeleteCommentAt(group, line),
        deleteComment: (line) => void session.deleteCommentAt(group, line),
        get canUndo() {
            const path = session.annotatablePath(group)
            return path !== undefined && session.canUndoAnnotation(path)
        },
        undo: () => {
            const path = session.annotatablePath(group)
            if (path !== undefined) session.undoAnnotation(path)
        },
        get canRedo() {
            const path = session.annotatablePath(group)
            return path !== undefined && session.canUndoAnnotation(path, true)
        },
        redo: () => {
            const path = session.annotatablePath(group)
            if (path !== undefined) session.redoAnnotation(path)
        }
    })
    /** The Executable's own Listing's: Patch instruction…, Show in Hex, renames and comments too. */
    const ownListingActions = [...listingActions, ...debugActions, ...annotating]

    /**
     * Whether the pane's find widget is open, in the top right corner where a read-only notice
     * sits, which hides for it.
     */
    let findOpen = $state(false)
    $effect(() => {
        const editor = group.editor
        if (!editor) return
        const watch = watchFindWidget(editor, (open) => (findOpen = open))
        return () => {
            watch.dispose()
            findOpen = false
        }
    })

    /** Whether the execution dock floats over the bottom of this pane. */
    const docked = $derived(group.hasDock(controls))
    /**
     * Whether its dock has the execution controls: outside a Debug session every pane showing an
     * Entry file, for that Program's Build, and during one the controls group alone
     * ([programs-plan.md](../../../../../../docs/design/programs-plan.md), decision 8).
     */
    const execution = $derived(
        controls &&
            (session.debugSession
                ? session.controlsGroup === group
                : group.displayedProgram !== undefined)
    )
    /** Where this pane was in a File's bytes, kept for as long as its tab is open. */
    function hexViewState(path: string): HexViewState {
        let state = group.hexViews.get(path)
        if (!state) {
            state = { caret: { offset: 0, nibble: 0, column: 'hex' }, anchor: undefined, topRow: 0 }
            group.hexViews.set(path, state)
        }
        return state
    }

    function overSplitZone(event: DragEvent) {
        if (!session.canSplitWithDrop()) return false
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
        return event.clientX > rect.right - rect.width * SPLIT_ZONE
    }

    function enter(event: DragEvent) {
        if (!session.canDropFile(event)) return
        event.preventDefault()
        event.stopPropagation()
        dragDepth += 1
    }
    function over(event: DragEvent) {
        if (!session.canDropFile(event)) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer!.dropEffect = session.draggedFile?.groupId ? 'move' : 'copy'
        splitTarget = overSplitZone(event)
    }
    function leave(event: DragEvent) {
        if (!session.canDropFile(event)) return
        dragDepth = Math.max(0, dragDepth - 1)
        if (dragDepth === 0) splitTarget = false
    }
    function drop(event: DragEvent) {
        if (!session.canDropFile(event)) return
        event.preventDefault()
        event.stopPropagation()
        dragDepth = 0
        const split = overSplitZone(event)
        splitTarget = false
        if (split) void session.dropFileIntoSplit(event)
        else void session.dropFile(event, group)
    }
</script>

<section
    class="editor-pane"
    style:flex={share}
    aria-label="File editor"
    class:drop-target={dragDepth > 0 && !splitTarget}
    class:split-target={dragDepth > 0 && splitTarget}
    ondragentercapture={enter}
    ondragovercapture={over}
    ondragleavecapture={leave}
    ondropcapture={drop}
    onfocusin={() => session.focusEditorGroup(group)}
>
    <FileTabs {group} />
    <div class="code-area">
        {#if group.displayedListing}
            <ListingNotice
                document={group.displayedListing}
                library={group.displayedLibraryListing}
                built={group.displayedBuildOutput}
                patchable={!group.displayedLibraryListing &&
                    !group.displayedBuildOutput &&
                    session.emulator.patcher !== undefined &&
                    group.sourceView === 'snapshot' &&
                    session.debugSession}
                touch={!ui.viewport.canHover}
                {findOpen}
                onHelp={documentationAt(LISTING_DOCUMENTATION)}
            />
        {:else if group.displayedView === 'pseudocode' && group.displayedFile}
            <PseudocodeNotice
                {group}
                {findOpen}
                onHelp={documentationAt(PSEUDOCODE_DOCUMENTATION)}
            />
        {:else if group.displayedLibraryMember && group.displayedFile}
            <LibraryMemberNotice
                path={group.displayedPath}
                onShowSource={group.libraryMemberSourceAvailable
                    ? () => session.showRuntimeSource(group)
                    : undefined}
                {findOpen}
            />
        {/if}
        <CompilationNotice
            notice={group.compilationNotice}
            recompile={group.sourceMappingLost
                ? {
                      busy: session.compiling && session.compilingGroupId === group.id,
                      disabled: group.sourceCompileDisabled,
                      onClick: () => void session.compileDisplayedSource(group)
                  }
                : undefined}
        />
        <!-- the File's text, a Listing or Pseudocode are code; its bytes and a Preview are not -->
        {#if group.displayedPath && group.showsCode}
            <Editor
                source={group.modelIdentity
                    ? {
                          key: group.modelKey,
                          value: group.displayedCode,
                          identity: group.modelIdentity,
                          //a Listing changes only where a Debug session patches a line; a
                          //new document is new text, with a model of its own, as is each
                          //function's Pseudocode
                          generatedFrom: group.displayedListing ?? group.displayedPseudocode,
                          opensAt: group.listingStartLine
                      }
                    : undefined}
                modelKey={group.modelKey}
                modelIdentity={group.modelIdentity}
                sharedModels={session.models}
                retainedModelKeys={session.retainedModelKeys}
                buildArtifacts={group.sourceView === 'snapshot' && showsFileLines
                    ? emulator.buildArtifacts.filter(
                          (artifact) => artifact.file === group.displayedPath
                      )
                    : []}
                viewZones={group.sourceView === 'snapshot' &&
                showsFileLines &&
                preferencesStore.values.showPseudoInstructions.value
                    ? emulator.decorations
                          .filter(
                              (decoration) =>
                                  (decoration.file ?? emulator.buildSources?.entry) ===
                                  group.displayedPath
                          )
                          .map((decoration) => {
                              return {
                                  afterLineNumber: decoration.belowLine,
                                  content: BelowLineContent,
                                  props: {
                                      md: decoration.md,
                                      note: decoration.note ?? '',
                                      instructions: decoration.instructions,
                                      language: group.displayedLanguage.toLowerCase(),
                                      //`emulator.pc` is read inside the callback, not here: reading it
                                      //while building this array would rebuild every zone on every
                                      //step, remounting each component and shifting the layout
                                      isCurrent: (address: bigint) => emulator.pc === address
                                  }
                              }
                          })
                    : []}
                on:breakpointPress={(event) => session.toggleBreakpoint(event.detail - 1, group)}
                listing={listingModel}
                pseudocode={pseudocodeModel}
                on:cursorMove={(event) => session.cursorMoved(group, event.detail)}
                on:jump={(event) => session.recordJump(group, event.detail)}
                navigation={navigable ? navigation : undefined}
                canBreakAt={breakable}
                {patchedLines}
                lineNote={group.runningWithin}
                lineActions={listingModel
                    ? listingModel.library
                        ? undefined
                        : ownListingActions
                    : pseudocodeModel
                      ? debugActions
                      : undefined}
                viewStates={group.editorViewStates}
                bind:editor={group.editor}
                code={group.displayedCode}
                breakpoints={group.displayedBreakpoints}
                mappedBreakpoints={group.displayedMappedBreakpoints}
                breakpointsEditable={group.breakpointsEditable}
                diagnostics={group.displayedDiagnostics}
                language={group.displayedLanguage}
                highlightedLine={group.highlightedLine}
                lineColoring={group.lineColoring}
                activeLineColors={group.activeLineColors}
                on:linesSelect={(event) => session.selectMappedLines(group, event.detail)}
                disabled={group.editorDisabled}
                hasError={emulator.errors.length > 0}
            />
        {/if}
        {#if group.openPatchPrompt}
            <PatchPromptView
                prompt={group.openPatchPrompt}
                available={session.pokeable}
                onapply={() => session.applyPatch(group)}
                onclose={() => session.closePatchPrompt(group)}
                onrelease={() => group.editor?.focus()}
            />
        {/if}
        {#if group.openAnnotationPrompt}
            <AnnotationPromptView
                prompt={group.openAnnotationPrompt}
                onsave={() => session.saveAnnotationPrompt(group)}
                onclose={() => session.closeAnnotationPrompt(group)}
                onrelease={() => group.editor?.focus()}
            />
        {/if}
        {#if !group.displayedPath}
            <EmptyEditor {group} compact={session.groups.length > 1} />
        {:else if group.displayedView === 'hex' && group.displayedFile && group.displayedKind}
            <!-- one Hex editor per File, so each keeps its own caret, typing and Find -->
            {#key group.displayedPath}
                <HexEditor
                    path={group.displayedPath}
                    file={group.displayedFile}
                    kind={group.displayedKind}
                    readOnly={group.bytesReadOnly}
                    notice={group.bytesNotice}
                    history={session.byteEditHistory}
                    onEdit={(path, offset, bytes) => session.editFileBytes(path, offset, bytes)}
                    onSetEdits={(path, edits) => session.setFileByteEdits(path, edits)}
                    registerFlush={(flush) => session.registerTypingFlush(flush)}
                    reveal={group.hexReveal?.path === group.displayedPath
                        ? group.hexReveal
                        : undefined}
                    onRevealed={() => (group.hexReveal = undefined)}
                    viewState={hexViewState(group.displayedPath)}
                    dockInset={docked}
                    onShowInListing={group.displayedKind === 'executable'
                        ? (offset) => void session.showInListing(group, offset)
                        : undefined}
                />
            {/key}
        {:else if group.displayedView === 'preview' && group.displayedFile && isPreviewKind(group.displayedKind)}
            <!-- one Preview per File, whose Blob URL goes with it -->
            {#key group.displayedPath}
                <FilePreview
                    path={group.displayedPath}
                    file={group.displayedFile}
                    kind={group.displayedKind}
                    dockInset={docked}
                    onUnavailable={(path, note) => group.previewUnavailable(path, note)}
                />
            {/key}
        {:else if group.displayedView === 'preview' && group.displayedFile && group.displayedKind === 'markdown'}
            <!-- one Preview per File, whose images' Blob URLs go with it -->
            {#key group.displayedPath}
                <MarkdownPreview
                    path={group.displayedPath}
                    file={group.displayedFile}
                    files={session.project.files}
                    dockInset={docked}
                    onOpenFile={(path) => session.selectFile(path)}
                />
            {/key}
        {:else if pendingListing?.status === 'generating'}
            <!-- a Pseudocode is decompiled from the Listing, which comes first -->
            {@const progress = pendingListing.progress}
            <div class="file-notice">
                <h2>Generating the Listing…</h2>
                <p>
                    Disassembling {pendingListing.name}{progress === undefined
                        ? ''
                        : `: ${Math.round(progress * 100)}%`}
                </p>
                <progress max="1" value={progress} aria-label="Listing generated so far"></progress>
            </div>
        {:else if pendingListing?.status === 'failed'}
            <div class="file-notice">
                <h2>No Listing</h2>
                <p>
                    The Listing of {pendingListing.name} could not be generated: {pendingListing.error}
                </p>
            </div>
        {:else if group.displayedView === 'pseudocode' && group.pseudocodeListing}
            <PseudocodeStatus
                {group}
                onRetry={() => {
                    if (group.requestedPseudocode)
                        session.pseudocode.retry(group.requestedPseudocode)
                }}
            />
        {:else if group.displayedListing}
            <!-- an Executable shown as its Listing -->
        {:else if !group.displayedFile}
            <div class="file-notice">
                <h2>File not found</h2>
                <p>{group.displayedPath} does not currently name a File.</p>
            </div>
        {/if}
        {#if docked}
            <div class="floating-controls">
                <ExecutionControls {group} attached {fill} {execution} />
            </div>
        {/if}
    </div>
</section>

<style lang="scss">
    .editor-pane {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
    }
    .drop-target::after {
        content: '';
        position: absolute;
        inset: 1px;
        z-index: 10;
        border: 2px dashed var(--accent);
        background: color-mix(in srgb, var(--accent) 8%, transparent);
        pointer-events: none;
    }
    /* the pane the drop would open, over the right half where it will be */
    .split-target::after {
        content: '';
        position: absolute;
        top: 1px;
        bottom: 1px;
        right: 1px;
        left: 50%;
        z-index: 10;
        border: 2px dashed var(--accent);
        background: color-mix(in srgb, var(--accent) 16%, transparent);
        pointer-events: none;
    }
    .code-area {
        display: flex;
        position: relative;
        flex: 1;
        min-height: 0;
    }
    .file-notice {
        position: absolute;
        z-index: 3;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        padding: 2rem;
        color: var(--secondary-text);
        background: var(--secondary);
        text-align: center;
    }
    .file-notice p {
        max-width: 30rem;
        opacity: 0.72;
    }
    .file-notice progress {
        width: min(16rem, 80%);
        accent-color: var(--accent);
    }

    .floating-controls {
        position: absolute;
        z-index: 5;
        inset: auto 0 0;
        pointer-events: none;
    }
</style>
