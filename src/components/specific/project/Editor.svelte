<script lang="ts" generics="ViewZoneProps extends Record<string, unknown> = Record<string, never>">
    import {
        type Component,
        createEventDispatcher,
        mount,
        onDestroy,
        onMount,
        unmount
    } from 'svelte'
    import type monaco from 'monaco-editor'
    import type {
        AvailableLanguages,
        AvailableProgrammingLanguages
    } from '../../../lib/Project.svelte'
    import type { MonacoType } from '$lib/monaco/Monaco'
    import { Monaco } from '$lib/monaco/Monaco'
    import { generateTheme } from '$lib/monaco/editorTheme'
    import type { BuildArtifact, Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
    import {
        parseProjectSourceUri,
        projectSourceUri,
        type ProjectModelIdentity
    } from '$lib/languages/service/uri'
    import { resolveEditorModel, type EditorModelStore, type EditorSource } from './editorSource'
    import { zeroBasedLineToMonaco } from '$lib/languages/service/monacoConversions'
    import { setModelBuildArtifacts } from '$lib/monaco/assemblyInsights'

    interface Props {
        disabled?: boolean
        /**
         * The single-source contract: one File, bound two ways. Hosts that bind it (a lesson
         * playground, an exam answer) both supply the text and receive the user's edits through it.
         * A multi-File host passes `source` instead and this is never written.
         */
        code: string
        codeOverride?: string
        /**
         * The multi-File contract. The key and the text travel together so they cannot disagree:
         * passing them as separate props let an effect run with the new File's key and the previous
         * File's text, which created that File's model holding the other one's source.
         */
        source?: EditorSource
        /** Keeps each Project File on its own Monaco model and therefore its own text Undo stack. */
        modelKey?: string
        /** Gives a Project File a stable URI that providers can route back to its Project session. */
        modelIdentity?: ProjectModelIdentity
        /** Model identities still owned by the Project; omitted outside the Project File editor. */
        retainedModelKeys?: readonly string[]
        highlightedLine?: number
        hasError?: boolean
        language: AvailableLanguages | AvailableProgrammingLanguages
        diagnostics?: Diagnostic[]
        breakpoints?: number[]
        /** Text can be read-only while the Debug session still accepts breakpoint changes. */
        breakpointsEditable?: boolean
        editor?: monaco.editor.IStandaloneCodeEditor
        viewZones?: {
            afterLineNumber: number
            content: Component<ViewZoneProps>
            props: ViewZoneProps
        }[]
        buildArtifacts?: BuildArtifact[]
    }

    let {
        disabled = false,
        code = $bindable(),
        codeOverride,
        source,
        modelKey = 'default',
        modelIdentity,
        retainedModelKeys,
        highlightedLine = -1,
        hasError = false,
        language,
        diagnostics = [],
        breakpoints = [],
        breakpointsEditable = true,
        editor = $bindable(),
        viewZones = [],
        buildArtifacts = []
    }: Props = $props()
    /**
     * Which model to show and what it should hold, as one value. A multi-File host supplies both
     * together; a single-source host's text is its `code` prop, or the compiled-code override when
     * there is one. That test is truthiness, not `??`: every emulator but x86 reports `''` from
     * `_getCompiledCode` for a program with nothing to expand, so a successful Build would
     * otherwise replace the program with an empty model.
     */
    const activeSource = $derived<EditorSource>(
        source ?? { key: modelKey, value: codeOverride || code, identity: modelIdentity }
    )
    let mockEditor: HTMLDivElement | null = $state(null)
    let monacoInstance: MonacoType | null = $state.raw(null)
    /**
     * Which model is attached to the editor. Reactive, because the decoration, marker, view-zone
     * and highlight effects below all key off it: with a plain variable each of them read `''` on
     * its first run, returned before reading anything tracked, and so registered no dependencies at
     * all and never ran again — leaving Monaco without a decorations collection or a single marker.
     */
    let activeModelKey = $state('')
    /**
     * The same key, untracked, for saving the outgoing model's view state inside `selectModel`.
     * Reading `activeModelKey` there would make the effect that calls `selectModel` depend on a
     * value that same call writes, so it would re-run itself on every model switch.
     */
    let viewStateKey = ''
    let hoveredGliphen: number | null = $state(null)
    let destroyed = false
    let applyingExternalValue = false
    let overflowWidgets: HTMLDivElement | null = null
    //Plain Maps, not reactive ones: nothing renders from them, and the effect that reconciles the
    //models both reads and writes them, which with reactive maps made it re-run on its own writes.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- see above; no tracked consumer.
    const models = new Map<string, monaco.editor.ITextModel>()
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- see above; no tracked consumer.
    const modelViewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>()
    const toDispose: (monaco.IDisposable | (() => void))[] = []
    const dispatcher = createEventDispatcher<{
        change: string
        /** A change to any Project File's model, including one the editor is not showing. */
        fileChange: { path: string; value: string }
        breakpointPress: number
    }>()
    let el: HTMLDivElement | null = $state(null)

    $effect(() => {
        if (editor) {
            Monaco.setCustomTheme(generateTheme())
        }
    })

    onMount(async () => {
        const loadedMonaco = await Monaco.get()
        if (destroyed) return
        monacoInstance = loadedMonaco
        const editorElement = el
        if (!editorElement) return console.log('Wrapper element not valid', editorElement)
        const editorLanguage = language
        await Monaco.registerLanguage(editorLanguage)
        if (destroyed) return
        const mounted = activeSource
        const initialModel = createModel(
            loadedMonaco,
            mounted.value,
            editorLanguage.toLowerCase(),
            mounted.identity
        )
        initialModel.setEOL(0)
        models.set(mounted.key, initialModel)
        viewStateKey = mounted.key
        activeModelKey = mounted.key
        overflowWidgets = document.createElement('div')
        //Keep Monaco's widget styles/theme while escaping the editor's local stacking context.
        overflowWidgets.className = 'monaco-overflow-widgets monaco-editor'
        const overflowWidgetsHost =
            editorElement.closest<HTMLElement>('.theme-root') ?? document.body
        overflowWidgetsHost.appendChild(overflowWidgets)
        const mountedEditor = loadedMonaco.editor.create(editorElement, {
            model: initialModel,
            theme: 'custom-theme',
            //Monaco's default is 'editable', which means it hides every validation decoration while
            //the editor is read-only — and this editor is read-only in exactly the states where the
            //diagnostics still matter: a Debug session, a Build snapshot, an exam. The error pill
            //and the console list keep reporting them there, so the squiggles must agree.
            renderValidationDecorations: 'on',
            fixedOverflowWidgets: true,
            overflowWidgetsDomNode: overflowWidgets,
            minimap: { enabled: false },
            scrollbar: {
                vertical: 'auto',
                horizontal: 'auto'
            },
            colorDecorators: false,
            glyphMargin: true,
            lineNumbersMinChars: 3,
            cursorBlinking: 'phase',
            fontSize: 16,
            smoothScrolling: true,
            cursorSmoothCaretAnimation: 'on'
        })
        editor = mountedEditor
        const observer = new ResizeObserver(() => {
            if (!mockEditor) return
            const bounds = mockEditor.getBoundingClientRect()
            mountedEditor.layout({
                width: bounds.width,
                height: bounds.height
            })
        })
        if (mockEditor) {
            observer.observe(mockEditor)
        }

        toDispose.push(
            mountedEditor.onMouseDown((e) => {
                if (
                    breakpointsEditable &&
                    e.target.type === loadedMonaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
                ) {
                    dispatcher('breakpointPress', e.target.position.lineNumber)
                }
            }),
            mountedEditor.onMouseLeave(() => {
                hoveredGliphen = null
            }),
            mountedEditor.onMouseMove((e) => {
                if (
                    breakpointsEditable &&
                    e.target.type === loadedMonaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
                ) {
                    hoveredGliphen = e.target.position.lineNumber
                } else {
                    hoveredGliphen = null
                }
            })
        )
        toDispose.push(() => observer.disconnect())
        toDispose.push(
            mountedEditor.onDidChangeModelContent(() => {
                if (disabled || applyingExternalValue) return
                const value = mountedEditor.getValue()
                //A multi-File host owns its Files and receives edits through `fileChange`; writing
                //`code` there would make this component a second writer of a prop the host is also
                //deriving, and whichever wrote last in a tick would win.
                if (!source) code = value
                dispatcher('change', value)
            })
        )
    })

    function setModelValue(model: monaco.editor.ITextModel, value: string) {
        if (model.getValue() === value) return
        applyingExternalValue = true
        try {
            //External changes are authoritative (for example, a running program writing a live
            //File), so they start a fresh text Undo history instead of becoming an editor edit.
            model.setValue(value)
        } finally {
            applyingExternalValue = false
        }
    }

    function createModel(
        currentMonaco: MonacoType,
        value: string,
        modelLanguage: string,
        identity: ProjectModelIdentity | undefined
    ): monaco.editor.ITextModel {
        const uri = identity ? projectSourceUri(currentMonaco, identity) : undefined
        const model = currentMonaco.editor.createModel(value, modelLanguage, uri)
        //Per model, not per editor: a rename or a code action returns edits for several resources
        //at once, and Monaco applies them to models the editor is not showing. Listening only on
        //the active model dropped those edits, and the next time that File was opened its model was
        //overwritten from the Project, losing them for good.
        const listener = model.onDidChangeContent(() => {
            if (disabled || applyingExternalValue) return
            const changed = parseProjectSourceUri(model.uri)
            if (changed?.sourceKind === 'live') {
                dispatcher('fileChange', { path: changed.path, value: model.getValue() })
            }
        })
        toDispose.push(() => listener.dispose())
        return model
    }

    function modelStore(currentMonaco: MonacoType): EditorModelStore<monaco.editor.ITextModel> {
        return {
            get: (key) => models.get(key),
            set: (key, model) => void models.set(key, model),
            delete: (key) => void models.delete(key),
            isDisposed: (model) => model.isDisposed(),
            create: (source) => {
                const model = createModel(
                    currentMonaco,
                    source.value,
                    language.toLowerCase(),
                    source.identity
                )
                model.setEOL(0)
                return model
            },
            setValue: setModelValue
        }
    }

    /** `next`, not `source`: shadowing the prop here is how the two could quietly diverge again. */
    function selectModel(next: EditorSource) {
        const currentEditor = editor
        const currentMonaco = monacoInstance
        if (!currentEditor || !currentMonaco) return
        const model = resolveEditorModel(modelStore(currentMonaco), next)
        if (currentEditor.getModel() !== model) {
            if (viewStateKey) modelViewStates.set(viewStateKey, currentEditor.saveViewState())
            applyingExternalValue = true
            try {
                currentEditor.setModel(model)
                const viewState = modelViewStates.get(next.key)
                if (viewState) currentEditor.restoreViewState(viewState)
            } finally {
                applyingExternalValue = false
            }
        }
        viewStateKey = next.key
        activeModelKey = next.key
    }

    $effect(() => {
        selectModel(activeSource)
    })

    $effect(() => {
        const model = models.get(activeSource.key)
        if (!model || model.isDisposed()) return
        return setModelBuildArtifacts(model.uri.toString(), buildArtifacts)
    })

    $effect(() => {
        if (!retainedModelKeys) return
        const retained = new Set(retainedModelKeys)
        const current = activeSource.key
        for (const [key, model] of models) {
            if (key === current || retained.has(key)) continue
            model.dispose()
            models.delete(key)
            modelViewStates.delete(key)
        }
    })
    onDestroy(() => {
        destroyed = true

        toDispose.forEach((disposable) => {
            if (typeof disposable === 'function') return disposable()
            disposable?.dispose()
        })
        decorations?.clear()
        editor?.dispose()
        overflowWidgets?.remove()
        overflowWidgets = null
        for (const model of models.values()) model.dispose()
        models.clear()
        modelViewStates.clear()
    })

    let decorations: monaco.editor.IEditorDecorationsCollection | undefined = $state.raw()

    $effect(() => {
        if (!activeModelKey) return
        const collection = editor?.createDecorationsCollection()
        decorations = collection
        return () => collection?.clear()
    })

    $effect(() => {
        if (activeModelKey && editor && viewZones.length > 0) {
            const viewZoneEditor = editor
            let currentViewZones = [] as {
                id: string
                domNode: HTMLElement
                observer: ResizeObserver
                component: Record<string, unknown>
            }[]
            currentViewZones = []
            viewZoneEditor.changeViewZones(function (changeAccessor) {
                viewZones.forEach((zone) => {
                    const domNode = document.createElement('div')
                    const wrapper = document.createElement('div')
                    const Component = zone.content
                    const props = zone.props
                    const component = mount(Component, {
                        target: wrapper,
                        props
                    })
                    domNode.appendChild(wrapper)

                    const id = changeAccessor.addZone({
                        afterLineNumber: zone.afterLineNumber,
                        get heightInPx() {
                            return wrapper.getBoundingClientRect().height
                        },
                        domNode
                    })
                    const observer = new ResizeObserver(() => {
                        const height = wrapper.getBoundingClientRect().height
                        if (!height) return
                        viewZoneEditor.changeViewZones((accessor) => {
                            accessor.layoutZone(id)
                        })
                    })
                    observer.observe(wrapper)
                    currentViewZones.push({ id, domNode, observer, component })
                })
            })
            return () => {
                currentViewZones.forEach((zone) => {
                    zone.observer.disconnect()
                    void unmount(zone.component)
                    zone.domNode.remove()
                })
                if (destroyed) return
                viewZoneEditor.changeViewZones((changeAccessor) => {
                    currentViewZones.forEach((zone) => {
                        changeAccessor.removeZone(zone.id)
                    })
                })
            }
        }
    })

    $effect(() => {
        const currentMonaco = monacoInstance
        if (activeModelKey && editor && decorations && currentMonaco) {
            decorations.set([
                ...(highlightedLine >= 0
                    ? [
                          {
                              range: new currentMonaco.Range(
                                  zeroBasedLineToMonaco(highlightedLine),
                                  1,
                                  zeroBasedLineToMonaco(highlightedLine),
                                  1
                              ),
                              options: {
                                  className: hasError ? 'error-line' : 'selected-line',
                                  inlineClassName: 'selected-line-text',
                                  isWholeLine: true
                              }
                          }
                      ]
                    : []),
                ...breakpoints.map((e) => ({
                    range: new currentMonaco.Range(e + 1, 1, e + 1, 1),
                    options: {
                        glyphMarginClassName: 'breakpoint-glyph'
                    }
                })),
                ...(breakpointsEditable &&
                hoveredGliphen &&
                !breakpoints.includes(hoveredGliphen - 1)
                    ? [
                          {
                              range: new currentMonaco.Range(hoveredGliphen, 1, hoveredGliphen, 1),
                              options: {
                                  glyphMarginClassName: 'hovered-glyph'
                              }
                          }
                      ]
                    : [])
            ])
        }
    })

    $effect(() => {
        if (activeModelKey && editor && highlightedLine >= 0) {
            editor.revealLineInCenter(zeroBasedLineToMonaco(highlightedLine))
        }
    })
    $effect(() => {
        const currentMonaco = monacoInstance
        if (activeModelKey && editor && currentMonaco) {
            const model = editor.getModel()
            if (!model) return

            const markerSeverities = {
                error: currentMonaco.MarkerSeverity.Error,
                warning: currentMonaco.MarkerSeverity.Warning,
                suggestion: currentMonaco.MarkerSeverity.Info
            }
            currentMonaco.editor.setModelMarkers(
                model,
                language,
                diagnostics.map((e) => {
                    const lineNumber = Math.min(Math.max(e.lineIndex + 1, 1), model.getLineCount())
                    const maxColumn = model.getLineMaxColumn(lineNumber)
                    let startColumn = Math.min(Math.max(e.column, 1), maxColumn)
                    let endColumn = Math.min(
                        Math.max(e.endColumn ?? startColumn + 1, startColumn),
                        maxColumn
                    )
                    //An empty range draws nothing. A Core that reports a point, or one that points
                    //at the end of the line — "expected an operand" — clamps to exactly that, so
                    //widen it over the character beside it rather than leave an invisible marker.
                    if (startColumn === endColumn) {
                        if (endColumn < maxColumn) endColumn += 1
                        else if (startColumn > 1) startColumn -= 1
                    }
                    return {
                        severity: markerSeverities[e.severity],
                        message: e.formatted,
                        source: e.source,
                        code: e.code,
                        startLineNumber: lineNumber,
                        startColumn,
                        endLineNumber: lineNumber,
                        endColumn,
                        relatedInformation: e.related?.map((related) => {
                            const relatedIdentity = modelIdentity
                                ? { ...modelIdentity, path: related.file }
                                : undefined
                            return {
                                resource: relatedIdentity
                                    ? projectSourceUri(currentMonaco, relatedIdentity)
                                    : model.uri,
                                startLineNumber: related.lineIndex + 1,
                                startColumn: related.column,
                                endLineNumber: related.lineIndex + 1,
                                endColumn: related.endColumn,
                                message: related.message
                            }
                        })
                    }
                })
            )
        }
    })

    $effect(() => {
        editor?.updateOptions({ readOnly: disabled })
    })
</script>

<div bind:this={mockEditor} class="mock-editor">
    {#if !editor}
        <h1 class="loading">Loading editor...</h1>
    {/if}
</div>

<div bind:this={el} class="editor"></div>

<style lang="scss">
    :global(.selected-line) {
        background-color: var(--accent);
        color: var(--accent-text);
    }

    :global(.overflow-guard, .monaco-editor) {
        border-radius: 0.4rem;
    }

    :global(.error-line) {
        background-color: var(--red);
        color: var(--red-text);
    }

    :global(.selected-line-text) {
        color: var(--accent-text) !important;
    }

    :global(.find-widget) {
        border-radius: 0.3rem !important;
        top: 1rem !important;
        right: 2.4rem !important;
    }
    :global(.monaco-editor .find-widget > .button.codicon-widget-close) {
        top: 7px !important;
    }

    :global(.editor-widget.suggest-widget) {
        border-radius: 0.3rem !important;
        overflow: hidden;
    }

    :global(.monaco-editor-overlaymessage .message) {
        border-radius: 0.3rem !important;
        border-bottom-left-radius: 0 !important;
    }

    :global(.monaco-inputbox) {
        border-radius: 0.2rem;
    }

    :global(.monaco-resizable-hover),
    :global(.monaco-hover) {
        border-radius: 0.4rem !important;
    }

    :global(.monaco-hover) {
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        border: 1px solid var(--accent2) !important;
    }

    :global(.monaco-overflow-widgets) {
        position: fixed;
        z-index: 1000;
        inset: 0;
        background: transparent;
        pointer-events: none;
    }

    :global(.monaco-overflow-widgets .overflowingContentWidgets > *),
    :global(.monaco-overflow-widgets .overflowingOverlayWidgets > *) {
        pointer-events: auto;
    }

    :global(.monaco-editor .monaco-hover .hover-row:not(:first-child):not(:empty)) {
        border-top: 1px solid var(--accent2) !important;
    }

    :global(.monaco-hover table) {
        border-collapse: collapse;
        overflow-x: auto;
        display: block;
        margin: 0.5rem 0;
        font-family: 'Fira Code', monospace;
        border-radius: 0.5rem;
        border: solid 0.1rem var(--primary);
        width: fit-content;
        max-width: 100%;
    }

    :global(.monaco-hover thead) {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }

    :global(.monaco-hover thead th) {
        padding: 0.2rem 0.4rem;
        border-right: 0.1rem solid var(--secondary);
    }

    :global(.monaco-hover thead th:first-child) {
        border-top-left-radius: 0.3rem;
    }

    :global(.monaco-hover thead th:last-child) {
        border-top-right-radius: 0.3rem;
        border-right: unset;
    }

    :global(.monaco-hover tbody tr:nth-child(odd)) {
        background-color: color-mix(in srgb, var(--secondary), var(--tertiary) 20%);
    }

    :global(.monaco-hover tbody) {
        background-color: var(--secondary);
    }

    :global(.monaco-hover td) {
        padding: 0.2rem 0.4rem;
        border: 0.1rem solid var(--tertiary);
    }

    :global(.monaco-hover td:first-child) {
        border-left: unset;
    }

    :global(.monaco-hover td:last-child) {
        border-right: unset;
    }

    :global(.monaco-hover tr:last-child td) {
        border-bottom: unset;
    }

    :global(.find-widget) {
        transform: translateY(calc(-100% - 1.2rem)) !important;
    }

    :global(.find-widget.visible) {
        transform: translateY(0) !important;
    }

    .mock-editor {
        display: flex;
        flex: 1;
    }

    :global(.breakpoint-glyph),
    :global(.hovered-glyph) {
        width: calc(22px - 0.6rem) !important;
        height: calc(22px - 0.6rem) !important;
        margin-top: 0.3rem;
        cursor: pointer;
        margin-left: 0.6rem;
        background-color: var(--accent);
        border-radius: 1rem;
    }

    :global(.hovered-glyph) {
        background-color: var(--accent2) !important;
    }

    .editor {
        display: flex;
        position: absolute;
        flex: 1;
        z-index: 2;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
    }

    .loading {
        display: flex;
        width: calc(100% - 0.4rem);
        height: calc(100% - 0.4rem);
        justify-content: center;
        align-items: center;
        background-color: var(--secondary);
        color: var(--secondary-text);
        border-radius: 0.4rem;
        animation: infinite 3s pulse ease-in-out;
        position: absolute;
    }

    @keyframes pulse {
        0% {
            background-color: var(--secondary);
        }
        50% {
            background-color: var(--primary);
        }
        100% {
            background-color: var(--secondary);
        }
    }
</style>
