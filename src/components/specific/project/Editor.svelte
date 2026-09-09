<script lang="ts" generics="ViewZoneProps extends Record<string, unknown> = Record<string, never>">
    import {
        type Component,
        createEventDispatcher,
        mount,
        onDestroy,
        onMount,
        unmount
    } from 'svelte'
    import { SvelteMap } from 'svelte/reactivity'
    import type monaco from 'monaco-editor'
    import type {
        AvailableLanguages,
        AvailableProgrammingLanguages
    } from '../../../lib/Project.svelte'
    import type { MonacoType } from '$lib/monaco/Monaco'
    import { Monaco } from '$lib/monaco/Monaco'
    import { generateTheme } from '$lib/monaco/editorTheme'
    import type { Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        disabled?: boolean
        code: string
        codeOverride?: string
        /** Keeps each Project File on its own Monaco model and therefore its own text Undo stack. */
        modelKey?: string
        highlightedLine?: number
        hasError?: boolean
        language: AvailableLanguages | AvailableProgrammingLanguages
        diagnostics?: Diagnostic[]
        breakpoints?: number[]
        editor?: monaco.editor.IStandaloneCodeEditor
        viewZones?: {
            afterLineNumber: number
            content: Component<ViewZoneProps>
            props: ViewZoneProps
        }[]
    }

    let {
        disabled = false,
        code = $bindable(),
        codeOverride,
        modelKey = 'default',
        highlightedLine = -1,
        hasError = false,
        language,
        diagnostics = [],
        breakpoints = [],
        editor = $bindable(),
        viewZones = []
    }: Props = $props()
    let mockEditor: HTMLDivElement | null = $state(null)
    let monacoInstance: MonacoType | null = $state.raw(null)
    let activeModelKey = $state('')
    let hoveredGliphen: number | null = $state(null)
    let destroyed = false
    let applyingExternalValue = false
    let overflowWidgets: HTMLDivElement | null = null
    const models = new SvelteMap<string, monaco.editor.ITextModel>()
    const toDispose: (monaco.IDisposable | (() => void))[] = []
    const dispatcher = createEventDispatcher<{
        change: string
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
        const initialModel = loadedMonaco.editor.createModel(
            codeOverride ?? code,
            editorLanguage.toLowerCase()
        )
        initialModel.setEOL(0)
        models.set(modelKey, initialModel)
        activeModelKey = modelKey
        overflowWidgets = document.createElement('div')
        //Keep Monaco's widget styles/theme while escaping the editor's local stacking context.
        overflowWidgets.className = 'monaco-overflow-widgets monaco-editor'
        const overflowWidgetsHost =
            editorElement.closest<HTMLElement>('.theme-root') ?? document.body
        overflowWidgetsHost.appendChild(overflowWidgets)
        const mountedEditor = loadedMonaco.editor.create(editorElement, {
            model: initialModel,
            theme: 'custom-theme',
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
                if (e.target.type === loadedMonaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                    dispatcher('breakpointPress', e.target.position.lineNumber)
                }
            }),
            mountedEditor.onMouseLeave(() => {
                hoveredGliphen = null
            }),
            mountedEditor.onMouseMove((e) => {
                if (e.target.type === loadedMonaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
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
                code = mountedEditor.getValue()
                dispatcher('change', code)
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

    function selectModel(key: string, value: string) {
        const currentEditor = editor
        const currentMonaco = monacoInstance
        if (!currentEditor || !currentMonaco) return
        let model = models.get(key)
        if (!model) {
            model = currentMonaco.editor.createModel(value, language.toLowerCase())
            model.setEOL(0)
            models.set(key, model)
        } else {
            setModelValue(model, value)
        }
        if (currentEditor.getModel() !== model) {
            applyingExternalValue = true
            try {
                currentEditor.setModel(model)
            } finally {
                applyingExternalValue = false
            }
        }
        activeModelKey = key
    }

    $effect(() => {
        selectModel(modelKey, codeOverride ?? code)
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
                                  highlightedLine + 1,
                                  0,
                                  highlightedLine + 1,
                                  0
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
                    range: new currentMonaco.Range(e + 1, 0, e + 1, 0),
                    options: {
                        glyphMarginClassName: 'breakpoint-glyph'
                    }
                })),
                ...(hoveredGliphen && !breakpoints.includes(hoveredGliphen - 1)
                    ? [
                          {
                              range: new currentMonaco.Range(hoveredGliphen, 0, hoveredGliphen, 0),
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
        if (activeModelKey && editor && highlightedLine > 0) {
            editor.revealLineInCenter(highlightedLine)
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
                    const position = e.column
                    return {
                        severity: markerSeverities[e.severity],
                        message: e.formatted,
                        startLineNumber: e.lineIndex + 1,
                        startColumn: position,
                        endLineNumber: e.lineIndex + 1,
                        endColumn: 100
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
