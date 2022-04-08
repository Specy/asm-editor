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
	const toDispose = []
	onMount(async () => {
		Monaco.registerLanguages()
		monacoInstance = await Monaco.get()
		editor = monacoInstance.editor.create(el, {
			value: project.code,
			language: project.language.toLowerCase(),
			theme: 'custom-theme',
			minimap: { enabled: false },
			scrollbar: {
				vertical: 'auto',
				horizontal: 'hidden',
			},
			cursorBlinking: 'phase',
			fontSize: 16,

			smoothScrolling: true,
		})
		toDispose.push(editor.getModel().onDidChangeContent(() => {
			project.code = editor.getValue()
		}))
		return () => {
			console.log(toDispose)
			toDispose.forEach(d => d.dispose())
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
									isWholeLine: true,
								
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
{#if !editor}
	<h1 class="loading">
		Loading editor...
	</h1>
{/if}
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

	.editor{
		display: flex;
		flex: 1;
		z-index: 2;
		border-radius: 0.4rem;
		overflow: hidden;
		box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
	}
	.loading{
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
		0%{
			background-color: var(--secondary);
		}
		50%{
			background-color: var(--primary);
		}
		100%{
			background-color: var(--secondary);

		}
	}
</style>
