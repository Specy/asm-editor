import type { AvailableLanguages } from '#lib/Project.svelte.ts'

type InstructionSets = {
    m68k: Set<string>
    mips: Set<string>
    x86: Set<string>
    z80: Set<string>
    riscv: Set<string>
    /** RISC-V mnemonics whose every variant is 64-bit only. */
    riscv64Only: Set<string>
}

let instructionSets: Promise<InstructionSets> | undefined

/**
 * The instruction tables come from each language's documentation, which is large and would
 * otherwise ship with every page that imports a Project (the docs layouts link to the projects
 * through the store), so they load on the first detection and are shared by every later one.
 */
function loadInstructionSets(): Promise<InstructionSets> {
    instructionSets ??= Promise.all([
        import('./M68K/M68K-documentation'),
        import('./MIPS/MIPS-documentation'),
        import('./RISC-V/RISC-V-documentation'),
        import('./X86/X86-grammar'),
        import('./Z80/Z80-documentation')
    ]).then(
        ([
            { M68kInstructions },
            { mipsInstructionNames },
            { riscvInstructionMap },
            { X86Instructions },
            { z80InstructionNames }
        ]) => {
            const riscv = new Set<string>()
            const riscv64Only = new Set<string>()
            for (const [name, variants] of riscvInstructionMap) {
                riscv.add(name.toLowerCase())
                if (variants.every((v) => v.isRv64Only)) riscv64Only.add(name.toLowerCase())
            }
            return {
                m68k: new Set(M68kInstructions.map((i) => i.toLowerCase())),
                mips: new Set(mipsInstructionNames.map((i) => i.toLowerCase())),
                x86: new Set(X86Instructions.map((i) => i.toLowerCase())),
                z80: new Set(z80InstructionNames.map((i) => i.toLowerCase())),
                riscv,
                riscv64Only
            }
        },
        (error) => {
            //a failed chunk load (offline, a stale deploy) is retried by the next detection
            instructionSets = undefined
            throw error
        }
    )
    return instructionSets
}

/** Starts loading the instruction tables, so a later detection does not wait for them. */
export function preloadLanguageDetector(): Promise<void> {
    return loadInstructionSets().then(() => undefined)
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

        // Extract the first word as the mnemonic (including optional size suffix like .b, .w, .l)
        const match = line.match(/^([a-zA-Z_]\w*(\.\w+)?)/)
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
export async function detectAssemblyLanguage(code: string): Promise<AvailableLanguages> {
    const sets = await loadInstructionSets()
    const mnemonics = extractMnemonics(code)

    let m68kScore = 0
    let mipsScore = 0
    let x86Score = 0
    let riscvScore = 0
    let riscv64Score = 0
    let z80Score = 0

    for (const mnemonic of mnemonics) {
        // M68K branches also accept `.s` as the short-displacement spelling.
        const m68kMnemonic = mnemonic.replace(/\.[bswl]$/, '')
        if (sets.m68k.has(m68kMnemonic)) m68kScore++
        if (sets.mips.has(mnemonic)) mipsScore++
        if (sets.x86.has(mnemonic)) x86Score++
        // The Z80's everyday mnemonics are all shared: `ld` and `jr` are MIPS and RISC-V
        // instructions too, and `add`, `push`, `call`, `ret`, `inc` are X86 ones, so Z80 code often
        // ties with another language instead of outscoring it. The order of `scores` below decides
        // those ties.
        if (sets.z80.has(mnemonic)) z80Score++
        if (sets.riscv.has(mnemonic)) {
            riscvScore++
            if (sets.riscv64Only.has(mnemonic)) riscv64Score++
        }
    }

    // The sort below is stable, so this order breaks ties. Z80 sits right after M68K because a Z80
    // program made only of shared mnemonics (`ld`, `jr`, `or`, `add`) is common, while MIPS,
    // RISC-V and X86 code almost always contains something no other language has (`li`, `lw`,
    // `ecall`, `mov`) and wins on score rather than on position. Inserting it there, instead of
    // anywhere lower, keeps every tie the other languages already resolved between themselves.
    const scores: { language: AvailableLanguages; score: number }[] = [
        { language: 'M68K', score: m68kScore },
        { language: 'Z80', score: z80Score },
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
