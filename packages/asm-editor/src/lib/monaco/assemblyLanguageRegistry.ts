import type monaco from 'monaco-editor'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import type { MonacoType } from './Monaco'
import {
    createBuildArtifactHoverProvider,
    createNumericHoverProvider,
    type AssemblyInsightOptions,
    type OperationSpan
} from './assemblyInsights'

type ProviderSet = {
    completion?: monaco.languages.CompletionItemProvider[]
    hover?: monaco.languages.HoverProvider[]
    signatureHelp?: monaco.languages.SignatureHelpProvider[]
    documentSymbols?: monaco.languages.DocumentSymbolProvider[]
    definitions?: monaco.languages.DefinitionProvider[]
    references?: monaco.languages.ReferenceProvider[]
    highlights?: monaco.languages.DocumentHighlightProvider[]
    rename?: monaco.languages.RenameProvider[]
    links?: monaco.languages.LinkProvider[]
    formatting?: monaco.languages.DocumentFormattingEditProvider[]
    rangeFormatting?: monaco.languages.DocumentRangeFormattingEditProvider[]
    folding?: monaco.languages.FoldingRangeProvider[]
}

export type AssemblyLanguageDescriptor = {
    id: string
    // M68K's generated Monarch table is structurally valid, but its inferred tuple types are wider
    // than Monaco's declaration. Registration is the one boundary at which it needs coercion.
    monarch: unknown
    configuration: monaco.languages.LanguageConfiguration
    providers: ProviderSet
}

type DescriptorLoader = (monaco: MonacoType) => Promise<AssemblyLanguageDescriptor>

const descriptorLoaders: Record<AvailableLanguages, DescriptorLoader> = {
    M68K: loadM68kDescriptor,
    MIPS: (monaco) => loadMarsDescriptor(monaco, 'mips', false),
    'RISC-V': (monaco) => loadMarsDescriptor(monaco, 'risc-v', false),
    'RISC-V-64': (monaco) => loadMarsDescriptor(monaco, 'risc-v-64', true),
    X86: loadX86Descriptor,
    Z80: loadZ80Descriptor
}

export async function registerAssemblyLanguage(
    monacoInstance: MonacoType,
    language: AvailableLanguages,
    isCurrent: () => boolean = () => true
): Promise<monaco.IDisposable[]> {
    const descriptor = await descriptorLoaders[language](monacoInstance)
    // Descriptor imports can outlive the loader's disposal. Do not overwrite providers from
    // a newer lifecycle, including Monaco's single Monarch and configuration registrations.
    if (!isCurrent()) return []
    return registerAssemblyLanguageDescriptor(monacoInstance, descriptor)
}

export function registerAssemblyLanguageDescriptor(
    monacoInstance: MonacoType,
    descriptor: AssemblyLanguageDescriptor
): monaco.IDisposable[] {
    const registrations: monaco.IDisposable[] = []
    try {
        registrations.push(
            monacoInstance.languages.setMonarchTokensProvider(
                descriptor.id,
                descriptor.monarch as never
            ),
            monacoInstance.languages.setLanguageConfiguration(
                descriptor.id,
                descriptor.configuration
            )
        )
        const { providers } = descriptor
        registerEach(registrations, providers.completion, (provider) =>
            monacoInstance.languages.registerCompletionItemProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.hover, (provider) =>
            monacoInstance.languages.registerHoverProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.signatureHelp, (provider) =>
            monacoInstance.languages.registerSignatureHelpProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.documentSymbols, (provider) =>
            monacoInstance.languages.registerDocumentSymbolProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.definitions, (provider) =>
            monacoInstance.languages.registerDefinitionProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.references, (provider) =>
            monacoInstance.languages.registerReferenceProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.highlights, (provider) =>
            monacoInstance.languages.registerDocumentHighlightProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.rename, (provider) =>
            monacoInstance.languages.registerRenameProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.links, (provider) =>
            monacoInstance.languages.registerLinkProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.formatting, (provider) =>
            monacoInstance.languages.registerDocumentFormattingEditProvider(descriptor.id, provider)
        )
        registerEach(registrations, providers.rangeFormatting, (provider) =>
            monacoInstance.languages.registerDocumentRangeFormattingEditProvider(
                descriptor.id,
                provider
            )
        )
        registerEach(registrations, providers.folding, (provider) =>
            monacoInstance.languages.registerFoldingRangeProvider(descriptor.id, provider)
        )
        return registrations
    } catch (error) {
        for (const disposable of registrations.reverse()) disposable.dispose()
        throw error
    }
}

function registerEach<T>(
    registrations: monaco.IDisposable[],
    providers: readonly T[] | undefined,
    register: (provider: T) => monaco.IDisposable
): void {
    for (const provider of providers ?? []) registrations.push(register(provider))
}

async function loadM68kDescriptor(monacoInstance: MonacoType): Promise<AssemblyLanguageDescriptor> {
    const [grammar, language, projectLanguage, textFeatures] = await Promise.all([
        import('#lib/languages/M68K/M68K-grammar.ts'),
        import('#lib/languages/M68K/M68K-language.ts'),
        import('#lib/languages/M68K/M68K-project-language.ts'),
        import('#lib/languages/service/assemblyText.ts')
    ])
    return {
        id: 'm68k',
        monarch: grammar.M68KLanguage,
        configuration: grammar.M68KLanguageConfiguration,
        providers: {
            completion: [
                language.createM68KCompletion(monacoInstance),
                projectLanguage.createM68kProjectCompletionProvider(monacoInstance)
            ],
            hover: [
                language.createM68kHoverProvider(monacoInstance),
                projectLanguage.createM68kProjectHoverProvider(monacoInstance),
                ...insightHoverProviders(
                    monacoInstance,
                    {
                        bits: 32,
                        comment: ';',
                        dialect: 'm68k'
                    },
                    language.m68kOperationSpan
                )
            ],
            signatureHelp: [language.createM68kSignatureHelpProvider(monacoInstance)],
            documentSymbols: [projectLanguage.createM68kDocumentSymbolProvider(monacoInstance)],
            definitions: [projectLanguage.createM68kDefinitionProvider(monacoInstance)],
            links: [projectLanguage.createM68kDocumentLinkProvider(monacoInstance)],
            formatting: [language.createM68kFormatter(monacoInstance)],
            rangeFormatting: [language.createM68kRangeFormatter(monacoInstance)],
            folding: [
                textFeatures.createAssemblyFoldingProvider(monacoInstance, {
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
            ]
        }
    }
}

async function loadMarsDescriptor(
    monacoInstance: MonacoType,
    id: 'mips' | 'risc-v' | 'risc-v-64',
    rv64: boolean
): Promise<AssemblyLanguageDescriptor> {
    const [projectLanguage, textFeatures] = await Promise.all([
        import('#lib/languages/service/projectAssemblyLanguage.ts'),
        import('#lib/languages/service/assemblyText.ts')
    ])
    const projectOptions = { comment: '#' as const, dialect: 'mars' as const }

    if (id === 'mips') {
        const [grammar, language] = await Promise.all([
            import('#lib/languages/MIPS/MIPS-grammar.ts'),
            import('#lib/languages/MIPS/MIPS-language.ts')
        ])
        return {
            id,
            monarch: grammar.MIPSLanguage,
            configuration: grammar.MIPSLanguageConfiguration,
            providers: projectProviderSet(monacoInstance, projectLanguage, textFeatures, {
                completion: language.createMIPSCompletion(monacoInstance),
                hover: language.createMIPSHoverProvider(monacoInstance),
                signatureHelp: language.createMIPSSignatureHelpProvider(monacoInstance),
                projectOptions,
                textOptions: language.MIPS_TEXT_OPTIONS,
                insightOptions: { bits: 32, comment: '#', dialect: 'mips' }
            })
        }
    }

    const [grammar, language] = await Promise.all([
        import('#lib/languages/RISC-V/RISC-V-grammar.ts'),
        import('#lib/languages/RISC-V/RISC-V-language.ts')
    ])
    return {
        id,
        monarch: grammar.RISCVLanguage,
        configuration: grammar.RISCVLanguageConfiguration,
        providers: projectProviderSet(monacoInstance, projectLanguage, textFeatures, {
            completion: language.createRISCVCompletion(monacoInstance, rv64),
            hover: language.createRISCVHoverProvider(monacoInstance, rv64),
            signatureHelp: language.createRISCVSignatureHelpProvider(monacoInstance, rv64),
            projectOptions,
            textOptions: language.RISCV_TEXT_OPTIONS,
            insightOptions: {
                bits: rv64 ? 64 : 32,
                comment: '#',
                dialect: 'risc-v'
            }
        })
    }
}

async function loadX86Descriptor(monacoInstance: MonacoType): Promise<AssemblyLanguageDescriptor> {
    const [grammar, language, projectLanguage, textFeatures, listingProviders] = await Promise.all([
        import('#lib/languages/X86/X86-grammar.ts'),
        import('#lib/languages/X86/X86-language.ts'),
        import('#lib/languages/service/projectAssemblyLanguage.ts'),
        import('#lib/languages/service/assemblyText.ts'),
        import('./listingProviders')
    ])
    const projectHover = projectLanguage.createProjectSymbolHoverProvider(monacoInstance, {
        comment: ';',
        dialect: 'x86'
    })
    const providers = projectProviderSet(monacoInstance, projectLanguage, textFeatures, {
        completion: language.createX86CompletionProvider(monacoInstance),
        hover: language.createX86HoverProvider(monacoInstance),
        signatureHelp: language.createX86SignatureHelpProvider(monacoInstance),
        projectOptions: { comment: ';', dialect: 'x86' },
        textOptions: language.X86_TEXT_OPTIONS,
        insightOptions: { bits: 64, comment: ';', dialect: 'x86' },
        projectHover: false
    })
    //an Executable's Listing is x86 assembly, highlighted and documented as any, but read for
    //navigation from the Listing rather than from the Project's Files
    const { withoutListings } = listingProviders
    const listing = listingProviders.createListingProviders(monacoInstance)
    return {
        id: 'x86',
        monarch: grammar.X86Language,
        configuration: grammar.X86LanguageConfiguration,
        providers: {
            ...providers,
            //in the order the other assembly languages register theirs
            hover: [
                ...(providers.hover ?? []).slice(0, 1),
                withoutListings(projectHover, 'provideHover'),
                ...(providers.hover ?? []).slice(1),
                listing.hover
            ],
            documentSymbols: [
                ...(providers.documentSymbols ?? []).map((provider) =>
                    withoutListings(provider, 'provideDocumentSymbols')
                ),
                listing.documentSymbols
            ],
            definitions: [
                ...(providers.definitions ?? []).map((provider) =>
                    withoutListings(provider, 'provideDefinition')
                ),
                listing.definition
            ],
            references: [listing.references],
            links: (providers.links ?? []).map((provider) =>
                withoutListings(provider, 'provideLinks', { links: [] })
            ),
            folding: [
                ...(providers.folding ?? []).map((provider) =>
                    withoutListings(provider, 'provideFoldingRanges')
                ),
                listing.folding
            ],
            formatting: (providers.formatting ?? []).map((provider) =>
                withoutListings(provider, 'provideDocumentFormattingEdits')
            ),
            rangeFormatting: (providers.rangeFormatting ?? []).map((provider) =>
                withoutListings(provider, 'provideDocumentRangeFormattingEdits')
            )
        }
    }
}

async function loadZ80Descriptor(monacoInstance: MonacoType): Promise<AssemblyLanguageDescriptor> {
    const [grammar, language, projectLanguage, z80ProjectLanguage, textFeatures] =
        await Promise.all([
            import('#lib/languages/Z80/Z80-grammar.ts'),
            import('#lib/languages/Z80/Z80-language.ts'),
            import('#lib/languages/service/projectAssemblyLanguage.ts'),
            import('#lib/languages/Z80/Z80-project-language.ts'),
            import('#lib/languages/service/assemblyText.ts')
        ])
    const projectOptions = {
        comment: ';' as const,
        dialect: 'z80' as const,
        z80BareSymbols: true,
        knownOperations: language.Z80_TEXT_OPTIONS.knownOperations
    }
    const providers = projectProviderSet(monacoInstance, projectLanguage, textFeatures, {
        completion: language.createZ80Completion(monacoInstance),
        hover: language.createZ80HoverProvider(monacoInstance),
        signatureHelp: language.createZ80SignatureHelpProvider(monacoInstance),
        projectOptions,
        textOptions: language.Z80_TEXT_OPTIONS,
        insightOptions: { bits: 16, comment: ';', dialect: 'z80' },
        projectHover: false,
        projectDocumentSymbols: false,
        projectDefinitions: false
    })
    return {
        id: 'z80',
        monarch: grammar.Z80Language,
        configuration: grammar.Z80LanguageConfiguration,
        providers: {
            ...providers,
            hover: [
                ...(providers.hover ?? []),
                z80ProjectLanguage.createZ80ProjectHoverProvider(monacoInstance)
            ],
            documentSymbols: [
                z80ProjectLanguage.createZ80ProjectDocumentSymbolProvider(monacoInstance)
            ],
            definitions: [z80ProjectLanguage.createZ80ProjectDefinitionProvider(monacoInstance)],
            references: [z80ProjectLanguage.createZ80ReferenceProvider(monacoInstance)],
            highlights: [z80ProjectLanguage.createZ80DocumentHighlightProvider(monacoInstance)],
            rename: [z80ProjectLanguage.createZ80RenameProvider(monacoInstance)]
        }
    }
}

type GenericProjectModule = typeof import('#lib/languages/service/projectAssemblyLanguage.ts')
type TextFeatureModule = typeof import('#lib/languages/service/assemblyText.ts')
type GenericProjectOptions = Parameters<
    GenericProjectModule['createProjectSymbolCompletionProvider']
>[1]
type TextOptions = Parameters<TextFeatureModule['createAssemblyFoldingProvider']>[1]

function projectProviderSet(
    monacoInstance: MonacoType,
    projectLanguage: GenericProjectModule,
    textFeatures: TextFeatureModule,
    options: {
        completion: monaco.languages.CompletionItemProvider
        hover: monaco.languages.HoverProvider
        signatureHelp: monaco.languages.SignatureHelpProvider
        projectOptions: GenericProjectOptions
        textOptions: TextOptions
        insightOptions: AssemblyInsightOptions
        projectHover?: boolean
        projectDocumentSymbols?: boolean
        projectDefinitions?: boolean
    }
): ProviderSet {
    const insightHovers = insightHoverProviders(
        monacoInstance,
        options.insightOptions,
        (line) => textFeatures.parseAssemblyLine(line, options.textOptions).operation
    )
    return {
        completion: [
            options.completion,
            projectLanguage.createProjectSymbolCompletionProvider(monacoInstance, {
                ...options.projectOptions,
                excludeCurrentFromCompletion: true
            })
        ],
        hover: [
            options.hover,
            ...(options.projectHover === false
                ? []
                : [
                      projectLanguage.createProjectSymbolHoverProvider(
                          monacoInstance,
                          options.projectOptions
                      )
                  ]),
            ...insightHovers
        ],
        signatureHelp: [options.signatureHelp],
        documentSymbols:
            options.projectDocumentSymbols === false
                ? []
                : [
                      projectLanguage.createProjectDocumentSymbolProvider(
                          monacoInstance,
                          options.projectOptions
                      )
                  ],
        definitions:
            options.projectDefinitions === false
                ? []
                : [
                      projectLanguage.createProjectDefinitionProvider(
                          monacoInstance,
                          options.projectOptions
                      )
                  ],
        links: [
            projectLanguage.createProjectDocumentLinkProvider(
                monacoInstance,
                options.projectOptions
            )
        ],
        folding: [textFeatures.createAssemblyFoldingProvider(monacoInstance, options.textOptions)],
        formatting: [
            textFeatures.createAssemblyFormattingProvider(monacoInstance, options.textOptions)
        ],
        rangeFormatting: [
            textFeatures.createAssemblyRangeFormattingProvider(monacoInstance, options.textOptions)
        ]
    }
}

function insightHoverProviders(
    monacoInstance: MonacoType,
    options: AssemblyInsightOptions,
    operationSpan: (line: string) => OperationSpan | undefined
): monaco.languages.HoverProvider[] {
    return [
        createNumericHoverProvider(monacoInstance, options),
        createBuildArtifactHoverProvider(monacoInstance, operationSpan)
    ]
}
