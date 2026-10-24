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

/**
 * Resolve the same input for execution, live analysis and embedded programs, from an Entry and the
 * Settings it runs with, whatever holds them: a Project's Program (`programBuildSources`) or a
 * Playground's one program.
 */
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

/**
 * The input for building one of a Project's Programs, the Selected program unless another Entry is
 * named: the Project's Files and Compilation records with that Program's Entry and Settings
 * ([ADR 0054](../../../../docs/adr/0054-a-project-holds-programs-identified-by-their-entry-file.md)).
 * Throws when there is no such Program, for the caller to say how to make one.
 */
export function programBuildSources(
    project: {
        files: ProjectFiles
        programs: Readonly<Record<string, { settings: ProjectSettingsDecisions }>>
        selectedProgram?: string
        language: AvailableLanguages
        compilations?: readonly CompilationRecord[]
    },
    entry: string | undefined = project.selectedProgram
): BuildSources {
    if (entry === undefined) throw new Error('This Project has no program')
    if (!Object.hasOwn(project.programs, entry))
        throw new Error(`${entry} is the Entry of no program`)
    return projectBuildSources({
        files: project.files,
        entry,
        language: project.language,
        compilations: project.compilations,
        settings: project.programs[entry].settings
    })
}
