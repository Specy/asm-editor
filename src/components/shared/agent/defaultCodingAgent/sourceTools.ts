import { tool } from '@discerns/sdk'
import { z } from 'zod'
import { compileProjectSource } from '$lib/sourceCompilation/compileProjectSource'
import { SourceCompilationError } from '$lib/sourceCompilation/compilerExplorer'
import { isCompilationTarget, OPTIMIZATIONS, sourceLanguage } from '$lib/sourceCompilation/records'
import type { DefaultCodingAgentToolContext } from './types'
import { runAgentTool } from './toolResults'

export function isSourceFile(path: string) {
    return !!sourceLanguage(path) || /\.(h|hpp|hh|hxx)$/i.test(path)
}

export function createCompileSourceTool(context: DefaultCodingAgentToolContext) {
    return tool({
        name: 'compile_source',
        description:
            'Compiles one C/C++ source file and local headers through Compiler Explorer into assembly. Sets the generated assembly as the project entry and preserves compilation records and source maps. Requires internet access. Call compile afterwards to build for execution. Recompile after source or header edits.',
        schema: z.object({
            path: z
                .string()
                .optional()
                .describe(
                    'C/C++ source path, e.g. main.c. Defaults to active source or the source behind active generated assembly.'
                ),
            optimization: z
                .enum(OPTIMIZATIONS)
                .optional()
                .describe('Optimization level; defaults to 0 for readable debugging.'),
            compiler: z
                .enum(['gcc', 'clang'])
                .optional()
                .describe('Compiler; defaults to the target default.')
        }),
        execute: async ({ path, optimization, compiler }) =>
            runAgentTool(async (toolRun) => {
                if (!context.canEditCode)
                    return toolRun.failure(
                        'unavailable',
                        'Source compilation changes project files and is unavailable in this read-only context.'
                    )
                const project = context.getProject?.()
                if (!project)
                    return toolRun.failure(
                        'unavailable',
                        'Source compilation is unavailable in this editor.',
                        {
                            nextAction:
                                'Keep C examples in chat, or use a Project editor with source compilation.'
                        }
                    )
                if (!isCompilationTarget(project.language))
                    return toolRun.failure(
                        'invalid_input',
                        `C/C++ compilation is unavailable for ${project.language}.`,
                        {
                            nextAction: 'Use a MIPS, RISC-V, RISC-V-64 or X86 project for C/C++.'
                        }
                    )
                const active = context.getActivePath?.() ?? project.entry
                const sourcePath =
                    path ??
                    (sourceLanguage(active)
                        ? active
                        : project.compilations.find((record) => record.outputPath === active)
                              ?.sourcePath)
                if (!sourcePath || !sourceLanguage(sourcePath) || !project.files[sourcePath])
                    return toolRun.failure(
                        'invalid_input',
                        'Choose an existing C/C++ source file to compile.',
                        {
                            nextAction:
                                'Call list_files, then pass a .c or .cpp source path to compile_source.'
                        }
                    )
                context.getEmulator()?.clear()
                try {
                    const result = await compileProjectSource(
                        project,
                        sourcePath,
                        optimization ?? '0',
                        {
                            compiler,
                            signal: AbortSignal.timeout(45_000),
                            confirm: (question) =>
                                context.confirmSourceOverwrite?.(question) ?? Promise.resolve(false)
                        }
                    )
                    if (!result)
                        return toolRun.failure(
                            'execution_state',
                            'Generated assembly was preserved because replacement was not confirmed.',
                            {
                                nextAction:
                                    'Explain that compilation was cancelled and the existing assembly was preserved.'
                            }
                        )
                    context.setActivePath?.(sourcePath)
                    return toolRun.success({
                        sourcePath,
                        outputPath: result.record.outputPath,
                        entry: project.entry,
                        language: project.language,
                        sourceLanguage: result.record.language,
                        diagnostics: result.diagnostics,
                        canExecute: false,
                        nextAction:
                            'Call compile to build the generated assembly, then run or step if requested.'
                    })
                } catch (error) {
                    if (!(error instanceof SourceCompilationError)) throw error
                    return toolRun.failure('compile_error', error, {
                        details: { sourcePath, diagnostics: error.diagnostics },
                        nextAction: 'Fix the C/C++ source or headers, then retry compile_source.'
                    })
                }
            })
    })
}
