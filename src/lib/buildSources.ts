import type { AvailableLanguages } from './Project.svelte'
import type { ProjectSettingsDecisions } from './projectSettings'
import { hasRuntimeLibrary } from './runtimeAbi'
import type { BuildSources, ProjectFiles } from './projectFiles'
import {
    compiledLanguages,
    resolveAssemblyProfile,
    resolveRuntimeLink,
    resolveX86Start
} from './sourceCompilation/assemblyProfile'
import type { CompilationRecord } from './sourceCompilation/records'

/** Resolve the same input for execution, live analysis and embedded programs. */
export function projectBuildSources(project: {
    files: ProjectFiles
    entry: string
    language: AvailableLanguages
    compilations?: readonly CompilationRecord[]
    settings?: ProjectSettingsDecisions
}): BuildSources {
    const sources = {
        files: project.files,
        entry: project.entry,
        compiledLanguages: compiledLanguages(project, project.compilations)
    }
    if (project.language === 'X86')
        return { ...sources, ...resolveX86Start(sources, project.compilations) }
    if (!hasRuntimeLibrary(project.language)) return sources
    return {
        ...sources,
        assemblerProfile: resolveAssemblyProfile(
            sources,
            project.compilations,
            project.language === 'MIPS' ? undefined : project.settings
        ),
        ...resolveRuntimeLink(sources, project.compilations, project.settings?.linkRuntimeLibrary)
    }
}
