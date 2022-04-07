import { browser } from '$app/env';
import { baseTheme } from '$lib/editorTheme';
import { M68KLanguage, M68KCompletition } from '$lib/M68K-language';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import type monaco from 'monaco-editor'

export type MonacoType = typeof monaco
class MonacoLoader {
	private monaco: MonacoType;
	loading: Promise<MonacoType>;
	constructor() {
		if (browser) this.load()
	}
	async load(): Promise<MonacoType> {
		if (this.loading) return this.loading
		this.loading = import('monaco-editor')
		const monaco = await this.loading
		//@ts-ignore custom theme
		monaco.editor.defineTheme('custom-theme', baseTheme)
		monaco.languages.register({ id: 'm68k' })
		//@ts-ignore custom language
		monaco.languages.setMonarchTokensProvider('m68k', M68KLanguage)
		monaco.languages.registerCompletionItemProvider('m68k', M68KCompletition(monaco))
		this.monaco = monaco
		// @ts-ignore add worker
		self.MonacoEnvironment = {
			getWorker: function (_moduleId: any, label: string) {
				return new editorWorker()
			}
		}
		return monaco
	}

	async get() {
		if (this.monaco) return this.monaco
		await this.load()
		return this.monaco
	}
}


export const Monaco = new MonacoLoader()