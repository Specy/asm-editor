import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_DISPLAY, type ProjectDisplay } from './marsDisplay'
import {
    applyScreenDirective,
    parseScreenDirective,
    readScreenLabelProbe,
    rewriteScreenDirective,
    type ScreenDirectiveLabelResolver,
    SCREEN_LABEL_PROBE_ADDRESS,
    screenLabelProbeSource
} from './screenDirective'

/**
 * The `@screen` comment directive: what a program can say about the bitmap display it wants, what
 * it is told when it says something MARS could not be configured with, and the fact that a program
 * without one changes nothing.
 */

/** Not MARS's default, so a test can tell "kept" from "happened to match". */
const CURRENT: ProjectDisplay = {
    unitWidth: 8,
    unitHeight: 8,
    width: 512,
    height: 256,
    baseAddress: 0x10000000
}

const NO_LABELS: ScreenDirectiveLabelResolver = () => null

function apply(code: string, resolve: ScreenDirectiveLabelResolver = NO_LABELS, current = CURRENT) {
    return applyScreenDirective(code, current, resolve)
}

describe('parsing the directive', () => {
    it('reads the documented form', () => {
        const { directive, diagnostics } = parseScreenDirective(
            '# @screen width=256 height=256 unit=1 base=display\n.data\n'
        )
        expect(diagnostics).toEqual([])
        expect(directive).toMatchObject({
            lineIndex: 0,
            width: 256,
            height: 256,
            unitWidth: 1,
            unitHeight: 1,
            base: { kind: 'label', label: 'display' }
        })
    })

    it('does not mind the whitespace, the order, the case or the spelling of a name', () => {
        const { directive, diagnostics } = parseScreenDirective(
            '\t###   @SCREEN   base = 0x10010000 ,  unit-height=4,unitWidth = 2  height=64 width=128'
        )
        expect(diagnostics).toEqual([])
        expect(directive).toMatchObject({
            unitWidth: 2,
            unitHeight: 4,
            width: 128,
            height: 64,
            base: { kind: 'address', address: 0x10010000 }
        })
    })

    it('takes a decimal base address as well as a hexadecimal one', () => {
        const { directive } = parseScreenDirective('# @screen base=268500992')
        expect(directive?.base).toEqual({ kind: 'address', address: 0x10010000 })
    })

    it('points at the directive itself, in the editor’s own numbering', () => {
        const { directive } = parseScreenDirective('main:\n    nop     # @screen unit=2\n')
        //monaco columns are 1 based, and the line index is 0 based like every other Diagnostic
        expect(directive?.lineIndex).toBe(1)
        expect(directive?.column).toBe(15)
        expect(directive?.lineText).toBe('    nop     # @screen unit=2')
    })

    it('finds nothing in a program that has no directive', () => {
        expect(parseScreenDirective('# a plain comment\n.data\nx: .word 1\n')).toEqual({
            directive: null,
            diagnostics: []
        })
        //the keyword has to be the whole comment, not a word inside one
        expect(parseScreenDirective('# see @screen below').directive).toBe(null)
    })

    it('uses the first directive and reports the others', () => {
        const { directive, diagnostics } = parseScreenDirective(
            '# @screen unit=1\n# @screen unit=32\n'
        )
        expect(directive?.unitWidth).toBe(1)
        expect(diagnostics).toHaveLength(1)
        expect(diagnostics[0]?.lineIndex).toBe(1)
        expect(diagnostics[0]?.message).toContain('line 1')
    })
})

describe('applying the directive', () => {
    it('leaves the user’s configuration alone when there is no directive', () => {
        const applied = apply('.data\nx: .word 1\n')
        expect(applied.display).toEqual(CURRENT)
        expect(applied.origin).toBe('user')
        expect(applied.diagnostics).toEqual([])
    })

    it('changes only what the directive names', () => {
        const applied = apply('# @screen width=128')
        expect(applied.display).toEqual({ ...CURRENT, width: 128 })
        expect(applied.origin).toBe('directive')
    })

    it('resolves a base label through the assembler', () => {
        const applied = apply('# @screen base=display', (label) =>
            label === 'display' ? 0x10011234 : null
        )
        expect(applied.display.baseAddress).toBe(0x10011234)
        expect(applied.baseLabel).toBe('display')
        expect(applied.diagnostics).toEqual([])
    })

    it('keeps the base address and says so when the label does not exist', () => {
        const applied = apply('# @screen base=missing')
        expect(applied.display.baseAddress).toBe(CURRENT.baseAddress)
        expect(applied.baseLabel).toBeUndefined()
        expect(applied.diagnostics).toHaveLength(1)
        expect(applied.diagnostics[0]?.severity).toBe('warning')
        expect(applied.diagnostics[0]?.message).toContain('No label named "missing"')
    })

    it('aligns a label that is not on a word boundary and says so', () => {
        const applied = apply('# @screen base=chars', () => 0x1001000e)
        expect(applied.display.baseAddress).toBe(0x1001000c)
        expect(applied.diagnostics[0]?.message).toContain('.align 2')
    })

    it('asks for the label only when the base names one', () => {
        let asked = 0
        apply('# @screen base=0x10008000 width=64', () => {
            asked++
            return 0
        })
        expect(asked).toBe(0)
    })

    it('snaps a size MARS does not offer and warns instead of failing', () => {
        const applied = apply('# @screen width=300 unit=3')
        expect(applied.display.width).toBe(256)
        expect(applied.display.unitWidth).toBe(2)
        expect(applied.display.unitHeight).toBe(2)
        expect(applied.diagnostics.map((d) => d.severity)).toEqual(['warning', 'warning'])
        expect(applied.diagnostics[0]?.message).toContain('64, 128, 256, 512, 1024')
        expect(applied.diagnostics[1]?.message).toContain('using 2')
    })

    it('reports an unknown setting, a value that is not a number and a base that is neither', () => {
        const applied = apply('# @screen depth=8 width=wide base=1two3')
        expect(applied.display).toEqual({ ...CURRENT })
        const messages = applied.diagnostics.map((d) => d.message)
        expect(messages[0]).toContain('"depth" is not a screen setting')
        expect(messages[1]).toContain('"wide" is not a number')
        expect(messages[2]).toContain('neither an address nor a label')
        expect(applied.diagnostics.every((d) => d.severity === 'warning')).toBe(true)
    })

    it('reports a word that is not a name=value setting', () => {
        const applied = apply('# @screen 256x256')
        expect(applied.diagnostics).toHaveLength(1)
        expect(applied.diagnostics[0]?.message).toContain('"256x256" is not a name=value setting')
    })

    it('refuses a base address past the top of memory', () => {
        const applied = apply('# @screen base=0x1ffffffff')
        expect(applied.display.baseAddress).toBe(CURRENT.baseAddress)
        expect(applied.diagnostics[0]?.message).toContain('past the top of memory')
    })

    it('every diagnostic sits on the directive’s own line', () => {
        const applied = apply('.data\n\n    # @screen depth=8\n')
        expect(applied.diagnostics[0]?.lineIndex).toBe(2)
        expect(applied.diagnostics[0]?.line.line_index).toBe(3)
    })
})

describe('the label probe', () => {
    it('appends one word at a fixed address, leaving the program’s own lines untouched', () => {
        const code = '.data\ndisplay: .space 64\n'
        const probe = screenLabelProbeSource(code, 'display')
        expect(probe.startsWith(code)).toBe(true)
        expect(probe).toContain('.data 0x10040000')
        expect(probe.trimEnd().endsWith('.word display')).toBe(true)
        expect(SCREEN_LABEL_PROBE_ADDRESS).toBe(0x10040000)
    })

    it('reads the word back little endian, the way both Cores hold it', () => {
        expect(readScreenLabelProbe([0x00, 0x00, 0x01, 0x10])).toBe(0x10010000)
        //the guest's signed bytes, as `readMemoryBytes` hands them over
        expect(readScreenLabelProbe([0x00, 0x00, -1, -1])).toBe(0xffff0000)
        expect(readScreenLabelProbe([0x00])).toBe(null)
    })
})

describe('MARS’s defaults', () => {
    it('are what a directive layers onto in a fresh project', () => {
        const applied = apply('# @screen unit=1', NO_LABELS, DEFAULT_PROJECT_DISPLAY)
        expect(applied.display).toEqual(DEFAULT_PROJECT_DISPLAY)
    })
})

/**
 * A choice beside the Screen rewrites the program's own directive, when it has one, so the two
 * never disagree and the next Build reads the choice back; it never writes a directive into a
 * program that has none (the display section of docs/design/project-format.md).
 */
describe('rewriting the directive', () => {
    const shown: ProjectDisplay = {
        unitWidth: 1,
        unitHeight: 1,
        width: 256,
        height: 256,
        baseAddress: 0x10010000
    }

    it('leaves a program without a directive alone', () => {
        expect(rewriteScreenDirective('.data\n.text\n', shown, { ...shown, width: 512 })).toBeNull()
    })

    it('changes only the parameter that changed and keeps a base label the user did not touch', () => {
        const code =
            '# @screen width=256 height=256 unit=1 base=display\n.data\ndisplay: .space 4\n'
        expect(rewriteScreenDirective(code, shown, { ...shown, width: 512 })).toBe(
            '# @screen width=512 height=256 unit=1 base=display\n.data\ndisplay: .space 4\n'
        )
    })

    it('writes a changed base as an address, replacing the label', () => {
        const code = '# @screen width=256 base=display'
        expect(rewriteScreenDirective(code, shown, { ...shown, baseAddress: 0x10008000 })).toBe(
            '# @screen width=256 base=0x10008000'
        )
    })

    it('keeps the spelling, the comment prefix and the indentation of the line', () => {
        const code = '  ## @Screen Unit_Width=1, height=256'
        expect(rewriteScreenDirective(code, shown, { ...shown, unitWidth: 4, height: 512 })).toBe(
            '  ## @Screen Unit_Width=4 height=512'
        )
    })

    it('splits unit= into width and height when they stop being equal, and appends what the line lacks', () => {
        const code = '# @screen unit=1'
        expect(rewriteScreenDirective(code, shown, { ...shown, unitWidth: 2 })).toBe(
            '# @screen unitWidth=2 unitHeight=1'
        )
        expect(
            rewriteScreenDirective('# @screen width=64', shown, {
                ...shown,
                unitWidth: 2,
                unitHeight: 2
            })
        ).toBe('# @screen width=64 unit=2')
        expect(rewriteScreenDirective('# @screen width=64', shown, { ...shown, height: 128 })).toBe(
            '# @screen width=64 height=128'
        )
    })

    it('returns the code as it was when nothing changed', () => {
        const code = '# @screen width=256\nnop'
        expect(rewriteScreenDirective(code, shown, { ...shown })).toBe(code)
    })
})
