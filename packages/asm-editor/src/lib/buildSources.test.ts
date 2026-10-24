import { describe, expect, it } from 'vite-plus/test'
import { makeProject } from './Project.svelte'
import { programBuildSources, projectBuildSources } from './buildSources'
import { playgroundBuildSources } from './content/playgroundProgram'
import { buildConfiguration, buildSourcesEqual, normalizeBuildInput } from './projectFiles'

const files = { 'main.s': { encoding: 'plain' as const, content: 'nop' } }

describe('shared build contract', () => {
    it.each(['MIPS', 'RISC-V', 'RISC-V-64', 'X86', 'M68K', 'Z80'] as const)(
        '%s playground and project builds resolve the same settings',
        (language) => {
            const settings = {
                riscvAssemblerProfile: 'gnu-compiler-v1',
                linkRuntimeLibrary: 'v1'
            } as const
            const project = makeProject({ language, files, entry: 'main.s', settings })
            expect(playgroundBuildSources(project)).toEqual(programBuildSources(project))
            expect(programBuildSources(project)).toEqual(
                projectBuildSources({ language, files, entry: 'main.s', settings })
            )
        }
    )
    it('names the source File an x86 Entry of Generated assembly was compiled from', () => {
        const fingerprint = 'a'.repeat(32)
        const project = makeProject({
            language: 'X86',
            files: {
                'main.c': { encoding: 'plain', content: 'int main(void) { return 0; }' },
                'main.c.asm': { encoding: 'plain', content: 'nop' }
            },
            entry: 'main.c.asm',
            compilations: [
                {
                    sourcePath: 'main.c',
                    outputPath: 'main.c.asm',
                    target: 'X86',
                    language: 'c',
                    compilerId: 'cg152',
                    optimization: '0',
                    inputs: { 'main.c': fingerprint },
                    outputFingerprint: fingerprint
                }
            ]
        })
        expect(programBuildSources(project).entrySource).toBe('main.c')
        project.createProgram('main.c')
        expect(programBuildSources(project).entrySource).toBeUndefined()
        const sources = normalizeBuildInput({ files, entry: 'main.s', entrySource: 'main.c' })
        expect(sources.entrySource).toBe('main.c')
        expect(buildSourcesEqual(sources, { ...sources, entrySource: 'other.c' })).toBe(false)
        expect(() => normalizeBuildInput({ files, entry: 'main.s', entrySource: '../x' })).toThrow(
            /Entry source/
        )
    })

    it.each(['MIPS', 'RISC-V', 'RISC-V-64'] as const)(
        'names the source File a %s Entry of Generated assembly was compiled from, for argv[0]',
        (language) => {
            const fingerprint = 'a'.repeat(32)
            const project = makeProject({
                language,
                files: {
                    'main.c': { encoding: 'plain', content: 'int main(void) { return 0; }' },
                    'main.c.s': { encoding: 'plain', content: 'nop' }
                },
                entry: 'main.c.s',
                compilations: [
                    {
                        sourcePath: 'main.c',
                        outputPath: 'main.c.s',
                        target: language,
                        language: 'c',
                        compilerId: 'cmipsg1420',
                        optimization: '0',
                        inputs: { 'main.c': fingerprint },
                        outputFingerprint: fingerprint,
                        runtimeAbi: 'v1'
                    }
                ]
            })
            expect(programBuildSources(project).entrySource).toBe('main.c')
            project.createProgram('main.c')
            expect(programBuildSources(project).entrySource).toBeUndefined()
        }
    )

    it("builds a Program from its own Entry and Settings, the Selected program's by default", () => {
        const project = makeProject({
            language: 'RISC-V',
            files: { ...files, 'other.s': { encoding: 'plain', content: 'nop' } },
            programs: {
                'main.s': { settings: { riscvAssemblerProfile: 'gnu-compiler-v1' }, testcases: [] },
                'other.s': { settings: {}, testcases: [] }
            },
            selectedProgram: 'other.s'
        })
        const selected = programBuildSources(project)
        expect(selected.entry).toBe('other.s')
        expect(selected.assemblerProfile).toBe('rars')
        const main = programBuildSources(project, 'main.s')
        expect(main.entry).toBe('main.s')
        expect(main.assemblerProfile).toBe('gnu-compiler-v1')
        expect(main).toEqual(
            projectBuildSources({
                files: project.files,
                entry: 'main.s',
                language: 'RISC-V',
                settings: { riscvAssemblerProfile: 'gnu-compiler-v1' }
            })
        )
        expect(() => programBuildSources(project, 'notes.txt')).toThrow(/Entry of no program/)
        project.removeProgram('main.s')
        project.removeProgram('other.s')
        expect(() => programBuildSources(project)).toThrow(/no program/)
    })

    it('preserves every configuration field and compares source languages independent of key order', () => {
        const original = normalizeBuildInput({
            files,
            entry: 'main.s',
            x86Support: true,
            assemblerProfile: 'gnu-compiler-v1',
            runtimeAbi: 'v1',
            entrySymbol: '_start',
            compiledLanguages: { 'main.s': 'c', 'other.s': 'cpp' }
        })
        expect(buildSourcesEqual(original, { ...original, x86Support: false })).toBe(false)
        expect(
            buildSourcesEqual(original, {
                ...original,
                compiledLanguages: { 'other.s': 'cpp', 'main.s': 'c' }
            })
        ).toBe(true)
        expect(
            buildSourcesEqual(original, {
                ...original,
                compiledLanguages: { 'main.s': 'cpp', 'other.s': 'cpp' }
            })
        ).toBe(false)
        expect(buildConfiguration(original)).toEqual({
            assemblerProfile: 'gnu-compiler-v1',
            runtimeAbi: 'v1',
            entrySymbol: '_start',
            x86Support: true,
            compiledLanguages: original.compiledLanguages
        })
        expect(() =>
            normalizeBuildInput({ ...original, x86Support: 'yes' as unknown as boolean })
        ).toThrow(/support/)
    })
})
