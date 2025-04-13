import { browser } from '$app/environment'
import { generateTheme } from '$lib/monaco/editorTheme'
import {
    createM68KCompletition,
    createM68kHoverProvider,
    createM68kFormatter
} from '$lib/languages/M68K/M68K-language'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import type monaco from 'monaco-editor'
import { createMIPSCompletition, createMIPSHoverProvider } from '$lib/languages/MIPS/MIPS-language'
import { M68KLanguage } from '$lib/languages/M68K/M68K-grammar'
import { MIPSLanguage, MIPSLanguageConfiguration } from '$lib/languages/MIPS/MIPS-grammar'
import { X86Language } from '$lib/languages/X86/X86-grammar'
import { createX86CompletitionProvider, createX86HoverProvider } from '$lib/languages/X86/X86-language'

export type MonacoType = typeof monaco

class MonacoLoader {
    private monaco: MonacoType
    loading: Promise<MonacoType>
    toDispose: monaco.IDisposable[] = []
    constructor() {
        if (browser) this.load()
    }
    dispose = () => {
        this.toDispose.forEach((d) => d.dispose())
    }
    async load(): Promise<MonacoType> {
        if (this.loading) return this.loading
        this.loading = import('monaco-editor')
        const monaco: MonacoType = await this.loading
        monaco.editor.defineTheme('custom-theme', generateTheme())
        monaco.languages.register({ id: 'm68k' })
        monaco.languages.register({ id: 'mips' })
        monaco.languages.register({ id: 'x86'})
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
        if (!monaco) return
        this.toDispose.push(
            //@ts-ignore custom language
            monaco.languages.setMonarchTokensProvider('m68k', M68KLanguage),
            monaco.languages.registerCompletionItemProvider('m68k', createM68KCompletition(monaco)),
            monaco.languages.registerHoverProvider('m68k', createM68kHoverProvider(monaco)),
            monaco.languages.registerDocumentFormattingEditProvider(
                'm68k',
                createM68kFormatter(monaco)
            )
        )
        this.toDispose.push(
            monaco.languages.setMonarchTokensProvider('mips', MIPSLanguage),
            monaco.languages.setLanguageConfiguration('mips', MIPSLanguageConfiguration),
            monaco.languages.registerCompletionItemProvider('mips', createMIPSCompletition(monaco)),
            monaco.languages.registerHoverProvider('mips', createMIPSHoverProvider(monaco))
        )
        this.toDispose.push(
            monaco.languages.setMonarchTokensProvider('x86', X86Language),
            monaco.languages.registerCompletionItemProvider('x86', createX86CompletitionProvider(monaco)),
            monaco.languages.registerHoverProvider('x86', createX86HoverProvider(monaco))
        )
    }
    async get() {
        if (this.monaco) return this.monaco
        await this.load()
        return this.monaco
    }
}

export const Monaco = new MonacoLoader()
