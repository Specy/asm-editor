import { untrack } from 'svelte'
import type { Project } from '$lib/Project.svelte'
import type { BuildSources } from '$lib/projectFiles'
import type { Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
import { compileProjectSource } from '$lib/sourceCompilation/compileProjectSource'
import { SourceCompilationError } from '$lib/sourceCompilation/compilerExplorer'
import {
    compilationStatus,
    defaultSourceCompiler,
    isCompilationTarget,
    sourceLanguage,
    type Optimization,
    type SourceCompiler
} from '$lib/sourceCompilation/records'
import { playgroundBuildSources } from './playgroundProgram'
import { registerLanguageSession } from '$lib/languages/service/sessionRegistry'

/** A transient Project gives embeds the same files and compilation lifecycle as the Workbench. */
export class PlaygroundSession {
    readonly project: Project
    selected = $state('')
    compiling = $state(false)
    diagnostics = $state<Diagnostic[]>([])
    optimization = $state<Optimization>('0')
    compiler = $state<SourceCompiler>('clang')
    private controller?: AbortController
    readonly sources: BuildSources
    private readonly sourceHelpSources: BuildSources

    constructor(project: Project) {
        this.project = project
        this.selected = project.entry
        this.compiler = defaultSourceCompiler(project.language)
        this.sources = $derived.by(() => {
            try {
                return playgroundBuildSources(project)
            } catch (error) {
                return { files: project.files, entry: project.entry, assemblyError: String(error) }
            }
        })
        // A C/C++ entry leaves the emulator idle, but its source files still need editor help.
        this.sourceHelpSources = $derived({ ...this.sources, files: project.files })
    }

    /** Give named models source help without starting an assembly-analysis Worker. */
    registerSourceHelp(sessionId: string): () => void {
        const getSources = () => this.sourceHelpSources
        const getTarget = () => this.project.language
        return registerLanguageSession({
            sessionId,
            get sources() {
                return getSources()
            },
            get target() {
                return getTarget()
            },
            snapshot: undefined,
            sourcesFor(sourceKind) {
                return sourceKind === 'live' ? getSources() : undefined
            }
        })
    }

    get sourcePath() {
        if (!isCompilationTarget(this.project.language)) return undefined
        if (sourceLanguage(this.selected)) return this.selected
        return this.project.compilations.find((record) => record.outputPath === this.selected)
            ?.sourcePath
    }

    get recompilationNeeded() {
        const record = this.project.compilations.find(
            (record) => record.outputPath === this.selected
        )
        if (!record) return false
        const status = compilationStatus(record, this.project.files, this.project.language)
        return status.stale || status.edited
    }

    get needsCompilation() {
        const path = this.sourcePath
        if (!path) return false
        const record = this.project.compilations.find((record) => record.sourcePath === path)
        return !record || compilationStatus(record, this.project.files, this.project.language).stale
    }

    edit(path: string, value: string) {
        this.project.fileSystem.writeText(path, value)
        this.diagnostics = []
    }

    async compile(confirm: (question: string, signal: AbortSignal) => Promise<boolean | null>) {
        const path = this.sourcePath
        if (!path || this.compiling) return false
        const originalEntry = this.project.entry
        const controller = new AbortController()
        this.controller = controller
        this.compiling = true
        this.diagnostics = []
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)])
        try {
            const result = await compileProjectSource(this.project, path, this.optimization, {
                compiler: this.compiler,
                signal,
                confirm: (question) => confirm(question, signal)
            })
            if (!result) return false
            //A hand-authored assembly entry may include generated code. Keep that entry when
            //compiling a companion source file instead of replacing the caller's program.
            if (!sourceLanguage(originalEntry) && originalEntry !== result.record.outputPath)
                this.project.entry = originalEntry
            this.diagnostics = result.diagnostics
            this.selected = result.record.outputPath
            return true
        } catch (error) {
            if (error instanceof SourceCompilationError) this.diagnostics = error.diagnostics
            if (controller.signal.aborted) return false
            throw error
        } finally {
            this.compiling = false
            this.controller = undefined
        }
    }

    cancel() {
        untrack(() => this.controller?.abort())
    }
}
