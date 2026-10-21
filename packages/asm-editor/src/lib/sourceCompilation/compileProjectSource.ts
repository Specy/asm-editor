import type { Project } from '#lib/Project.svelte.ts'
import {
    cleanCompilationRecords,
    fileFingerprint,
    generatedAssemblyPath,
    isCompilationTarget,
    type Optimization,
    type SourceCompiler
} from './records'
import {
    compilerExplorerDriver,
    SourceCompilationError,
    type CompilerDriver
} from './compilerExplorer'

type Dependencies = {
    /** The Compiler driver's compile; Compiler Explorer unless a caller supplies another. */
    compile?: CompilerDriver['compile']
    confirm: (question: string) => Promise<boolean | null>
    signal?: AbortSignal
    sourceAnnotations?: boolean
    compiler?: SourceCompiler
    /**
     * What a Generated assembly that defines `main` and is no Entry does to the Programs: becomes a
     * new one (`create`, the default), the Selected program's Entry (`move`, for a host with exactly
     * one Program, such as /chat, which makes one only while it has none), or leaves them alone
     * (`none`, a Playground's authored one; programs.md, decision 12).
     */
    newProgram?: NewProgram
}

export type NewProgram = 'create' | 'move' | 'none'

/**
 * What a Compile did to the Programs, in the order `publishProgram` tries each: selected the one
 * whose Entry is the Generated assembly, moved there the one whose Entry was the source (or, with
 * `newProgram: 'move'`, the Selected one), created one because the assembly defines `main`, or
 * left them alone.
 */
export type CompiledProgram = 'selected' | 'moved' | 'created' | 'none'

/** Remote work never owns live Files. Validate again after every await, then publish synchronously. */
export async function compileProjectSource(
    project: Project,
    sourcePath: string,
    optimization: Optimization,
    dependencies: Dependencies
) {
    project.fileSystem.assertEditable()
    const target = project.language
    if (!isCompilationTarget(target))
        throw new SourceCompilationError(
            'Source compilation is available for MIPS, RISC-V and x86 Projects.'
        )
    const files = project.fileSystem.snapshot(sourcePath).files
    const previous = project.compilations.find(
        (record) => record.sourcePath === sourcePath && record.target === target
    )
    const outputPath = previous?.outputPath ?? generatedAssemblyPath(sourcePath, target)
    const originalOutput = fileFingerprint(files[outputPath])
    // Every submitted header can affect preprocessing, even if it emits no mapped instructions.
    const submitted = (current: typeof files) =>
        Object.keys(current)
            .filter(
                (path) =>
                    path === sourcePath ||
                    (/\.(h|hpp|hh|hxx|inc)$/i.test(path) && current[path].encoding === 'plain')
            )
            .sort()
            .map((path) => `${path}\0${fileFingerprint(current[path])}`)
            .join('\n')
    const originalInputs = submitted(files)
    const assertCurrent = () => {
        dependencies.signal?.throwIfAborted()
        project.fileSystem.assertEditable()
        if (
            project.language !== target ||
            originalInputs !== submitted(project.files) ||
            originalOutput !== fileFingerprint(project.files[outputPath])
        ) {
            throw new SourceCompilationError(
                'Source or destination changed during compilation. Compile again to use the current Files.'
            )
        }
    }
    dependencies.signal?.throwIfAborted()
    const result = await (dependencies.compile ?? compilerExplorerDriver.compile)(
        {
            sourcePath,
            outputPath,
            files,
            target,
            optimization,
            sourceAnnotations: dependencies.sourceAnnotations,
            compiler: dependencies.compiler
        },
        dependencies.signal
    )
    assertCurrent()
    if (files[outputPath] && (!previous || originalOutput !== previous.outputFingerprint)) {
        const accepted = await dependencies.confirm(
            `${outputPath} ${previous ? 'was edited manually' : 'already exists'}. Recompilation will replace its contents. Replace it?`
        )
        assertCurrent()
        if (!accepted) return undefined
    }
    // Validate metadata capacity before touching the existing assembly.
    cleanCompilationRecords([
        ...project.compilations.filter((record) => record.outputPath !== outputPath),
        result.record
    ])
    project.fileSystem.writeText(outputPath, result.assembly)
    project.recordCompilation(result.record, result.map)
    const program = publishProgram(
        project,
        sourcePath,
        outputPath,
        result.definesMain ? (dependencies.newProgram ?? 'create') : 'none'
    )
    return { ...result, program }
}

/**
 * Gives the Generated assembly its Program. A Program is identified by its Entry file
 * ([ADR 0054](../../../../../docs/adr/0054-a-project-holds-programs-identified-by-their-entry-file.md)),
 * so a recompile selects the one the assembly has, `main` or not. One whose Entry was the source
 * itself (earlier data, a Playground's authored C entry) moves there with its Settings and
 * Testcases (programs-plan.md, decision 2). Otherwise only a source that defines `main` makes one:
 * a companion File leaves the Programs and the selection alone (programs.md, decision 9). A host
 * with one Program moves it there instead, as the one Entry moved before Programs, and makes one
 * only when it has none.
 */
function publishProgram(
    project: Project,
    sourcePath: string,
    outputPath: string,
    newProgram: NewProgram
): CompiledProgram {
    if (project.program(outputPath)) {
        project.selectProgram(outputPath)
        return 'selected'
    }
    if (project.program(sourcePath)) {
        project.renameProgram(sourcePath, outputPath)
        project.selectProgram(outputPath)
        return 'moved'
    }
    if (newProgram === 'none') return 'none'
    const selected = project.selectedProgram
    if (newProgram === 'move' && selected !== undefined) {
        project.renameProgram(selected, outputPath)
        return 'moved'
    }
    project.createProgram(outputPath)
    return 'created'
}
