import { describe, expect, it } from 'vitest'
import { parseZ80ScreenDirective } from '$lib/languages/Z80/trs80/z80ScreenDirective'

/**
 * The `; @screen` comment directive: the one line a program brought in from outside has to add, so
 * everything it can get wrong stays a warning rather than stopping an assembly that is otherwise
 * fine (ADR 0020, following the MIPS and RISC-V directive).
 */
describe('the Z80 @screen directive', () => {
    it('reads the mode a program asks for', () => {
        expect(parseZ80ScreenDirective('; @screen trs80\n    org $8000\n').mode).toBe('cells')
        expect(parseZ80ScreenDirective('; @screen drawing\n').mode).toBe('drawing')
    })

    it('accepts the spellings a reader might carry over from the other directive', () => {
        expect(parseZ80ScreenDirective(';; @screen TRS-80').mode).toBe('cells')
        expect(parseZ80ScreenDirective(';@screen mode=trs80').mode).toBe('cells')
        expect(parseZ80ScreenDirective('        ; @SCREEN Cells   ; a comment').mode).toBe('cells')
        expect(parseZ80ScreenDirective('; @screen ports').mode).toBe('drawing')
    })

    it('leaves a program with no directive alone', () => {
        const parse = parseZ80ScreenDirective('    org $8000\n    halt ; @screenshot\n')
        expect(parse.mode).toBe(null)
        expect(parse.diagnostics).toEqual([])
    })

    it('warns about a mode it does not know, and changes nothing', () => {
        const parse = parseZ80ScreenDirective('; @screen spectrum\n')
        expect(parse.mode).toBe(null)
        expect(parse.diagnostics).toHaveLength(1)
        expect(parse.diagnostics[0].severity).toBe('warning')
        expect(parse.diagnostics[0].message).toContain('spectrum')
        expect(parse.diagnostics[0].lineIndex).toBe(0)
    })

    it('warns about a directive with no mode at all', () => {
        const parse = parseZ80ScreenDirective('; @screen\n')
        expect(parse.mode).toBe(null)
        expect(parse.diagnostics[0].message).toContain('needs a mode')
    })

    it('uses the first of several and says which line it took', () => {
        const parse = parseZ80ScreenDirective('; @screen trs80\n; @screen drawing\n')
        expect(parse.mode).toBe('cells')
        expect(parse.diagnostics).toHaveLength(1)
        expect(parse.diagnostics[0].lineIndex).toBe(1)
        expect(parse.diagnostics[0].message).toContain('line 1')
    })

    it('points at the @, which is where the editor draws the warning', () => {
        const parse = parseZ80ScreenDirective('    ; @screen nonsense')
        expect(parse.diagnostics[0].column).toBe(7)
        expect(parse.diagnostics[0].line.line_index).toBe(1)
    })
})
