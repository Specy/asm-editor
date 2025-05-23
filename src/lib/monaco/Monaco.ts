import { browser } from '$app/environment'
import { generateTheme } from '$lib/monaco/editorTheme'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import type monaco from 'monaco-editor'
import type { AvailableLanguages } from '$lib/Project.svelte'

export type MonacoType = typeof monaco

class MonacoLoader {
    private monaco: MonacoType
    loading: Promise<MonacoType>
    toDispose: monaco.IDisposable[] = []

    constructor() {
        if (browser) this.load()
    }

    dispose = () => {
        this.registeredLanguages = []
        this.toDispose.forEach((d) => d.dispose())
    }

    async load(): Promise<MonacoType> {
        if (this.loading) return this.loading
        this.loading = import('monaco-editor')
        const monaco: MonacoType = await this.loading
        monaco.editor.defineTheme('custom-theme', generateTheme())
        this.monaco = monaco
        // @ts-ignore add worker
        self.MonacoEnvironment = {
            getWorker: function (_moduleId: any, label: string) {
                return new editorWorker()
            }
        }
        return monaco
    }

    private registeredLanguages: AvailableLanguages[] = []

    async registerLanguage(lang: AvailableLanguages) {
        if (!this.monaco) await this.load()
        const { monaco } = this
        if (!monaco) return
        if (this.registeredLanguages.includes(lang)) return
        this.registeredLanguages.push(lang)
        console.log('loading language', lang)
        monaco.languages.register({ id: lang.toLowerCase() })
        if (lang === 'M68K') {
            const [grammar, language] = await Promise.all([
                import('$lib/languages/M68K/M68K-grammar'),
                import('$lib/languages/M68K/M68K-language')
            ])
            this.toDispose.push(
                //@ts-ignore custom language
                monaco.languages.setMonarchTokensProvider('m68k', grammar.M68KLanguage),
                monaco.languages.registerCompletionItemProvider(
                    'm68k',
                    language.createM68KCompletition(monaco)
                ),
                monaco.languages.registerHoverProvider(
                    'm68k',
                    language.createM68kHoverProvider(monaco)
                ),
                monaco.languages.registerDocumentFormattingEditProvider(
                    'm68k',
                    language.createM68kFormatter(monaco)
                )
            )
        } else if (lang === 'MIPS') {
            const [grammar, language] = await Promise.all([
                import('$lib/languages/MIPS/MIPS-grammar'),
                import('$lib/languages/MIPS/MIPS-language')
            ])
            this.toDispose.push(
                monaco.languages.setMonarchTokensProvider('mips', grammar.MIPSLanguage),
                monaco.languages.setLanguageConfiguration(
                    'mips',
                    grammar.MIPSLanguageConfiguration
                ),
                monaco.languages.registerCompletionItemProvider(
                    'mips',
                    language.createMIPSCompletition(monaco)
                ),
                monaco.languages.registerHoverProvider(
                    'mips',
                    language.createMIPSHoverProvider(monaco)
                )
            )
        } else if (lang === 'RISC-V') {
            const [grammar, language] = await Promise.all([
                import('$lib/languages/RISC-V/RISC-V-grammar'),
                import('$lib/languages/RISC-V/RISC-V-language')
            ])
            this.toDispose.push(
                monaco.languages.setMonarchTokensProvider('risc-v', grammar.RISCVLanguage),
                monaco.languages.setLanguageConfiguration(
                    'risc-v',
                    grammar.RISCVLanguageConfiguration
                ),
                monaco.languages.registerCompletionItemProvider(
                    'risc-v',
                    language.createRISCVCompletition(monaco)
                ),
                monaco.languages.registerHoverProvider(
                    'risc-v',
                    language.createRISCVHoverProvider(monaco)
                )
            )
        } else if (lang === 'X86') {
            const [grammar, language] = await Promise.all([
                import('$lib/languages/X86/X86-grammar'),
                import('$lib/languages/X86/X86-language')
            ])
            this.toDispose.push(
                monaco.languages.setMonarchTokensProvider('x86', grammar.X86Language),
                monaco.languages.registerCompletionItemProvider(
                    'x86',
                    language.createX86CompletitionProvider(monaco)
                ),
                monaco.languages.registerHoverProvider(
                    'x86',
                    language.createX86HoverProvider(monaco)
                )
            )
        }
    }

    setTheme = (theme: string) => {
        this.monaco.editor.setTheme(theme)
    }
    setCustomTheme = (theme: monaco.editor.IStandaloneThemeData) => {
        this.monaco.editor.defineTheme('custom-theme', theme)
        this.monaco.editor.setTheme('custom-theme')
    }
    registerLanguages = async () => {
        return await Promise.all([
            this.registerLanguage('M68K'),
            this.registerLanguage('MIPS'),
            this.registerLanguage('RISC-V'),
            this.registerLanguage('X86')
        ])
    }

    async get() {
        if (this.monaco) return this.monaco
        await this.load()
        return this.monaco
    }
}

export const Monaco = new MonacoLoader()
