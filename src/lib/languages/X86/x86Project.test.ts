import { describe, expect, it } from 'vitest'
import { normalizeBuildInput, type ProjectFiles } from '$lib/projectFiles'
import { analyzeX86Project } from '$lib/languages/service/adapters/x86Adapter'
import { toX86Project, x86ReachableFiles } from './x86Project'

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

describe('x86 File reachability', () => {
    const text = (content: string) => ({ encoding: 'plain' as const, content })

    it('follows nested relative includes, root includes and labeled binary data', () => {
        const sources = normalizeBuildInput({
            entry: 'src/main.asm',
            files: {
                'src/main.asm': text('%include "parts/first.inc"\n%include "root.inc"'),
                'src/parts/first.inc': text('%include "../second.inc"'),
                'src/second.inc': text('blob: incbin "../assets/blob.bin", 1, 2'),
                'root.inc': text('; %include "missing.inc"'),
                'assets/blob.bin': { encoding: 'base64', content: 'AQIDBA==' },
                'unused.inc': text('nop')
            }
        })
        expect(x86ReachableFiles(sources)).toEqual(
            new Set([
                'src/main.asm',
                'src/parts/first.inc',
                'src/second.inc',
                'assets/blob.bin',
                'root.inc'
            ])
        )
    })

    const unresolved: ProjectFiles[] = [
        {},
        { 'main.asm': text('%include "missing.inc"') },
        { 'main.asm': text('incbin "missing.bin"') },
        {
            'main.asm': text('%include "blob.bin"'),
            'blob.bin': { encoding: 'base64' as const, content: 'AA==' }
        },
        { 'main.asm': text('%include "loop.inc"'), 'loop.inc': text('%include "main.asm"') }
    ]
    it.each(unresolved)(
        'leaves reachability unknown when the Entry cannot be followed (%#)',
        (files) => {
            expect(x86ReachableFiles({ entry: 'main.asm', files })).toBeUndefined()
        }
    )

    it('keeps known Entry reachability when a secondary unit has a missing include', () => {
        const sources = normalizeBuildInput({
            entry: 'main.asm',
            files: {
                'main.asm': text('nop'),
                'other.s': text('%include "shared.inc"\n%include "missing.inc"'),
                'shared.inc': text('nop'),
                'unused.inc': text('nop')
            }
        })
        expect(x86ReachableFiles(sources)).toEqual(new Set(['main.asm', 'other.s', 'shared.inc']))
    })
})
