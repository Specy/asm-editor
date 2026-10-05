import type { Project } from '$lib/Project.svelte'
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
}

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
    const files = project.fileSystem.snapshot(project.entry).files
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
    project.entry = outputPath
    return result
}
