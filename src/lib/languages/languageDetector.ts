import type { AvailableLanguages } from '$lib/Project.svelte'
import { M68kInstructions } from './M68K/M68K-documentation'
import { mipsInstructionNames } from './MIPS/MIPS-documentation'
import { riscvInstructionMap } from './RISC-V/RISC-V-documentation'
import { X86Instructions } from './X86/X86-grammar'

const m68kSet = new Set(M68kInstructions.map((i) => i.toLowerCase()))
const mipsSet = new Set(mipsInstructionNames.map((i) => i.toLowerCase()))
const x86Set = new Set(X86Instructions.map((i) => i.toLowerCase()))

// Build RISC-V sets: one for all instructions, one for 64-bit only
const riscvSet = new Set<string>()
const riscv64OnlySet = new Set<string>()
for (const [name, variants] of riscvInstructionMap) {
    riscvSet.add(name.toLowerCase())
    if (variants.every((v) => v.isRv64Only)) {
        riscv64OnlySet.add(name.toLowerCase())
    }
}

/**
 * Extracts instruction mnemonics from assembly code lines.
 * Strips comments, ignores labels and directives, and returns
 * the first word (mnemonic) of each remaining line.
 */
function extractMnemonics(code: string): string[] {
    const mnemonics: string[] = []
    for (const rawLine of code.split('\n')) {
        // Strip comments (;, #, and line-starting *)
        let line = rawLine
        // Remove inline comments: everything after ; or #
        const semiIdx = line.indexOf(';')
        if (semiIdx !== -1) line = line.slice(0, semiIdx)
        const hashIdx = line.indexOf('#')
        if (hashIdx !== -1) line = line.slice(0, hashIdx)

        line = line.trim()
        if (line.length === 0) continue

        // Lines starting with * are M68K full-line comments
        if (line.startsWith('*')) continue

        // Skip labels (word followed by colon at end, possibly with trailing whitespace)
        if (/^\w+:\s*$/.test(line)) continue
        // Strip leading label from lines like "label: instruction"
        const labelMatch = line.match(/^\w+:\s+(.+)$/)
        if (labelMatch) {
            line = labelMatch[1]
        }

        // Skip assembler directives (starting with .)
        if (line.startsWith('.')) continue

        // Skip M68K directives that don't start with . (ORG, EQU, DC, DS, DCB)
        const upperLine = line.toUpperCase()
        if (/^(ORG|EQU|DCB|DS|DC|SECTION|GLOBAL|EXTERN)\b/.test(upperLine)) continue

        // Extract the first word as the mnemonic
        const match = line.match(/^([a-zA-Z_]\w*(\.\w)?)/)
        if (match) {
            mnemonics.push(match[1].toLowerCase())
        }
    }
    return mnemonics
}

/**
 * Given some unknown assembly code, detects which assembly language it most
 * likely is by analyzing the instruction mnemonics. Returns the language with
 * the highest number of matched instructions.
 */
export function detectAssemblyLanguage(code: string): AvailableLanguages {
    const mnemonics = extractMnemonics(code)

    let m68kScore = 0
    let mipsScore = 0
    let x86Score = 0
    let riscvScore = 0
    let riscv64Score = 0

    for (const mnemonic of mnemonics) {
        // For M68K, also try stripping size suffix (.b, .w, .l)
        const m68kMnemonic = mnemonic.replace(/\.[bwl]$/, '')
        if (m68kSet.has(m68kMnemonic)) m68kScore++
        if (mipsSet.has(mnemonic)) mipsScore++
        if (x86Set.has(mnemonic)) x86Score++
        if (riscvSet.has(mnemonic)) {
            riscvScore++
            if (riscv64OnlySet.has(mnemonic)) riscv64Score++
        }
    }

    const scores: { language: AvailableLanguages; score: number }[] = [
        { language: 'M68K', score: m68kScore },
        { language: 'MIPS', score: mipsScore },
        { language: 'X86', score: x86Score },
        // If most RISC-V matches are 64-bit only, pick RISC-V-64
        {
            language: riscv64Score > riscvScore / 2 ? 'RISC-V-64' : 'RISC-V',
            score: riscvScore
        }
    ]

    scores.sort((a, b) => b.score - a.score)

    // Default to M68K if no instructions matched or there's a tie at 0
    if (scores[0].score === 0) return 'M68K'

    return scores[0].language
}
