/**
 * Which of NASM's instruction forms the Core runs: plain data, so the documentation routes and the
 * Monaco providers can import it as they import `X86-documentation.ts`.
 *
 * NASM's table names the extension each form needs (`AVX2`, `AVX512F`, `APX`). The Core runs the
 * x86-64 baseline, x87, SSE through SSE3 and SSSE3, and AVX, AVX2, FMA, BMI1 and BMI2 in their VEX
 * encodings, with the AES, PCLMULQDQ and SSE4 instructions that have a `v` form. It does not run
 * AVX-512 (EVEX), APX, MMX or the other extensions below, and a program that reaches one stops with
 * SIGILL. A form that needs an extension named in neither list is neither claimed nor denied: the
 * pages say nothing about it.
 */
import type { X86Instruction, X86InstructionForm } from './generated/x86Instructions'

/** The extensions a form may need and still run. */
const RUNNING_FEATURES = new Set([
    'FPU',
    'SSE',
    'SSE2',
    'SSE3',
    'SSSE3',
    'AVX',
    'AVX2',
    'FMA',
    'BMI1',
    'BMI2'
])

/**
 * Legacy encodings NASM files under `SSE` that need a later instruction set: the Core runs AES and
 * PCLMULQDQ only as `vaesenc`, `vpclmulqdq` and their relatives.
 */
const VEX_ONLY_LEGACY = /^(aes|pclmul)/

/** Extensions the Core does not run, by NASM's name for them and the family a reader knows them by. */
const UNSUPPORTED: readonly [RegExp, string][] = [
    [/^AVX512/, 'AVX-512'],
    [/^AVX10/, 'AVX10'],
    [/^APX$/, 'APX'],
    [/^MMX$/, 'MMX'],
    [/^3DNOW$/, '3DNow!'],
    [/^SSE5$/, 'XOP and FMA4'],
    [/^SSE4A$/, 'SSE4A'],
    [/^TBM$/, 'TBM'],
    [/^(VAES|VPCLMULQDQ)$/, '256-bit AES and carry-less multiplication'],
    [/^GFNI$/, 'GFNI'],
    [/^(SHA|SHA512)$/, 'the SHA extensions'],
    [/^HSM[34]$/, 'SM3 and SM4'],
    [/^AVXIFMA$/, 'AVX-IFMA'],
    [/^AVXVNNI/, 'AVX-VNNI'],
    [/^AVXNECONVERT$/, 'AVX-NE-CONVERT'],
    [/^AMX/, 'AMX']
]

/** What stops a form from running. */
export type X86Unsupported =
    | { kind: 'family'; family: string }
    /** Runs, but only in its `v` encoding: `vblendps` for `blendps`. */
    | { kind: 'v-form'; family: string }

/** A form's standing: it runs, a known reason stops it, or nothing is claimed either way. */
export type X86FormSupport = 'runs' | X86Unsupported | 'unknown'

export function x86FormSupport(name: string, form: X86InstructionForm): X86FormSupport {
    if (form.features.length === 0) return 'runs'
    if (form.features.every((feature) => RUNNING_FEATURES.has(feature))) {
        return form.features.includes('SSE') && VEX_ONLY_LEGACY.test(name)
            ? { kind: 'v-form', family: 'AES and PCLMULQDQ' }
            : 'runs'
    }
    for (const feature of form.features) {
        const match = UNSUPPORTED.find(([pattern]) => pattern.test(feature))
        if (match) return { kind: 'family', family: match[1] }
    }
    // SSE4 runs as a `v` encoding, which NASM lists under the mnemonic with a `v` in front.
    const missing = form.features.filter((feature) => !RUNNING_FEATURES.has(feature))
    if (missing.every((feature) => feature === 'SSE41' || feature === 'SSE42')) {
        return { kind: 'v-form', family: 'SSE4' }
    }
    return 'unknown'
}

/** Whether the Core runs this form; a form nothing is known about is not claimed. */
export function x86FormRuns(name: string, form: X86InstructionForm): boolean {
    return x86FormSupport(name, form) === 'runs'
}

/** Whether the Core is known not to run this form, so that a snippet of it would be a SIGILL. */
export function x86FormFails(name: string, form: X86InstructionForm): boolean {
    const support = x86FormSupport(name, form)
    return support !== 'runs' && support !== 'unknown'
}

/** How much of a mnemonic the Core runs. */
export type X86Support = {
    /** Every form runs. */
    all: boolean
    /** At least one form runs. */
    any: boolean
    /** The known reasons the other forms do not, without repeats. */
    missing: X86Unsupported[]
    /** How many forms need an extension nothing is claimed about. */
    unknown: number
}

export function x86Support(instruction: X86Instruction): X86Support {
    let running = 0
    let unknown = 0
    const missing = new Map<string, X86Unsupported>()
    for (const form of instruction.forms) {
        const support = x86FormSupport(instruction.name, form)
        if (support === 'runs') running++
        else if (support === 'unknown') unknown++
        else missing.set(`${support.kind}:${support.family}`, support)
    }
    return {
        all: running === instruction.forms.length,
        any: running > 0,
        missing: [...missing.values()],
        unknown
    }
}

/** Known not to run in any form: the Core stops at it. */
export function x86IsUnsupported(instruction: X86Instruction): boolean {
    const support = x86Support(instruction)
    return !support.any && support.unknown === 0 && support.missing.length > 0
}

/** `a`, `a and b`, `a, b and c`. */
export function x86List(items: readonly string[]): string {
    if (items.length <= 1) return items.join('')
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * One sentence for the hover: what the Core will not run of this mnemonic, or `undefined` when it
 * runs every form it is known about.
 */
export function x86SupportNote(instruction: X86Instruction): string | undefined {
    const support = x86Support(instruction)
    if (support.missing.length === 0) return undefined
    const families = [
        ...new Set(support.missing.filter((r) => r.kind === 'family').map((r) => r.family))
    ]
    const vForms = [
        ...new Set(support.missing.filter((r) => r.kind === 'v-form').map((r) => r.family))
    ]
    const sentences: string[] = []
    if (vForms.length > 0) {
        sentences.push(`This emulator runs ${x86List(vForms)} only in its \`v\` form.`)
    }
    if (families.length > 0) {
        sentences.push(
            x86IsUnsupported(instruction)
                ? `This emulator does not support ${x86List(families)}.`
                : `The ${x86List(families)} forms are not supported by this emulator.`
        )
    }
    return sentences.join(' ')
}
