import type { DecodedInstruction, DecodedOperand } from '@specy/x86/disassembler'
import type {
    ElfAnalysis,
    ElfAnalysisSymbol,
    ElfProgramHeader,
    ElfRelocation,
    ElfSectionHeader,
    ElfSymbol
} from '@specy/x86/elf'

/**
 * The one module of the Listing that imports the x86 Core's decoder and ELF reader. The ELF reader
 * (`@specy/x86/elf`) is plain TypeScript; the decoder (`@specy/x86/disassembler`) instantiates
 * Zydis's wasm when it is first loaded. Everything else in `lib/listing` takes a
 * {@link ListingDecoder} and imports these types from this file.
 */
export type {
    DecodedInstruction,
    DecodedOperand,
    ElfAnalysis,
    ElfAnalysisSymbol,
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
    loading ??= Promise.all([import('@specy/x86/elf'), import('@specy/x86/disassembler')]).then(
        async ([{ analyze }, { loadDisassembler }]) => {
            const { disassemble } = await loadDisassembler()
            return { analyze, disassemble }
        }
    )
    loading.catch(() => {
        loading = undefined
    })
    return loading
}
