<script lang="ts">
    import Editor from '$cmp/specific/project/Editor.svelte'
    import BelowLineContent from '$cmp/specific/project/user-tools/BelowLineContent.svelte'
    import { preferencesStore } from '$stores/preferencesStore.svelte'
    import { sourceLanguage } from '$lib/sourceCompilation/records'
    import type { EditorGroup } from '$lib/workbench/EditorGroup.svelte'
    import FileTabs from './FileTabs.svelte'
    import CompilationNotice from './CompilationNotice.svelte'
    import ExecutionControls from './ExecutionControls.svelte'
    import { useWorkbench } from './workbenchContext'

    let {
        group,
        share = 1,
        controls = false,
        fill = false
    }: { group: EditorGroup; share?: number; controls?: boolean; fill?: boolean } = $props()
    const { session } = useWorkbench()
    const emulator = session.emulator
    let dragDepth = $state(0)
    $effect(() => {
        if (!session.draggedFile) dragDepth = 0
    })

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
    }
    function leave(event: DragEvent) {
        if (session.canDropFile(event)) dragDepth = Math.max(0, dragDepth - 1)
    }
    function drop(event: DragEvent) {
        if (!session.canDropFile(event)) return
        event.preventDefault()
        event.stopPropagation()
        dragDepth = 0
        void session.dropFile(event, group)
    }
</script>

<section
    class="editor-pane"
    style:flex={share}
    aria-label="File editor"
    class:drop-target={dragDepth > 0}
    ondragentercapture={enter}
    ondragovercapture={over}
    ondragleavecapture={leave}
    ondropcapture={drop}
>
    <FileTabs {group} />
    <CompilationNotice notice={group.compilationNotice} />
    <div class="code-area">
        {#if group.displayedPath}
            <Editor
                source={group.modelIdentity
                    ? {
                          key: group.modelKey,
                          value: group.displayedCode,
                          identity: group.modelIdentity
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
                bind:editor={group.editor}
                code={group.displayedCode}
                breakpoints={group.displayedBreakpoints}
                breakpointsEditable={group.breakpointsEditable}
                diagnostics={group.displayedDiagnostics}
                language={group.displayedLanguage}
                highlightedLine={group.highlightedLine}
                mappedLines={group.mappedLines}
                lineColoring={group.lineColoring}
                on:lineSelect={(event) => session.selectMappedLine(group, event.detail)}
                disabled={group.editorDisabled}
                hasError={emulator.errors.length > 0}
            />
        {/if}
        {#if !group.displayedPath}
            <div class="file-notice">
                <h2>No open files</h2>
                <p>Open a file from the Explorer.</p>
            </div>
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
        {#if (controls && session.controlsGroup === group) || ((sourceLanguage(group.displayedPath) || group.recompilationNeeded) && !session.debugSession)}
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
    .floating-controls {
        position: absolute;
        z-index: 5;
        inset: auto 0 0;
        pointer-events: none;
    }
</style>
