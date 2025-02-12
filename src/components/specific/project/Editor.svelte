<script lang="ts">
    import { run } from 'svelte/legacy'

    import { createEventDispatcher, onDestroy, onMount } from 'svelte'
    import type monaco from 'monaco-editor'
    import type { AvailableLanguages } from '../../../lib/Project.svelte'
    import { Monaco } from '$lib/monaco/Monaco'
    import type { MonacoType } from '$lib/monaco/Monaco'
    import { generateTheme } from '$lib/monaco/editorTheme'
    import type { MonacoError } from '$lib/languages/commonLanguageFeatures.svelte'
    interface Props {
        disabled?: boolean
        code: string
        highlightedLine: number
        hasError?: boolean
        language: AvailableLanguages
        errors: MonacoError[]
        breakpoints: number[]
        editor?: monaco.editor.IStandaloneCodeEditor
    }

    let {
        disabled = false,
        code = $bindable(),
        highlightedLine,
        hasError = false,
        language,
        errors,
        breakpoints,
        editor = $bindable()
    }: Props = $props()
    let mockEditor: HTMLDivElement | null = $state()
    let monacoInstance: MonacoType | null = $state.raw()
    let hoveredGliphen: number | null = $state()
    const toDispose = []
    const dispatcher = createEventDispatcher<{
        change: string
        breakpointPress: number
    }>()
    let el: HTMLDivElement = $state()

    onMount(async () => {
        monacoInstance = await Monaco.get()
        if (!el) return console.log('Wrapper element not valid', el)
        Monaco.registerLanguages()
        editor = monacoInstance.editor.create(el, {
            value: code,
            language: language.toLowerCase(),
            theme: 'custom-theme',
            minimap: { enabled: false },
            scrollbar: {
                vertical: 'auto',
                horizontal: 'auto'
            },
            glyphMargin: true,
            cursorBlinking: 'phase',
            fontSize: 16,
            smoothScrolling: true,
            cursorSmoothCaretAnimation: 'on'
        })

        const observer = new ResizeObserver(() => {
            if (!mockEditor) return
            const bounds = mockEditor.getBoundingClientRect()
            editor.layout({
                width: bounds.width,
                height: bounds.height
            })
        })
        Monaco.setCustomTheme(generateTheme())
        observer.observe(mockEditor)

        toDispose.push(
            editor.onMouseDown((e) => {
                if (e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                    dispatcher('breakpointPress', e.target.position.lineNumber)
                }
            }),
            editor.onMouseLeave(() => {
                hoveredGliphen = null
            }),
            editor.onMouseMove((e) => {
                if (e.target.type === monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                    hoveredGliphen = e.target.position.lineNumber
                } else {
                    hoveredGliphen = null
                }
            })
        )
        toDispose.push(() => observer.disconnect())
        toDispose.push(
            editor.getModel().onDidChangeContent(() => {
                code = editor.getValue()
                dispatcher('change', code)
            })
        )
    })
    $effect(() => {
        if (editor && code !== editor.getValue()) {
            console.log('overridden editor code')
            editor.setValue(code)
        }
    })
    onDestroy(() => {
        toDispose.forEach((d) => {
            if (typeof d === 'function') return d()
            d.dispose()
        })
        Monaco?.dispose()
        editor?.dispose()
    })

    let decorations = $state.raw(editor?.createDecorationsCollection())

    $effect(() => {
        decorations = editor?.createDecorationsCollection()
    })
    $effect(() => {
        if (editor && decorations) {
            decorations.set([
                ...(highlightedLine >= 0
                    ? [
                          {
                              range: new monacoInstance.Range(
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
                    range: new monacoInstance.Range(e + 1, 0, e + 1, 0),
                    options: {
                        glyphMarginClassName: 'breakpoint-glyph'
                    }
                })),
                ...(hoveredGliphen && !breakpoints.includes(hoveredGliphen - 1)
                    ? [
                          {
                              range: new monacoInstance.Range(hoveredGliphen, 0, hoveredGliphen, 0),
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
        if (editor && highlightedLine > 0) {
            editor.revealLineInCenter(highlightedLine)
        }
    })
    $effect(() => {
        if (editor && monacoInstance) {
            monacoInstance.editor.setModelMarkers(
                editor.getModel(),
                language,
                errors.map((e) => {
                    const position =  e.column
                    return {
                        severity: monacoInstance.MarkerSeverity.Error,
                        message: e.message,
                        startLineNumber: e.lineIndex + 1,
                        startColumn: position,
                        endLineNumber: e.lineIndex,
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
        right: 1rem !important;
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

    :global(.monaco-hover) {
        border-radius: 0.3rem;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        border: 1px solid var(--accent2) !important;
    }
    :global(.monaco-editor .monaco-hover .hover-row:not(:first-child):not(:empty)) {
        border-top: 1px solid var(--accent2) !important;
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
