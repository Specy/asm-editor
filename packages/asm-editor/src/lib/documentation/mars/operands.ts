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
    imm32: 'Any 32-bit value, `-2147483648` to `4294967295`; the assembler builds it in `$at` first.',
    imm5: 'An unsigned 5-bit number, `0` to `31`, such as a shift amount.',
    cc: 'One of the eight FP condition flags, `0` to `7`, which the comparisons set and `bc1t` and `bc1f` read.',
    label: 'A label: the name of an address in the program, such as the start of a loop or a variable in `.data`.',
    $8: 'A coprocessor 0 register, by number: `$8` (vaddr), `$12` (status), `$13` (cause) or `$14` (epc).'
}

/** The immediates and other value symbols of a RISC-V row. */
export const RISCV_OPERAND_MEANINGS: Readonly<Record<string, string>> = {
    imm12: 'A signed 12-bit immediate, `-2048` to `2047`.',
    imm20: 'A 20-bit immediate, `0` to `1048575` (`0xFFFFF`), which lands in the upper 20 bits of the register.',
    imm32: 'Any 32-bit value, `-2147483648` to `4294967295`.',
    imm64: 'Any 64-bit value.',
    imm5: 'An unsigned 5-bit number, `0` to `31`, such as a shift amount or a CSR immediate.',
    imm6: 'An unsigned 6-bit shift amount or bit number, `0` to `63`; RV32 takes only `0` to `31`.',
    label: 'A label: the name of an address in the program, such as the start of a loop or a variable in `.data`.',
    csr: 'A control and status register, by name or number: `fcsr`, `fflags`, `frm`, `cycle`, `time`, `instret`, `ustatus`, `uepc`, `ucause`, `utval`….',
    rm: 'A rounding mode: `rne` (to nearest, ties to even), `rtz` (toward zero), `rdn` (down), `rup` (up), `rmm` (to nearest, ties away from zero) or `dyn`, the mode `fcsr` holds.'
}

/** How a merged `imm` row's widths read in its legend line, in the order they are listed. */
const IMMEDIATE_PHRASES: Readonly<Record<string, string>> = {
    imm5: 'an unsigned 5-bit one (`0` to `31`)',
    imm6: 'an unsigned 6-bit one (`0` to `63`)',
    imm12: 'a signed 12-bit one (`-2048` to `2047`)',
    imm16: 'a signed 16-bit one (`-32768` to `32767`)',
    uimm16: 'an unsigned 16-bit one (`0` to `65535`)',
    imm20: 'a 20-bit one (`0` to `1048575`)',
    imm32: 'any 32-bit value',
    imm64: 'any 64-bit value'
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
            : (phrases[0] ?? 'any value its forms take')
    return `A number: ${listed}. The assembler picks the form by the value, and the expanded row lists each one.`
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
        general: 'Any general-purpose register, `$zero` to `$ra` (`$0` to `$31`).',
        float: 'Any floating point register, `$f0` to `$f31`.',
        double: 'An even floating point register, `$f0` to `$f30`, which holds a double together with the odd register above it.'
    },
    'risc-v': {
        general: 'Any integer register, `zero` to `t6` (`x0` to `x31`).',
        float: 'Any floating point register, `ft0` to `ft11` (`f0` to `f31`).',
        double: 'Any floating point register, `ft0` to `ft11` (`f0` to `f31`).'
    }
}

const ANOTHER: Record<MarsLanguage, Record<Exclude<RegisterKind, 'fcsr'>, string>> = {
    mips: {
        general: 'Another general-purpose register',
        float: 'Another floating point register',
        double: 'Another even floating point register, holding a double'
    },
    'risc-v': {
        general: 'Another integer register',
        float: 'Another floating point register',
        double: 'Another floating point register'
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
        return '`$f31` here names the FPU control and status register (FCSR), which holds the rounding mode and the exception flags.'
    }
    if (first === undefined || first === symbol) {
        return `${RANGES[language][kind]} The forms' sentences call the one written here \`${symbol}\`.`
    }
    return `${ANOTHER[language][kind]}, which may be the same one as \`${first}\`.`
}
