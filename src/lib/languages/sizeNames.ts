import type { AvailableLanguages } from '$lib/Project.svelte'
import { RegisterSize } from '$lib/languages/commonLanguageFeatures.svelte'

/**
 * What each Target calls the widths the editor groups values by.
 *
 * `RegisterSize`'s members are spelled the way the 68000 spells them, because M68K was the only
 * language here when they were written: a `Word` is two bytes and a `Long` is four. Every other
 * Target disagrees somewhere — a MIPS or RISC-V word is four bytes and two is a *halfword*, an x86
 * four is a *dword* — so a size strip labelled `B W L` tells a MIPS reader something false about
 * their own architecture. The enum keeps its 68000 spelling, since its members are widths in bytes
 * and renaming them would only move the problem, and every name the reader sees comes from here.
 */
export type SizeName = {
    /** The letter a size strip draws, as that Target's own mnemonics abbreviate the width. */
    short: string
    /** The width written out, for the strip's tooltip and for prose about a mutation. */
    long: string
}

//the 68000's names, which every other Target is written here as a difference from: a Target that
//renames nothing reads exactly as the editor always did
const MOTOROLA: Record<RegisterSize, SizeName> = {
    [RegisterSize.Byte]: { short: 'B', long: 'Byte' },
    [RegisterSize.Word]: { short: 'W', long: 'Word' },
    [RegisterSize.Long]: { short: 'L', long: 'Long' },
    [RegisterSize.Double]: { short: 'D', long: 'Double' },
    [RegisterSize.Quad]: { short: 'Q', long: 'Quad' }
}

//MIPS and RISC-V share one set of names, and their load/store mnemonics are where the letters come
//from: `lb`, `lh`, `lw`, `ld`. Both leave 128 bits alone — nothing in either emulator is that wide
const MIPS_LIKE: Record<RegisterSize, SizeName> = {
    ...MOTOROLA,
    [RegisterSize.Word]: { short: 'H', long: 'Halfword' },
    [RegisterSize.Long]: { short: 'W', long: 'Word' },
    [RegisterSize.Double]: { short: 'D', long: 'Doubleword' }
}

//x86 keeps byte and word where the 68000 has them and renames everything above: the names are the
//operand-size keywords NASM and MASM write, so 16 bytes is the SSE file's `xmmword` rather than
//NASM's rarer `oword` spelling of it
const INTEL: Record<RegisterSize, SizeName> = {
    ...MOTOROLA,
    [RegisterSize.Long]: { short: 'D', long: 'Dword' },
    [RegisterSize.Double]: { short: 'Q', long: 'Qword' },
    [RegisterSize.Quad]: { short: 'X', long: 'Xmmword' }
}

const SIZE_NAMES = {
    M68K: MOTOROLA,
    //`defb`/`defw`: the Z80 spells its two widths as the 68000 does, and has nothing wider
    Z80: MOTOROLA,
    MIPS: MIPS_LIKE,
    'RISC-V': MIPS_LIKE,
    'RISC-V-64': MIPS_LIKE,
    X86: INTEL
} satisfies Record<AvailableLanguages, Record<RegisterSize, SizeName>>

/** The widths the editor groups by, narrowest first. */
export const REGISTER_SIZES: readonly RegisterSize[] = [
    RegisterSize.Byte,
    RegisterSize.Word,
    RegisterSize.Long,
    RegisterSize.Double,
    RegisterSize.Quad
]

/**
 * Every width named as `language` names it. A caller with no Target to hand — the agent formatting
 * a step before a language is chosen is the only one — gets the 68000's names, which is what the
 * whole editor showed before this table existed.
 */
export function sizeNames(language?: AvailableLanguages | null): Record<RegisterSize, SizeName> {
    return (language && SIZE_NAMES[language]) || MOTOROLA
}

/**
 * One width named as `language` names it. A width no table covers is shown as its own byte count
 * rather than as a neighbouring width's name: being wrong about a size is worse than being plain.
 */
export function sizeName(size: RegisterSize, language?: AvailableLanguages | null): SizeName {
    return sizeNames(language)[size] ?? { short: String(size), long: `${size} bytes` }
}
