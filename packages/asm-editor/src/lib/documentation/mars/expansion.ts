import type { MarsLanguage } from './operands'

/**
 * A pseudo-instruction's expansion in the page's own symbols
 * ([the design record](../../../../../../docs/design/instruction-layout.md), decision 11, and
 * [the plan](../../../../../../docs/design/instruction-layout-plan.md), M4): MARS and RARS keep each
 * pseudo form's real instructions as templates whose placeholders name the form's tokens by
 * position, `lw $t1,100000` becoming `lui $1, VH2` and `lw RG1,VL2($1)`. This writes them the way the
 * row does: `lui $at, hi(imm)` and `lw $t1, lo(imm)($at)`.
 */

/** One token of the form, as its row writes it; token 0 is the mnemonic. */
export type ExpansionOperand = {
    /** The Core's token type: `REGISTER_NAME`, `INTEGER_16`, `IDENTIFIER`, `LEFT_PAREN`… */
    type: string
    /** What the row writes for it: `$t1`, `imm`, `label`, `(`. */
    text: string
}

const MIPS_REGISTERS =
    '$zero $at $v0 $v1 $a0 $a1 $a2 $a3 $t0 $t1 $t2 $t3 $t4 $t5 $t6 $t7 $s0 $s1 $s2 $s3 $s4 $s5 $s6 $s7 $t8 $t9 $k0 $k1 $gp $sp $fp $ra'.split(
        ' '
    )

const RISCV_REGISTERS =
    'zero ra sp gp tp t0 t1 t2 s0 s1 a0 a1 a2 a3 a4 a5 a6 a7 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 t3 t4 t5 t6'.split(
        ' '
    )

/** RARS's control and status registers by number, which its CSR templates write as hex. */
const RISCV_CSRS: Readonly<Record<number, string>> = {
    0x000: 'ustatus',
    0x001: 'fflags',
    0x002: 'frm',
    0x003: 'fcsr',
    0x004: 'uie',
    0x005: 'utvec',
    0x040: 'uscratch',
    0x041: 'uepc',
    0x042: 'ucause',
    0x043: 'utval',
    0x044: 'uip',
    0xc00: 'cycle',
    0xc01: 'time',
    0xc02: 'instret',
    0xc80: 'cycleh',
    0xc81: 'timeh',
    0xc82: 'instreth'
}

/** Immediates that fit the real instruction's field whole, so a low-half placeholder is the value. */
const FITS_FIELD: Record<MarsLanguage, ReadonlySet<string>> = {
    mips: new Set(['INTEGER_5', 'INTEGER_16', 'INTEGER_16U']),
    'risc-v': new Set(['INTEGER_5', 'INTEGER_6', 'INTEGER_12', 'INTEGER_12U'])
}

const REGISTER_TYPES = new Set(['REGISTER_NAME', 'FP_REGISTER_NAME', 'REGISTER_NUMBER'])

/** The bits of a 64-bit `li` each of RARS's five pieces carries. */
const LI_PIECES: Readonly<Record<string, string>> = {
    A: '63:44',
    B: '43:32',
    C: '31:21',
    D: '20:10',
    E: '9:0'
}

function placeholder(
    word: string,
    operands: readonly ExpansionOperand[],
    language: MarsLanguage
): string | undefined {
    const text = (n: string | number) => operands[Number(n)]?.text
    const plus = (value: string | undefined, add: string | undefined) =>
        value === undefined ? undefined : add ? `${value}+${add}` : value
    const wrap = (fn: string, value: string | undefined) =>
        value === undefined ? undefined : `${fn}(${value})`
    const last = operands[operands.length - 1]?.text
    // the `label+100000` forms: the label is token 2 and the immediate token 4
    const offsetLabel = () => {
        const label = text(2)
        const offset = text(4)
        return label === undefined || offset === undefined ? undefined : `${label}+${offset}`
    }
    let match: RegExpExecArray | null
    if ((match = /^RG(\d+)$/.exec(word))) return text(match[1])
    if ((match = /^OP(\d+)$/.exec(word))) return text(match[1])
    if ((match = /^NR(\d+)$/.exec(word))) return wrap('next', text(match[1]))
    if ((match = /^VHL?(\d)(?:P(\d))?$/.exec(word)))
        return wrap('hi', plus(text(match[1]), match[2]))
    if ((match = /^VL(\d)(?:P(\d))?U?$/.exec(word))) {
        const value = text(match[1])
        if (match[2]) return wrap('lo', plus(value, match[2]))
        return FITS_FIELD[language].has(operands[Number(match[1])]?.type ?? '')
            ? value
            : wrap('lo', value)
    }
    if ((match = /^LH(\d)(?:P(\d))?$/.exec(word))) return wrap('hi', plus(text(match[1]), match[2]))
    if ((match = /^LL(\d)(?:P(\d))?U?$/.exec(word)))
        return wrap('lo', plus(text(match[1]), match[2]))
    if ((match = /^(?:LHPA(?:P(\d))?|LHPN)$/.exec(word)))
        return wrap('hi', plus(offsetLabel(), match[1]))
    if ((match = /^LLP(?:P(\d))?U?$/.exec(word))) return wrap('lo', plus(offsetLabel(), match[1]))
    if (word === 'LHL') return wrap('hi', text(2))
    if (word === 'LAB') return last
    if (word === 'S32') return last === undefined ? undefined : `32-${last}`
    // the branch offset without delayed branching, which this Core never turns on
    if ((match = /^BROFF(\d)(\d)$/.exec(word))) return match[1]
    if ((match = /^PCH(\d+)$/.exec(word))) return wrap('pcrel_hi', text(match[1]))
    if ((match = /^PCL(\d+)$/.exec(word))) return wrap('pcrel_lo', text(match[1]))
    if ((match = /^LI([A-E])(\d+)$/.exec(word))) {
        const value = text(match[2])
        return value === undefined ? undefined : `${value}[${LI_PIECES[match[1]]}]`
    }
    return undefined
}

/** Numbered registers as the language names them, unless the name is one of the row's own. */
function nameRegisters(line: string, language: MarsLanguage, taken: ReadonlySet<string>): string {
    const pattern = language === 'mips' ? /\$(\d+)\b/g : /\bx(\d+)\b/g
    const names = language === 'mips' ? MIPS_REGISTERS : RISCV_REGISTERS
    return line.replace(pattern, (whole, number: string) => {
        const name = names[Number(number)]
        return name && !taken.has(name) ? name : whole
    })
}

/** The template's spacing as the rows write it: one space after the mnemonic and each comma. */
function tidy(line: string): string {
    return line
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ', ')
        .trim()
}

/**
 * The real instructions a pseudo form becomes, written with the row's texts for its tokens;
 * undefined when a template has a placeholder this does not know, so a page never shows a raw one.
 */
export function rewriteExpansion(
    templates: readonly string[],
    operands: readonly ExpansionOperand[],
    language: MarsLanguage
): string[] | undefined {
    if (templates.length === 0) return undefined
    const taken = new Set(
        operands
            .filter((operand) => REGISTER_TYPES.has(operand.type))
            .map((operand) => operand.text)
    )
    const lines: string[] = []
    for (const template of templates) {
        // a `nop` that only delayed branching asks for, which this Core never turns on
        if (template.trim() === 'DBNOP') continue
        let unknown = false
        let line = nameRegisters(template, language, taken)
        if (language === 'risc-v' && /^\s*csr/.test(line)) {
            line = line.replace(/\b0x[0-9a-f]+\b/gi, (hex) => RISCV_CSRS[Number(hex)] ?? hex)
        }
        line = line.replace(/\b[A-Z][A-Z0-9]*\b/g, (word) => {
            const replaced = placeholder(word, operands, language)
            if (replaced === undefined) unknown = true
            return replaced ?? word
        })
        if (unknown) return undefined
        lines.push(tidy(line))
    }
    return lines.length > 0 ? lines : undefined
}
