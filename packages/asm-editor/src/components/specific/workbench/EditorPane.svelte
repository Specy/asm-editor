<script lang="ts">
    import Editor from '#cmp/specific/project/Editor.svelte'
    import BelowLineContent from '#cmp/specific/project/user-tools/BelowLineContent.svelte'
    import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
    import { sourceLanguage } from '#lib/sourceCompilation/records.ts'
    import type { EditorGroup } from '#lib/workbench/EditorGroup.svelte.ts'
    import FileTabs from './FileTabs.svelte'
    import LibraryMemberNotice from './LibraryMemberNotice.svelte'
    import ListingNotice from './ListingNotice.svelte'
    import { LINE_KIND } from '#lib/listing/listing.ts'
    import type { ListingModel } from '#lib/monaco/listingModels.ts'
    import type { EditorLineAction } from '#lib/monaco/editorLineActions.ts'
    import PatchPromptView from './PatchPrompt.svelte'
    import CompilationNotice from './CompilationNotice.svelte'
    import ExecutionControls from './ExecutionControls.svelte'
    import EmptyEditor from './EmptyEditor.svelte'
    import { useWorkbench } from './workbenchContext'

    let {
        group,
        share = 1,
        controls = false,
        fill = false
    }: { group: EditorGroup; share?: number; controls?: boolean; fill?: boolean } = $props()
    const { session, ui } = useWorkbench()
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
     * "Patch instruction…" on an instruction of the running Executable's Listing
     * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13): in the context
     * menu, and on Space, as x64dbg's disassembly assembles; the Listing is read-only, so Space
     * types nothing there.
     */
    const listingActions: EditorLineAction[] = [
        {
            id: 'asm-editor.patchInstruction',
            label: 'Patch instruction…',
            keybindings: (monaco) => [monaco.KeyCode.Space],
            available: (line) => session.patchSite(group, line) !== undefined,
            run: (line) => void session.openPatchPrompt(group, line)
        }
    ]
    /** A Listing's Breakpoints go on its instructions, no other line. */
    const listingBreakable = $derived.by(() => {
        const kinds = listingModel?.listing.lines.kinds
        return kinds ? (line: number) => kinds[line] === LINE_KIND.instruction : undefined
    })

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
    {#if group.displayedListing}
        <ListingNotice
            document={group.displayedListing}
            library={group.displayedLibraryListing}
            patchable={!group.displayedLibraryListing &&
                session.emulator.patcher !== undefined &&
                group.sourceView === 'snapshot' &&
                session.debugSession}
            touch={!ui.viewport.canHover}
        />
    {:else if group.displayedLibraryMember && group.displayedFile}
        <LibraryMemberNotice
            path={group.displayedPath}
            onShowSource={group.libraryMemberSourceAvailable
                ? () => session.showRuntimeSource(group)
                : undefined}
        />
    {/if}
    <div class="code-area">
        <CompilationNotice
            notice={group.compilationNotice}
            rightAligned={group.sourceMappingLost}
            recompile={group.sourceMappingLost
                ? {
                      busy: session.compiling && session.compilingGroupId === group.id,
                      disabled: group.sourceCompileDisabled,
                      onClick: () => void session.compileDisplayedSource(group)
                  }
                : undefined}
        />
        {#if group.displayedPath}
            <Editor
                source={group.modelIdentity
                    ? {
                          key: group.modelKey,
                          value: group.displayedCode,
                          identity: group.modelIdentity,
                          //a Listing changes only where a Debug session patches a line; a
                          //new document is new text, with a model of its own
                          generatedFrom: group.displayedListing
                      }
                    : undefined}
                modelKey={group.modelKey}
                modelIdentity={group.modelIdentity}
                sharedModels={session.models}
                retainedModelKeys={session.retainedModelKeys}
                buildArtifacts={group.sourceView === 'snapshot'
                    ? emulator.buildArtifacts.filter(
                          (artifact) => artifact.file === group.displayedPath
                      )
                    : []}
                viewZones={group.sourceView === 'snapshot' &&
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
                canBreakAt={listingBreakable}
                {patchedLines}
                lineNote={group.runningWithin}
                lineActions={listingModel && !listingModel.library ? listingActions : undefined}
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
        {#if !group.displayedPath}
            <EmptyEditor {group} compact={session.groups.length > 1} />
        {:else if group.displayedListing?.status === 'generating'}
            {@const progress = group.displayedListing.progress}
            <div class="file-notice">
                <h2>Generating the Listing…</h2>
                <p>
                    Disassembling {group.displayedListing.name}{progress === undefined
                        ? ''
                        : `: ${Math.round(progress * 100)}%`}
                </p>
                <progress max="1" value={progress} aria-label="Listing generated so far"></progress>
            </div>
        {:else if group.displayedListing?.status === 'failed'}
            <div class="file-notice">
                <h2>No Listing</h2>
                <p>
                    The Listing of {group.displayedListing.name} could not be generated: {group
                        .displayedListing.error}
                </p>
            </div>
        {:else if group.displayedListing}
            <!-- an Executable is shown as its Listing, not as the bytes it is -->
        {:else if group.displayedFile?.encoding === 'base64'}
            <div class="file-notice">
                <h2>Binary file</h2>
                <p>
                    {group.displayedPath} is preserved as exact bytes and is not editable as text.
                </p>
            </div>
        {:else if !group.displayedFile}
            <div class="file-notice">
                <h2>File not found</h2>
                <p>{group.displayedPath} does not currently name a File.</p>
            </div>
        {/if}
        {#if group.displayedPath && ((controls && session.controlsGroup === group) || ((sourceLanguage(group.displayedPath) || group.recompilationNeeded) && !session.debugSession))}
            <div class="floating-controls">
                <ExecutionControls
                    {group}
                    attached
                    {fill}
                    execution={controls && session.controlsGroup === group}
                />
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
