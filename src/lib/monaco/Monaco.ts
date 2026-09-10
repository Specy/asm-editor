import { browser } from '$app/environment'
import { generateTheme } from '$lib/monaco/editorTheme'
import type monaco from 'monaco-editor'

import editorWorker from 'monaco-editor/editor/editor.worker?worker'

import type { AvailableLanguages, AvailableProgrammingLanguages } from '$lib/Project.svelte'
import { openProjectResource } from '$lib/languages/service/navigation'

export type MonacoType = typeof monaco

class MonacoLoader {
    private monaco: MonacoType | null = null
    loading: Promise<MonacoType> | null = null
    private toDispose: monaco.IDisposable[] = []
    private declaredLanguageIds = new Set<AvailableLanguages>()
    private registeredLanguages = new Set<AvailableLanguages>()
    private registeringLanguages = new Map<AvailableLanguages, Promise<void>>()
    private projectOpener: monaco.IDisposable | undefined

    constructor() {
        if (browser) this.load()
    }

    dispose = () => {
        for (const disposable of this.toDispose.splice(0).reverse()) disposable.dispose()
        this.registeredLanguages.clear()
        this.registeringLanguages.clear()
        this.projectOpener = undefined
    }

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

    async registerLanguage(lang: AvailableLanguages | AvailableProgrammingLanguages) {
        if (lang === 'c') return
        if (this.registeredLanguages.has(lang)) return
        const pending = this.registeringLanguages.get(lang)
        if (pending) return pending

        const registration = this.installLanguage(lang)
        this.registeringLanguages.set(lang, registration)
        try {
            await registration
            this.registeredLanguages.add(lang)
        } finally {
            this.registeringLanguages.delete(lang)
        }
    }

    private async installLanguage(lang: AvailableLanguages): Promise<void> {
        const monaco = this.monaco ?? (await this.load())
        this.ensureProjectOpener(monaco)
        if (!this.declaredLanguageIds.has(lang)) {
            monaco.languages.register({ id: lang.toLowerCase() })
            this.declaredLanguageIds.add(lang)
        }
        const registrations: monaco.IDisposable[] = []
        try {
            if (lang === 'M68K') {
                const [grammar, language, textFeatures] = await Promise.all([
                    import('$lib/languages/M68K/M68K-grammar'),
                    import('$lib/languages/M68K/M68K-language'),
                    import('$lib/languages/service/assemblyText')
                ])
                const projectLanguage = await import('$lib/languages/M68K/M68K-project-language')
                registrations.push(
                    //@ts-ignore custom language
                    monaco.languages.setMonarchTokensProvider('m68k', grammar.M68KLanguage),
                    monaco.languages.setLanguageConfiguration(
                        'm68k',
                        grammar.M68KLanguageConfiguration
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'm68k',
                        language.createM68KCompletion(monaco)
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'm68k',
                        projectLanguage.createM68kProjectCompletionProvider(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'm68k',
                        language.createM68kHoverProvider(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'm68k',
                        projectLanguage.createM68kProjectHoverProvider(monaco)
                    ),
                    monaco.languages.registerSignatureHelpProvider(
                        'm68k',
                        language.createM68kSignatureHelpProvider(monaco)
                    ),
                    monaco.languages.registerDocumentSymbolProvider(
                        'm68k',
                        projectLanguage.createM68kDocumentSymbolProvider(monaco)
                    ),
                    monaco.languages.registerDefinitionProvider(
                        'm68k',
                        projectLanguage.createM68kDefinitionProvider(monaco)
                    ),
                    monaco.languages.registerLinkProvider(
                        'm68k',
                        projectLanguage.createM68kDocumentLinkProvider(monaco)
                    ),
                    monaco.languages.registerDocumentFormattingEditProvider(
                        'm68k',
                        language.createM68kFormatter(monaco)
                    ),
                    monaco.languages.registerDocumentRangeFormattingEditProvider(
                        'm68k',
                        language.createM68kRangeFormatter(monaco)
                    ),
                    monaco.languages.registerFoldingRangeProvider(
                        'm68k',
                        textFeatures.createAssemblyFoldingProvider(monaco, {
                            comment: ';',
                            sectionPattern: /^(?:section|org)$/i,
                            blockPairs: [
                                {
                                    start: /^\s*(?:[A-Za-z_.$][\w.$]*\s+)?macro\b/i,
                                    end: /^\s*endm\b/i
                                },
                                {
                                    start: /^\s*(?:if\w*|while|for|dbloop)\b/i,
                                    end: /^\s*(?:endc|endi|endw|endf|unless)\b/i
                                }
                            ]
                        })
                    )
                )
            } else if (lang === 'MIPS') {
                const [grammar, language, projectLanguage, textFeatures] = await Promise.all([
                    import('$lib/languages/MIPS/MIPS-grammar'),
                    import('$lib/languages/MIPS/MIPS-language'),
                    import('$lib/languages/service/projectAssemblyLanguage'),
                    import('$lib/languages/service/assemblyText')
                ])
                registrations.push(
                    monaco.languages.setMonarchTokensProvider('mips', grammar.MIPSLanguage),
                    monaco.languages.setLanguageConfiguration(
                        'mips',
                        grammar.MIPSLanguageConfiguration
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'mips',
                        language.createMIPSCompletion(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'mips',
                        language.createMIPSHoverProvider(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'mips',
                        projectLanguage.createProjectSymbolHoverProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerSignatureHelpProvider(
                        'mips',
                        language.createMIPSSignatureHelpProvider(monaco)
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'mips',
                        projectLanguage.createProjectSymbolCompletionProvider(monaco, {
                            comment: '#',
                            dialect: 'mars',
                            excludeCurrentFromCompletion: true
                        })
                    ),
                    monaco.languages.registerDocumentSymbolProvider(
                        'mips',
                        projectLanguage.createProjectDocumentSymbolProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerDefinitionProvider(
                        'mips',
                        projectLanguage.createProjectDefinitionProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerLinkProvider(
                        'mips',
                        projectLanguage.createProjectDocumentLinkProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerFoldingRangeProvider(
                        'mips',
                        textFeatures.createAssemblyFoldingProvider(
                            monaco,
                            language.MIPS_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentFormattingEditProvider(
                        'mips',
                        textFeatures.createAssemblyFormattingProvider(
                            monaco,
                            language.MIPS_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentRangeFormattingEditProvider(
                        'mips',
                        textFeatures.createAssemblyRangeFormattingProvider(
                            monaco,
                            language.MIPS_TEXT_OPTIONS
                        )
                    )
                )
            } else if (lang === 'RISC-V') {
                const [grammar, language, projectLanguage, textFeatures] = await Promise.all([
                    import('$lib/languages/RISC-V/RISC-V-grammar'),
                    import('$lib/languages/RISC-V/RISC-V-language'),
                    import('$lib/languages/service/projectAssemblyLanguage'),
                    import('$lib/languages/service/assemblyText')
                ])
                registrations.push(
                    monaco.languages.setMonarchTokensProvider('risc-v', grammar.RISCVLanguage),
                    monaco.languages.setLanguageConfiguration(
                        'risc-v',
                        grammar.RISCVLanguageConfiguration
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'risc-v',
                        language.createRISCVCompletion(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'risc-v',
                        language.createRISCVHoverProvider(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'risc-v',
                        projectLanguage.createProjectSymbolHoverProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerSignatureHelpProvider(
                        'risc-v',
                        language.createRISCVSignatureHelpProvider(monaco)
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'risc-v',
                        projectLanguage.createProjectSymbolCompletionProvider(monaco, {
                            comment: '#',
                            dialect: 'mars',
                            excludeCurrentFromCompletion: true
                        })
                    ),
                    monaco.languages.registerDocumentSymbolProvider(
                        'risc-v',
                        projectLanguage.createProjectDocumentSymbolProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerDefinitionProvider(
                        'risc-v',
                        projectLanguage.createProjectDefinitionProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerLinkProvider(
                        'risc-v',
                        projectLanguage.createProjectDocumentLinkProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerFoldingRangeProvider(
                        'risc-v',
                        textFeatures.createAssemblyFoldingProvider(
                            monaco,
                            language.RISCV_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentFormattingEditProvider(
                        'risc-v',
                        textFeatures.createAssemblyFormattingProvider(
                            monaco,
                            language.RISCV_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentRangeFormattingEditProvider(
                        'risc-v',
                        textFeatures.createAssemblyRangeFormattingProvider(
                            monaco,
                            language.RISCV_TEXT_OPTIONS
                        )
                    )
                )
            } else if (lang === 'RISC-V-64') {
                const [grammar, language, projectLanguage, textFeatures] = await Promise.all([
                    import('$lib/languages/RISC-V/RISC-V-grammar'),
                    import('$lib/languages/RISC-V/RISC-V-language'),
                    import('$lib/languages/service/projectAssemblyLanguage'),
                    import('$lib/languages/service/assemblyText')
                ])
                registrations.push(
                    monaco.languages.setMonarchTokensProvider('risc-v-64', grammar.RISCVLanguage),
                    monaco.languages.setLanguageConfiguration(
                        'risc-v-64',
                        grammar.RISCVLanguageConfiguration
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'risc-v-64',
                        language.createRISCVCompletion(monaco, true)
                    ),
                    monaco.languages.registerHoverProvider(
                        'risc-v-64',
                        language.createRISCVHoverProvider(monaco, true)
                    ),
                    monaco.languages.registerHoverProvider(
                        'risc-v-64',
                        projectLanguage.createProjectSymbolHoverProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerSignatureHelpProvider(
                        'risc-v-64',
                        language.createRISCVSignatureHelpProvider(monaco, true)
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'risc-v-64',
                        projectLanguage.createProjectSymbolCompletionProvider(monaco, {
                            comment: '#',
                            dialect: 'mars',
                            excludeCurrentFromCompletion: true
                        })
                    ),
                    monaco.languages.registerDocumentSymbolProvider(
                        'risc-v-64',
                        projectLanguage.createProjectDocumentSymbolProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerDefinitionProvider(
                        'risc-v-64',
                        projectLanguage.createProjectDefinitionProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerLinkProvider(
                        'risc-v-64',
                        projectLanguage.createProjectDocumentLinkProvider(monaco, {
                            comment: '#',
                            dialect: 'mars'
                        })
                    ),
                    monaco.languages.registerFoldingRangeProvider(
                        'risc-v-64',
                        textFeatures.createAssemblyFoldingProvider(
                            monaco,
                            language.RISCV_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentFormattingEditProvider(
                        'risc-v-64',
                        textFeatures.createAssemblyFormattingProvider(
                            monaco,
                            language.RISCV_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentRangeFormattingEditProvider(
                        'risc-v-64',
                        textFeatures.createAssemblyRangeFormattingProvider(
                            monaco,
                            language.RISCV_TEXT_OPTIONS
                        )
                    )
                )
            } else if (lang === 'Z80') {
                const [grammar, language, projectLanguage, z80ProjectLanguage, textFeatures] =
                    await Promise.all([
                        import('$lib/languages/Z80/Z80-grammar'),
                        import('$lib/languages/Z80/Z80-language'),
                        import('$lib/languages/service/projectAssemblyLanguage'),
                        import('$lib/languages/Z80/Z80-project-language'),
                        import('$lib/languages/service/assemblyText')
                    ])
                registrations.push(
                    monaco.languages.setMonarchTokensProvider('z80', grammar.Z80Language),
                    monaco.languages.setLanguageConfiguration(
                        'z80',
                        grammar.Z80LanguageConfiguration
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'z80',
                        language.createZ80Completion(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'z80',
                        language.createZ80HoverProvider(monaco)
                    ),
                    monaco.languages.registerSignatureHelpProvider(
                        'z80',
                        language.createZ80SignatureHelpProvider(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'z80',
                        z80ProjectLanguage.createZ80ProjectHoverProvider(monaco)
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'z80',
                        projectLanguage.createProjectSymbolCompletionProvider(monaco, {
                            comment: ';',
                            dialect: 'z80',
                            z80BareSymbols: true,
                            knownOperations: language.Z80_TEXT_OPTIONS.knownOperations,
                            excludeCurrentFromCompletion: true
                        })
                    ),
                    monaco.languages.registerDocumentSymbolProvider(
                        'z80',
                        z80ProjectLanguage.createZ80ProjectDocumentSymbolProvider(monaco)
                    ),
                    monaco.languages.registerDefinitionProvider(
                        'z80',
                        z80ProjectLanguage.createZ80ProjectDefinitionProvider(monaco)
                    ),
                    monaco.languages.registerReferenceProvider(
                        'z80',
                        z80ProjectLanguage.createZ80ReferenceProvider(monaco)
                    ),
                    monaco.languages.registerDocumentHighlightProvider(
                        'z80',
                        z80ProjectLanguage.createZ80DocumentHighlightProvider(monaco)
                    ),
                    monaco.languages.registerRenameProvider(
                        'z80',
                        z80ProjectLanguage.createZ80RenameProvider(monaco)
                    ),
                    monaco.languages.registerLinkProvider(
                        'z80',
                        projectLanguage.createProjectDocumentLinkProvider(monaco, {
                            comment: ';',
                            dialect: 'z80',
                            z80BareSymbols: true,
                            knownOperations: language.Z80_TEXT_OPTIONS.knownOperations
                        })
                    ),
                    monaco.languages.registerFoldingRangeProvider(
                        'z80',
                        textFeatures.createAssemblyFoldingProvider(
                            monaco,
                            language.Z80_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentFormattingEditProvider(
                        'z80',
                        textFeatures.createAssemblyFormattingProvider(
                            monaco,
                            language.Z80_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentRangeFormattingEditProvider(
                        'z80',
                        textFeatures.createAssemblyRangeFormattingProvider(
                            monaco,
                            language.Z80_TEXT_OPTIONS
                        )
                    )
                )
            } else if (lang === 'X86') {
                const [grammar, language, projectLanguage, textFeatures] = await Promise.all([
                    import('$lib/languages/X86/X86-grammar'),
                    import('$lib/languages/X86/X86-language'),
                    import('$lib/languages/service/projectAssemblyLanguage'),
                    import('$lib/languages/service/assemblyText')
                ])
                registrations.push(
                    monaco.languages.setMonarchTokensProvider('x86', grammar.X86Language),
                    monaco.languages.setLanguageConfiguration(
                        'x86',
                        grammar.X86LanguageConfiguration
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'x86',
                        language.createX86CompletionProvider(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'x86',
                        language.createX86HoverProvider(monaco)
                    ),
                    monaco.languages.registerHoverProvider(
                        'x86',
                        projectLanguage.createProjectSymbolHoverProvider(monaco, {
                            comment: ';',
                            dialect: 'x86'
                        })
                    ),
                    monaco.languages.registerSignatureHelpProvider(
                        'x86',
                        language.createX86SignatureHelpProvider(monaco)
                    ),
                    monaco.languages.registerCompletionItemProvider(
                        'x86',
                        projectLanguage.createProjectSymbolCompletionProvider(monaco, {
                            comment: ';',
                            dialect: 'x86',
                            excludeCurrentFromCompletion: true
                        })
                    ),
                    monaco.languages.registerDocumentSymbolProvider(
                        'x86',
                        projectLanguage.createProjectDocumentSymbolProvider(monaco, {
                            comment: ';',
                            dialect: 'x86'
                        })
                    ),
                    monaco.languages.registerDefinitionProvider(
                        'x86',
                        projectLanguage.createProjectDefinitionProvider(monaco, {
                            comment: ';',
                            dialect: 'x86'
                        })
                    ),
                    monaco.languages.registerLinkProvider(
                        'x86',
                        projectLanguage.createProjectDocumentLinkProvider(monaco, {
                            comment: ';',
                            dialect: 'x86'
                        })
                    ),
                    monaco.languages.registerFoldingRangeProvider(
                        'x86',
                        textFeatures.createAssemblyFoldingProvider(
                            monaco,
                            language.X86_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentFormattingEditProvider(
                        'x86',
                        textFeatures.createAssemblyFormattingProvider(
                            monaco,
                            language.X86_TEXT_OPTIONS
                        )
                    ),
                    monaco.languages.registerDocumentRangeFormattingEditProvider(
                        'x86',
                        textFeatures.createAssemblyRangeFormattingProvider(
                            monaco,
                            language.X86_TEXT_OPTIONS
                        )
                    )
                )
            }
        } catch (error) {
            for (const disposable of registrations.reverse()) disposable.dispose()
            throw error
        }
        this.toDispose.push(...registrations)
    }

    private ensureProjectOpener(monaco: MonacoType) {
        if (this.projectOpener) return
        this.projectOpener = monaco.editor.registerEditorOpener({
            openCodeEditor(_source, resource, selectionOrPosition) {
                return openProjectResource(resource, selectionOrPosition)
            }
        })
        this.toDispose.push(this.projectOpener)
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
