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
import { compiledEntrySource, languageTakesArguments } from './commandLine'

/** Resolve the same input for execution, live analysis and embedded programs. */
export function projectBuildSources(project: {
    files: ProjectFiles
    entry: string
    language: AvailableLanguages
    compilations?: readonly CompilationRecord[]
    settings?: ProjectSettingsDecisions
}): BuildSources {
    //the program's name on the Command line and in `argv[0]` (`./main` for `main.c.asm`)
    const entrySource = languageTakesArguments(project.language)
        ? compiledEntrySource(project.entry, project.compilations)
        : undefined
    const sources = {
        files: project.files,
        entry: project.entry,
        compiledLanguages: compiledLanguages(project, project.compilations),
        ...(entrySource === undefined ? {} : { entrySource })
    }
    if (project.language === 'X86') {
        return {
            ...sources,
            ...resolveX86Start(sources, project.compilations, project.settings?.linkRuntimeLibrary)
        }
    }
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
