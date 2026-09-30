<script lang="ts">
    /**
     * The code editor with its tab row: the displayed File in Monaco, its breakpoints, Diagnostics
     * and current line, and the notices for a binary or a missing File. The editor fills its panel
     * to the edges: the Build turning into Stop is what says a Debug session is on, so it has none
     * of the Interactive editor's animated border, and only a program stopped on an error gets a
     * red frame, drawn over the editor's edge rather than around it. On a desktop the execution
     * controls float over the bottom of the code.
     */
    import Editor from '$cmp/specific/project/Editor.svelte'
    import BelowLineContent from '$cmp/specific/project/user-tools/BelowLineContent.svelte'
    import { preferencesStore } from '$stores/preferencesStore.svelte'
    import FileTabs from './FileTabs.svelte'
    import ExecutionControls from './ExecutionControls.svelte'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        tabs?: boolean
        /** The execution controls floating over the bottom of the code. */
        controls?: boolean
        style?: string
    }

    let { tabs = true, controls = false, style = '' }: Props = $props()

    const { session } = useWorkbench()
    const emulator = session.emulator
</script>

<div class="editor-area" {style}>
    {#if tabs}
        <FileTabs />
    {/if}
    <div class="editor-frame" class:failed={emulator.errors.length > 0}>
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
                    {session.displayedPath || 'The configured Entry path'} does not currently name a File.
                </p>
            </div>
        {/if}
        {#if controls}
            <div class="floating-controls">
                <ExecutionControls variant="floating" />
            </div>
        {/if}
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

    /* the shadow Monaco draws under the top edge once the code is scrolled */
    .editor-area :global(.monaco-editor .scroll-decoration) {
        display: none;
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

    /* along the editor's bottom edge, over a fade from the editor's colour, and clear of its
       scrollbar on the right; the bar lets clicks through between its two ends, and the code
       scrolls past the last line to come out from under it */
    .floating-controls {
        position: absolute;
        z-index: 5;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 1.4rem calc(0.35rem + 14px) 0.35rem 0.35rem;
        background: linear-gradient(to top, var(--secondary), transparent);
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
