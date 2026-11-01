import { describe, expect, it } from 'vite-plus/test'
import {
    applyX86ScreenDirective,
    parseX86ScreenDirective,
    rewriteX86ScreenDirective,
    x86CommentStyle,
    x86ScreenDirectiveFile
} from './x86ScreenDirective'
import {
    DEFAULT_X86_DISPLAY,
    normalizeX86Display,
    snapX86DisplayWidth,
    X86_DISPLAY_SIZE_CHOICES,
    x86DisplayEquals
} from './x86Display'

const CURRENT = { width: 320, height: 240 }

function messages(code: string, style: 'nasm' | 'c') {
    return parseX86ScreenDirective(code, style).diagnostics.map((diagnostic) => diagnostic.message)
}

describe('the x86 Display configuration', () => {
    it('starts at 320 by 240, and every size on the menu has a width that is a multiple of 8', () => {
        expect(DEFAULT_X86_DISPLAY).toEqual({ width: 320, height: 240 })
        for (const size of X86_DISPLAY_SIZE_CHOICES) {
            expect(size.width % 8).toBe(0)
            expect(normalizeX86Display(size)).toEqual(size)
        }
        expect(X86_DISPLAY_SIZE_CHOICES).toContainEqual(DEFAULT_X86_DISPLAY)
    })

    it('rounds a width down to a multiple of 8, as CVT does, within 8 to 1024', () => {
        expect(snapX86DisplayWidth(322, 0)).toBe(320)
        expect(snapX86DisplayWidth(324, 0)).toBe(320)
        expect(snapX86DisplayWidth(327.9, 0)).toBe(320)
        expect(snapX86DisplayWidth(3, 0)).toBe(8)
        expect(snapX86DisplayWidth(5000, 0)).toBe(1024)
        expect(snapX86DisplayWidth(Number.NaN, 64)).toBe(64)
    })

    it('reads only a width and a height, and falls back to the default for anything else', () => {
        expect(normalizeX86Display(undefined)).toEqual(DEFAULT_X86_DISPLAY)
        expect(
            normalizeX86Display({ unitWidth: 4, width: 512, height: 256 } as { width: number })
        ).toEqual({ width: 512, height: 256 })
        expect(normalizeX86Display({ width: 0, height: 2000 })).toEqual({ width: 8, height: 1024 })
        expect(x86DisplayEquals({ width: 8, height: 8 }, { width: 8, height: 8 })).toBe(true)
    })
})

describe('where the directive is read', () => {
    it('reads a C or C++ File with C comments and anything else with NASM comments', () => {
        expect(x86CommentStyle('main.c')).toBe('c')
        expect(x86CommentStyle('game/draw.cpp')).toBe('c')
        expect(x86CommentStyle('fb.h')).toBe('c')
        expect(x86CommentStyle('main.asm')).toBe('nasm')
        expect(x86CommentStyle('main.c.asm')).toBe('nasm')
    })

    it("reads a compiled Program's source while it exists, else its Entry", () => {
        const files = { 'main.c': {}, 'main.c.asm': {} }
        expect(x86ScreenDirectiveFile(files, 'main.c.asm', 'main.c')).toBe('main.c')
        expect(x86ScreenDirectiveFile(files, 'main.c.asm', 'gone.c')).toBe('main.c.asm')
        expect(x86ScreenDirectiveFile(files, 'main.asm', undefined)).toBe('main.asm')
    })
})

describe('parseX86ScreenDirective', () => {
    it('reads a NASM comment, after code too', () => {
        const parsed = parseX86ScreenDirective(
            'section .text\n    mov eax, 1 ;; @screen width=640 height=480\n',
            'nasm'
        )
        expect(parsed.diagnostics).toEqual([])
        expect(parsed.directive).toEqual({ lineIndex: 1, column: 19, width: 640, height: 480 })
    })

    it('reads //, /* */ and a later line of a block comment in C', () => {
        for (const code of [
            '// @screen width=640 height=480\nint main(void) {}',
            '/* @screen width=640 height=480 */\nint main(void) {}',
            '/**\n * @screen width=640 height=480\n */\nint main(void) {}',
            'int x; /// @screen width=640, height=480'
        ]) {
            expect(parseX86ScreenDirective(code, 'c').directive).toMatchObject({
                width: 640,
                height: 480
            })
        }
        const block = parseX86ScreenDirective('/* @screen width=640 height=480*/', 'c')
        expect(block.diagnostics).toEqual([])
        expect(block.directive).toMatchObject({ lineIndex: 0, column: 4 })
    })

    it('ignores a directive in a string, and a comment style the File does not have', () => {
        expect(parseX86ScreenDirective('char *s = "// @screen width=64";', 'c').directive).toBe(
            null
        )
        expect(parseX86ScreenDirective("db '; @screen width=64', 0", 'nasm').directive).toBe(null)
        expect(parseX86ScreenDirective('// @screen width=64', 'nasm').directive).toBe(null)
        expect(parseX86ScreenDirective('; @screen width=64', 'c').directive).toBe(null)
        expect(parseX86ScreenDirective('auto s = R"x(// @screen width=64)x";', 'c').directive).toBe(
            null
        )
        //a word that only mentions it is not one
        expect(parseX86ScreenDirective('; see @screen below', 'nasm').directive).toBe(null)
    })

    it('rounds a width that is not a multiple of 8 and clamps a size out of range', () => {
        const parsed = parseX86ScreenDirective('; @screen width=322 height=2000', 'nasm')
        expect(parsed.directive).toMatchObject({ width: 320, height: 1024 })
        expect(parsed.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
            'The screen width must be a multiple of 8 pixels. Using 320 instead of 322.',
            'height must be between 8 and 1024 pixels. Using 1024 instead of 2000.'
        ])
        expect(parsed.diagnostics.every((diagnostic) => diagnostic.severity === 'warning')).toBe(
            true
        )
        expect(parsed.diagnostics[0]).toMatchObject({ lineIndex: 0, column: 3 })
    })

    it('warns about a setting x86 does not have, and about anything that is not one', () => {
        expect(messages('; @screen unit=2 base=display depth=16', 'nasm')).toEqual([
            '"unit" is not an x86 screen setting. Use the Screen\'s zoom to enlarge pixels. The settings are width and height.',
            '"base" is not an x86 screen setting. Use mmap to map /dev/fb0 into the program. The settings are width and height.',
            '"depth" is not an x86 screen setting. Use width or height.'
        ])
        expect(messages('// @screen 640x480', 'c')).toEqual([
            '"640x480" must be written as name=value. For example: // @screen width=320 height=240.'
        ])
        expect(messages('// @screen width=wide', 'c')).toEqual([
            '"wide" is not a valid number for width. The previous value is kept.'
        ])
    })

    it('uses the first directive and warns about the others', () => {
        const parsed = parseX86ScreenDirective('// @screen width=640\n/* @screen width=800 */', 'c')
        expect(parsed.directive).toMatchObject({ width: 640 })
        expect(parsed.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
            'Only the first @screen directive is used (line 1). This directive is ignored.'
        ])
    })
})

describe('applyX86ScreenDirective', () => {
    it('keeps the Program display without a directive, and applies what one names', () => {
        expect(applyX86ScreenDirective('mov eax, 1', 'nasm', CURRENT)).toEqual({
            display: CURRENT,
            origin: 'user',
            diagnostics: []
        })
        expect(applyX86ScreenDirective('; @screen height=200', 'nasm', CURRENT)).toEqual({
            display: { width: 320, height: 200 },
            origin: 'directive',
            diagnostics: []
        })
    })
})

describe('rewriteX86ScreenDirective', () => {
    const changed = { width: 640, height: 240 }

    it('rewrites the value that changed under its own spelling, in a NASM comment', () => {
        expect(
            rewriteX86ScreenDirective(
                '  ; @screen Width=320 height=240\nret',
                'nasm',
                CURRENT,
                changed
            )
        ).toBe('  ; @screen Width=640 height=240\nret')
    })

    it('keeps a block comment closed and a CRLF line ending', () => {
        expect(
            rewriteX86ScreenDirective('/* @screen width=320 */\r\nint x;', 'c', CURRENT, {
                width: 640,
                height: 480
            })
        ).toBe('/* @screen width=640 height=480 */\r\nint x;')
        expect(
            rewriteX86ScreenDirective('/**\n * @screen height=240\n */', 'c', CURRENT, changed)
        ).toBe('/**\n * @screen height=240 width=640\n */')
    })

    it('keeps what it does not know, and answers null without a directive', () => {
        expect(
            rewriteX86ScreenDirective('// @screen unit=2 width=320', 'c', CURRENT, changed)
        ).toBe('// @screen unit=2 width=640')
        expect(rewriteX86ScreenDirective('int x;', 'c', CURRENT, changed)).toBe(null)
        expect(rewriteX86ScreenDirective('// @screen', 'c', CURRENT, CURRENT)).toBe('// @screen')
    })

    it('rewrites what the next Build reads back', () => {
        const code = '; @screen width=320 height=240'
        const rewritten = rewriteX86ScreenDirective(code, 'nasm', CURRENT, {
            width: 1024,
            height: 768
        })
        expect(applyX86ScreenDirective(rewritten!, 'nasm', CURRENT).display).toEqual({
            width: 1024,
            height: 768
        })
    })
})
