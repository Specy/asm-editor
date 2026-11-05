import { describe, expect, it } from 'vite-plus/test'
import {
    isMarsDisplay,
    programDisplay,
    programDisplayEquals,
    rewriteProgramScreenDirective,
    screenDirectiveFile
} from './programDisplay'
import { DEFAULT_PROJECT_DISPLAY } from './mars/marsDisplay'

describe("a Program's display in its Target's shape", () => {
    it("gives x86 a width and a height, and MIPS and RISC-V MARS's five fields", () => {
        expect(programDisplay('X86', undefined)).toEqual({ width: 320, height: 240 })
        expect(programDisplay('MIPS', undefined)).toEqual(DEFAULT_PROJECT_DISPLAY)
        //a MIPS display read on x86 keeps its size, a multiple of 8 already
        expect(programDisplay('X86', DEFAULT_PROJECT_DISPLAY)).toEqual({ width: 512, height: 256 })
        expect(programDisplay('RISC-V', { width: 320, height: 240 })).toEqual({
            ...DEFAULT_PROJECT_DISPLAY,
            width: 320,
            height: 240
        })
        expect(isMarsDisplay(programDisplay('X86', undefined))).toBe(false)
        expect(isMarsDisplay(DEFAULT_PROJECT_DISPLAY)).toBe(true)
    })

    it('compares displays of one shape, and never two shapes as equal', () => {
        const x86 = { width: 512, height: 256 }
        expect(programDisplayEquals(x86, { ...x86 })).toBe(true)
        expect(programDisplayEquals(x86, { width: 512, height: 240 })).toBe(false)
        expect(programDisplayEquals(x86, DEFAULT_PROJECT_DISPLAY)).toBe(false)
        expect(programDisplayEquals(DEFAULT_PROJECT_DISPLAY, { ...DEFAULT_PROJECT_DISPLAY })).toBe(
            true
        )
    })
})

describe('the @screen comment a display is rewritten in', () => {
    const files = { 'main.c': {}, 'main.c.asm': {} }

    it("reads x86's compiled Programs from their source and every other from its Entry", () => {
        expect(screenDirectiveFile('X86', files, 'main.c.asm', 'main.c')).toBe('main.c')
        expect(screenDirectiveFile('MIPS', files, 'main.c.mips', 'main.c')).toBe('main.c.mips')
    })

    it("rewrites in the File's own comment style", () => {
        const before = { width: 320, height: 240 }
        const after = { width: 640, height: 480 }
        expect(
            rewriteProgramScreenDirective('X86', 'main.c', '// @screen width=320', before, after)
        ).toBe('// @screen width=640 height=480')
        expect(
            rewriteProgramScreenDirective('X86', 'main.asm', '; @screen width=320', before, after)
        ).toBe('; @screen width=640 height=480')
        expect(
            rewriteProgramScreenDirective(
                'MIPS',
                'main.s',
                '# @screen width=512',
                DEFAULT_PROJECT_DISPLAY,
                { ...DEFAULT_PROJECT_DISPLAY, width: 256 }
            )
        ).toBe('# @screen width=256')
    })
})
