import { browser } from '$app/environment'
import { generateTheme } from '$lib/monaco/editorTheme'
import type monaco from 'monaco-editor'

import editorWorker from 'monaco-editor/editor/editor.worker?worker'

import type { AvailableLanguages, AvailableProgrammingLanguages } from '$lib/Project.svelte'

export type MonacoType = typeof monaco

class MonacoLoader {
    private monaco: MonacoType | null = null
    loading: Promise<MonacoType> | null = null
    toDispose: monaco.IDisposable[] = []

    constructor() {
        if (browser) this.load()
    }

    dispose = () => {}

    async load(): Promise<MonacoType> {
        if (this.loading) return this.loading
        const loading = import('monaco-editor')
        this.loading = loading
        const monaco = await loading
        monaco.editor.defineTheme('custom-theme', generateTheme())
        this.monaco = monaco
        // @ts-ignore add worker
        self.MonacoEnvironment = {
            getWorker: function (_moduleId: unknown, _label: string) {
                return new editorWorker()
            }
        }
        return monaco
    }

    private registeredLanguages: AvailableLanguages[] = []

    async registerLanguage(lang: AvailableLanguages | AvailableProgrammingLanguages) {
        const monaco = this.monaco ?? (await this.load())
        if (lang === 'c') return
        if (this.registeredLanguages.includes(lang)) return
        this.registeredLanguages.push(lang)
        monaco.languages.register({ id: lang.toLowerCase() })
        if (lang === 'M68K') {
            const [grammar, language] = await Promise.all([
                import('$lib/languages/M68K/M68K-grammar'),
                import('$lib/languages/M68K/M68K-language')
            ])
            this.toDispose.push(
                //@ts-ignore custom language
                monaco.languages.setMonarchTokensProvider('m68k', grammar.M68KLanguage),
                monaco.languages.setLanguageConfiguration(
                    'm68k',
                    grammar.M68KLanguageConfiguration
                ),
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
        } else if (lang === 'RISC-V-64') {
            const [grammar, language] = await Promise.all([
                import('$lib/languages/RISC-V/RISC-V-grammar'),
                import('$lib/languages/RISC-V/RISC-V-language')
            ])
            this.toDispose.push(
                monaco.languages.setMonarchTokensProvider('risc-v-64', grammar.RISCVLanguage),
                monaco.languages.setLanguageConfiguration(
                    'risc-v-64',
                    grammar.RISCVLanguageConfiguration
                ),
                monaco.languages.registerCompletionItemProvider(
                    'risc-v-64',
                    language.createRISCVCompletition(monaco, true)
                ),
                monaco.languages.registerHoverProvider(
                    'risc-v-64',
                    language.createRISCVHoverProvider(monaco, true)
                )
            )
        } else if (lang === 'Z80') {
            const [grammar, language] = await Promise.all([
                import('$lib/languages/Z80/Z80-grammar'),
                import('$lib/languages/Z80/Z80-language')
            ])
            this.toDispose.push(
                monaco.languages.setMonarchTokensProvider('z80', grammar.Z80Language),
                monaco.languages.setLanguageConfiguration('z80', grammar.Z80LanguageConfiguration),
                monaco.languages.registerCompletionItemProvider(
                    'z80',
                    language.createZ80Completion(monaco)
                ),
                monaco.languages.registerHoverProvider(
                    'z80',
                    language.createZ80HoverProvider(monaco)
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
        if (!this.monaco) return
        this.monaco.editor.setTheme(theme)
    }
    setCustomTheme = (theme: monaco.editor.IStandaloneThemeData) => {
        if (!this.monaco) return
        this.monaco.editor.defineTheme('custom-theme', theme)
        this.monaco.editor.setTheme('custom-theme')
    }
    registerLanguages = async () => {
        return await Promise.all([
            this.registerLanguage('M68K'),
            this.registerLanguage('MIPS'),
            this.registerLanguage('RISC-V'),
            this.registerLanguage('RISC-V-64'),
            this.registerLanguage('X86'),
            this.registerLanguage('Z80')
        ])
    }

    async get(): Promise<MonacoType> {
        return this.monaco ?? (await this.load())
    }
}

export const Monaco = new MonacoLoader()
