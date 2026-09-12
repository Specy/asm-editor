import type { RegisteredTool } from '@discerns/sdk'
import type { Emulator } from '$lib/languages/Emulator'
import type { FileSystem } from '$lib/languages/peripherals/FileSystem'
import { fileText, type ProjectFiles, type ProjectFile } from '$lib/projectFiles'
import { defaultEntryPath } from '$lib/Project.svelte'
import {
    DEFAULT_CODING_AGENT_TOOL_NAMES,
    type AgentToolAllowList,
    type DefaultCodingAgentToolContext,
    type DefaultCodingAgentToolName,
    type SupportedLanguage
} from './types'
import { createDefaultCodingAgentTools } from './tools'
import {
    collectEmulatorDiagnostics,
    collectEmulatorErrors,
    formatEmulatorState
} from './formatting'

export interface AssemblyCodingHarnessOptions {
    language?: SupportedLanguage | null
    files?: Record<string, string> | ProjectFiles | string
    entry?: string
    fileSystem?: FileSystem
    emulator?: Emulator | null
    canUpdateLanguage?: boolean
    activePath?: string
}

export interface HarnessFileInfo {
    path: string
    lineCount: number
    size: number
    isEntry: boolean
}

/**
 * A simple, modular coding harness for assembly.
 * Supports multi-file project management, emulator execution, and tool registration.
 */
export class AssemblyCodingHarness {
    private language: SupportedLanguage | null = null
    private files: Record<string, string> = {}
    private entry: string
    private activePath: string
    private fileSystem?: FileSystem
    private emulator: Emulator | null = null
    private canUpdateLanguage: boolean
    private listeners = new Set<() => void>()

    constructor(options: AssemblyCodingHarnessOptions = {}) {
        this.language = options.language ?? 'M68K'
        this.canUpdateLanguage = options.canUpdateLanguage ?? true
        this.fileSystem = options.fileSystem
        this.emulator = options.emulator ?? null

        const defaultEntry = this.language ? defaultEntryPath(this.language) : 'main.s'
        this.entry = options.entry ?? defaultEntry
        this.activePath = options.activePath ?? this.entry

        if (this.fileSystem) {
            this.syncFromFs()
            this.fileSystem.subscribe(() => {
                this.syncFromFs()
                this.notify()
            })
        } else if (options.files) {
            this.initFiles(options.files)
        } else {
            this.files[this.entry] = ''
        }
    }

    private syncFromFs() {
        if (!this.fileSystem) return
        const fsFiles = this.fileSystem.files
        const nextFiles: Record<string, string> = {}
        for (const [path, file] of Object.entries(fsFiles)) {
            nextFiles[path] = fileText(file)
        }
        this.files = nextFiles
    }

    private initFiles(files: Record<string, string> | ProjectFiles | string) {
        if (typeof files === 'string') {
            this.files[this.entry] = files
            return
        }

        for (const [path, fileOrContent] of Object.entries(files)) {
            if (typeof fileOrContent === 'string') {
                this.files[path] = fileOrContent
            } else if (
                fileOrContent &&
                typeof fileOrContent === 'object' &&
                'content' in fileOrContent
            ) {
                this.files[path] = fileText(fileOrContent as ProjectFile)
            }
        }

        if (!(this.entry in this.files)) {
            const first = Object.keys(this.files)[0]
            if (first) {
                this.entry = first
            } else {
                this.files[this.entry] = ''
            }
        }
    }

    private notify() {
        for (const listener of this.listeners) {
            try {
                listener()
            } catch (e) {
                console.error('Error in harness listener', e)
            }
        }
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    getLanguage(): SupportedLanguage | null {
        return this.language
    }

    setLanguage(language: SupportedLanguage) {
        this.language = language
        this.notify()
    }

    getEntry(): string {
        return this.entry
    }

    setEntry(entry: string) {
        this.entry = entry
        this.notify()
    }

    getActivePath(): string {
        return this.activePath
    }

    setActivePath(path: string) {
        this.activePath = path
        this.notify()
    }

    getFile(path?: string): string | null {
        const targetPath = path ?? this.activePath ?? this.entry
        if (this.fileSystem) {
            try {
                return this.fileSystem.readText(targetPath)
            } catch {
                return null
            }
        }
        return this.files[targetPath] ?? null
    }

    setFile(path: string, content: string) {
        if (this.fileSystem) {
            this.fileSystem.writeText(path, content)
        }
        this.files[path] = content
        this.syncEmulatorSources()
        this.notify()
    }

    deleteFile(path: string): boolean {
        if (!(path in this.files)) return false
        if (this.fileSystem) {
            try {
                this.fileSystem.remove(path)
            } catch {
                return false
            }
        }
        delete this.files[path]
        if (this.activePath === path) {
            this.activePath =
                this.entry in this.files ? this.entry : (Object.keys(this.files)[0] ?? '')
        }
        this.syncEmulatorSources()
        this.notify()
        return true
    }

    listFiles(): HarnessFileInfo[] {
        return Object.entries(this.files).map(([path, content]) => ({
            path,
            lineCount: content.length === 0 ? 1 : content.split('\n').length,
            size: content.length,
            isEntry: path === this.entry
        }))
    }

    getAllFiles(): Record<string, string> {
        return { ...this.files }
    }

    getEmulator(): Emulator | null {
        return this.emulator
    }

    setEmulator(emulator: Emulator | null) {
        this.emulator = emulator
        if (emulator) {
            this.syncEmulatorSources()
        }
        this.notify()
    }

    syncEmulatorSources() {
        if (!this.emulator) return
        const projectFiles: Record<string, ProjectFile> = {}
        for (const [path, content] of Object.entries(this.files)) {
            projectFiles[path] = { encoding: 'plain', content }
        }
        this.emulator.setSources({
            files: projectFiles,
            entry: this.entry
        })
    }

    createToolContext(options: { canEditCode?: boolean } = {}): DefaultCodingAgentToolContext {
        return {
            canUpdateLanguage: this.canUpdateLanguage,
            canEditCode: options.canEditCode ?? true,
            getEditorLanguage: () => this.language,
            setEditorLanguage: (lang) => this.setLanguage(lang),
            getEmulator: () => this.emulator,

            getFiles: () => this.getAllFiles(),
            getFile: (path) => this.getFile(path),
            setFile: (path, code) => this.setFile(path, code),
            deleteFile: (path) => void this.deleteFile(path),
            getEntryPath: () => this.entry,
            getActivePath: () => this.activePath,
            setActivePath: (path) => this.setActivePath(path),

            getEditorCode: () => this.getFile(this.entry) ?? '',
            setEditorCode: (code) => this.setFile(this.entry, code)
        }
    }

    getTools(allowList: AgentToolAllowList = 'all'): Record<string, RegisteredTool> {
        const tools = createDefaultCodingAgentTools(this.createToolContext())
        if (allowList === 'all') return tools
        const filtered: Record<string, RegisteredTool> = {}
        for (const name of allowList) {
            if (name in tools) {
                filtered[name] = tools[name]
            }
        }
        return filtered
    }

    async executeTool<T = unknown>(
        name: DefaultCodingAgentToolName,
        args: Record<string, unknown> = {}
    ): Promise<T> {
        const tools = this.getTools('all')
        const targetTool = tools[name]
        if (!targetTool) {
            throw new Error(`Tool "${name}" not found on harness`)
        }
        return (await targetTool.execute(args as never)) as T
    }

    async compile(historySize = 100) {
        if (!this.emulator) {
            throw new Error('Emulator is not available')
        }
        this.syncEmulatorSources()
        await this.emulator.compile(historySize)
        return {
            success: this.emulator.compilerErrors.length === 0,
            errors: collectEmulatorErrors(this.emulator),
            diagnostics: collectEmulatorDiagnostics(this.emulator),
            canExecute: this.emulator.canExecute
        }
    }

    async step(steps = 1) {
        if (!this.emulator) {
            throw new Error('Emulator is not available')
        }
        let terminated = false
        let executed = 0
        for (let i = 0; i < steps && !terminated; i++) {
            terminated = await this.emulator.step()
            executed++
        }
        return {
            success: true,
            stepsExecuted: executed,
            state: formatEmulatorState((file) => this.getFile(file) ?? '', this.emulator)
        }
    }

    async run(haltLimit = 1_000_000) {
        if (!this.emulator) {
            throw new Error('Emulator is not available')
        }
        const status = await this.emulator.run(haltLimit)
        return {
            success: this.emulator.errors.length === 0,
            status,
            state: formatEmulatorState((file) => this.getFile(file) ?? '', this.emulator)
        }
    }

    undo(steps = 1): number {
        if (!this.emulator) {
            throw new Error('Emulator is not available')
        }
        return this.emulator.undo(steps)
    }
}
