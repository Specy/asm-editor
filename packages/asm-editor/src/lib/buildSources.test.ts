import { describe, expect, it } from 'vite-plus/test'
import { makeProject } from './Project.svelte'
import { projectBuildSources } from './buildSources'
import { playgroundBuildSources } from './content/playgroundProgram'
import { buildConfiguration, buildSourcesEqual, normalizeBuildInput } from './projectFiles'

const files = { 'main.s': { encoding: 'plain' as const, content: 'nop' } }

describe('shared build contract', () => {
    it.each(['MIPS', 'RISC-V', 'RISC-V-64', 'X86', 'M68K', 'Z80'] as const)(
        '%s playground and project builds resolve the same settings',
        (language) => {
            const project = makeProject({
                language,
                files,
                entry: 'main.s',
                settings: {
                    riscvAssemblerProfile: 'gnu-compiler-v1',
                    linkRuntimeLibrary: 'v1'
                }
            })
            expect(playgroundBuildSources(project)).toEqual(projectBuildSources(project))
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
        expect(projectBuildSources(project).entrySource).toBe('main.c')
        project.entry = 'main.c'
        expect(projectBuildSources(project).entrySource).toBeUndefined()
        const sources = normalizeBuildInput({ files, entry: 'main.s', entrySource: 'main.c' })
        expect(sources.entrySource).toBe('main.c')
        expect(buildSourcesEqual(sources, { ...sources, entrySource: 'other.c' })).toBe(false)
        expect(() => normalizeBuildInput({ files, entry: 'main.s', entrySource: '../x' })).toThrow(
            /Entry source/
        )
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
