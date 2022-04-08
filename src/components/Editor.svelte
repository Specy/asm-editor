<script lang="ts">
	import { onMount } from 'svelte'
	import type monaco from 'monaco-editor'
	import type { Project } from '$lib/Project'
	import { Monaco, MonacoType } from '$lib/Monaco'
	export let disabled = false
	export let project: Project
	export let highlightedLine: number
	export let hasError = false
	let el: HTMLDivElement
	let editor: monaco.editor.IStandaloneCodeEditor
	let monacoInstance: MonacoType
	let decorations = []
	onMount(async () => {
		monacoInstance = await Monaco.get()
		editor = monacoInstance.editor.create(el, {
			value: project.code,
			language: project.language.toLowerCase(),
			theme: 'custom-theme',
			minimap: { enabled: false },
			scrollbar: {
				vertical: 'auto',
				horizontal: 'hidden'
			}
		})
		editor.getModel().onDidChangeContent(() => {
			project.code = editor.getValue()
		})
		return editor.dispose
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
	$: editor?.updateOptions({ readOnly: disabled })
</script>

<svelte:window
	on:resize={() => {
		if (editor) editor.layout()
	}}
/>
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
	.editor {
		display: flex;
		flex: 1;
		z-index: 2;
		border-radius: 0.3rem;
		overflow: hidden;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);

	}
	@keyframes moveGradient {
		50% {
			background-position: 100% 50%;
		}
	}
</style>
