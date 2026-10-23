import { describe, expect, it } from 'vite-plus/test'
import { makeProject } from '#lib/Project.svelte.ts'
import type { ProjectFiles } from '#lib/projectFiles.ts'
import { compilationInputs } from './compilationInputs'
import { compilationStatus, fileFingerprint, type CompilationRecord } from './records'

const text = (content: string) => ({ encoding: 'plain' as const, content })
const files = {
    'src/main.c': text('#include "config.h"\nint main(void) { return VALUE; }'),
    'config.h': text('#define VALUE 1'),
    'main.s': text('main:\nret\n')
}
const record: CompilationRecord = {
    sourcePath: 'src/main.c',
    outputPath: 'main.s',
    target: 'RISC-V',
    language: 'c',
    compilerId: 'rv32-cgcc1420',
    optimization: '0',
    inputs: compilationInputs('src/main.c', files),
    outputFingerprint: fileFingerprint(files['main.s'])!
}

describe('compilation freshness after include resolution changes', () => {
    it('invalidates saved records when a nearer header shadows the original', () => {
        expect(compilationStatus(record, files, 'RISC-V').stale).toBe(false)
        const changed = { ...files, 'src/config.h': text('#define VALUE 2') }
        expect(compilationStatus(JSON.parse(JSON.stringify(record)), changed, 'RISC-V').stale).toBe(
            true
        )
    })
    it('invalidates system-header fallback when a quoted include starts resolving locally', () => {
        const original = { ...files, 'src/main.c': text('#include "sim.h"\nint main(void) {}') }
        const compiled = { ...record, inputs: compilationInputs(record.sourcePath, original) }
        expect(
            compilationStatus(compiled, { ...original, 'src/sim.h': text('') }, 'RISC-V').stale
        ).toBe(true)
    })
    it('checks nested and computed includes, while unrelated literal-header additions stay fresh', () => {
        const original: ProjectFiles = {
            ...files,
            'config.h': text('#include "nested.h"'),
            'nested.h': text('')
        }
        const compiled = { ...record, inputs: compilationInputs(record.sourcePath, original) }
        expect(
            compilationStatus(compiled, { ...original, 'unused.h': text('') }, 'RISC-V').stale
        ).toBe(false)
        expect(
            compilationStatus(
                compiled,
                { ...original, 'nested.h': text('#include HEADER') },
                'RISC-V'
            ).stale
        ).toBe(true)
        const computed = {
            ...files,
            'src/main.c': text('#define HEADER "config.h"\n#include HEADER')
        }
        const macroRecord = { ...record, inputs: compilationInputs(record.sourcePath, computed) }
        expect(
            compilationStatus(macroRecord, { ...computed, 'unused.h': text('') }, 'RISC-V').stale
        ).toBe(true)
    })
    it('follows a quoted include of a .c File and a __has_include like any header', () => {
        const original: ProjectFiles = {
            ...files,
            'src/main.c': text(
                '#include "parts/video.c"\n#if __has_include("options.h")\n#endif\nint main(void) {}'
            ),
            'src/parts/video.c': text('int video;'),
            'other.c': text('int main(void) { return 1; }')
        }
        const compiled = { ...record, inputs: compilationInputs(record.sourcePath, original) }
        expect(Object.keys(compiled.inputs).sort()).toEqual(['src/main.c', 'src/parts/video.c'])
        expect(
            compilationStatus(
                compiled,
                { ...original, 'src/parts/video.c': text('int video = 1;') },
                'RISC-V'
            ).stale
        ).toBe(true)
        //the File __has_include asked about appearing changes the answer
        expect(
            compilationStatus(compiled, { ...original, 'src/options.h': text('') }, 'RISC-V').stale
        ).toBe(true)
        //another Program's source is not an input
        expect(
            compilationStatus(compiled, { ...original, 'other.c': text('') }, 'RISC-V').stale
        ).toBe(false)
    })
    it('respects the source directory search path inside nested headers', () => {
        const original = {
            ...files,
            'src/main.c': text('#include "../lib/options.h"'),
            'lib/options.h': text('#include "config.h"')
        }
        const compiled = { ...record, inputs: compilationInputs(record.sourcePath, original) }
        expect(
            compilationStatus(
                compiled,
                { ...original, 'src/config.h': text('#define VALUE 2') },
                'RISC-V'
            ).stale
        ).toBe(true)
    })
    it('drops mappings when a project gains a shadowing header', () => {
        const project = makeProject({
            language: 'RISC-V',
            files,
            entry: 'main.s',
            compilations: [record]
        })
        project.recordCompilation(record, {
            sourcePath: record.sourcePath,
            outputFingerprint: record.outputFingerprint,
            lines: [{ path: record.sourcePath, line: 1 }]
        })
        expect(project.sourceMaps['main.s']).toBeDefined()
        project.fileSystem.writeText('src/config.h', '#define VALUE 2')
        expect(project.sourceMaps['main.s']).toBeUndefined()
    })
})
