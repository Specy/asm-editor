import { describe, expect, it } from 'vitest'
import { makeProject, normalizeProjectData } from '$lib/Project.svelte'
import { makeProjectFromArchive, projectToArchive } from '$lib/projectArchive'
import {
    normalizeBuildInput,
    updateEntryText,
    buildAssemblerProfile,
    type BuildSources
} from '$lib/projectFiles'
import { cleanProjectSettings, resolveProjectSettings } from '$lib/projectSettings'
import { resolveAssemblyProfile, resolveX86Start } from './assemblyProfile'
import { cleanCompilationRecords, fileFingerprint, type CompilationRecord } from './records'
import { analyzeMarsProject } from '$lib/languages/service/adapters/marsAdapter'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'

const text = (content: string) => ({ encoding: 'plain' as const, content })
const sources: BuildSources = {
    entry: 'main.s',
    files: { 'main.s': text('.include "gen.s"'), 'gen.s': text('.data\n.quad 42') }
}
const record: CompilationRecord = {
    sourcePath: 'main.c',
    outputPath: 'gen.s',
    target: 'RISC-V',
    language: 'c',
    compilerId: 'rv32-cgcc1420',
    optimization: '0',
    inputs: { 'main.c': fileFingerprint(text('int main() {}'))! },
    outputFingerprint: fileFingerprint(sources.files['gen.s'])!,
    assemblerProfile: 'gnu-compiler-v1'
}

describe('assembler profile ownership', () => {
    it('reports source-unit conflicts in live checking and Build without losing the error', async () => {
        const broken = {
            ...sources,
            assemblyError: 'Conflicting required assembler profiles in the include unit'
        }
        const emulator = RISCVEmulator(broken)
        try {
            expect(await emulator.check()).toMatchObject([
                { message: expect.stringContaining('Conflicting') }
            ])
            await expect(emulator.compile(200, broken)).rejects.toThrow(/Conflicting/)
            expect(emulator.compilerErrors[0].message).toContain('Conflicting')
            expect(() => analyzeMarsProject(broken, 'profile', 1, 'RISC-V')).toThrow(/Conflicting/)
        } finally {
            emulator.dispose()
        }
    })
    it('keeps old projects and records in RARS and lets explicit manual settings select GNU', () => {
        expect(resolveAssemblyProfile(sources, undefined)).toBe('rars')
        const old = { ...record }
        delete old.assemblerProfile
        expect(resolveAssemblyProfile(sources, [old])).toBe('rars')
        expect(
            resolveAssemblyProfile(sources, [old], { riscvAssemblerProfile: 'gnu-compiler-v1' })
        ).toBe('gnu-compiler-v1')
    })
    it('uses required provenance for the reachable include unit and diagnoses conflicts', () => {
        expect(resolveAssemblyProfile(sources, [record], { riscvAssemblerProfile: 'rars' })).toBe(
            'gnu-compiler-v1'
        )
        expect(resolveAssemblyProfile({ ...sources, entry: 'gen.s' }, [record])).toBe(
            'gnu-compiler-v1'
        )
        expect(() =>
            resolveAssemblyProfile(sources, [
                record,
                { ...record, outputPath: 'main.s', assemblerProfile: 'rars' }
            ])
        ).toThrow(/Conflicting/)
        expect(resolveAssemblyProfile({ ...sources, entry: 'unrelated.s' }, [record])).toBe('rars')
    })
    it('retains profile requirements after edits, save, reload, sharing shape and archives', () => {
        const project = makeProject({
            language: 'RISC-V',
            entry: sources.entry,
            files: { ...sources.files, 'main.c': text('int main() {}') },
            compilations: [record],
            settings: { riscvAssemblerProfile: 'rars' }
        })
        project.fileSystem.writeText('gen.s', '.data\n.quad 99')
        for (const reopened of [
            makeProject(project.toObject()),
            makeProject(normalizeProjectData(JSON.parse(JSON.stringify(project.toObject())))),
            makeProjectFromArchive(projectToArchive(project)).project
        ]) {
            expect(
                resolveAssemblyProfile(
                    { files: reopened.files, entry: reopened.entry },
                    reopened.compilations,
                    reopened.settings
                )
            ).toBe('gnu-compiler-v1')
            expect(reopened.sourceMaps).toEqual({})
        }
    })
    it.each([null, undefined, '', 'gnu-compiler-v2', 123])(
        'rejects every present invalid profile %s before precedence',
        (value) => {
            const invalid = value as 'rars'
            expect(() => normalizeBuildInput({ ...sources, assemblerProfile: invalid })).toThrow(
                /profile/
            )
            expect(() => buildAssemblerProfile({ ...sources, assemblerProfile: invalid })).toThrow(
                /profile/
            )
            expect(() => cleanProjectSettings({ riscvAssemblerProfile: invalid })).toThrow(
                /profile/
            )
            expect(() =>
                resolveProjectSettings('RISC-V', { riscvAssemblerProfile: invalid })
            ).toThrow(/profile/)
            expect(() =>
                cleanCompilationRecords([{ ...record, assemblerProfile: invalid }])
            ).toThrow(/profile/)
            expect(() =>
                resolveAssemblyProfile(sources, [record], { riscvAssemblerProfile: invalid })
            ).toThrow(/profile/)
            expect(() =>
                normalizeProjectData({
                    language: 'RISC-V',
                    files: sources.files,
                    entry: sources.entry,
                    compilations: [{ ...record, assemblerProfile: invalid }]
                })
            ).toThrow(/profile/)
        }
    )
    it('keeps the captured profile through normalization and Entry-text probes', () => {
        const original = normalizeBuildInput({ ...sources, assemblerProfile: 'gnu-compiler-v1' })
        const changed = updateEntryText(original, 'nop')
        expect(changed.assemblerProfile).toBe('gnu-compiler-v1')
        expect(original.files['main.s'].content).toBe('.include "gen.s"')
        expect(Object.isFrozen(changed)).toBe(true)
    })
    it('uses GNU semantics for live checking and rejects unknown profiles there', () => {
        const result = analyzeMarsProject(
            { ...sources, assemblerProfile: 'gnu-compiler-v1' },
            'profile',
            1,
            'RISC-V'
        )
        expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
        expect(() =>
            analyzeMarsProject(
                { ...sources, assemblerProfile: 'unknown' as 'rars' },
                'profile',
                1,
                'RISC-V'
            )
        ).toThrow(/profile/)
    })
})

describe('x86 start code', () => {
    const x86Sources: BuildSources = {
        entry: 'main.asm',
        files: {
            'main.asm': text('global _start\n_start:\n    ret'),
            'main.c': text('int main(void) { return 20; }'),
            'main.c.asm': text('global main\nmain:\n    mov eax, 20\n    ret')
        }
    }
    const x86Record: CompilationRecord = {
        sourcePath: 'main.c',
        outputPath: 'main.c.asm',
        target: 'X86',
        language: 'c',
        compilerId: 'cg142',
        optimization: '0',
        inputs: { 'main.c': fileFingerprint(x86Sources.files['main.c'])! },
        outputFingerprint: fileFingerprint(x86Sources.files['main.c.asm'])!
    }

    it('adds startup only for a compiled Entry and keeps support for secondary compiled Files', () => {
        expect(resolveX86Start(x86Sources, [x86Record])).toEqual({ x86Support: true })
        expect(resolveX86Start({ ...x86Sources, entry: 'main.c.asm' }, [x86Record])).toEqual({
            entrySymbol: '_start',
            x86Support: true
        })
    })
    it('leaves hand-written programs and removed Generated assembly alone', () => {
        expect(resolveX86Start(x86Sources, undefined)).toEqual({})
        expect(resolveX86Start(x86Sources, [{ ...x86Record, outputPath: 'gone.c.asm' }])).toEqual(
            {}
        )
        //only x86 Generated assembly links into an x86 Build
        expect(resolveX86Start(x86Sources, [{ ...x86Record, target: 'RISC-V' }])).toEqual({})
    })
    it('blocks a record that requires a Runtime ABI until its source is compiled again', () => {
        expect(() => resolveX86Start(x86Sources, [{ ...x86Record, runtimeAbi: 'v1' }])).toThrow(
            /main\.c\.asm was compiled against Runtime ABI v1, and this editor has no x86 Runtime library\. Recompile main\.c/
        )
    })
    it('blocks a Project File inside the namespace the start code is linked in', () => {
        const shadowed = {
            ...x86Sources,
            files: { ...x86Sources.files, '@runtime/start.asm': text('nop') }
        }
        expect(() => resolveX86Start(shadowed, [x86Record])).toThrow(
            '@runtime/start.asm is inside @runtime/, which the start code of compiled programs reserves'
        )
        expect(resolveX86Start(shadowed, undefined)).toEqual({})
    })
    it('keeps the requirement through save, reload and archives', () => {
        const project = makeProject({
            language: 'X86',
            entry: x86Sources.entry,
            files: x86Sources.files,
            compilations: [x86Record]
        })
        for (const reopened of [
            makeProject(normalizeProjectData(JSON.parse(JSON.stringify(project.toObject())))),
            makeProjectFromArchive(projectToArchive(project)).project
        ]) {
            expect(
                resolveX86Start(
                    { files: reopened.files, entry: reopened.entry },
                    reopened.compilations
                )
            ).toEqual({ x86Support: true })
        }
    })
})

it('carries the source language of reachable Generated assembly, including NASM includes', async () => {
    const { compiledLanguages } = await import('./assemblyProfile')
    const sources = {
        entry: 'main.asm',
        files: {
            'main.asm': text('%include "generated.asm"'),
            'generated.asm': text('section .data')
        }
    }
    const records = [
        { outputPath: 'generated.asm', language: 'cpp' },
        { outputPath: 'unused.asm', language: 'c' }
    ] as import('./records').CompilationRecord[]
    expect(compiledLanguages(sources, records)).toEqual({ 'generated.asm': 'cpp' })
})
