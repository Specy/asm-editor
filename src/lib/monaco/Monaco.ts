import { browser } from '$app/environment';
import { generateTheme } from '$lib/monaco/editorTheme';
import { M68KLanguage, createM68KCompletition, createM68kHoverProvider, createM68kFormatter } from '$lib/languages/M68K-language';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import type monaco from 'monaco-editor'

export type MonacoType = typeof monaco

class MonacoLoader {
	private monaco: MonacoType;
	loading: Promise<MonacoType>;
	toDispose: monaco.IDisposable[] = [];
	constructor() {
		if (browser) this.load()
	}
	dispose = () => {
		this.toDispose.forEach(d => d.dispose())
	}
	async load(): Promise<MonacoType> {
		if (this.loading) return this.loading
		this.loading = import('monaco-editor')
		const monaco: MonacoType = await this.loading
		monaco.editor.defineTheme('custom-theme', generateTheme())
		monaco.languages.register({ id: 'm68k' })
		this.monaco = monaco
		this.registerLanguages()

		// @ts-ignore add worker
		self.MonacoEnvironment = {
			getWorker: function (_moduleId: any, label: string) {
				return new editorWorker()
			}
		}
		return monaco
	}
	setTheme = (theme: string) => {
		this.monaco.editor.setTheme(theme)
	}
	setCustomTheme = (theme: monaco.editor.IStandaloneThemeData) => {
		this.monaco.editor.defineTheme('custom-theme', theme)
		this.monaco.editor.setTheme('custom-theme')
	}
	registerLanguages = () => {
		this.dispose()
		const { monaco } = this
		if(!monaco) return
		//@ts-ignore custom language
		this.toDispose.push(monaco.languages.setMonarchTokensProvider('m68k', M68KLanguage))
		this.toDispose.push(monaco.languages.registerCompletionItemProvider('m68k', createM68KCompletition(monaco)))
		this.toDispose.push(monaco.languages.registerHoverProvider('m68k', createM68kHoverProvider(monaco)))
		this.toDispose.push(monaco.languages.registerDocumentFormattingEditProvider('m68k', createM68kFormatter(monaco)))

	}
	async get() {
		if (this.monaco) return this.monaco
		await this.load()
		return this.monaco
	}
}

export const Monaco = new MonacoLoader()