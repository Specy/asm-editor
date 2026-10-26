import type { MarsForm } from './instructionDocument'

/**
 * What `MIPS-documentation.ts` and `RISC-V-documentation.ts` do alike with their Core's forms. It
 * takes the forms and the addressing modes rather than reading them, so that it imports neither
 * Core, as the rest of this folder.
 */

/**
 * A Core's forms grouped by mnemonic: the map in the Core's order, its groups, the groups sorted by
 * mnemonic, and those mnemonics. Each data module exports them under its own names.
 */
export function groupMarsForms<F extends { name: string }>(forms: readonly F[]) {
    const map = new Map<string, [F, ...F[]]>()
    for (const form of forms) {
        const variants = map.get(form.name)
        if (variants) {
            variants.push(form)
        } else {
            map.set(form.name, [form])
        }
    }
    const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    return { map, variants: [...map.values()], entries, names: entries.map(([name]) => name) }
}

/**
 * A form's operands as the hovers and completions write them, `$reg` or `int16($reg)`, each token
 * read as its label in the language's addressing modes. A parenthesis after a register's label
 * (`$reg`, `$freg` or `regnum` in MIPS, the same without `$` in RISC-V) opens an operand of its
 * own; after anything else it continues the operand.
 */
export function marsVariantOperands(
    variant: Pick<MarsForm, 'args'>,
    modes: Readonly<Record<string, { label: string }>>
): string[] {
    const { REGISTER_NAME, FP_REGISTER_NAME, REGISTER_NUMBER } = modes
    const registers = new Set([REGISTER_NAME.label, FP_REGISTER_NAME.label, REGISTER_NUMBER.label])

    function getLabel(type: string): string {
        if (type.startsWith('INTEGER')) return 'imm'
        return Object.prototype.hasOwnProperty.call(modes, type) ? modes[type].label : type
    }

    const tokens = variant.args.map((a) => a[0])
    if (tokens.length === 0) return []

    const operands: string[] = []
    let parts: string[] = []

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]
        const label = getLabel(t.type)

        if (t.type === 'LEFT_PAREN') {
            const last = parts[parts.length - 1]
            if (parts.length > 0 && !registers.has(last)) {
                parts.push('(')
            } else {
                if (parts.length > 0) operands.push(parts.join(''))
                parts = ['(']
            }
        } else if (t.type === 'RIGHT_PAREN') {
            parts.push(')')
            operands.push(parts.join(''))
            parts = []
        } else if (t.type === 'PLUS') {
            parts.push('+')
        } else {
            const prevType = i > 0 ? tokens[i - 1].type : null
            if (parts.length > 0 && prevType !== 'LEFT_PAREN' && prevType !== 'PLUS') {
                operands.push(parts.join(''))
                parts = []
            }
            parts.push(label)
        }
    }
    if (parts.length > 0) operands.push(parts.join(''))
    return operands
}
