/**
 * One line summaries for the mnemonics the Opcodes project does not list because they are NASM's
 * own spellings of another: the `cmp<predicate><shape>` family, the FMA operand-order aliases and a
 * few register-width aliases. Plain data, so the documentation routes can import it while
 * prerendering.
 */
import type { X86Instruction } from './generated/x86Instructions'

const SHAPES: Record<string, string> = {
    ps: 'Packed Single-Precision',
    pd: 'Packed Double-Precision',
    ss: 'Scalar Single-Precision',
    sd: 'Scalar Double-Precision'
}

const PREDICATES: Record<string, string> = {
    eq: 'Equal',
    lt: 'Less Than',
    le: 'Less Than or Equal',
    gt: 'Greater Than',
    ge: 'Greater Than or Equal',
    neq: 'Not Equal',
    nlt: 'Not Less Than',
    nle: 'Not Less Than or Equal',
    ngt: 'Not Greater Than',
    nge: 'Not Greater Than or Equal',
    ord: 'Ordered',
    unord: 'Unordered',
    false: 'False',
    true: 'True'
}

/** How the AVX predicates behave on a NaN: the two letters NASM appends. */
const NAN_BEHAVIOUR: Record<string, string> = {
    oq: 'Ordered, Non-Signaling',
    os: 'Ordered, Signaling',
    uq: 'Unordered, Non-Signaling',
    us: 'Unordered, Signaling',
    q: 'Non-Signaling',
    s: 'Signaling'
}

const COMPARE =
    /^v?cmp(eq|lt|le|gt|ge|neq|nlt|nle|ngt|nge|ord|unord|false|true)(?:_(oq|os|uq|us|q|s))?(ps|pd|ss|sd)$/

/** NASM spells an FMA order by the operands it multiplies first; Intel's name for the same order. */
const FMA = /^(vfn?m(?:add|sub)(?:sub|add)?)(123|132|213|231|312|321)(ps|pd|ss|sd)$/
const FMA_INTEL_ORDER: Record<string, string> = {
    '123': '213',
    '132': '132',
    '213': '213',
    '231': '231',
    '312': '132',
    '321': '231'
}

/** The 256-bit spellings of the `qq` aliases and the instruction each stands for. */
const ALIASES: Record<string, string> = {
    vldqqu: 'vlddqu',
    vmovntqq: 'vmovntdq',
    vmovqqa: 'vmovdqa',
    vmovqqu: 'vmovdqu'
}

const CLMUL = /^v?pclmul(?:hq|lq)(?:hq|lq)dq$/

/** The summary of `name` when it is one of those spellings and the instruction it stands for has one. */
export function x86AliasSummary(
    name: string,
    summaryOf: (name: string) => string | undefined
): string | undefined {
    const compare = COMPARE.exec(name)
    if (compare) {
        const [, predicate, behaviour, shape] = compare
        const how = behaviour ? ` (${NAN_BEHAVIOUR[behaviour]})` : ''
        return `Compare ${SHAPES[shape]} Floating-Point Values for ${PREDICATES[predicate]}${how}`
    }
    const fma = FMA.exec(name)
    if (fma) return summaryOf(`${fma[1]}${FMA_INTEL_ORDER[fma[2]]}${fma[3]}`)
    if (name in ALIASES) return summaryOf(ALIASES[name])
    if (CLMUL.test(name)) {
        return 'Carry-Less Quadword Multiplication, the quadwords named by the mnemonic'
    }
    return undefined
}

/** The same instructions, each with a summary where its spelling is one of those aliases. */
export function withAliasSummaries(instructions: readonly X86Instruction[]): X86Instruction[] {
    const byName = new Map(instructions.map((instruction) => [instruction.name, instruction]))
    const lookup = (name: string) => byName.get(name)?.summary || undefined
    return instructions.map((instruction) =>
        instruction.summary
            ? instruction
            : { ...instruction, summary: x86AliasSummary(instruction.name, lookup) ?? '' }
    )
}
