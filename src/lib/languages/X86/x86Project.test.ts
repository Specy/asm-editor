import { describe, expect, it } from 'vitest'
import { normalizeBuildInput } from '$lib/projectFiles'
import { analyzeX86Project } from '$lib/languages/service/adapters/x86Adapter'
import { toX86Project } from './x86Project'

describe('x86 Project compilation', () => {
    it('preserves text and decodes binary Files for the Core filesystem', () => {
        const project = toX86Project(
            normalizeBuildInput({
                entry: 'src/main.asm',
                files: {
                    'src/main.asm': { encoding: 'plain', content: 'incbin "../blob.bin"' },
                    'blob.bin': { encoding: 'base64', content: 'AQIDBA==' }
                }
            })
        )

        expect(project.entry).toBe('src/main.asm')
        expect(project.files['src/main.asm']).toBe('incbin "../blob.bin"')
        expect([...((project.files['blob.bin'] as Uint8Array) ?? [])]).toEqual([1, 2, 3, 4])
    })

    it('maps an included diagnostic to its File', async () => {
        const snapshot = await analyzeX86Project(
            normalizeBuildInput({
                entry: 'src/main.asm',
                files: {
                    'src/main.asm': {
                        encoding: 'plain',
                        content: '%include "parts/lib.asm"'
                    },
                    'src/parts/lib.asm': {
                        encoding: 'plain',
                        content: 'mov rax, nope nonsense'
                    }
                }
            }),
            'x86-project-test',
            1
        )

        expect(snapshot.fileStatus['src/parts/lib.asm']).toBe('assembled')
        expect(snapshot.diagnostics).toContainEqual(
            expect.objectContaining({
                location: expect.objectContaining({ path: 'src/parts/lib.asm' })
            })
        )
    })
})
