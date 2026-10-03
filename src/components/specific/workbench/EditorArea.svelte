<script lang="ts">
    /**
     * The code editor with its tab row: the displayed File in Monaco, its breakpoints, Diagnostics
     * and current line, and the notices for a binary or a missing File. The editor fills its panel
     * to the edges: the Build turning into Stop is what says a Debug session is on, so it has none
     * of the Interactive editor's animated border, and only a program stopped on an error gets a
     * red frame, drawn over the editor's edge rather than around it. On a desktop and a phone
     * the execution controls sit edge to edge in the bottom corners of the code, on a phone as one
     * tray across its bottom edge.
     */
    import Editor from '$cmp/specific/project/Editor.svelte'
    import Splitter from '$cmp/shared/layout/Splitter.svelte'
    import type monaco from 'monaco-editor'
    import BelowLineContent from '$cmp/specific/project/user-tools/BelowLineContent.svelte'
    import { preferencesStore } from '$stores/preferencesStore.svelte'
    import FileTabs from './FileTabs.svelte'
    import ExecutionControls from './ExecutionControls.svelte'
    import CompilationNotice from './CompilationNotice.svelte'
    import MappedSourcePane from './MappedSourcePane.svelte'
    import SourceMapConnections from './SourceMapConnections.svelte'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        tabs?: boolean
        /** The execution controls, edge to edge in the bottom corners of the code. */
        controls?: boolean
        /** The controls as one tray across the bottom of the code, a phone's. */
        fill?: boolean
        style?: string
    }

    let { tabs = true, controls = false, fill = false, style = '' }: Props = $props()

    const { session } = useWorkbench()
    const emulator = session.emulator
    let sourceEditor = $state.raw<monaco.editor.IStandaloneCodeEditor>()
    let frameWidth = $state(0)
    let sourceRatio = $state(0.5)
    const paneWidth = $derived(Math.max(0, frameWidth - 48))
    const minPaneWidth = $derived(Math.min(160, paneWidth / 2))
    const sourceWidth = $derived(
        Math.min(paneWidth - minPaneWidth, Math.max(minPaneWidth, paneWidth * sourceRatio))
    )
    const sourceShare = $derived(paneWidth > 0 ? sourceWidth / paneWidth : 0.5)
    const activeLocation = $derived(
        session.mappingSelection && session.mappingSelection.line >= 0
            ? session.mappingSelection
            : session.executionSourceLocation
    )
</script>

<div class="editor-area" {style}>
    {#if tabs}
        <FileTabs />
    {/if}
    <CompilationNotice />
    <div
        class="editor-frame"
        bind:clientWidth={frameWidth}
        class:failed={emulator.errors.length > 0}
        class:mapped={!!session.compilationMap}
    >
        {#if session.compilationMap}
            <MappedSourcePane bind:editor={sourceEditor} share={sourceShare} />
            {#if session.mappingColors}
                <SourceMapConnections
                    {sourceEditor}
                    assemblyEditor={session.editor}
                    sourcePath={session.mappedSourcePath}
                    coloring={session.mappingColors}
                    {activeLocation}
                >
                    {#snippet divider()}
                        <Splitter
                            orientation="vertical"
                            size={sourceWidth}
                            min={minPaneWidth}
                            max={paneWidth - minPaneWidth}
                            label="Resize source and assembly editors"
                            style="--splitter-size: 0.25rem; --splitter-line: transparent;"
                            onResize={(width) => {
                                if (paneWidth > 0) sourceRatio = width / paneWidth
                            }}
                            onReset={() => (sourceRatio = 0.5)}
                        />
                    {/snippet}
                </SourceMapConnections>
            {/if}
        {/if}
        <div
            class="assembly-pane"
            style:--assembly-share={session.compilationMap ? 1 - sourceShare : 1}
        >
            <Editor
                source={session.displayedModelIdentity
                    ? {
                          key: session.displayedModelKey,
                          value: session.displayedCode,
                          identity: session.displayedModelIdentity
                      }
                    : undefined}
                modelKey={session.displayedModelKey}
                modelIdentity={session.displayedModelIdentity}
                retainedModelKeys={session.retainedModelKeys}
                buildArtifacts={session.sourceView === 'snapshot'
                    ? emulator.buildArtifacts.filter(
                          (artifact) => artifact.file === session.displayedPath
                      )
                    : []}
                viewZones={session.sourceView === 'snapshot' &&
                preferencesStore.values.showPseudoInstructions.value
                    ? emulator.decorations
                          .filter(
                              (decoration) =>
                                  (decoration.file ?? emulator.buildSources?.entry) ===
                                  session.displayedPath
                          )
                          .map((decoration) => {
                              return {
                                  afterLineNumber: decoration.belowLine,
                                  content: BelowLineContent,
                                  props: {
                                      md: decoration.md,
                                      note: decoration.note ?? '',
                                      instructions: decoration.instructions,
                                      language: session.displayedLanguage.toLowerCase(),
                                      //`emulator.pc` is read inside the callback, not here: reading it
                                      //while building this array would rebuild every zone on every
                                      //step, remounting each component and shifting the layout
                                      isCurrent: (address: bigint) => emulator.pc === address
                                  }
                              }
                          })
                    : []}
                on:fileChange={(event) => session.fileEdited(event.detail.path, event.detail.value)}
                on:breakpointPress={(event) => session.toggleBreakpoint(event.detail - 1)}
                bind:editor={session.editor}
                code={session.displayedCode}
                breakpoints={session.displayedBreakpoints}
                breakpointsEditable={session.breakpointsEditable}
                diagnostics={session.displayedDiagnostics}
                language={session.displayedLanguage}
                highlightedLine={session.highlightedLine}
                mappedLines={session.mappedAssemblyLines}
                lineColoring={session.mappingColors?.assembly}
                on:lineSelect={(event) => session.selectMappedAssemblyLine(event.detail)}
                disabled={session.editorDisabled}
                hasError={emulator.errors.length > 0}
            />
            {#if session.displayedFile?.encoding === 'base64'}
                <div class="file-notice">
                    <h2>Binary file</h2>
                    <p>
                        {session.displayedPath} is preserved as exact bytes and is not editable as text.
                    </p>
                </div>
            {:else if !session.displayedFile}
                <div class="file-notice">
                    <h2>File not found</h2>
                    <p>
                        {session.displayedPath || 'The configured Entry path'} does not currently name
                        a File.
                    </p>
                </div>
            {/if}
            {#if controls}
                <div class="floating-controls">
                    <ExecutionControls attached {fill} />
                </div>
            {/if}
        </div>
    </div>
</div>

<style lang="scss">
    .editor-area {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        background-color: var(--secondary);
        border-radius: var(--wb-radius);
        border: var(--wb-card-edge);
        overflow: hidden;
    }

    .editor-frame {
        position: relative;
        display: flex;
        flex: 1;
        min-height: 0;
    }

    .assembly-pane {
        display: flex;
        position: relative;
        flex: var(--assembly-share) 1 0;
        min-width: 0;
        min-height: 0;
    }
    @media (max-width: 700px) {
        .editor-frame.mapped {
            flex-direction: column;
        }
        .assembly-pane {
            flex: 1;
        }
    }

    /* the shadow Monaco draws under the top edge once the code is scrolled */
    .editor-area :global(.monaco-editor .scroll-decoration) {
        display: none;
    }

    /* The editor wrappers cast shadows over the ribbons from both sides of the gutter. */
    .editor-frame.mapped :global(.editor) {
        box-shadow: none;
    }

    /* square under the file tabs: the Interactive editor's rounded corners are the card's here,
       and the editor's own would only nick its first line against the tabs */
    .editor-area :global(.monaco-editor),
    .editor-area :global(.monaco-editor .overflow-guard) {
        border-radius: 0;
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

        p {
            max-width: 30rem;
            opacity: 0.72;
        }
    }

    /* on the editor's bottom edge, where the panel's own rounding clips the trays' outer corners;
       the bar lets clicks through between its two ends, and the code scrolls past the last line to
       come out from under it */
    .floating-controls {
        position: absolute;
        z-index: 5;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
    }

    .failed::after {
        position: absolute;
        z-index: 4;
        content: '';
        inset: 0;
        border: 0.2rem solid var(--red);
        pointer-events: none;
        animation: appear 0.3s ease-in;
    }

    @keyframes appear {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
</style>
