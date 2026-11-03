import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'
import { afterAll, expect, it } from 'vite-plus/test'
import { makeBuildRecord } from '#lib/buildOutput.ts'
import { programBuildSources } from '#lib/buildSources.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { X86Emulator } from '#lib/languages/X86/X86Emulator.svelte.ts'
import { makeProjectFromArchive } from '#lib/projectArchive.ts'
import { projectFileFromBytes } from '#lib/projectFiles.ts'

const directory = fileURLToPath(new URL('../../../examples/dist/', import.meta.url))
const indexPath = `${directory}/index.json`
const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
    examples: Record<
        string,
        { ports: { target: string; archive: string; bytes: number; buildOutputs?: string[] }[] }
    >
}

for (const example of Object.values(index.examples)) {
    for (const port of example.ports) {
        if (!port.buildOutputs?.length) continue
        it(`adds Build outputs to ${port.archive}`, async () => {
            expect(port.target).toBe('X86')
            const path = `${directory}/${port.archive}`
            const zip = unzipSync(readFileSync(path))
            const manifest = JSON.parse(new TextDecoder().decode(zip['project.json']))
            const { project } = makeProjectFromArchive(readFileSync(path))
            for (const entry of port.buildOutputs!) {
                const sources = programBuildSources(project, entry)
                const emulator = await X86Emulator(sources, {
                    automaticChecking: false,
                    peripherals: { fileSystem: new FileSystem(project.files) }
                })
                let saved = false
                emulator.setBuildOutputHost({
                    claim: async () => 'save',
                    save: (_sources, outputPath, bytes) => {
                        const output = projectFileFromBytes(bytes, 'base64')
                        const record = makeBuildRecord(sources, outputPath, output, [])
                        manifest.files[outputPath] = { encoding: 'base64' }
                        manifest.project.builds = [
                            ...(manifest.project.builds ?? []).filter(
                                (old: { outputPath: string }) => old.outputPath !== outputPath
                            ),
                            record
                        ]
                        zip[`files/${outputPath}`] = bytes.slice()
                        saved = true
                    },
                    isBuildOutput: () => false
                })
                try {
                    await emulator.compile(0, sources)
                    expect(emulator.errors).toEqual([])
                    expect(saved).toBe(true)
                } finally {
                    emulator.dispose()
                }
            }
            zip['project.json'] = new TextEncoder().encode(JSON.stringify(manifest))
            const archive = zipSync(
                Object.fromEntries(
                    Object.entries(zip).map(([name, bytes]) => [
                        name,
                        [bytes, { mtime: new Date(2026, 0, 1) }]
                    ])
                ),
                { level: 6 }
            )
            writeFileSync(path, archive)
            port.bytes = archive.byteLength
        })
    }
}

afterAll(() => {
    writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
})
