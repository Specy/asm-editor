import { tool } from '@discerns/sdk'
import { z } from 'zod'
import { compileProjectSource } from '#lib/sourceCompilation/compileProjectSource.ts'
import { SourceCompilationError } from '#lib/sourceCompilation/compilerExplorer.ts'
import {
    isCompilationTarget,
    OPTIMIZATIONS,
    sourceLanguage
} from '#lib/sourceCompilation/records.ts'
import { DEFAULT_NO_PROGRAM_MESSAGE, type DefaultCodingAgentToolContext } from './types'
import { runAgentTool } from './toolResults'

export function isSourceFile(path: string) {
    return !!sourceLanguage(path) || /\.(h|hpp|hh|hxx)$/i.test(path)
}

export function createCompileSourceTool(context: DefaultCodingAgentToolContext) {
    //a host with exactly one Program moves it to the assembly rather than make a second
    const becomes =
        context.newProgram === 'move'
            ? 'the program moves to the generated assembly, with its settings and testcases'
            : 'the generated assembly becomes a program and is selected'
    return tool({
        name: 'compile_source',
        description: `Compiles one C/C++ source file and local headers through Compiler Explorer into assembly. When the source defines main, ${becomes}; a recompile selects the program it already is, and a source without main (a companion file) leaves the programs alone. Preserves compilation records and source maps. Requires internet access. Call compile afterwards to build the selected program. Recompile after source or header edits.`,
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
                const active = context.getActivePath?.() ?? project.selectedProgram
                const sourcePath =
                    path ??
                    (active === undefined || sourceLanguage(active)
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
                            newProgram: context.newProgram,
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
                    //the Compile gave the assembly its Program, or left the Programs alone for a
                    //source without `main` (programs.md, decision 9), so compile builds whatever
                    //is selected now
                    const entry = project.selectedProgram
                    return toolRun.success({
                        sourcePath,
                        outputPath: result.record.outputPath,
                        entry: entry ?? null,
                        program: result.program,
                        language: project.language,
                        sourceLanguage: result.record.language,
                        diagnostics: result.diagnostics,
                        canExecute: false,
                        ...(result.program === 'none'
                            ? {
                                  note: `${sourcePath} defines no main, so no program was made for it.`
                              }
                            : {}),
                        nextAction:
                            entry === undefined
                                ? `${context.noProgramMessage ?? DEFAULT_NO_PROGRAM_MESSAGE} Give ${sourcePath} a main and compile it again, or write a new assembly file.`
                                : result.program === 'none'
                                  ? `Call compile to build the selected program, ${entry}, then run or step if requested.`
                                  : 'Call compile to build the generated assembly, then run or step if requested.'
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
