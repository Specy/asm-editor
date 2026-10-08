import { describe, expect, it } from 'vitest'
import { BASE_CODE } from '$lib/Config'
import type { BuildSources } from '$lib/projectFiles'
import {
    x86CoreProject,
    X86_START_UNIT,
    X86_START_UNIT_PATH,
    X86_SUPPORT_UNIT,
    X86_SUPPORT_UNIT_PATH
} from './x86StartUnit'

const text = (content: string) => ({ encoding: 'plain' as const, content })

describe('the start code beside an x86 Project', () => {
    const files = {
        'main.asm': text(BASE_CODE.X86),
        'src/main.c.asm': text('    global main\nmain:\n    ret\n')
    }
    const compiled: BuildSources = { entry: 'src/main.c.asm', files, entrySymbol: '_start' }

    it('offers the start code as library units to a Core that links a Project as an archive', () => {
        expect(x86CoreProject(compiled)).toEqual({
            entry: 'src/main.c.asm',
            files: { 'main.asm': BASE_CODE.X86, 'src/main.c.asm': files['src/main.c.asm'].content },
            startUnits: { [X86_START_UNIT_PATH]: X86_START_UNIT },
            library: { [X86_SUPPORT_UNIT_PATH]: X86_SUPPORT_UNIT }
        })
    })

    it('adds nothing to a Build that links no start code', () => {
        const handWritten = { entry: 'main.asm', files }
        expect(x86CoreProject(handWritten)).toEqual({
            entry: 'main.asm',
            files: { 'main.asm': BASE_CODE.X86, 'src/main.c.asm': files['src/main.c.asm'].content }
        })
        //with a Runtime ABI, the library's crt0 starts the program instead of the start code
        expect(x86CoreProject({ ...compiled, runtimeAbi: 'v1' }).library).toBeUndefined()
    })

    it('splits the start code so a program with a _start of its own can still take the rest', () => {
        expect(X86_START_UNIT).toMatch(/^\s*global _start\b/m)
        expect(X86_SUPPORT_UNIT).not.toMatch(/\b_start\b/)
        expect(X86_SUPPORT_UNIT).toMatch(/^\s*global memcpy:weak\b/m)
    })
})
