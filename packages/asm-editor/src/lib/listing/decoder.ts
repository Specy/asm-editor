import type {
    DecodedInstruction,
    DecodedOperand,
    ElfAnalysis,
    ElfProgramHeader,
    ElfRelocation,
    ElfSectionHeader,
    ElfSymbol
} from '@specy/x86/disassembler'

/**
 * The one module of the Listing that imports the x86 Core's decoder and ELF reader, so that where
 * they come from (today one subpath whose wasm starts with a top-level await) is a change here
 * alone. Everything else in `lib/listing` takes a {@link ListingDecoder} and imports these types
 * from this file.
 */
export type {
    DecodedInstruction,
    DecodedOperand,
    ElfAnalysis,
    ElfProgramHeader,
    ElfRelocation,
    ElfSectionHeader,
    ElfSymbol
}

export type ListingDecoder = {
    analyze(bytes: Uint8Array): ElfAnalysis
    /** Decodes a whole range at once; undecodable bytes come back as one-byte `db` entries. */
    disassemble(bytes: Uint8Array, address: bigint): DecodedInstruction[]
}

let loading: Promise<ListingDecoder> | undefined

/** Loads Zydis's wasm once, on first use, so nothing pays for it until a Listing is generated. */
export function loadDecoder(): Promise<ListingDecoder> {
    loading ??= import('@specy/x86/disassembler').then(({ analyze, disassemble }) => ({
        analyze,
        disassemble
    }))
    return loading
}
