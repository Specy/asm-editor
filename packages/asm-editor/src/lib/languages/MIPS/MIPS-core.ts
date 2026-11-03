import { MIPS, type RuntimeLibrary } from '@specy/mips'
import { validateAssemblerProfile, type AssemblerProfile } from '#lib/assemblerProfiles.ts'

/**
 * What a Build links besides its Entry's unit: the Runtime library, the global execution starts at,
 * and the Project's other GNU-profile units, which the Core takes as an archive's members.
 */
export type MipsLink = {
    library?: RuntimeLibrary
    entrySymbol?: string
    units?: readonly string[]
}

/**
 * A MIPS Core for a Build. The editor's profile names the Core's own dialect `rars`, after the
 * RISC-V Setting that chooses it; for MIPS that dialect is MARS's, and only Generated assembly
 * asks for the GNU compiler profile.
 */
export function makeMipsCore(
    files: Record<string, string>,
    entry: string,
    profile: AssemblerProfile,
    link: MipsLink = {}
) {
    validateAssemblerProfile(profile)
    return MIPS.makeMipsFromFiles(files, entry, {
        assemblerProfile: profile === 'gnu-compiler-v1' ? profile : 'mars',
        ...(link.library ? { libraries: [link.library] } : {}),
        ...(link.entrySymbol ? { entrySymbol: link.entrySymbol } : {}),
        ...(link.units?.length ? { units: [...link.units] } : {})
    })
}
