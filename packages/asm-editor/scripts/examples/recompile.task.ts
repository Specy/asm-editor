import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { it } from 'vite-plus/test'
import { compileSource, SourceCompilationError } from '#lib/sourceCompilation/compilerExplorer.ts'
import { compilationStatus, type CompilationRecord } from '#lib/sourceCompilation/records.ts'
import type { ProjectFiles } from '#lib/projectFiles.ts'
import { findExamples, buildExample } from '../../../examples/scripts/lib/examples.mjs'

/** Recompile stale recorded units using the editor's Compile, then keep its returned records. */
const id = process.env.ASM_EXAMPLE
it.skipIf(!id)(
    'recompiles stale example sources',
    async () => {
        const root = fileURLToPath(new URL('../../../examples/', import.meta.url))
        const example = findExamples(root).examples.find((example) => example.id === id)
        if (!example) throw new Error(`Unknown example: ${id}`)
        const { captured, compilations } = await buildExample(example, { capture: true })
        for (const port of captured) {
            const records = compilations[port.target.folder] as CompilationRecord[] | undefined
            if (
                !records ||
                (process.env.ASM_EXAMPLE_TARGET &&
                    process.env.ASM_EXAMPLE_TARGET !== port.target.name)
            )
                continue
            const files: Record<string, ProjectFiles[string]> = Object.fromEntries(
                Object.entries(port.files).map(([path, source]) => {
                    const bytes = readFileSync(source as string)
                    const plain = !/\.(bmp|png|jpe?g|gif|bin|wav|mid|wad|vid)$/i.test(path)
                    return [
                        path,
                        {
                            encoding: plain ? 'plain' : 'base64',
                            content: bytes.toString(plain ? 'utf8' : 'base64')
                        }
                    ]
                })
            )
            for (let i = 0; i < records.length; i++) {
                const record = records[i]
                const status = compilationStatus(record, files, record.target)
                if (!status.stale && !status.edited && files[record.outputPath]) continue
                const result = await compileSource(
                    {
                        sourcePath: record.sourcePath,
                        outputPath: record.outputPath,
                        files,
                        target: record.target,
                        optimization: record.optimization,
                        compiler: record.compilerId.includes('clang') ? 'clang' : 'gcc'
                    },
                    AbortSignal.timeout(120_000)
                ).catch((error: unknown) => {
                    console.error(`Compilation failed: ${record.target}, ${record.sourcePath}`)
                    if (error instanceof SourceCompilationError) {
                        for (const diagnostic of error.diagnostics)
                            console.error(
                                `${diagnostic.file}:${diagnostic.lineIndex + 1}: ${diagnostic.message}`
                            )
                    }
                    throw error
                })
                writeFileSync(port.files[record.outputPath], result.assembly)
                files[record.outputPath] = { encoding: 'plain', content: result.assembly }
                records[i] = result.record
                writeFileSync(
                    `${example.folder}/compilations.json`,
                    JSON.stringify(compilations, null, 4) + '\n'
                )
                console.log(
                    `Compiled ${record.sourcePath} (${record.target}, -O${record.optimization})`
                )
            }
        }
    },
    600_000
)
