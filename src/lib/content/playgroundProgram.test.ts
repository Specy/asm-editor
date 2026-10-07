import { describe, expect, it } from 'vitest'
import { makeProject } from '$lib/Project.svelte'
import { compileSource } from '$lib/sourceCompilation/compilerExplorer'
import { compileProjectSource } from '$lib/sourceCompilation/compileProjectSource'
import { createEmulator } from '$lib/languages/Emulator'
import fixture from '$lib/sourceCompilation/fixtures/risc-v-c-O2.json'
import { extractPlaygrounds, parsePlaygroundFence } from './playgrounds'
import {
    decodePlaygroundProgram,
    encodePlaygroundProgram,
    playgroundBuildSources
} from './playgroundProgram'

const text = (content: string) => ({ encoding: 'plain' as const, content })

describe('named playground files', () => {
    it('builds and runs a named assembly entry with an included companion', async () => {
        const project = makeProject({
            language: 'RISC-V',
            entry: 'src/main.s',
            files: {
                'src/main.s': text(
                    '.include "helper.s"\n.text\n.globl main\nmain:\ncall answer\nli a7, 93\necall'
                ),
                'src/helper.s': text('.text\nanswer:\nli a0, 42\nret')
            }
        })
        const sources = playgroundBuildSources(project)
        const emulator = await createEmulator('RISC-V', sources, {
            language: 'RISC-V',
            automaticChecking: false
        })
        try {
            await emulator.compile(0, sources)
            expect(emulator.compilerErrors).toEqual([])
            await emulator.run(10000)
            expect(emulator.errors).toEqual([])
            expect(emulator.terminated).toBe(true)
            expect(emulator.registers.find((register) => register.name === 'a0')?.value).toBe(42n)
        } finally {
            emulator.dispose()
        }
    }, 30000)

    it('runs recorded C compilation with its local header and runtime startup', async () => {
        const project = makeProject({
            language: 'RISC-V',
            entry: fixture.sourcePath,
            files: {
                [fixture.sourcePath]: text(fixture.source),
                ...Object.fromEntries(
                    Object.entries(fixture.headers).map(([path, content]) => [path, text(content)])
                )
            }
        })
        await compileProjectSource(project, fixture.sourcePath, '2', {
            confirm: async () => false,
            compile: (request, signal) =>
                compileSource(
                    request,
                    signal,
                    async () => new Response(JSON.stringify(fixture.response))
                )
        })
        const sources = playgroundBuildSources(project)
        const emulator = await createEmulator('RISC-V', sources, {
            language: 'RISC-V',
            automaticChecking: false
        })
        try {
            await emulator.compile(0, sources)
            expect(emulator.compilerErrors).toEqual([])
            await emulator.run(10000)
            expect(emulator.errors).toEqual([])
            expect(emulator.terminated).toBe(true)
            expect(emulator.registers.find((register) => register.name === 'a0')?.value).toBe(20n)
        } finally {
            emulator.dispose()
        }
    }, 30000)
    it('groups C and a local header, carries a separate target and attaches the testcase', () => {
        const [playground] = extractPlaygrounds(
            [
                '```c|playground|target=riscv|file=src/main.c|open-screen',
                '#include "value.h"\nint main(void) { return VALUE; }',
                '```',
                '',
                '```c|file=src/value.h',
                '#define VALUE 42',
                '```',
                '',
                '```testcase',
                '{"runFor": 1000}',
                '```'
            ].join('\n')
        )
        expect(playground.settings.language).toBe('RISC-V')
        expect(playground.program).toEqual({
            entry: 'src/main.c',
            files: {
                'src/main.c': text('#include "value.h"\nint main(void) { return VALUE; }'),
                'src/value.h': text('#define VALUE 42')
            }
        })
        expect(playground.runFor).toBe(1000)
        expect(playground.testcase).toBeDefined()
        expect(decodePlaygroundProgram(encodePlaygroundProgram(playground.program!))).toEqual(
            playground.program
        )
    })

    it('supports an assembly entry and does not combine independent playgrounds', () => {
        const playgrounds = extractPlaygrounds(
            [
                '```riscv|playground|file=helper.s|entry=main.s',
                'helper: ret',
                '```',
                '',
                '```riscv|file=main.s',
                '.include "helper.s"\nmain: j helper',
                '```',
                '',
                '```riscv|playground|file=other.s',
                'main: nop',
                '```'
            ].join('\n')
        )
        expect(playgrounds).toHaveLength(2)
        expect(playgrounds[0].program?.entry).toBe('main.s')
        expect(Object.keys(playgrounds[0].program!.files)).toEqual(['helper.s', 'main.s'])
        expect(Object.keys(playgrounds[1].program!.files)).toEqual(['other.s'])
    })

    it('does not attach files across prose', () => {
        const [playground] = extractPlaygrounds(
            '```riscv|playground|file=main.s\nmain: nop\n```\n\nExplanation.\n\n```riscv|file=other.s\nnop\n```'
        )
        expect(Object.keys(playground.program!.files)).toEqual(['main.s'])
    })

    it('rejects duplicate names, invalid paths, missing entries and unsupported C targets', () => {
        expect(() =>
            extractPlaygrounds(
                '```riscv|playground|file=main.s\nnop\n```\n\n```riscv|file=main.s\nnop\n```'
            )
        ).toThrow('Duplicate')
        expect(() => parsePlaygroundFence('riscv|playground|file=../main.s')).toThrow('Invalid')
        expect(() =>
            extractPlaygrounds('```riscv|playground|file=main.s|entry=missing.s\nnop\n```')
        ).toThrow('entry')
        expect(() => parsePlaygroundFence('c|playground|target=m68k|file=main.c')).toThrow(
            'no C/C++'
        )
        expect(() =>
            decodePlaygroundProgram(encodePlaygroundProgram({ entry: 'missing', files: {} }))
        ).toThrow('entry')
    })

    it('keeps legacy fences as single assembly programs', () => {
        const [playground] = extractPlaygrounds('```riscv|playground|console\nmain: nop\n```')
        expect(playground.program).toBeUndefined()
        expect(playground.code).toBe('main: nop')
    })

    it('does not submit C to the assembler before compilation', () => {
        const project = makeProject({
            language: 'RISC-V',
            entry: 'main.c',
            files: { 'main.c': text('int main(void) {}') }
        })
        expect(playgroundBuildSources(project)).toEqual({ files: {}, entry: 'main.c' })
    })
})
