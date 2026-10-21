import { untrack } from 'svelte'
import { defaultEntryPath, type Project } from '#lib/Project.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { compileProjectSource } from '#lib/sourceCompilation/compileProjectSource.ts'
import { SourceCompilationError } from '#lib/sourceCompilation/compilerExplorer.ts'
import {
    compilationStatus,
    defaultSourceCompiler,
    isCompilationTarget,
    sourceLanguage,
    type Optimization,
    type SourceCompiler
} from '#lib/sourceCompilation/records.ts'
import { playgroundBuildSources } from './playgroundProgram'
import { registerLanguageSession } from '#lib/languages/service/sessionRegistry.ts'

/**
 * What live checking and Build say while the Playground has no Program, which only the chat page's
 * agent leaves it with, by deleting the one Entry; a File it writes then makes the next.
 */
export const PLAYGROUND_NO_PROGRAM_MESSAGE =
    'This playground has no program. Write an assembly file to make one.'

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
        this.selected = project.selectedProgram ?? ''
        this.compiler = defaultSourceCompiler(project.language)
        this.sources = $derived.by(() => {
            //the Emulator and live checking always have sources, as in the Workbench: with no
            //Program, the default Entry path's, and why nothing builds
            const entry = project.selectedProgram
            if (entry === undefined)
                return {
                    files: project.files,
                    entry: defaultEntryPath(project.language),
                    assemblyError: PLAYGROUND_NO_PROGRAM_MESSAGE
                }
            try {
                return playgroundBuildSources(project)
            } catch (error) {
                return { files: project.files, entry, assemblyError: String(error) }
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
        const controller = new AbortController()
        this.controller = controller
        this.compiling = true
        this.diagnostics = []
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)])
        try {
            //A Playground has exactly one Program, its authored entry (programs.md, decision 12),
            //and a Compile makes no other: a C entry moves to its Generated assembly, and a
            //companion of an assembly entry leaves that entry alone
            const result = await compileProjectSource(this.project, path, this.optimization, {
                compiler: this.compiler,
                signal,
                confirm: (question) => confirm(question, signal),
                newProgram: 'none'
            })
            if (!result) return false
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
