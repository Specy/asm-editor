import { describe, expect, it } from 'vitest'
import { editorFileKind, editorGroupForFile } from './editorFileRouting'

describe('file-type editor routing', () => {
    it('recognizes sources and headers independently of supported compiler languages', () => {
        for (const path of [
            'main.c',
            'main.cpp',
            'main.CC',
            'types.hpp',
            'value.h',
            'main.rs',
            'main.zig'
        ])
            expect(editorFileKind(path)).toBe('source')
        for (const path of [
            'main.riscv',
            'main.asm',
            'main.mips',
            'main.s',
            'main.S',
            'macros.inc',
            'main'
        ])
            expect(editorFileKind(path)).toBe('assembly')
        expect(editorFileKind('')).toBeUndefined()
    })
    it('uses the matching pane for mixed source/assembly files in either order', () => {
        const source = { displayedPath: 'main.cpp' },
            assembly = { displayedPath: 'main.riscv' }
        for (const panes of [
            [source, assembly],
            [assembly, source]
        ]) {
            expect(editorGroupForFile('value.h', panes)).toBe(source)
            expect(editorGroupForFile('main.rs', panes)).toBe(source)
            expect(editorGroupForFile('other.s', panes)).toBe(assembly)
        }
    })
    it('uses the left pane for both source panes or both assembly panes', () => {
        for (const panes of [
            [{ displayedPath: 'main.c' }, { displayedPath: 'other.cpp' }],
            [{ displayedPath: 'main.s' }, { displayedPath: 'other.asm' }]
        ]) {
            expect(editorGroupForFile('next.c', panes)).toBe(panes[0])
            expect(editorGroupForFile('next.s', panes)).toBe(panes[0])
        }
    })
    it('uses a matching pane or the empty pane, and works with a single pane', () => {
        const source = { displayedPath: 'main.c' },
            empty = { displayedPath: '' }
        expect(editorGroupForFile('main.cpp', [source, empty])).toBe(source)
        expect(editorGroupForFile('main.s', [source, empty])).toBe(empty)
        expect(editorGroupForFile('main.s', [source])).toBe(source)
    })
})
