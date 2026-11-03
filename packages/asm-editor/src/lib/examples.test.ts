import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
    defaultExample,
    destinationPath,
    exampleSharePath,
    examplesPath,
    isExampleDestination,
    loadExample,
    parseExamplesIndex
} from './examples.ts'
import { makeProjectFromArchive } from './projectArchive.ts'
import { compilationStatus } from './sourceCompilation/records.ts'
import { programBuildSources } from './buildSources.ts'
import { createEmulator } from './languages/Emulator.ts'
import { FileSystem } from './languages/peripherals/FileSystem.ts'
import { buildOutputStale } from './buildOutput.ts'
import { SHARE_ID } from '#stores/projectsStore.svelte.ts'

const index = JSON.parse(
    readFileSync(new URL('../../../examples/dist/index.json', import.meta.url), 'utf8')
)
const examples = parseExamplesIndex(index)

afterEach(() => vi.restoreAllMocks())

it('gives every port a unique ISA-prefixed id, independent of its display name or source folder', () => {
    expect(new Set(examples.map((e) => e.id)).size).toBe(examples.length)
    expect(examples.find((e) => e.id === 'risc-v-pacman')?.label).toBe('RISC-V - Pac-Man')
    const renamed = structuredClone(index)
    renamed.examples.pacman.name = 'A different title'
    renamed.examples.pacman.path = 'shared/pacman'
    expect(parseExamplesIndex(renamed).find((e) => e.id === 'risc-v-pacman')).toBeDefined()
    expect(exampleSharePath('mips-bouncing-ball')).toBe(
        '/projects/share?example=mips-bouncing-ball'
    )
    expect(examplesPath('mips-bouncing-ball')).toBe('/examples?example=mips-bouncing-ball')
    expect(exampleSharePath('mips-bouncing-ball', 'build')).toBe(
        '/projects/share?example=mips-bouncing-ball&build=true'
    )
    expect(examplesPath('mips-bouncing-ball', 'buildAndRun')).toBe(
        '/examples?example=mips-bouncing-ball&buildAndRun=true'
    )
    expect(examplesPath(undefined, 'build')).toBe('/examples?build=true')
})

it('keeps variants distinct, leaves out a port whose id another has, and rejects unsafe archive paths', () => {
    const data = {
        version: 1,
        examples: {
            demo: {
                name: 'Demo',
                description: '',
                ports: [
                    { target: 'X86', archive: 'x86/demo.asmproj' },
                    { target: 'X86', archive: 'x86/demo-small.asmproj', variant: 'small' }
                ]
            }
        }
    }
    expect(parseExamplesIndex(data).map((e) => e.id)).toEqual(['x86-demo', 'x86-demo-small'])
    data.examples.demo.ports[1].variant = undefined
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(parseExamplesIndex(data).map((e) => e.archive)).toEqual(['x86/demo.asmproj'])
    expect(warn).toHaveBeenCalledOnce()
    data.examples.demo.ports[0].archive = '../outside.asmproj'
    expect(() => parseExamplesIndex(data)).toThrow()
})

it('opens a small example when the link names none, and says each port as the index does', () => {
    const port = (name: string, archive: string, bytes?: number) => ({
        name,
        description: `${name}.`,
        ports: [{ target: 'X86', archive, bytes }]
    })
    const listed = parseExamplesIndex({
        version: 1,
        examples: {
            'a-os': port('An OS', 'x86/a-os.asmproj', 6_000_000),
            ball: port('Ball', 'x86/ball.asmproj', 2_000),
            clock: port('Clock', 'x86/clock.asmproj', 3_000)
        }
    })
    expect(defaultExample(listed)?.id).toBe('x86-ball')
    expect(defaultExample(listed.slice(0, 1))?.id).toBe('x86-a-os')
    expect(defaultExample([])).toBeUndefined()
    //asmOS's MIPS port is described as itself, not as the x86 one
    const asmos = examples.filter((e) => e.id.endsWith('-asmos'))
    expect(asmos.find((e) => e.language === 'MIPS')?.description).toContain('MIPS assembly')
    expect(asmos.find((e) => e.language === 'X86')?.description).toContain('x86 assembly')
})

it('sends a framed Project page only where the site goes on its own', () => {
    expect(destinationPath({ to: 'home' })).toBe('/')
    expect(destinationPath({ to: 'projects' })).toBe('/projects')
    expect(destinationPath({ to: 'donate' })).toBe('/donate')
    expect(destinationPath({ to: 'project', id: 'abc' })).toBe('/projects/abc')
    expect(isExampleDestination({ to: 'project', id: 'abc' })).toBe(true)
    for (const value of [{ to: 'project' }, { to: '/admin' }, '/projects', null, { href: '/' }])
        expect(isExampleDestination(value)).toBe(false)
})

it('rejects an unknown id without fetching an arbitrary project', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(index)))
    await expect(loadExample('../outside', fetcher)).rejects.toThrow('not available')
    expect(fetcher).toHaveBeenCalledOnce()
})

it('loads a fresh unsaved copy from a short link', async () => {
    const bytes = readFileSync(
        new URL('../../../examples/dist/mips/bouncing-ball.asmproj', import.meta.url)
    )
    const fetcher = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(index)))
        .mockResolvedValueOnce(new Response(bytes))
    const project = await loadExample('mips-bouncing-ball', fetcher)
    expect(project.id).toBe(SHARE_ID)
    expect(project.language).toBe('MIPS')
    expect(project.files['bouncing-ball.asm']).toBeDefined()
    expect(fetcher).toHaveBeenLastCalledWith('/examples/mips/bouncing-ball.asmproj')
})

describe('bundled example projects', () => {
    for (const example of examples) {
        it(`${example.id} imports with current generated assembly and builds every Program`, async () => {
            const bytes = readFileSync(
                new URL(`../../../examples/dist/${example.archive}`, import.meta.url)
            )
            const { project } = makeProjectFromArchive(bytes)
            expect(project.language).toBe(example.language)
            for (const record of project.compilations) {
                expect(compilationStatus(record, project.files, project.language).stale).toBe(false)
                expect(compilationStatus(record, project.files, project.language).edited).toBe(
                    false
                )
            }
            for (const record of project.builds) {
                expect(
                    buildOutputStale(
                        record,
                        programBuildSources(project, record.entry),
                        project.files
                    )
                ).toBe(false)
            }
            for (const entry of Object.keys(project.programs)) {
                const sources = programBuildSources(project, entry)
                const emulator = await createEmulator(project.language, sources, {
                    automaticChecking: false,
                    peripherals: { fileSystem: new FileSystem(project.files) }
                })
                try {
                    await emulator.compile(0, sources)
                    expect(emulator.errors).toEqual([])
                } finally {
                    emulator.dispose()
                }
            }
        }, 120_000)
    }
})
