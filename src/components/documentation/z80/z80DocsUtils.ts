/**
 * Shared helpers for the Z80 documentation pages.
 */

import type { Z80InstructionVariant } from '$lib/languages/Z80/Z80-documentation'

/**
 * Drops the forms that print identically. The assembler accepts `xor a,b` as well as `xor b`, and
 * both spellings reach the table as the same `instruction` string on the same opcode, so without
 * this 152 of the 1296 variants would be listed twice (and a keyed `{#each}` over them would fail
 * on the duplicate key).
 */
export function dedupeZ80Variants(variants: Z80InstructionVariant[]): Z80InstructionVariant[] {
    const seen = new Set<string>()
    return variants.filter((variant) => {
        const key = `${variant.instruction} ${variant.opcodes}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

/** The same deduplication for the bare instruction forms of a description group. */
export function dedupeZ80Forms(instructions: string[]): string[] {
    return [...new Set(instructions)]
}
