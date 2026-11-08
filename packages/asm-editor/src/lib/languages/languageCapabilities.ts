import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { isCompilationTarget } from '#lib/sourceCompilation/records.ts'

/**
 * What the create page says about each Instruction set: a line on what it is, the simulator it
 * follows, and what a Project of it can do that a Project of some other set cannot.
 *
 * Written out rather than read from the peripherals themselves: `peripheralSet.ts` and the
 * adapters would bring the Screen, the Audio and the Cores' devices into a page that only names
 * them. Each row says where its answer comes from, so that a row can be checked when a set gains
 * or loses a device.
 */

/** The sets in the order the app lists them. */
export const LANGUAGE_ORDER: readonly AvailableLanguages[] = [
    'M68K',
    'MIPS',
    'RISC-V',
    'RISC-V-64',
    'X86',
    'Z80'
]

/**
 * One line on each set, the home page's (`LANDING_TARGETS` in `landing.ts`) without the simulator,
 * which the page names beside it, with RISC-V's two widths told apart, and short enough to share
 * the 40rem column's line with that simulator's name (hence the M68K's "Mac").
 */
export const LANGUAGE_DESCRIPTIONS: Record<AvailableLanguages, string> = {
    M68K: 'The Motorola 68000 of the Amiga, the Atari ST and the first Mac.',
    MIPS: 'The RISC design taught in many computer architecture courses.',
    'RISC-V': 'The open instruction set from UC Berkeley, with 32-bit registers.',
    'RISC-V-64': 'The open instruction set from UC Berkeley, with 64-bit registers.',
    X86: 'The 64-bit instruction set of most PCs, with Linux system calls, SSE and AVX.',
    Z80: "Zilog's 8-bit CPU of the ZX Spectrum and the MSX computers."
}

/**
 * The simulator each set follows (its Reference environment, CONTEXT.md), for a course that teaches
 * with that tool. x86 follows a Linux process and the Z80 its own Port map, neither a simulator.
 */
export const COMPATIBLE_WITH: Partial<Record<AvailableLanguages, string>> = {
    M68K: 'EASy68K',
    MIPS: 'MARS',
    'RISC-V': 'RARS',
    'RISC-V-64': 'RARS'
}

export type LanguageCapability =
    | 'screen'
    | 'keyboard'
    | 'mouse'
    | 'sound'
    | 'fileSystem'
    | 'compile'
    | 'disassemble'
    | 'decompile'

export type LanguageCapabilityRow = {
    id: LanguageCapability
    label: string
    languages: readonly AvailableLanguages[]
}

/** The sets that can do it, row by row, in the order the page shows them. */
export const LANGUAGE_CAPABILITIES: readonly LanguageCapabilityRow[] = [
    {
        //every set has a Screen panel (`languageHasScreen` in peripheralSet.ts): EASy68K's window,
        //the Z80's Port map screen, MARS's and RARS's bitmap display, x86's /dev/fb0
        id: 'screen',
        label: 'Screen',
        languages: LANGUAGE_ORDER
    },
    {
        //EASy68K's key tasks, MARS's and RARS's keyboard registers and the Input controller, the
        //Port map's keyboard group, x86's evdev keyboard (CONTEXT.md, Keyboard)
        id: 'keyboard',
        label: 'Keyboard',
        languages: LANGUAGE_ORDER
    },
    {
        //EASy68K's mouse tasks, the Input controller of MIPS and RISC-V, the Port map's mouse
        //group, x86's tablet (CONTEXT.md, Mouse; mars/InputController.ts, Z80-model.ts)
        id: 'mouse',
        label: 'Mouse',
        languages: LANGUAGE_ORDER
    },
    {
        //EASy68K's sound tasks and the Synth, MARS's and RARS's MIDI services and the Synth, the
        //Port map's audio group and the Sound chip, x86's /dev/dsp, raw MIDI and PC speaker
        //(CONTEXT.md, Audio)
        id: 'sound',
        label: 'Sound',
        languages: LANGUAGE_ORDER
    },
    {
        //the file services a running program can call: EASy68K's file tasks 50 to 59, MARS's and
        //RARS's file system calls, Blink's file calls on x86 (environment-library.md); the Z80's
        //Port map has no file group, so a Z80 program reads Files only at assembly (`#insert`)
        id: 'fileSystem',
        label: 'File system',
        languages: ['M68K', 'MIPS', 'RISC-V', 'RISC-V-64', 'X86']
    },
    {
        //the Targets C and C++ compile to
        id: 'compile',
        label: 'C/C++',
        languages: LANGUAGE_ORDER.filter(isCompilationTarget)
    },
    {
        //an Executable's Listing, and its Pseudocode from Ghidra's decompiler: an Executable is
        //only ever an x86-64 Linux ELF in an x86 Project (CONTEXT.md, Executable)
        id: 'disassemble',
        label: 'Disassemble',
        languages: ['X86']
    },
    {
        id: 'decompile',
        label: 'Ghidra decompile',
        languages: ['X86']
    }
]

/** Every capability of the page, each with whether the set has it. */
export function languageCapabilities(
    language: AvailableLanguages
): { id: LanguageCapability; label: string; available: boolean }[] {
    return LANGUAGE_CAPABILITIES.map(({ id, label, languages }) => ({
        id,
        label,
        available: languages.includes(language)
    }))
}
