import { describe, expect, it } from 'vitest'
import {
    fileFingerprint,
    type CompilationRecord,
    type CompilationSourceMap
} from '$lib/sourceCompilation/records'
import { resolveMappingPair } from './mappingPair'

const text = (content: string) => ({ encoding: 'plain' as const, content })
const files = {
    'main.c': text('int main(void) { return VALUE; }'),
    'value.h': text('#define VALUE 42'),
    'main.s': text('li a0, 42'),
    'other.s': text('nop')
}
const record: CompilationRecord = {
    sourcePath: 'main.c',
    outputPath: 'main.s',
    language: 'c',
    target: 'RISC-V',
    compilerId: 'gcc',
    optimization: '0',
    inputs: {
        'main.c': fileFingerprint(files['main.c'])!,
        'value.h': fileFingerprint(files['value.h'])!
    },
    outputFingerprint: fileFingerprint(files['main.s'])!
}
const map: CompilationSourceMap = {
    sourcePath: record.sourcePath,
    outputFingerprint: record.outputFingerprint,
    lines: [
        { path: 'main.c', line: 0 },
        { path: 'value.h', line: 0 },
        { path: 'main.c', line: 0 },
        null
    ]
}
const pane = (path: keyof typeof files) => ({ displayedPath: path, displayedFile: files[path] })
const resolve = (panes: ReturnType<typeof pane>[], current = files, maps = { 'main.s': map }) =>
    resolveMappingPair(panes, maps, [record], current, 'RISC-V')

describe('mapping between displayed editor files', () => {
    it('resolves source/assembly in either pane order and maps headers', () => {
        const assembly = pane('main.s')
        for (const source of [pane('main.c'), pane('value.h')]) {
            expect(resolve([source, assembly])).toEqual({ source, assembly, map })
            expect(resolve([assembly, source])).toEqual({ source, assembly, map })
        }
    })
    it('does not pair unrelated files, identical files, or a single editor', () => {
        expect(resolve([pane('main.c'), pane('other.s')])).toBeUndefined()
        expect(resolve([pane('main.c'), pane('main.c')])).toBeUndefined()
        expect(resolve([pane('main.s')])).toBeUndefined()
    })
    it('rejects stale live inputs even when the displayed snapshot still has the original bytes', () => {
        const panes = [pane('main.c'), pane('main.s')]
        expect(resolve(panes, { ...files, 'value.h': text('#define VALUE 43') })).toBeUndefined()
        expect(resolve(panes, { ...files, 'main.s': text('nop') })).toBeUndefined()
        expect(resolve(panes, files, {} as never)).toBeUndefined()
    })
    it('rejects displayed bytes from a different build even when the live compilation is current', () => {
        expect(
            resolve([{ ...pane('main.c'), displayedFile: text('old C') }, pane('main.s')])
        ).toBeUndefined()
        expect(
            resolve([pane('main.c'), { ...pane('main.s'), displayedFile: text('old assembly') }])
        ).toBeUndefined()
    })
    it('selects the map belonging to the currently displayed output when inputs are shared', () => {
        const other = {
            ...record,
            outputPath: 'other.s',
            outputFingerprint: fileFingerprint(files['other.s'])!
        }
        const otherMap = { ...map, outputFingerprint: other.outputFingerprint }
        expect(
            resolveMappingPair(
                [pane('main.c'), pane('other.s')],
                { 'main.s': map, 'other.s': otherMap },
                [record, other],
                files,
                'RISC-V'
            )?.map
        ).toBe(otherMap)
    })
    it('pairs a Runtime library member with its C source through the library map alone', () => {
        const member = {
            displayedPath: '@runtime/v1/stdio/puts.s',
            displayedFile: text('puts:\nret')
        }
        const source = {
            displayedPath: '@runtime/v1/src/stdio/puts.c',
            displayedFile: text('int puts(const char *s) {}')
        }
        const libraryMap: CompilationSourceMap = {
            sourcePath: source.displayedPath,
            outputFingerprint: '',
            lines: [{ path: source.displayedPath, line: 0 }, null]
        }
        const lookup = (path: string) => (path === member.displayedPath ? libraryMap : undefined)
        expect(resolveMappingPair([source, member], {}, [], files, 'RISC-V', lookup)).toEqual({
            source,
            assembly: member,
            map: libraryMap
        })
        expect(
            resolveMappingPair([pane('main.c'), member], {}, [], files, 'RISC-V', lookup)
        ).toBeUndefined()
    })
})
