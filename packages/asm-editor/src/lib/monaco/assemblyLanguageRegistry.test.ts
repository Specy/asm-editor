import { describe, expect, it } from 'vite-plus/test'
import type { MonacoType } from './Monaco'
import {
    registerAssemblyLanguage,
    registerAssemblyLanguageDescriptor,
    type AssemblyLanguageDescriptor
} from './assemblyLanguageRegistry'

function registrationStub(failAt?: string) {
    const disposed: string[] = []
    const registered: string[] = []
    const registration = (name: string) => {
        return () => {
            registered.push(name)
            if (name === failAt) throw new Error(`failed ${name}`)
            return { dispose: () => disposed.push(name) }
        }
    }
    const languages = {
        setMonarchTokensProvider: registration('monarch'),
        setLanguageConfiguration: registration('configuration'),
        registerCompletionItemProvider: registration('completion'),
        registerHoverProvider: registration('hover'),
        registerSignatureHelpProvider: registration('signatureHelp'),
        registerDocumentSymbolProvider: registration('documentSymbols'),
        registerDefinitionProvider: registration('definitions'),
        registerReferenceProvider: registration('references'),
        registerDocumentHighlightProvider: registration('highlights'),
        registerRenameProvider: registration('rename'),
        registerLinkProvider: registration('links'),
        registerDocumentFormattingEditProvider: registration('formatting'),
        registerDocumentRangeFormattingEditProvider: registration('rangeFormatting'),
        registerFoldingRangeProvider: registration('folding'),
        registerCodeActionProvider: registration('codeActions')
    }
    return {
        monaco: { languages } as unknown as MonacoType,
        disposed,
        registered
    }
}

function completeDescriptor(): AssemblyLanguageDescriptor {
    const provider = {} as never
    return {
        id: 'assembly-test',
        monarch: {},
        configuration: {},
        providers: {
            completion: [provider],
            hover: [provider],
            signatureHelp: [provider],
            documentSymbols: [provider],
            definitions: [provider],
            references: [provider],
            highlights: [provider],
            rename: [provider],
            links: [provider],
            formatting: [provider],
            rangeFormatting: [provider],
            folding: [provider],
            codeActions: [provider]
        }
    }
}

describe('assembly language provider registry', () => {
    it('skips provider installation if its lifecycle expires while the descriptor loads', async () => {
        const stub = registrationStub()
        let current = true
        const pending = registerAssemblyLanguage(stub.monaco, 'MIPS', () => current)
        current = false
        expect(await pending).toEqual([])
        expect(stub.registered).toEqual([])
        expect(stub.disposed).toEqual([])
    })

    it('installs every capability declared by a descriptor', () => {
        const stub = registrationStub()
        const registrations = registerAssemblyLanguageDescriptor(stub.monaco, completeDescriptor())

        expect(stub.registered).toEqual([
            'monarch',
            'configuration',
            'completion',
            'hover',
            'signatureHelp',
            'documentSymbols',
            'definitions',
            'references',
            'highlights',
            'rename',
            'links',
            'formatting',
            'rangeFormatting',
            'folding',
            'codeActions'
        ])
        expect(registrations).toHaveLength(stub.registered.length)
    })

    it('disposes partial registration when a provider fails', () => {
        const stub = registrationStub('definitions')
        expect(() => registerAssemblyLanguageDescriptor(stub.monaco, completeDescriptor())).toThrow(
            'failed definitions'
        )
        expect(stub.disposed).toEqual([
            'documentSymbols',
            'signatureHelp',
            'hover',
            'completion',
            'configuration',
            'monarch'
        ])
    })
})
