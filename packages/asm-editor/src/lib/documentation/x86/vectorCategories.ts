/**
 * The kind of work a vector instruction does, for the headings inside the Extensions groups of SSE,
 * SSE2, SSE3, SSSE3, SSE4, AVX, AVX2 and FMA. Written by the mnemonic: NASM's own headings follow
 * the year an instruction arrived, which splits `paddd` from `vpaddd` and says nothing about what
 * either does. One per mnemonic, the `v` of an AVX spelling dropped.
 *
 * Separate from the shared Instruction categories
 * ([the design record](../../../../../../docs/design/instruction-categories.md)): those name the
 * kinds of work of a scalar instruction set, and a vector instruction set needs its own words.
 */
export const VECTOR_CATEGORIES = [
    { id: 'moves', label: 'Moves, loads and stores' },
    { id: 'arithmetic', label: 'Arithmetic' },
    { id: 'fused', label: 'Fused multiply-add' },
    { id: 'logic', label: 'Logic' },
    { id: 'shifts', label: 'Shifts' },
    { id: 'compare', label: 'Compare, minimum and maximum' },
    { id: 'predicate', label: 'Compares named by their predicate' },
    { id: 'shuffle', label: 'Shuffles, permutes and blends' },
    { id: 'lane', label: 'Broadcast, insert and extract' },
    { id: 'convert', label: 'Conversions' },
    { id: 'masked', label: 'Gathers and masked moves' },
    { id: 'string', label: 'String compare' },
    { id: 'crypto', label: 'AES and carry-less multiplication' },
    { id: 'state', label: 'State and control' }
] as const

export type VectorCategory = (typeof VECTOR_CATEGORIES)[number]['id']

/** The rules in the order they are tried; the first that matches the stem decides. */
const RULES: readonly [VectorCategory, RegExp][] = [
    ['fused', /^fn?m(?:add|sub)(?:sub|add)?\d{3}(?:ps|pd|ss|sd)$/],
    ['masked', /^(?:p?gather|p?maskmov)/],
    ['string', /^pcmp[ei]str[im]$/],
    ['crypto', /^(?:aes|pclmul|clmul)/],
    [
        'predicate',
        /^cmp(?:eq|lt|le|gt|ge|neq|nlt|nle|ngt|nge|ord|unord|false|true)(?:_[a-z]+)?(?:ps|pd|ss|sd)$/
    ],
    [
        'state',
        /^(?:zero(?:upper|all)|ldmxcsr|stmxcsr|fxsave|fxrstor|xsave|xrstor|sfence|lfence|mfence|clflush|prefetch|emms)/
    ],
    ['convert', /^(?:cvt|pmov[sz]x|round|ldqq)/],
    ['lane', /^(?:p?broadcast|insert|extract|pinsr|pextr|movmsk|pmovmskb)/],
    [
        'shuffle',
        /^(?:p?shuf|punpck|unpck|perm|pblend|blend|palignr|pack|movddup|movsldup|movshdup|movlhps|movhlps)/
    ],
    ['moves', /^(?:mov|lddqu|vldqq)/],
    ['compare', /^(?:cmp|comis|ucomis|pcmp|pmin|pmax|min|max|ptest|testp[sd]|phminpos)/],
    ['shifts', /^p?(?:sll|srl|sra|rol|ror)/],
    ['logic', /^(?:p?and|p?or|p?xor|p?andn)/],
    [
        'arithmetic',
        /^(?:p?add|p?sub|p?mul|p?div|pmadd|pavg|psad|pabs|psign|phadd|phsub|hadd|hsub|addsub|dp|mpsadbw|sqrt|rsqrt|rcp|mulh|pmulh|pmuld|pmuludq)/
    ]
]

/** The stem of a mnemonic: an AVX spelling without its leading `v`. */
function stemOf(name: string): string {
    return /^v[a-z]/.test(name) && !/^vz/.test(name) ? name.slice(1) : name
}

export function vectorCategory(name: string): VectorCategory | undefined {
    const stem = name.startsWith('vzero') ? name.slice(1) : stemOf(name)
    return RULES.find(([, pattern]) => pattern.test(stem))?.[0]
}
