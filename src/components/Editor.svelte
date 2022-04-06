<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

	import type { Project } from '$lib/Project'
    import { baseTheme } from '$lib/editorTheme';
import { M68KLanguage } from '$lib/M68K-language';
import Logger from './misc/Logger.svelte';
	let el: HTMLDivElement
	let editor: monaco.editor.IStandaloneCodeEditor
	let Monaco
	export let project: Project
    export let highlightedLine: number
	let decorations = []
	onMount(async () => {
		// @ts-ignore
		self.MonacoEnvironment = {
			getWorker: function (_moduleId: any, label: string) {
				return new editorWorker()
			}
		}
		Monaco = await import('monaco-editor')
        Monaco.editor.defineTheme('custom-theme',baseTheme)
		Monaco.languages.register({id: 'm68k'})
		Monaco.languages.setMonarchTokensProvider('m68k',M68KLanguage)
		editor = Monaco.editor.create(el, {
			value: project.code,
			language: 'm68k',
            theme: 'custom-theme',
            minimap:{enabled:false},
            scrollbar: {
                vertical:"auto",
                horizontal: "hidden",
            },
		})
		editor.getModel().onDidChangeContent(() => {
			project.code = editor.getValue()
		})
        return editor.dispose
	})
    $ : {
        if(editor){
			decorations = editor.deltaDecorations(decorations, highlightedLine >= 0 ? 
				[{
					range: new Monaco.Range(highlightedLine, 0, highlightedLine, 0),
					options: {
						className: 'selected-line',
						inlineClassName: 'selected-line-text',
						isWholeLine: true,
					}
			}] : [])

			editor.revealLineInCenter(highlightedLine)
		}
    }
</script>
<svelte:window on:resize={() => {
		if(editor) editor.layout()
	}}
/>
<div bind:this={el} class="editor" />

<style>
	:global(.selected-line){
		background-color: var(--accent);

	}
	:global(.selected-line-text){
		color: var(--accent-text) !important;
	}
	:global(.find-widget){
		border-radius: 0.3rem !important;
		top: 1rem !important;
		right: 1rem !important;
	}
	:global(.monaco-inputbox){
		border-radius: 0.2rem;
	}
	:global(.find-widget){
		transform: translateY(calc(-100% - 1.2rem)) !important;
	}
	:global(.find-widget.visible){
		transform: translateY(0) !important;
	}
	.editor {
		display: flex;
        flex: 1;
	}
</style>
