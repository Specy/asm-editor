export const ASSEMBLER_PROFILES = ['rars', 'gnu-compiler-v1'] as const
export type AssemblerProfile = (typeof ASSEMBLER_PROFILES)[number]

export function isAssemblerProfile(value: unknown): value is AssemblerProfile {
    return value === 'rars' || value === 'gnu-compiler-v1'
}

/** Only absence selects the default; a present requirement must never be dropped. */
export function validateAssemblerProfile(value: unknown): AssemblerProfile {
    if (!isAssemblerProfile(value))
        throw new TypeError(`Unsupported assembler profile: ${String(value)}`)
    return value
}
