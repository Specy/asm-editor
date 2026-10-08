import { RISCV, type RuntimeLibrary } from '@specy/risc-v'
import { validateAssemblerProfile, type AssemblerProfile } from '$lib/assemblerProfiles'

/** What a Build links besides its Files: the Runtime library and the global execution starts at. */
export type RiscVLink = {
    library?: RuntimeLibrary
    entrySymbol?: string
}

/** Creates a Core using the Project's assembler profile and optional Runtime library. */
export function makeRiscVCore(
    files: Record<string, string>,
    entry: string,
    profile: AssemblerProfile,
    link: RiscVLink = {}
) {
    validateAssemblerProfile(profile)
    return RISCV.makeRiscVFromFiles(files, entry, {
        assemblerProfile: profile,
        ...(link.library ? { libraries: [link.library] } : {}),
        ...(link.entrySymbol ? { entrySymbol: link.entrySymbol } : {})
    })
}
