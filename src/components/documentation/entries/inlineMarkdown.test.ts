import { describe, expect, it } from 'vitest'
import { inlineMarkdown } from './inlineMarkdown'

describe('inlineMarkdown', () => {
    it('escapes everything before it adds its own markup', () => {
        expect(inlineMarkdown('<img src=x onerror=alert(1)>')).toBe(
            '&lt;img src=x onerror=alert(1)&gt;'
        )
    })

    it('keeps code spans as written, emphasis and all', () => {
        expect(inlineMarkdown('Put `**a*b**` in `$a0`')).toBe(
            'Put <code>**a*b**</code> in <code>$a0</code>'
        )
    })

    it('links only to our pages, anchors and the web', () => {
        expect(inlineMarkdown('[movea](/documentation/m68k/instruction/movea)')).toBe(
            '<a href="/documentation/m68k/instruction/movea">movea</a>'
        )
        const unsafe = inlineMarkdown('[x](javascript:alert(1))')
        expect(unsafe).not.toContain('<a')
        expect(unsafe).not.toContain('javascript')
    })

    it('reads bold and italics', () => {
        expect(inlineMarkdown('**Ready** is _set_')).toBe('<strong>Ready</strong> is <em>set</em>')
    })
})
