/**
 * The Hint on a File a Build leaves out, and on MIPS the exception handler such a File may hold,
 * which the processor enters by itself at 0x80000180, so no program names it and it is never
 * linked until a C file asks for it with `<sim.h>`'s `SIM_LINK`
 * ([asmos-stage2.md](../../../../../../docs/design/asmos-stage2.md), decision 10).
 */

/** The Hint on a File the program does not use, on every Target. */
export const NOT_LINKED_MESSAGE = "The program doesn't use this File, so it is left out."

/** Where the GNU profile places `.ktext`, the one address its `.ktext` directive takes. */
const KTEXT_BASE = 0x80000180

/**
 * The Hint on a MIPS File the program does not use: the general one, and for a File that holds an
 * exception handler what to write to include it, with the handler's name when it has a global one.
 */
export function notLinkedMessage(text: string | undefined): string {
    const handler = text === undefined ? undefined : exceptionHandler(text)
    if (!handler) return NOT_LINKED_MESSAGE
    const include = handler.name
        ? `write \`SIM_LINK(${handler.name});\` in one of your C files, outside any function.`
        : 'give the handler a name with `.globl`, then write `SIM_LINK(that_name);` in one of your C files, outside any function.'
    return `${NOT_LINKED_MESSAGE} Its exception handler never runs. To include it, ${include}`
}

type Condition = {
    /** A `.if` of any kind, or a `.rept`, `.irp` or `.irpc`, whose body may run no time. */
    kind: 'if' | 'repeat'
    /** Whether the lines under it count: its own branch taken, and every condition around it. */
    active: boolean
    /** Whether a branch of it was taken already, which leaves out the `.else` and `.elseif`s. */
    taken: boolean
    /** Whether the condition around it is active. */
    outer: boolean
}

/** A name as GNU assembly writes one. */
const NAME = /^[A-Za-z_.$][\w.$]*$/
/** The data an instruction or directive puts in a section, which ends the run of labels at its start. */
const EMITTING =
    /^\.(?:word|half|hword|short|byte|dword|quad|2byte|4byte|8byte|ascii|asciiz|asciz|string|space|skip|zero|fill|float|single|double|incbin|gpword|gpdword|insn)$/i

/**
 * The exception handler a File's text holds, as a quick scan finds it: a `.ktext` the GNU
 * profile takes, written alone, with 0x80000180, or as `.section .ktext`, outside a macro's body
 * and a false `.if`; and the name of the label that starts it, when that label is `.globl`.
 * Undefined when there is none. It is no assembler: a condition it cannot work out, or an address
 * that is not a number, counts as one the assembler takes.
 */
export function exceptionHandler(text: string): { name?: string } | undefined {
    //most Files hold none, which is the most of what a check reads this for
    if (!/ktext/i.test(text)) return undefined
    const conditions: Condition[] = []
    const active = () => conditions.at(-1)?.active ?? true
    const constants = new Map<string, number>()
    const defined = new Set<string>()
    const globals = new Set<string>()
    let macroDepth = 0
    /** Set at the handler's `.ktext`: the labels that start it, until something else does. */
    let starting: string[] | undefined
    let found = false
    let startLabels: string[] = []

    const value = (expression: string): number | undefined => {
        let text = expression.trim()
        let negate = false
        let not = false
        while (/^[-!]/.test(text)) {
            if (text[0] === '-') negate = !negate
            else not = !not
            text = text.slice(1).trim()
        }
        let number: number | undefined
        if (/^0x[0-9a-f]+$/i.test(text)) number = parseInt(text.slice(2), 16)
        else if (/^0b[01]+$/i.test(text)) number = parseInt(text.slice(2), 2)
        else if (/^0[0-7]+$/.test(text)) number = parseInt(text.slice(1), 8)
        else if (/^\d+$/.test(text)) number = Number(text)
        else if (NAME.test(text)) number = constants.get(text)
        if (number === undefined) return undefined
        if (negate) number = -number
        return not ? Number(!number) : number
    }
    //a condition it cannot work out counts as true, as the File most likely means it
    const truth = (directive: string, operand: string): boolean => {
        const name = operand.trim()
        switch (directive) {
            case '.ifdef':
                return defined.has(name) || constants.has(name)
            case '.ifndef':
            case '.ifnotdef':
                return !(defined.has(name) || constants.has(name))
        }
        const number = value(operand)
        if (number === undefined) return true
        switch (directive) {
            case '.if':
            case '.ifne':
            case '.elseif':
                return number !== 0
            case '.ifeq':
                return number === 0
            case '.ifge':
                return number >= 0
            case '.ifgt':
                return number > 0
            case '.ifle':
                return number <= 0
            case '.iflt':
                return number < 0
            default:
                return true
        }
    }

    for (const statement of statements(text)) {
        let rest = statement
        //labels first, `name:` as many as there are
        const labels: string[] = []
        for (let label = /^([A-Za-z_.$][\w.$]*)\s*:(?!=)/.exec(rest); label;) {
            labels.push(label[1])
            rest = rest.slice(label[0].length).trim()
            label = /^([A-Za-z_.$][\w.$]*)\s*:(?!=)/.exec(rest)
        }
        const split = /^(\S+)\s*(.*)$/.exec(rest)
        const directive = split?.[1].toLowerCase() ?? ''
        const operands = split?.[2] ?? ''

        if (macroDepth > 0) {
            if (directive === '.macro') macroDepth++
            else if (directive === '.endm' || directive === '.endmacro') macroDepth--
            continue
        }
        if (directive.startsWith('.if')) {
            const outer = active()
            const taken = outer && truth(directive, operands)
            conditions.push({ kind: 'if', active: taken, taken, outer })
            continue
        }
        //a body repeated no time, `.rept 0`, holds nothing; any other, at least one copy
        if (directive === '.rept' || directive === '.irp' || directive === '.irpc') {
            const outer = active()
            const count = directive === '.rept' ? value(operands) : undefined
            const taken = outer && (count === undefined || count > 0)
            conditions.push({ kind: 'repeat', active: taken, taken, outer })
            continue
        }
        if (directive === '.endr') {
            if (conditions.at(-1)?.kind === 'repeat') conditions.pop()
            continue
        }
        if (directive === '.elseif' || directive === '.else') {
            const condition = conditions.at(-1)
            if (condition?.kind !== 'if') continue
            const now =
                condition.outer &&
                !condition.taken &&
                (directive === '.else' || truth('.elseif', operands))
            condition.active = now
            condition.taken ||= now
            continue
        }
        if (directive === '.endif') {
            if (conditions.at(-1)?.kind === 'if') conditions.pop()
            continue
        }
        if (!active()) continue
        if (directive === '.macro') {
            macroDepth = 1
            continue
        }

        for (const label of labels) defined.add(label)
        if (starting) starting.push(...labels)

        if (directive === '.globl' || directive === '.global') {
            for (const name of operands.split(','))
                if (NAME.test(name.trim())) globals.add(name.trim())
            continue
        }
        const assignment =
            /^\.(?:set|equ|equiv|eqv)$/.exec(directive) &&
            /^([A-Za-z_.$][\w.$]*)\s*,\s*(.+)$/.exec(operands)
        const equals = /^([A-Za-z_.$][\w.$]*)\s*=\s*(.+)$/.exec(rest)
        const constant = assignment || equals
        if (constant) {
            const number = value(constant[2])
            if (number !== undefined) constants.set(constant[1], number)
            defined.add(constant[1])
            continue
        }

        const ktext =
            (directive === '.ktext' && takesKtext(operands, value)) ||
            ((directive === '.section' || directive === '.pushsection') &&
                /^(?:\.ktext(?:\.[^\s,]*)?|"\.ktext(?:\.[^"]*)?")(?:\s*,|$)/.test(operands.trim()))
        if (ktext) {
            if (!found) {
                found = true
                starting = []
            }
            continue
        }
        if (!starting || directive === '') continue
        //a section switch, an instruction or data ends the labels at the handler's start
        const switches =
            /^\.(?:text|data|bss|rodata|rdata|sdata|sbss|kdata|section|pushsection|popsection|previous)$/.test(
                directive
            )
        if (switches || !directive.startsWith('.') || EMITTING.test(directive)) {
            startLabels = starting
            starting = undefined
        }
    }
    if (!found) return undefined
    if (starting) startLabels = starting
    const name = startLabels.find((label) => globals.has(label))
    return name ? { name } : {}
}

/**
 * Whether the GNU profile takes a `.ktext` with these operands: none, or the one address it places
 * `.ktext` at. An address this cannot work out is taken, as the assembler may find it is that one.
 */
function takesKtext(operands: string, value: (expression: string) => number | undefined): boolean {
    const written = operands.trim()
    if (!written) return true
    if (written.includes(',')) return false
    const address = value(written)
    return address === undefined || address >>> 0 === KTEXT_BASE
}

/**
 * The statements of a File's text, without comments: `#` to the end of a line and `/* … *\/`
 * across lines, outside a string, and `;`, which separates statements in GNU assembly.
 */
function statements(text: string): string[] {
    const found: string[] = []
    let comment = false
    for (const line of text.split(/\r?\n/)) {
        let current = ''
        let quote = false
        for (let index = 0; index < line.length; index++) {
            const character = line[index]
            if (comment) {
                if (character === '*' && line[index + 1] === '/') {
                    comment = false
                    index++
                }
                continue
            }
            if (!quote && character === '/' && line[index + 1] === '*') {
                comment = true
                index++
                continue
            }
            if (quote) {
                current += character
                if (character === '\\') current += line[++index] ?? ''
                else if (character === '"') quote = false
                continue
            }
            if (character === '#') break
            if (character === ';') {
                found.push(current.trim())
                current = ''
                continue
            }
            if (character === '"') quote = true
            current += character
        }
        found.push(current.trim())
    }
    return found.filter(Boolean)
}
