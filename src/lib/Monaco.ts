import { browser } from '$app/env';
import { baseTheme } from '$lib/editorTheme';
import { M68KLanguage, M68KCompletition } from '$lib/languages/M68K-language';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import type monaco from 'monaco-editor'
import { MIPSLanguage, MIPSCompletition } from '$lib/languages/MIPS-language';

export type MonacoType = typeof monaco
class MonacoLoader {
	private monaco: MonacoType;
	loading: Promise<MonacoType>;
	toDispose: monaco.IDisposable[] = [];
	constructor() {
		if (browser) this.load()
	}
	dispose = () => {
		console.log('Disposed')
		this.toDispose.forEach(d => d.dispose())
	}
	async load(): Promise<MonacoType> {
		if (this.loading) return this.loading
		this.loading = import('monaco-editor')
		const monaco: MonacoType = await this.loading
		//@ts-ignore custom theme
		monaco.editor.defineTheme('custom-theme', baseTheme)
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

	registerLanguages = () => {
		this.dispose()
		const { monaco } = this
		if(!monaco) return
		//@ts-ignore custom language
		this.toDispose.push(monaco.languages.setMonarchTokensProvider('m68k', M68KLanguage))
		//@ts-ignore custom language
		this.toDispose.push(monaco.languages.setMonarchTokensProvider('mips', MIPSLanguage))
		this.toDispose.push(monaco.languages.registerCompletionItemProvider('m68k', M68KCompletition(monaco)))
		this.toDispose.push(monaco.languages.registerCompletionItemProvider('mips', MIPSCompletition(monaco)))

	}
	async get() {
		if (this.monaco) return this.monaco
		await this.load()
		return this.monaco
	}
}


export const Monaco = new MonacoLoader()