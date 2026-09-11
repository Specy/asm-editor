import { browser } from '$app/environment'
import { generateTheme } from '$lib/monaco/editorTheme'
import type monaco from 'monaco-editor'

import editorWorker from 'monaco-editor/editor/editor.worker?worker'

import type { AvailableLanguages, AvailableProgrammingLanguages } from '$lib/Project.svelte'
import { openProjectResource } from '$lib/languages/service/navigation'
import { registerAssemblyLanguage } from './assemblyLanguageRegistry'

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
        const monacoInstance = await loading
        monacoInstance.editor.defineTheme('custom-theme', generateTheme())
        this.monaco = monacoInstance
        // @ts-ignore add worker
        self.MonacoEnvironment = {
            getWorker: function (_moduleId: unknown, _label: string) {
                return new editorWorker()
            }
        }
        return monacoInstance
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
        const monacoInstance = this.monaco ?? (await this.load())
        this.ensureProjectOpener(monacoInstance)
        if (!this.declaredLanguageIds.has(lang)) {
            monacoInstance.languages.register({ id: lang.toLowerCase() })
            this.declaredLanguageIds.add(lang)
        }

        let registrations: monaco.IDisposable[] = []
        try {
            registrations = await registerAssemblyLanguage(monacoInstance, lang)
        } catch (error) {
            for (const disposable of registrations.reverse()) disposable.dispose()
            throw error
        }
        this.toDispose.push(...registrations)
    }

    private ensureProjectOpener(monacoInstance: MonacoType) {
        if (this.projectOpener) return
        this.projectOpener = monacoInstance.editor.registerEditorOpener({
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
