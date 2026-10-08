import { describe, expect, it } from 'vitest'
import {
    PLAIN_STYLE,
    TerminalEscapeParser,
    TerminalTranscriptReader,
    parseTerminalEscapes,
    styleClasses,
    type TerminalSpan
} from './terminalEscapes'

const ESC = '\x1b'

/** The spans as `text` for plain text, `[classes]text` for styled text and `{text}` for escapes. */
function render(spans: TerminalSpan[]): string {
    return spans
        .map((span) => {
            if (span.kind === 'escape') return `{${span.text}}`
            const classes = styleClasses(span.style)
            return classes ? `[${classes}]${span.text}` : span.text
        })
        .join('')
}

const show = (text: string) => render(parseTerminalEscapes(text))

describe('plain output', () => {
    it('is one span in the plain style', () => {
        const spans = parseTerminalEscapes('hello\nworld\n')
        expect(spans).toEqual([{ kind: 'text', text: 'hello\nworld\n', style: PLAIN_STYLE }])
    })

    it('is nothing at all when nothing was written', () => {
        expect(parseTerminalEscapes('')).toEqual([])
    })
})

describe('SGR colours', () => {
    it('sets the eight foreground colours and their bright forms', () => {
        expect(show(`${ESC}[31mred${ESC}[32mgreen${ESC}[37mwhite`)).toBe(
            '[fg-1]red[fg-2]green[fg-7]white'
        )
        expect(show(`${ESC}[90mgrey${ESC}[91mred${ESC}[97mwhite`)).toBe(
            '[fg-8]grey[fg-9]red[fg-15]white'
        )
    })

    it('sets the eight background colours and their bright forms', () => {
        expect(show(`${ESC}[40mblack${ESC}[44mblue${ESC}[104mbright`)).toBe(
            '[bg-0]black[bg-4]blue[bg-12]bright'
        )
    })

    it('goes back to the default colours with 39 and 49', () => {
        expect(show(`${ESC}[31;42mboth${ESC}[39mbackground${ESC}[49mplain`)).toBe(
            '[fg-1 bg-2]both[bg-2]backgroundplain'
        )
    })

    it('makes text bold with 1 until 22 or a reset', () => {
        expect(show(`${ESC}[1mbold${ESC}[22mnormal${ESC}[1;33mbold${ESC}[0mplain`)).toBe(
            '[bold]boldnormal[fg-3 bold]boldplain'
        )
    })

    it('resets on 0 and on a sequence with no parameters', () => {
        expect(show(`${ESC}[1;31ma${ESC}[mb${ESC}[35mc${ESC}[0md`)).toBe('[fg-1 bold]ab[fg-5]cd')
    })

    it('reads an empty parameter as a reset, in order with the rest', () => {
        expect(show(`${ESC}[31m${ESC}[;1mx`)).toBe('[bold]x')
    })

    it('skips the 256-colour and RGB forms whole, in both spellings', () => {
        expect(show(`${ESC}[38;5;1;4mx`)).toBe('x')
        expect(show(`${ESC}[38;2;255;0;0;1my`)).toBe('[bold]y')
        expect(show(`${ESC}[48:5:2mz${ESC}[0m`)).toBe('z')
    })

    it('ignores the attributes it does not draw, such as underline and inverse', () => {
        expect(show(`${ESC}[4;7;32mx`)).toBe('[fg-2]x')
    })

    it('keeps one span for text written in the same style', () => {
        const parser = new TerminalEscapeParser()
        parser.feed(`${ESC}[34mab`)
        parser.feed('cd')
        parser.feed(`${ESC}[34mef`)
        expect(parser.spans).toHaveLength(1)
        expect(render(parser.spans)).toBe('[fg-4]abcdef')
    })
})

describe('clear screen', () => {
    it('drops everything written before ESC[2J, keeping the colours', () => {
        expect(show(`old\n${ESC}[31mred${ESC}[2Jnew`)).toBe('[fg-1]new')
    })

    it('clears on ESC[3J too, the scrollback half of `clear`', () => {
        expect(show(`old${ESC}[H${ESC}[2J${ESC}[3Jnew`)).toBe('new')
    })

    it('clears and resets the colours on ESC c', () => {
        expect(show(`${ESC}[31mold${ESC}cnew`)).toBe('new')
    })

    it('reads ESC[H then ESC[J as a clear', () => {
        expect(show(`old${ESC}[H${ESC}[Jnew`)).toBe('new')
        expect(show(`old${ESC}[1;1H${ESC}[0Jnew`)).toBe('new')
    })

    it('ignores a cursor home on its own', () => {
        expect(show(`one${ESC}[Htwo${ESC}[;Hthree${ESC}[ffour`)).toBe('onetwothreefour')
    })

    it('shows ESC[J escaped when the cursor was not sent home', () => {
        expect(show(`one${ESC}[Jtwo`)).toBe('one{␛[J}two')
        expect(show(`${ESC}[Hone${ESC}[Jtwo`)).toBe('one{␛[J}two')
    })
})

describe('sequences the view does not interpret', () => {
    it('shows cursor addressing escaped, where the program wrote it', () => {
        expect(show(`a${ESC}[5;10Hb${ESC}[2Kc${ESC}[?25ld`)).toBe('a{␛[5;10H}b{␛[2K}c{␛[?25l}d')
    })

    it('shows other escape sequences and control strings escaped', () => {
        expect(show(`${ESC}7saved${ESC}(Bx`)).toBe('{␛7}saved{␛(B}x')
        expect(show(`${ESC}]0;title\x07after`)).toBe('{␛]0;title␇}after')
        expect(show(`${ESC}]8;;link${ESC}\\text`)).toBe('{␛]8;;link␛\\}text')
    })

    it('shows an ESC that starts no sequence on its own and reads on', () => {
        expect(show(`a${ESC}\nb`)).toBe('a{␛}\nb')
        expect(show(`a${ESC}${ESC}[31mb`)).toBe('a{␛}[fg-1]b')
    })

    it('ends a broken CSI where it breaks, reading the rest as text', () => {
        expect(show(`${ESC}[12\nnext`)).toBe('{␛[12}\nnext')
    })
})

describe('streamed output', () => {
    it('holds a sequence split between writes until it is complete', () => {
        const parser = new TerminalEscapeParser()
        parser.feed(`plain ${ESC}[3`)
        //shown as it stands in the meantime, so nothing written is hidden
        expect(render(parser.spans)).toBe('plain {␛[3}')
        parser.feed('1mred')
        expect(render(parser.spans)).toBe('plain [fg-1]red')
    })

    it('holds a lone ESC and an unterminated control string', () => {
        const parser = new TerminalEscapeParser()
        parser.feed(`a${ESC}`)
        expect(render(parser.spans)).toBe('a{␛}')
        parser.feed(`]0;ti`)
        expect(render(parser.spans)).toBe('a{␛]0;ti}')
        parser.feed(`tle\x07b`)
        expect(render(parser.spans)).toBe('a{␛]0;title␇}b')
    })

    it('follows a transcript handed over whole, starting over when it stops only growing', () => {
        const reader = new TerminalTranscriptReader()
        expect(render(reader.spansOf(`${ESC}[32mok`))).toBe('[fg-2]ok')
        expect(render(reader.spansOf(`${ESC}[32mok, more`))).toBe('[fg-2]ok, more')
        //Backspace took an echo back: the shorter transcript is read again from its start
        expect(render(reader.spansOf(`${ESC}[32mok, mor`))).toBe('[fg-2]ok, mor')
        expect(render(reader.spansOf(`header\n${ESC}[32mok`))).toBe('header\n[fg-2]ok')
        expect(reader.spansOf('')).toEqual([])
    })

    it('reads the same whether the output came in one write or one character at a time', () => {
        const output = `${ESC}[1;32mok${ESC}[0m ${ESC}[5;5Hx${ESC}[H${ESC}[2Jdone${ESC}]2;t\x07`
        const parser = new TerminalEscapeParser()
        for (const character of output) parser.feed(character)
        expect(parser.spans).toEqual(parseTerminalEscapes(output))
    })
})
