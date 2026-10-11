import { browser } from '$app/env'
import { generateTheme } from '#lib/monaco/editorTheme.ts'
import { EDITOR_FONT } from '#lib/monaco/editorFont.ts'
import type monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import type { AvailableLanguages, AvailableProgrammingLanguages } from '#lib/Project.svelte.ts'
import { openProjectResource } from '#lib/languages/service/navigation.ts'
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
    private sourceHelpRegistration: Promise<void> | undefined
    private sourceHelpGeneration = 0

    constructor() {
        if (browser) this.load()
    }

    dispose = () => {
        this.sourceHelpGeneration++

        for (const disposable of this.toDispose.splice(0).reverse()) disposable.dispose()

        this.registeredLanguages.clear()
        this.registeringLanguages.clear()
        this.projectOpener = undefined
        this.sourceHelpRegistration = undefined
    }

    async load(): Promise<MonacoType> {
        if (this.loading) return this.loading
        //Monaco measures the font once, when an editor is created, and does not measure it again
        //when a web font arrives later, so an editor made before Fira Code had loaded would place
        //its cursor and columns by the fallback's widths. The font is a fraction of Monaco's size
        //and loads alongside it; a font that fails to load leaves the fallback, as before. Tests load
        //Monaco where there is no document, or one without a font set
        const loading = Promise.all([
            import('monaco-editor'),
            globalThis.document?.fonts
                ?.load(`${EDITOR_FONT.fontSize}px ${EDITOR_FONT.fontFamily}`)
                .catch(() => undefined)
        ]).then(([monacoInstance]) => monacoInstance)
        this.loading = loading
        const monacoInstance = await loading
        monacoInstance.editor.defineTheme('custom-theme', generateTheme())
        this.monaco = monacoInstance
        self.MonacoEnvironment = {
            getWorker: function (_moduleId: unknown, _label: string) {
                return new editorWorker()
            }
        }
        return monacoInstance
    }

    async registerLanguage(lang: AvailableLanguages | AvailableProgrammingLanguages) {
        if (lang === 'c' || lang === 'cpp') {
            const generation = this.sourceHelpGeneration
            this.sourceHelpRegistration ??= this.installSourceHelp(generation).catch((error) => {
                if (generation === this.sourceHelpGeneration)
                    this.sourceHelpRegistration = undefined
                throw error
            })
            return this.sourceHelpRegistration
        }

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
            openCodeEditor(source, resource, selectionOrPosition) {
                return openProjectResource(resource, selectionOrPosition, source)
            }
        })
        this.toDispose.push(this.projectOpener)
    }

    private async installSourceHelp(generation: number): Promise<void> {
        const monacoInstance = this.monaco ?? (await this.load())
        const { registerSourceLanguageHelp } = await import('#lib/sourceLanguageHelp/register.ts')
        if (generation !== this.sourceHelpGeneration) return
        this.toDispose.push(...registerSourceLanguageHelp(monacoInstance))
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
