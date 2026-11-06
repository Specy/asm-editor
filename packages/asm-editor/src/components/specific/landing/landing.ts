/** The instruction sets the home page introduces. */
import { BUILTIN_THEMES } from '#stores/themeStore.svelte.ts'
import { LANGUAGE_THEMES } from '#lib/Config.ts'

/** An instruction set's card: its colour is the accent of the language's own built-in theme. */
export type LandingTarget = {
    name: string
    /** The few characters on the card's coloured tile. */
    glyph: string
    description: string
    color: string
    /** Dark text on a light tile, light text on a dark one. */
    ink: 'dark' | 'light'
    documentation: string
    course?: string
}

function themeAccent(themeId: string): string {
    return BUILTIN_THEMES.find((t) => t.id === themeId)?.theme.accent.color ?? '#888888'
}

export const LANDING_TARGETS: LandingTarget[] = [
    {
        name: 'M68K',
        glyph: '68k',
        description:
            'The Motorola 68000 of the Amiga, the Atari ST and the first Macintosh, based on the EASy68K simulator.',
        color: themeAccent(LANGUAGE_THEMES.M68K),
        ink: 'dark',
        documentation: '/documentation/m68k',
        course: '/learn/courses/m68k'
    },
    {
        name: 'MIPS',
        glyph: 'MIPS',
        description:
            'The RISC design taught in many computer architecture courses, based on the MARS simulator.',
        color: themeAccent(LANGUAGE_THEMES.MIPS),
        ink: 'light',
        documentation: '/documentation/mips',
        course: '/learn/courses/mips'
    },
    {
        name: 'RISC-V',
        glyph: 'RV',
        description: 'The open instruction set from UC Berkeley, based on the RARS simulator.',
        color: themeAccent(LANGUAGE_THEMES['RISC-V']),
        ink: 'dark',
        documentation: '/documentation/risc-v',
        course: '/learn/courses/risc-v'
    },
    {
        name: 'x86-64',
        glyph: 'x86',
        description:
            'The 64-bit instruction set of most PCs, with Linux system calls, SSE and AVX.',
        color: themeAccent(LANGUAGE_THEMES.X86),
        ink: 'light',
        documentation: '/documentation/x86',
        course: '/learn/courses/x86'
    },
    {
        name: 'Z80',
        glyph: 'Z80',
        description: "Zilog's 8-bit CPU of the ZX Spectrum and the MSX computers.",
        color: themeAccent(LANGUAGE_THEMES.Z80),
        ink: 'dark',
        documentation: '/documentation/z80',
        course: '/learn/courses/z80'
    },
    {
        name: 'C and C++',
        glyph: 'C',
        description:
            'Compile C or C++ to MIPS, RISC-V or x86-64 and see the assembly each line becomes.',
        color: '#a8b9cc',
        ink: 'dark',
        documentation: '/documentation/risc-v/using-c'
    }
]

/**
 * A line of hex bytes for one of the page's dividers: plain runs of bytes with a few picked out,
 * from a fixed pseudo-random sequence per divider, so the server and the browser draw the same.
 */
export function hexStrip(seed: number, bytes = 140): { text: string; hot: boolean }[] {
    let state = (seed * 0x9e3779b1) >>> 0 || 1
    const next = () => {
        state = (state * 1103515245 + 12345) >>> 0
        return state >>> 16
    }
    const segments: { text: string; hot: boolean }[] = []
    let run: string[] = []
    for (let i = 0; i < bytes; i++) {
        const byte = (next() & 0xff).toString(16).toUpperCase().padStart(2, '0')
        if (next() % 23 === 0) {
            if (run.length) segments.push({ text: run.join(' ') + ' ', hot: false })
            segments.push({ text: byte, hot: true })
            run = ['']
        } else run.push(byte)
    }
    if (run.length) segments.push({ text: run.join(' ') + ' ', hot: false })
    return segments
}
