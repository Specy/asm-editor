/**
 * What each operand symbol of a MIPS or RISC-V Form pattern stands for
 * ([the design record](../../../../../../docs/design/instruction-layout.md), decision 7, and
 * [the plan](../../../../../../docs/design/instruction-layout-plan.md), decisions 13 and 14). One
 * line of markdown each; a page's Operands legend shows the ones its rows use.
 *
 * The register placeholders stay as MARS and RARS write them (`$t1`, `t2`, `$f0`, `f1`), because
 * every form's own sentence names them: they get their lines from `registerMeaning`. Only the
 * example values became symbols, and those are the tables below.
 */

export type MarsLanguage = 'mips' | 'risc-v'

/** The immediates and other value symbols of a MIPS row. */
export const MIPS_OPERAND_MEANINGS: Readonly<Record<string, string>> = {
    imm16: 'A signed 16-bit immediate, `-32768` to `32767`.',
    uimm16: 'An unsigned 16-bit immediate, `0` to `65535`.',
    imm32: 'A 32-bit immediate, `-2147483648` to `4294967295`. Pseudoinstruction expansion may overwrite `$at`, losing its previous value.',
    imm5: 'An unsigned 5-bit immediate, `0` to `31`, used for values such as a shift count.',
    cc: 'A floating-point condition flag number, `0` to `7`. Comparisons set these flags; `bc1t` and `bc1f` test them.',
    label: 'A named address in the program, such as the start of a loop or a variable in `.data`.',
    $8: 'A coprocessor 0 register, written by number: `$8` (`vaddr`), `$12` (`status`), `$13` (`cause`) or `$14` (`epc`).'
}

/** The immediates and other value symbols of a RISC-V row. */
export const RISCV_OPERAND_MEANINGS: Readonly<Record<string, string>> = {
    imm12: 'A signed 12-bit immediate, `-2048` to `2047`.',
    imm20: 'A 20-bit immediate, `0` to `1048575` (`0xFFFFF`), placed in bits 31–12.',
    imm32: 'A 32-bit immediate, `-2147483648` to `4294967295`.',
    imm64: 'A 64-bit immediate for RV64: decimal `-9223372036854775808` to `9223372036854775807`, or a hexadecimal bit pattern up to `0xFFFFFFFFFFFFFFFF`.',
    imm5: 'An unsigned 5-bit immediate, `0` to `31`, used for values such as a shift count or a CSR immediate.',
    imm6: 'An unsigned shift count or bit number: `0` to `63` in RV64, or `0` to `31` in RV32.',
    label: 'A named address in the program, such as the start of a loop or a variable in `.data`.',
    csr: 'A control and status register, written by name or number, such as `fcsr`, `fflags`, `frm`, `cycle`, `time`, `instret`, `ustatus`, `uepc`, `ucause` or `utval`. See the [supported registers](/documentation/risc-v/registers).',
    rm: 'A rounding mode: `rne` (nearest, ties to even), `rtz` (toward zero), `rdn` (toward negative infinity), `rup` (toward positive infinity), `rmm` (nearest, ties away from zero) or `dyn` (use the rounding mode in `fcsr`).'
}

/** How a merged `imm` row's widths read in its legend line, in the order they are listed. */
const IMMEDIATE_PHRASES: Readonly<Record<string, string>> = {
    imm5: 'an unsigned 5-bit value (`0` to `31`)',
    imm6: 'an unsigned 6-bit value (`0` to `63` in RV64, `0` to `31` in RV32)',
    imm12: 'a signed 12-bit value (`-2048` to `2047`)',
    imm16: 'a signed 16-bit value (`-32768` to `32767`)',
    uimm16: 'an unsigned 16-bit value (`0` to `65535`)',
    imm20: 'a 20-bit value (`0` to `1048575`)',
    imm32: 'a 32-bit value (`-2147483648` to `4294967295`)',
    imm64: 'a 64-bit value in RV64 (signed decimal or a hexadecimal bit pattern up to `0xFFFFFFFFFFFFFFFF`)'
}

/**
 * The line of `imm`, which stands for immediates of different widths in one row (decision 14):
 * the widths are named from the ones the page's forms take, so the line says what the chips would.
 */
export function immediateMeaning(widths: readonly string[]): string {
    const phrases = Object.keys(IMMEDIATE_PHRASES)
        .filter((width) => widths.includes(width))
        .map((width) => IMMEDIATE_PHRASES[width])
    const listed =
        phrases.length > 1
            ? `${phrases.slice(0, -1).join(', ')} or ${phrases[phrases.length - 1]}`
            : (phrases[0] ?? 'a value accepted by the instruction')
    return `An immediate value: ${listed}. The assembler chooses a supported encoding for the value and other operands; a pseudoinstruction may expand into several instructions.`
}

export type RegisterKind = 'general' | 'float' | 'double' | 'fcsr'

/** The kind of register a placeholder stands for, from its token and the mnemonic it sits in. */
export function registerKind(
    language: MarsLanguage,
    tokenType: string,
    text: string,
    mnemonic: string
): RegisterKind {
    if (tokenType !== 'FP_REGISTER_NAME') return 'general'
    if (language === 'mips') {
        if (text === '$f31' && /^c[ft]c1$/.test(mnemonic)) return 'fcsr'
        // a double lives in an even register and the odd one above it; the even placeholders of a
        // double precision mnemonic are its doubles, the odd ones its singles and words
        const number = Number(text.slice(2))
        const double = /\.d(\.|$)|^[ls]dc1$|^[ls]\.d$/.test(mnemonic)
        if (double && number % 2 === 0) return 'double'
    }
    return 'float'
}

const RANGES: Record<MarsLanguage, Record<Exclude<RegisterKind, 'fcsr'>, string>> = {
    mips: {
        general:
            'Any general-purpose register, `$0` to `$31`, using its numeric or named spelling, such as `$8` or `$t0` (`$zero` is `$0`; `$ra` is `$31`).',
        float: 'Any floating-point register, `$f0` to `$f31`.',
        double: 'An even-numbered floating-point register, `$f0` to `$f30`. A double-precision value uses this register and the next odd-numbered register.'
    },
    'risc-v': {
        general:
            'Any integer register, `x0` to `x31`, or its named alias, such as `zero`, `t0` or `t6`.',
        float: 'Any floating-point register, `f0` to `f31`, or its named alias, such as `ft0`, `fa0` or `ft11`.',
        double: 'Any floating-point register, `f0` to `f31`, or its named alias, such as `ft0`, `fa0` or `ft11`.'
    }
}

const ANOTHER: Record<MarsLanguage, Record<Exclude<RegisterKind, 'fcsr'>, string>> = {
    mips: {
        general: 'A general-purpose register',
        float: 'A floating-point register',
        double: 'An even-numbered floating-point register holding a double'
    },
    'risc-v': {
        general: 'An integer register',
        float: 'A floating-point register',
        double: 'A floating-point register'
    }
}

/**
 * The line of one register placeholder. The first of its kind on a page says the range; the
 * others say they are another register of the same file, which may be the same one.
 */
export function registerMeaning(
    language: MarsLanguage,
    symbol: string,
    kind: RegisterKind,
    first: string | undefined
): string {
    if (kind === 'fcsr') {
        return '`$f31` here names the floating-point control and status register (FCSR), containing the rounding mode and exception flags.'
    }
    if (first === undefined || first === symbol) {
        return RANGES[language][kind]
    }
    return `${ANOTHER[language][kind]}. It may be the same register as \`${first}\`.`
}
