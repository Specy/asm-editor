import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { it } from 'vite-plus/test'
import { compileSource, SourceCompilationError } from '#lib/sourceCompilation/compilerExplorer.ts'
import { compilationStatus, type CompilationRecord } from '#lib/sourceCompilation/records.ts'
import type { ProjectFiles } from '#lib/projectFiles.ts'
import { findExamples, buildExample } from '../../../examples/scripts/lib/examples.mjs'

/**
 * Recompile stale recorded units using the editor's Compile, then keep its returned records. A
 * record whose Generated assembly the tree lacks is compiled too, its File written beside its
 * source. ASM_EXAMPLE_DRY_RUN=1 lists what would be compiled without asking Compiler Explorer.
 */
const id = process.env.ASM_EXAMPLE
const dryRun = process.env.ASM_EXAMPLE_DRY_RUN === '1'
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
                const reason = !files[record.outputPath]
                    ? 'missing'
                    : status.stale
                      ? 'stale'
                      : 'edited'
                if (dryRun) {
                    console.log(
                        `Would compile ${record.sourcePath} (${record.target}, -O${record.optimization}): ${reason}`
                    )
                    continue
                }
                //the Generated assembly goes where the port's Files come from: beside its source
                const outputFile =
                    (port.files[record.outputPath] as string | undefined) ??
                    outputBeside(port.files[record.sourcePath] as string, record)
                let answerBytes = 0
                const result = await compileSource(
                    {
                        sourcePath: record.sourcePath,
                        outputPath: record.outputPath,
                        files,
                        target: record.target,
                        optimization: record.optimization,
                        compiler: record.compilerId.includes('clang') ? 'clang' : 'gcc'
                    },
                    AbortSignal.timeout(120_000),
                    async (input, init) => {
                        const response = await fetch(input, init)
                        const body = await response.text()
                        //the bytes Compiler Explorer sent, which the 16 MiB limits count, and not
                        //the UTF-16 units of the decoded text
                        answerBytes = Buffer.byteLength(body, 'utf8')
                        return new Response(body, {
                            status: response.status,
                            statusText: response.statusText
                        })
                    }
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
                writeFileSync(outputFile, result.assembly)
                port.files[record.outputPath] = outputFile
                files[record.outputPath] = { encoding: 'plain', content: result.assembly }
                records[i] = result.record
                writeFileSync(
                    `${example.folder}/compilations.json`,
                    JSON.stringify(compilations, null, 4) + '\n'
                )
                console.log(
                    `Compiled ${record.sourcePath} (${record.target}, -O${record.optimization}, ${reason}): ` +
                        `answer ${(answerBytes / 2 ** 20).toFixed(2)} MiB, ` +
                        `Generated assembly ${(Buffer.byteLength(result.assembly, 'utf8') / 2 ** 20).toFixed(2)} MiB`
                )
            }
        }
    },
    1_800_000
)

/** Where a record's missing output goes: the folder its source File comes from. */
function outputBeside(source: string | undefined, record: CompilationRecord) {
    if (!source?.endsWith(record.sourcePath))
        throw new Error(`${record.outputPath}: its source ${record.sourcePath} is not in the port`)
    return source.slice(0, source.length - record.sourcePath.length) + record.outputPath
}
