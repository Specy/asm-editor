import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { makeProject } from '#lib/Project.svelte.ts'
import { compilationStatus, fileFingerprint } from '#lib/sourceCompilation/records.ts'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

function setup(readonly = false) {
    const onChange = vi.fn()
    const fixture = editorGroupsFixture(
        'RISC-V',
        {
            settings: { riscvAssemblerProfile: 'gnu-compiler-v1' },
            openTabs: ['main.c', 'main.s'],
            activeTab: 'main.s'
        },
        { readonly, onChange }
    )
    disposers.push(fixture.dispose)
    flushSync()
    return { ...fixture, onChange }
}

describe('changing a Project instruction set', () => {
    it('saves the new ISA, keeps files and navigation, and invalidates source maps', () => {
        const { session, project, onChange } = setup()
        const record = {
            sourcePath: 'main.c',
            outputPath: 'main.s',
            target: 'RISC-V' as const,
            language: 'c' as const,
            compilerId: 'gcc',
            optimization: '0' as const,
            inputs: {
                'main.c': fileFingerprint(project.files['main.c'])!,
                'value.h': fileFingerprint(project.files['value.h'])!
            },
            outputFingerprint: fileFingerprint(project.files['main.s'])!
        }
        project.recordCompilation(record, {
            sourcePath: 'main.c',
            outputFingerprint: record.outputFingerprint,
            lines: [null, { path: 'main.c', line: 0 }]
        })
        const before = project.toObject()
        const flush = vi.fn()
        session.registerTypingFlush(flush)

        session.setLanguage('RISC-V-64')

        expect(project.toObject()).toEqual({ ...before, language: 'RISC-V-64' })
        expect(project.sourceMaps).toEqual({})
        expect(compilationStatus(record, project.files, project.language).stale).toBe(true)
        expect(flush).toHaveBeenCalledOnce()
        expect(onChange).toHaveBeenCalledOnce()
        expect(makeProject(project.toObject()).language).toBe('RISC-V-64')

        //Switching back keeps the previous profile and still-valid generated assembly.
        session.setLanguage('RISC-V')
        expect(project.selected?.settings.riscvAssemblerProfile).toBe('gnu-compiler-v1')
        expect(compilationStatus(record, project.files, project.language).stale).toBe(false)
    })

    it('does nothing when the current ISA is selected', () => {
        const { session, onChange } = setup()
        session.setLanguage('RISC-V')
        expect(onChange).not.toHaveBeenCalled()
    })

    it('refuses a change on a read-only host', () => {
        const { session, project, onChange } = setup(true)
        expect(session.languageEditable).toBe(false)
        session.setLanguage('MIPS')
        expect(project.language).toBe('RISC-V')
        expect(onChange).not.toHaveBeenCalled()
    })

    it.each(['building', 'running', 'compiling', 'testing'] as const)(
        'refuses a change while %s',
        (operation) => {
            const { session, project, onChange } = setup()
            session[operation] = true
            expect(session.languageEditable).toBe(false)
            session.setLanguage('MIPS')
            expect(project.language).toBe('RISC-V')
            expect(onChange).not.toHaveBeenCalled()
        }
    )

    it('requires stopping the Debug session even when execution is paused', () => {
        const { session, project, emulator, onChange } = setup()
        emulator.canExecute = true
        flushSync()
        expect(session.languageEditable).toBe(false)
        session.setLanguage('MIPS')
        expect(project.language).toBe('RISC-V')
        expect(onChange).not.toHaveBeenCalled()
    })

    it('respects a FileSystem lock before changing the ISA', () => {
        const { session, project, onChange } = setup()
        const run = project.fileSystem.beginSession()
        expect(session.languageEditable).toBe(false)
        session.setLanguage('MIPS')
        expect(project.language).toBe('RISC-V')
        expect(onChange).not.toHaveBeenCalled()
        run.stop()
        expect(session.languageEditable).toBe(true)
    })
})
