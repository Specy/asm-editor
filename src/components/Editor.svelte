<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte'
	import type monaco from 'monaco-editor'
	import type { AvailableLanguages } from '$lib/Project'
	import { Monaco } from '$lib/Monaco'
	import type { MonacoType } from '$lib/Monaco'
	import type { MonacoError } from '$lib/M68KEmulator'
	export let disabled = false
	export let code: string
	export let highlightedLine: number
	export let hasError = false
	export let language: AvailableLanguages
	export let errors: MonacoError[]
	let el: HTMLDivElement
	let mockEditor: HTMLDivElement
	let editor: monaco.editor.IStandaloneCodeEditor
	let monacoInstance: MonacoType
	let decorations = []
	const toDispose = []
	const dispatcher = createEventDispatcher<{ change: string }>()

	onMount(async () => {
		Monaco.registerLanguages()
		monacoInstance = await Monaco.get()
		editor = monacoInstance.editor.create(el, {
			value: code,
			language: language.toLowerCase(),
			theme: 'custom-theme',
			minimap: { enabled: false },
			scrollbar: {
				vertical: 'auto',
				horizontal: 'auto'
			},
			cursorBlinking: 'phase',
			fontSize: 16,

			smoothScrolling: true
		})
		const observer = new ResizeObserver(() => {
			if (!mockEditor) return
			const bounds = mockEditor.getBoundingClientRect()
			console.log("resize")
			editor.layout({
				width: bounds.width,
				height: bounds.height
			})
		})
		observer.observe(mockEditor)
		toDispose.push(() => observer.disconnect())
		toDispose.push(
			editor.getModel().onDidChangeContent(() => {
				code = editor.getValue()
				dispatcher('change', code)
			})
		)
		return () => {
			toDispose.forEach((d) => d.dispose())
			Monaco.dispose()
			editor.dispose()
		}
	})
	$: {
		if (editor) {
			decorations = editor.deltaDecorations(
				decorations,
				highlightedLine > 0
					? [
							{
								range: new monacoInstance.Range(highlightedLine, 0, highlightedLine, 0),
								options: {
									className: hasError ? 'error-line' : 'selected-line',
									inlineClassName: 'selected-line-text',
									isWholeLine: true
								}
							}
					  ]
					: []
			)
			editor.revealLineInCenter(highlightedLine)
		}
	}
	$: {
		if (editor) {
			monacoInstance.editor.setModelMarkers(
				editor.getModel(),
				language,
				errors.map((e) => ({
					severity: monacoInstance.MarkerSeverity.Error,
					message: e.message,
					startLineNumber: e.lineIndex + 1,
					startColumn: 0,
					endLineNumber: e.lineIndex,
					endColumn: 100
				}))
			)
		}
	}
	$: editor?.updateOptions({ readOnly: disabled })
</script>


<div bind:this={mockEditor} class="mock-editor">
	{#if !editor}
		<h1 class="loading">Loading editor...</h1>
	{/if}
</div>
<div bind:this={el} class="editor" />

<style lang="scss">
	:global(.selected-line) {
		background-color: var(--accent);
	}
	:global(.error-line) {
		background-color: var(--red);
	}
	:global(.selected-line-text) {
		color: var(--accent-text) !important;
	}
	:global(.find-widget) {
		border-radius: 0.3rem !important;
		top: 1rem !important;
		right: 1rem !important;
	}
	:global(.monaco-editor-overlaymessage .message) {
		border-radius: 0.3rem !important;
		border-bottom-left-radius: 0 !important;
	}
	:global(.monaco-inputbox) {
		border-radius: 0.2rem;
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
	.editor {
		display: flex;
		position: absolute;
		flex: 1;
		z-index: 2;
		border-radius: 0.4rem;
		overflow: hidden;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
	}

	.loading {
		display: flex;
		width: calc(100% - 0.4rem);
		height: calc(100% - 0.4rem);
		justify-content: center;
		align-items: center;
		background-color: var(--secondary);
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
