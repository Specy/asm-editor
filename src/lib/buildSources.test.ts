import { describe, expect, it } from 'vitest'
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
