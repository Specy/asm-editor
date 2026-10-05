import { RISCV, type JsRiscV, type RuntimeLibrary } from '@specy/risc-v'
import { validateAssemblerProfile, type AssemblerProfile } from '$lib/assemblerProfiles'
import { ProjectFormatError } from '$lib/projectFiles'

type ProfileCore = JsRiscV & { getAddressOfLabel(label: string): number }

/** What a Build links besides its Files: the Runtime library and the global execution starts at. */
export type RiscVLink = {
    library?: RuntimeLibrary
    entrySymbol?: string
}

/** Older published Cores must reject a required profile before they can ignore factory options. */
export function makeRiscVCore(
    files: Record<string, string>,
    entry: string,
    profile: AssemblerProfile,
    link: RiscVLink = {}
) {
    validateAssemblerProfile(profile)
    const supported = (RISCV as typeof RISCV & { assemblerProfiles?: readonly string[] })
        .assemblerProfiles ?? ['rars']
    if (!supported.includes(profile))
        throw new ProjectFormatError(
            `This RISC-V Core does not support assembler profile ${profile}`
        )
    if ((link.library || link.entrySymbol) && typeof RISCV.analyzeGnuUnit !== 'function')
        throw new ProjectFormatError('This RISC-V Core cannot link the Runtime library')
    const factory = RISCV.makeRiscVFromFiles as (
        files: Record<string, string>,
        entry: string,
        options: {
            assemblerProfile: AssemblerProfile
            libraries?: RuntimeLibrary[]
            entrySymbol?: string
        }
    ) => ProfileCore
    return factory(files, entry, {
        assemblerProfile: profile,
        ...(link.library ? { libraries: [link.library] } : {}),
        ...(link.entrySymbol ? { entrySymbol: link.entrySymbol } : {})
    })
}
