import { describe, expect, it } from 'vitest'
import { normalizeBuildInput } from '$lib/projectFiles'
import { analyzeX86Project } from '$lib/languages/service/adapters/x86Adapter'
import { expandX86Project } from './x86Project'

describe('x86 Project source expansion', () => {
    it('expands nested relative includes and retains an exact source-line map', () => {
        const sources = normalizeBuildInput({
            entry: 'src/main.asm',
            files: {
                'src/main.asm': {
                    encoding: 'plain',
                    content: 'bits 64\n%include "parts/lib.asm"\nsyscall'
                },
                'src/parts/lib.asm': {
                    encoding: 'plain',
                    content: '%include "../../shared.asm"\nmov rax, 60'
                },
                'shared.asm': { encoding: 'plain', content: 'xor rdi, rdi' }
            }
        })
        const expanded = expandX86Project(sources)
        expect(expanded.diagnostics).toEqual([])
        expect(expanded.code).toBe('bits 64\nxor rdi, rdi\nmov rax, 60\nsyscall')
        expect(expanded.lineMap).toEqual([
            { path: 'src/main.asm', line: 0 },
            { path: 'shared.asm', line: 0 },
            { path: 'src/parts/lib.asm', line: 1 },
            { path: 'src/main.asm', line: 2 }
        ])
    })

    it('reports cycles and maps NASM diagnostics back to an included File', async () => {
        const cycle = expandX86Project(
            normalizeBuildInput({
                entry: 'a.asm',
                files: {
                    'a.asm': { encoding: 'plain', content: '%include "b.asm"' },
                    'b.asm': { encoding: 'plain', content: '%include "a.asm"' }
                }
            })
        )
        expect(cycle.diagnostics[0]?.message).toContain('a.asm -> b.asm -> a.asm')

        const snapshot = await analyzeX86Project(
            normalizeBuildInput({
                entry: 'main.asm',
                files: {
                    'main.asm': { encoding: 'plain', content: 'bits 64\n%include "lib.asm"' },
                    'lib.asm': { encoding: 'plain', content: 'mov rax, nope nonsense' }
                }
            }),
            'x86-project-test',
            1
        )
        expect(snapshot.fileStatus['lib.asm']).toBe('assembled')
        expect(snapshot.diagnostics).toContainEqual(
            expect.objectContaining({ location: expect.objectContaining({ path: 'lib.asm' }) })
        )
    })

    it('rewrites literal incbin paths to exact WASM byte assets', () => {
        const expanded = expandX86Project(
            normalizeBuildInput({
                entry: 'src/main.asm',
                files: {
                    'src/main.asm': {
                        encoding: 'plain',
                        content: 'section .data\nblob: incbin "../assets/blob.bin", 1, 2'
                    },
                    'assets/blob.bin': { encoding: 'base64', content: 'AQIDBA==' }
                }
            })
        )
        expect(expanded.diagnostics).toEqual([])
        expect(expanded.code).toMatch(/blob: incbin "\/__asm_editor_project\/[0-9a-f]+", 1, 2/)
        expect([...expanded.virtualFiles.values()].map((bytes) => [...bytes])).toEqual([
            [1, 2, 3, 4]
        ])
        expect(expanded.reached).toContain('assets/blob.bin')
    })
})
