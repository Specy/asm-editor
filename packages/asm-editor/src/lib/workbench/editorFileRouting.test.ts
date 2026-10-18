import { describe, expect, it } from 'vite-plus/test'
import { editorFileKind, editorGroupForFile, offersBuild } from './editorFileRouting'

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
    it('calls a File stored as bytes neither source nor assembly, whatever its name', () => {
        const bytes = { encoding: 'base64', content: 'iVBORw==' } as const
        const text = { encoding: 'plain', content: 'nop' } as const
        for (const path of ['image.png', 'main.c', 'crackme', 'main.s'])
            expect(editorFileKind(path, bytes)).toBe('bytes')
        expect(editorFileKind('main.s', text)).toBe('assembly')
        expect(editorFileKind('crackme', text)).toBe('assembly')
        //a pane showing bytes takes another byte File; a source pane no longer takes a .png
        const source = { displayedPath: 'main.c', displayedFile: text },
            image = { displayedPath: 'other.png', displayedFile: bytes },
            empty = { displayedPath: '' }
        expect(editorGroupForFile('image.png', [source, image], bytes)).toBe(image)
        expect(editorGroupForFile('image.png', [source, empty], bytes)).toBe(empty)
        expect(editorGroupForFile('image.png', [source], bytes)).toBe(source)
    })
    it('offers Build for code and an Executable, not for a document or data', () => {
        for (const path of ['main.s', 'main.asm', 'macros.inc', 'main.c', 'value.h', 'main'])
            expect(offersBuild(path, 'text')).toBe(true)
        //an include File's extension is anyone's guess
        expect(offersBuild('macros.m68', 'text')).toBe(true)
        expect(offersBuild('crackme', 'executable')).toBe(true)
        //a path that names nothing still builds, to say what is missing
        expect(offersBuild('main.s', undefined)).toBe(true)
        for (const path of ['notes.txt', 'data.csv', 'config.json', 'solve.py', 'README.md'])
            expect(offersBuild(path, 'text')).toBe(false)
        expect(offersBuild('README.md', 'markdown')).toBe(false)
        expect(offersBuild('image.png', { preview: 'image', mime: 'image/png' })).toBe(false)
        expect(offersBuild('manual.pdf', { preview: 'pdf', mime: 'application/pdf' })).toBe(false)
        expect(offersBuild('blob.bin', 'bytes')).toBe(false)
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
