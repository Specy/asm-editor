import { browser } from '$app/env'
import { generateTheme } from '#lib/monaco/editorTheme.ts'
import { EDITOR_FONT } from '#lib/monaco/editorFont.ts'
import type monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import type { AvailableLanguages, AvailableProgrammingLanguages } from '#lib/Project.svelte.ts'
import { isTextFileLanguage, type TextFileLanguage } from '#lib/textFileLanguages.ts'
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
    private assemblyGeneration = 0
    private projectOpener: monaco.IDisposable | undefined
    private sourceHelpRegistration: Promise<void> | undefined
    private sourceHelpGeneration = 0

    constructor() {
        if (browser) this.load()
    }

    dispose = () => {
        this.assemblyGeneration++
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
            //Monaco asks here for every worker, its language services' too: a JSON, CSS, HTML or
            //JavaScript File's model starts one of its own, which the editor's worker cannot be
            getWorker: function (_moduleId: unknown, label: string) {
                if (label === 'json') return new jsonWorker()
                if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
                if (label === 'html' || label === 'handlebars' || label === 'razor')
                    return new htmlWorker()
                if (label === 'typescript' || label === 'javascript') return new tsWorker()
                return new editorWorker()
            }
        }
        return monacoInstance
    }

    async registerLanguage(
        lang: AvailableLanguages | AvailableProgrammingLanguages | TextFileLanguage
    ) {
        //Markdown, Python, JSON and the rest are Monaco's own, there as soon as it is
        if (isTextFileLanguage(lang)) {
            await this.load()
            return
        }
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

        const generation = this.assemblyGeneration
        const registration = this.installLanguage(lang, generation)
            .then(() => {
                if (generation === this.assemblyGeneration) this.registeredLanguages.add(lang)
            })
            .finally(() => {
                // Disposal can start a new registration while this one is still pending.
                if (this.registeringLanguages.get(lang) === registration)
                    this.registeringLanguages.delete(lang)
            })

        this.registeringLanguages.set(lang, registration)

        return registration
    }

    private async installLanguage(lang: AvailableLanguages, generation: number): Promise<void> {
        const monacoInstance = this.monaco ?? (await this.load())
        const isCurrent = () => generation === this.assemblyGeneration
        if (!isCurrent()) return
        this.ensureProjectOpener(monacoInstance)
        if (!this.declaredLanguageIds.has(lang)) {
            monacoInstance.languages.register({ id: lang.toLowerCase() })
            this.declaredLanguageIds.add(lang)
        }

        const registrations = await registerAssemblyLanguage(monacoInstance, lang, isCurrent)
        if (!isCurrent()) {
            for (const disposable of registrations.reverse()) disposable.dispose()
            return
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

    /** C's providers: its source help, and the navigation of Pseudocode, which reads as C. */
    private async installSourceHelp(generation: number): Promise<void> {
        const monacoInstance = this.monaco ?? (await this.load())
        const [{ registerSourceLanguageHelp }, { registerPseudocodeProviders }] = await Promise.all(
            [import('#lib/sourceLanguageHelp/register.ts'), import('./pseudocodeProviders')]
        )
        if (generation !== this.sourceHelpGeneration) return
        //a Pseudocode's Go to Definition goes to its Listing's model, which the Workbench opens
        this.ensureProjectOpener(monacoInstance)
        this.toDispose.push(
            ...registerSourceLanguageHelp(monacoInstance),
            ...registerPseudocodeProviders(monacoInstance)
        )
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
