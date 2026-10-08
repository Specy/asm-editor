import lzstring from 'lz-string'
import {
    cleanFiles,
    ProjectFormatError,
    type BuildSources,
    type ProjectFiles
} from '$lib/projectFiles'
import type { Project } from '$lib/Project.svelte'
import {
    cleanCompilationRecords,
    sourceLanguage,
    type CompilationRecord
} from '$lib/sourceCompilation/records'
import {
    compiledLanguages,
    resolveAssemblyProfile,
    resolveRuntimeLink,
    resolveX86Start
} from '$lib/sourceCompilation/assemblyProfile'

/** Named files passed to an embed; the target remains the embed's `language` setting. */
export type PlaygroundProgram = {
    files: ProjectFiles
    entry: string
    compilations?: CompilationRecord[]
}

export function cleanPlaygroundProgram(raw: unknown): PlaygroundProgram {
    if (!raw || typeof raw !== 'object') throw new ProjectFormatError('Invalid playground program')
    const value = raw as Record<string, unknown>
    const files = cleanFiles(value.files)
    if (
        typeof value.entry !== 'string' ||
        !Object.prototype.hasOwnProperty.call(files, value.entry)
    )
        throw new ProjectFormatError('The playground entry must name one of its files')
    if (Object.values(files).some((file) => file.encoding !== 'plain'))
        throw new ProjectFormatError('Playground files must be text')
    const compilations = cleanCompilationRecords(value.compilations)
    return { files, entry: value.entry, ...(compilations ? { compilations } : {}) }
}

export function encodePlaygroundProgram(program: PlaygroundProgram): string {
    return lzstring.compressToEncodedURIComponent(JSON.stringify(cleanPlaygroundProgram(program)))
}

export function decodePlaygroundProgram(encoded: string): PlaygroundProgram {
    const text = lzstring.decompressFromEncodedURIComponent(encoded)
    if (!text) throw new ProjectFormatError('Unreadable playground program')
    return cleanPlaygroundProgram(JSON.parse(text))
}

/** Use the same assembler provenance and runtime startup as a Project Build. */
export function playgroundBuildSources(project: Project): BuildSources {
    const sources = {
        files: project.files,
        entry: project.entry,
        compiledLanguages: compiledLanguages(project, project.compilations)
    }
    if (sourceLanguage(project.entry)) {
        //There is no assembly to check yet. The Build action compiles the real source before
        //using this input; keep the emulator idle without marking valid C as an assembly error.
        return { files: {}, entry: project.entry }
    }
    if (project.language === 'X86')
        return { ...sources, ...resolveX86Start(sources, project.compilations) }
    return {
        ...sources,
        assemblerProfile: resolveAssemblyProfile(sources, project.compilations),
        ...resolveRuntimeLink(sources, project.compilations, undefined)
    }
}
