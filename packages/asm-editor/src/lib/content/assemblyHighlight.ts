import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { X86_ASSEMBLER_REGISTERS } from '#lib/languages/X86/generated/x86Tokens.ts'
import { X86Directives, X86Prefixes, X86SizeSpecifiers } from '#lib/languages/X86/X86-keywords.ts'

/**
 * The assembly highlighter for code blocks: a page's assembly fences, an instruction's examples,
 * and the block a prerendered lecture carries in place of a playground, before the client swaps the
 * embed in ([the code blocks](./codeBlocks.ts)).
 *
 * Monaco does the real highlighting once the editor is there, but it cannot run here: it is the
 * editor being replaced, and it loads asynchronously, while these blocks are built synchronously,
 * in the server render as in the browser. Its assembly grammars run on its tokenizer, so using them
 * would move the editor onto the critical path of every lecture to colour a block that is about to
 * be thrown away; this reads the structure instead of the language: what a line is made of, not
 * which mnemonics an architecture has. C and C++ have a highlighter of their own beside this one
 * (`./cppHighlight.ts`), which follows Monaco's one grammar for both; a fence in any other language
 * is plain, or coloured by Monaco where a host asks for it.
 *
 * That is enough for the six languages, because they differ mostly in what a comment starts with
 * and what a `$` means. The word lists it does keep are each language's registers, since every
 * assembly listing on a page is coloured by it, and an operand reads as a register or as a name;
 * the directives the languages spell like instructions (`section`, `equ`, `dc.w`); x86's size
 * keywords and prefixes; the Z80's conditions; RISC-V's CSRs; and the M68K words s68k refuses.
 * Those are rules rather than imports where the lists the editor and the Cores define come with the
 * Cores themselves, an emulator too many for a lecture page, so the tests hold the rules to them.
 * Anything it is unsure of stays plain.
 *
 * Plain TypeScript, no runes and no DOM, so the renderer builds the spans and a test can read the
 * tokens directly.
 */

export type AssemblyTokenKind =
    | 'comment'
    | 'string'
    | 'label'
    | 'directive'
    | 'mnemonic'
    | 'register'
    | 'condition'
    | 'keyword'
    | 'size'
    | 'number'
    | 'immediate'
    | 'bracket'
    | 'invalid'
    | 'plain'

export type AssemblyToken = {
    kind: AssemblyTokenKind
    text: string
    /**
     * How deeply a bracket is nested, counted across the whole program as the editor counts it,
     * from 0; none for a closing bracket that closes nothing open.
     */
    level?: number
}

type Syntax = {
    /** What starts a comment that runs to the end of the line. */
    lineComment: string[]
    /** `*` in the first column, which the M68K assemblers read as a whole-line comment. */
    starComment: boolean
    /**
     * Whether `$` introduces a hex literal, as it does for the two 8/16-bit-era assemblers, or
     * belongs to a name, as MIPS's `$t0` does.
     */
    dollarIsHex: boolean
    /** Whether `%` introduces a binary literal, as M68K's `%1010` does. */
    percentIsBinary: boolean
    /** Whether an operand, lower-cased, names a register, as the editor colours one. */
    isRegister: (name: string) => boolean
    /** Whether a name with a leading dot is a directive (`.text`) or, as in x86, just a name. */
    dotDirectives: boolean
    /**
     * The directives, lower-cased, written like instructions without a dot (`equ`, x86's `db`), or
     * with a `#` (the Z80's `#include`). An M68K directive's size suffix is not part of its name.
     */
    directives?: ReadonlySet<string>
    /**
     * Whether a directive is one among an instruction's operands too, as x86's editor colours
     * `times 4 db 0`; the others read a label spelled like one there as a name (`bra end`).
     */
    operandDirectives: boolean
    /** Operand words that size or place an operand: x86's `byte`, `rel`. */
    sizes?: ReadonlySet<string>
    /** Whether a name carries a size suffix coloured apart from it, as the M68K's `move.l` does. */
    sizeSuffixes: boolean
    /** The operators that take half of an address, MIPS and RISC-V's `%hi(msg)`. */
    relocations?: RegExp
    /** The CSRs, which are registers among the operands of the instructions that name one. */
    csrs?: ReadonlySet<string>
    /** Whether a number with a colon is a label, as RISC-V's local `1:` is. */
    numericLabels: boolean
    /**
     * Whether a name in the first column is a label, colon or not, as the M68K and Z80 assemblers
     * read one: `loop dbra d0, loop`. Only when another word follows that is not a register, since
     * an unindented `rts` is still the instruction.
     */
    columnLabels: boolean
    /**
     * Whether a directive's name in the first column is the directive all the same, as s68k reads
     * `opt p=68020` there, rather than a label for the word after it.
     */
    columnDirectives?: boolean
    /**
     * The words a directive takes as options of its own rather than operands, coloured as the
     * editor colours them: the M68K's `opt p=68020,bit`.
     */
    options?: { directive: string; words: RegExp }
    /** The instructions and directives the assembler knows but refuses, the M68K's `macro`. */
    refused?: ReadonlySet<string>
    /** The bracket pairs the editor colours by how deeply they nest, each opener before its closer. */
    brackets: string
    /** What opens a string or character, and which of those read a backslash as an escape. */
    quotes: string
    escapingQuotes: string
    /** What can stand before the instruction on its line: x86's `rep movsb`. */
    prefixes?: ReadonlySet<string>
    /** The conditions a jump, call or return takes as its first operand, as the Z80's do. */
    conditions?: { after: ReadonlySet<string>; names: ReadonlySet<string> }
    /** Whether `1.5` is one number, as the editors of the languages with float directives read it. */
    decimalFractions: boolean
    /** Whether `#` is a token of its own, the M68K's immediate marker, rather than the literal's. */
    immediates: boolean
}

/** `0`..`31`, the register numbers of the two RISC architectures. */
const UPTO_31 = '(?:[12]?[0-9]|3[01])'

/** The integer and floating-point registers by number and by ABI name, `fp` (`s0`) and `pc` included. */
const RISCV_REGISTER = new RegExp(
    `^(?:x${UPTO_31}|f${UPTO_31}|zero|ra|sp|gp|tp|fp|pc|t[0-6]|a[0-7]|s(?:[0-9]|1[01])|ft(?:[0-9]|1[01])|fa[0-7]|fs(?:[0-9]|1[01]))$`
)

/**
 * The data and address registers and the special ones, the 68010's control registers among them, a
 * size suffix (`d0.w`) included.
 */
const M68K_REGISTER = /^(?:[da][0-7]|sp|pc|sr|ccr|usp|sfc|dfc|vbr)(?:\.[bwl])?$/

/**
 * The 8 and 16-bit registers, the undocumented halves of the index registers, and the alternate
 * set with its apostrophe (`af'`), as the Z80 Core names them.
 */
const Z80_REGISTERS = new Set([
    ...['a', 'f', 'b', 'c', 'd', 'e', 'h', 'l', 'i', 'r'],
    ...['af', 'bc', 'de', 'hl', 'ix', 'iy', 'sp', 'pc'],
    ...['ixh', 'ixl', 'iyh', 'iyl'],
    ...["af'", "bc'", "de'", "hl'"]
])

/** s68k's directives; `dc.w` is `dc` sized. */
const M68K_DIRECTIVES = new Set([
    ...['dc', 'dcb', 'ds', 'end', 'equ', 'fail', 'incbin', 'include', 'list', 'memory'],
    ...['nolist', 'offset', 'opt', 'org', 'page', 'reg', 'section', 'set', 'simhalt']
])

/** The Z80's directives without a dot (those with one read by it), and those spelled with `#`. */
const Z80_DIRECTIVES = new Set([
    ...['error', 'defb', 'db', 'defm', 'dm', 'defw', 'dw', 'equ', 'defl', 'org', 'align'],
    ...['defs', 'ds', 'data', 'dc', 'macro', 'endm', 'if', 'cond', 'else', 'endif', 'endc'],
    ...['end', '#target', '#code', '#include', '#local', '#endlocal', '#insert']
])

/** RARS's CSRs, which `csrr t0, fcsr` names among its operands. */
const RISCV_CSRS = new Set([
    ...['ustatus', 'fflags', 'frm', 'fcsr', 'uie', 'utvec', 'uscratch', 'uepc', 'ucause'],
    ...['utval', 'uip', 'cycle', 'time', 'instret', 'cycleh', 'timeh', 'instreth']
])

/**
 * The 68020's instructions s68k does not implement yet, and the directives of other assemblers it
 * refuses. The 68010's are all implemented, and are instructions like any other.
 */
const M68K_REFUSED = new Set([
    ...['macro', 'endm', 'mexit', 'ifeq', 'ifne', 'iflt'],
    ...['ifle', 'ifgt', 'ifge', 'ifc', 'ifnc', 'ifarg', 'endc', 'if', 'else', 'endi', 'while'],
    ...['endw', 'for', 'endf', 'repeat', 'until', 'dbloop', 'unless'],
    ...['chk2', 'cmp2', 'cas', 'cas2', 'pack', 'unpk'],
    ...['divsl', 'divul', 'callm', 'rtm', 'bftst', 'bfextu', 'bfchg', 'bfexts', 'bfclr'],
    ...['bfffo', 'bfset', 'bfins'],
    //`trap<cc>`: the 68020's conditional trap, on each condition and `t` and `f`
    ...['t', 'f', 'hi', 'ls', 'cc', 'hs', 'cs', 'lo', 'ne', 'eq'].map((c) => `trap${c}`),
    ...['vc', 'vs', 'pl', 'mi', 'ge', 'lt', 'gt', 'le'].map((c) => `trap${c}`)
])

/** What `opt` takes: `p=` and the processor, `bit`, and the listing options, `no` or not. */
const M68K_OPT_OPTIONS = /^(?:p|bit|(?:no)?(?:cre|mex|sex|war|cex))$/i

/** `jr c, loop` takes the carry condition, where `c` is otherwise a register. */
const Z80_CONDITIONS = {
    after: new Set(['jp', 'jr', 'call', 'ret']),
    //`nv` and `v` are the overflow spellings of `po` and `pe`
    names: new Set(['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm', 'nv', 'v'])
}

const X86_REGISTERS = new Set(X86_ASSEMBLER_REGISTERS)
const lowerCased = (words: readonly string[]) => new Set(words.map((word) => word.toLowerCase()))
const X86_DIRECTIVES = lowerCased(X86Directives)
const X86_SIZES = lowerCased(X86SizeSpecifiers)
const X86_PREFIXES = lowerCased([...X86Prefixes, 'times'])

/** MIPS spells every register with a `$`, by number or by name: `$8`, `$t0`, `$f2`. */
const isMipsRegister = (name: string) => name.startsWith('$')

/** RV32 and RV64 read alike. */
const RISCV_SYNTAX: Syntax = {
    lineComment: ['#'],
    starComment: false,
    dollarIsHex: false,
    percentIsBinary: false,
    isRegister: (name) => RISCV_REGISTER.test(name),
    dotDirectives: true,
    operandDirectives: false,
    sizeSuffixes: false,
    relocations: /^%(?:pcrel_hi|pcrel_lo|hi|lo)$/i,
    csrs: RISCV_CSRS,
    numericLabels: true,
    columnLabels: false,
    brackets: '()',
    quotes: `"'`,
    escapingQuotes: `"'`,
    decimalFractions: true,
    immediates: false
}

const SYNTAX: Record<AvailableLanguages, Syntax> = {
    M68K: {
        lineComment: [';'],
        starComment: true,
        dollarIsHex: true,
        percentIsBinary: true,
        isRegister: (name) => M68K_REGISTER.test(name),
        //s68k's directives have no dot: `.loop` is a local label
        dotDirectives: false,
        operandDirectives: false,
        directives: M68K_DIRECTIVES,
        sizeSuffixes: true,
        numericLabels: false,
        columnLabels: true,
        columnDirectives: true,
        options: { directive: 'opt', words: M68K_OPT_OPTIONS },
        refused: M68K_REFUSED,
        brackets: '()',
        quotes: `"'`,
        escapingQuotes: `"'`,
        decimalFractions: false,
        immediates: true
    },
    Z80: {
        lineComment: [';'],
        starComment: false,
        dollarIsHex: true,
        percentIsBinary: false,
        isRegister: (name) => Z80_REGISTERS.has(name),
        dotDirectives: true,
        operandDirectives: false,
        directives: Z80_DIRECTIVES,
        conditions: Z80_CONDITIONS,
        sizeSuffixes: false,
        numericLabels: false,
        columnLabels: true,
        brackets: '()[]',
        quotes: `"'`,
        escapingQuotes: `"'`,
        decimalFractions: false,
        immediates: false
    },
    X86: {
        lineComment: [';'],
        starComment: false,
        dollarIsHex: false,
        percentIsBinary: false,
        isRegister: (name) => X86_REGISTERS.has(name),
        //`.data` names a section and `.done` a local label: NASM's directives have no dot
        dotDirectives: false,
        operandDirectives: true,
        directives: X86_DIRECTIVES,
        sizes: X86_SIZES,
        prefixes: X86_PREFIXES,
        sizeSuffixes: false,
        numericLabels: false,
        columnLabels: false,
        brackets: '()[]{}',
        //NASM reads escapes in a backquoted string only: `"C:\"` is a string ending in a backslash
        quotes: '"\'`',
        escapingQuotes: '`',
        decimalFractions: true,
        immediates: false
    },
    MIPS: {
        lineComment: ['#'],
        starComment: false,
        dollarIsHex: false,
        percentIsBinary: false,
        isRegister: isMipsRegister,
        dotDirectives: true,
        operandDirectives: false,
        sizeSuffixes: false,
        relocations: /^%(?:hi|lo)$/i,
        numericLabels: false,
        columnLabels: false,
        brackets: '()',
        quotes: `"'`,
        escapingQuotes: `"'`,
        decimalFractions: true,
        immediates: false
    },
    'RISC-V': RISCV_SYNTAX,
    'RISC-V-64': RISCV_SYNTAX
}

const isDigit = (c: string) => c >= '0' && c <= '9'
const isHex = (c: string) => isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
const isNameStart = (c: string) => /[A-Za-z_]/.test(c)
const isNameBody = (c: string) => /[A-Za-z0-9_.]/.test(c)

/**
 * What turns the name before it into a label rather than an instruction. `count equ 12` names a
 * constant, and all six assemblers spell that as a bare name followed by one of these, with no
 * colon to give it away. It is the one shape the positional rule below reads backwards, and the
 * courses open with hundreds of them.
 */
const ASSIGNMENT = /^[ \t]*(equ|eqv|set|=)\b/i

/** Whether a name, lower-cased, is one of the language's directives, sized or not (`dc.w`). */
function isDirective(name: string, syntax: Syntax): boolean {
    const directives = syntax.directives
    return !!directives && (directives.has(name) || directives.has(name.replace(/\.[bwls]$/, '')))
}

/** What a name in operand position is, `name` lower-cased. */
function operandKind(
    name: string,
    syntax: Syntax,
    mnemonic: string,
    operands: number
): AssemblyTokenKind {
    const conditions = syntax.conditions
    if (operands === 0 && conditions?.after.has(mnemonic) && conditions.names.has(name)) {
        return 'condition'
    }
    if (syntax.operandDirectives && isDirective(name, syntax)) return 'directive'
    if (syntax.sizes?.has(name)) return 'size'
    if (mnemonic === syntax.options?.directive && syntax.options.words.test(name)) return 'size'
    if (syntax.csrs?.has(name) && mnemonic.startsWith('csr')) return 'register'
    return syntax.isRegister(name) ? 'register' : 'plain'
}

/**
 * The tokens of one line. Statement position decides what a name is: the first one is the
 * instruction unless it is a label, in which case the one after it is. A name after it is a
 * register if the language has one by that name; everything else that is not a comment, a string,
 * a name or a number - separators, symbols, the rest of the operands - stays plain.
 */
function tokenizeLine(line: string, syntax: Syntax): AssemblyToken[] {
    const tokens: AssemblyToken[] = []
    //`*` is only a comment where the M68K assemblers read one: the very start of a line
    if (syntax.starComment && line.startsWith('*')) return [{ kind: 'comment', text: line }]

    let cursor = 0
    let seenInstruction = false
    //the instruction, lower-cased, and how many operands it has had so far: a Z80 condition is
    //only one as the first operand of a jump, a call or a return
    let mnemonic = ''
    let operands = 0
    const push = (kind: AssemblyTokenKind, text: string) => {
        if (text.length === 0) return
        const last = tokens[tokens.length - 1]
        if (last?.kind === kind && kind === 'plain') last.text += text
        else tokens.push({ kind, text })
    }
    //the colon is punctuation, left out of the label as the editors leave it out
    const pushLabel = (name: string) => {
        push('label', name)
        push('plain', ':')
    }
    //an M68K size suffix is coloured apart from the name it sizes: `move` `.l`, `d0` `.w`
    const pushSized = (kind: AssemblyTokenKind, name: string) => {
        const suffix = syntax.sizeSuffixes ? /\.[bwls]$/i.exec(name) : null
        if (!suffix || suffix.index === 0) return push(kind, name)
        push(kind, name.slice(0, suffix.index))
        push('size', suffix[0])
    }

    while (cursor < line.length) {
        const char = line[cursor]

        if (syntax.lineComment.includes(char)) {
            push('comment', line.slice(cursor))
            break
        }

        if (syntax.quotes.includes(char)) {
            const escapes = syntax.escapingQuotes.includes(char)
            let end = cursor + 1
            while (end < line.length && line[end] !== char) {
                //a backslash takes the character after it with it, so an escaped quote does not
                //close the string
                end += escapes && line[end] === '\\' ? 2 : 1
            }
            //an unterminated string runs to the end of the line rather than swallowing the next one
            const close = Math.min(end + 1, line.length)
            push('string', line.slice(cursor, close))
            cursor = close
            continue
        }

        //a directive carries its dot: `.text`, `.globl`. A mnemonic's own dot does not start one,
        //because `move.l` begins with a letter
        if (char === '.' && cursor + 1 < line.length && isNameStart(line[cursor + 1])) {
            let end = cursor + 1
            while (end < line.length && isNameBody(line[end])) end += 1
            const name = line.slice(cursor, end)
            //a local label carries one too: `.loop:`, `.L2:`
            if (line[end] === ':') {
                pushLabel(name)
                cursor = end + 1
                continue
            }
            //the size an M68K address or expression is taken at: `($1000).w`
            if (syntax.sizeSuffixes && /^\.[bwls]$/i.test(name)) {
                push('size', name)
                cursor = end
                continue
            }
            push(syntax.dotDirectives ? 'directive' : 'plain', name)
            //a statement that opens with a directive has no instruction, so the names after it are
            //its operands: `.eqv COUNT 12` names a constant, it does not call `COUNT`
            seenInstruction = true
            cursor = end
            continue
        }

        if (isNameStart(char) || (char === '$' && !syntax.dollarIsHex)) {
            let end = cursor + 1
            while (end < line.length && isNameBody(line[end])) end += 1
            //the Z80's alternate registers carry an apostrophe, which would otherwise open a string
            //that runs to the end of the line: `ex af, af'`
            if (line[end] === "'" && syntax.isRegister(line.slice(cursor, end + 1).toLowerCase())) {
                end += 1
            }
            const name = line.slice(cursor, end)
            if (line[end] === ':') {
                pushLabel(name)
                cursor = end + 1
                continue
            }
            if (!seenInstruction && char !== '$') {
                const lower = name.toLowerCase()
                //the name being assigned to is a label; the word doing the assigning reads as the
                //operation of the line, which is what it is. So is a name a directive follows,
                //`msg db "hi"`, where the editor reads one: in the first column, or anywhere in
                //x86, whose editor knows its directives among the operands too
                const following = /^[ \t]+([#.A-Za-z_][\w.]*)/.exec(line.slice(end))?.[1]
                const named =
                    following !== undefined &&
                    (cursor === 0 || syntax.operandDirectives) &&
                    isDirective(following.toLowerCase(), syntax)
                const columnLabel =
                    syntax.columnLabels &&
                    cursor === 0 &&
                    following !== undefined &&
                    !syntax.isRegister(following.toLowerCase()) &&
                    !(syntax.columnDirectives && isDirective(lower, syntax))
                if (named || columnLabel || ASSIGNMENT.test(line.slice(end))) push('label', name)
                //a prefix leaves the instruction it stands before still to come: `rep movsb`, and
                //so does x86's `times`, which repeats what follows its count: `times 4 db 0`
                else if (syntax.prefixes?.has(lower)) {
                    push(isDirective(lower, syntax) ? 'directive' : 'mnemonic', name)
                } else {
                    seenInstruction = true
                    mnemonic = lower
                    const refused = syntax.refused?.has(lower.replace(/\.[bwls]$/, ''))
                    pushSized(
                        refused ? 'invalid' : isDirective(lower, syntax) ? 'directive' : 'mnemonic',
                        name
                    )
                }
            } else {
                pushSized(operandKind(name.toLowerCase(), syntax, mnemonic, operands), name)
                operands += 1
            }
            cursor = end
            continue
        }

        if (char === '#') {
            //the M68K editor colours its immediate marker apart from what follows it: `#$FF`, `#count`
            if (syntax.immediates) {
                push('immediate', '#')
                cursor += 1
                continue
            }
        }

        //a word with a sigil: the Z80's `#include` and x86's `%define` directives, and the operators
        //that take half of an address, `%hi(msg)`
        if ((char === '#' || char === '%') && isNameStart(line[cursor + 1] ?? '')) {
            let end = cursor + 1
            while (end < line.length && isNameBody(line[end])) end += 1
            const word = line.slice(cursor, end)
            if (syntax.directives?.has(word.toLowerCase())) {
                push('directive', word)
                seenInstruction = true
                cursor = end
                continue
            }
            if (syntax.relocations?.test(word)) {
                push('keyword', word)
                cursor = end
                continue
            }
        }

        //RISC-V's local labels are numbers: `1:`, which `1b` and `1f` refer to
        if (syntax.numericLabels && !seenInstruction && isDigit(char)) {
            let end = cursor
            while (end < line.length && isDigit(line[end])) end += 1
            if (line[end] === ':') {
                pushLabel(line.slice(cursor, end))
                cursor = end + 1
                continue
            }
        }

        //elsewhere `#` is the immediate marker where it is not a comment, and it reads as part of
        //the literal it introduces: `#10`
        const numberStart = char === '#' ? cursor + 1 : cursor
        const lead = line[numberStart]
        const isNumber =
            (lead !== undefined && isDigit(lead)) ||
            (lead === '$' && syntax.dollarIsHex && isHex(line[numberStart + 1] ?? '')) ||
            (lead === '%' && syntax.percentIsBinary && /[01]/.test(line[numberStart + 1] ?? ''))
        if (isNumber) {
            let end = numberStart + (isDigit(lead) ? 0 : 1)
            //`0x`/`0b` prefixes, a Z80 `0FFh` suffix and plain digits all read as one run
            if (line[end] === '0' && /[xXbB]/.test(line[end + 1] ?? '')) end += 2
            while (end < line.length && (isHex(line[end]) || line[end] === '_')) end += 1
            if (syntax.decimalFractions && line[end] === '.' && isDigit(line[end + 1] ?? '')) {
                end += 1
                while (end < line.length && (isHex(line[end]) || line[end] === '_')) end += 1
            }
            if (/[hH]/.test(line[end] ?? '') && !isNameBody(line[end + 1] ?? '')) end += 1
            push('number', line.slice(cursor, end))
            if (seenInstruction) operands += 1
            cursor = end
            continue
        }

        push(syntax.brackets.includes(char) ? 'bracket' : 'plain', char)
        cursor += 1
    }
    return tokens
}

/**
 * Each bracket's nesting level, counted through the whole program the way the editor counts it: an
 * opener takes the depth it opens at and its closer the same, and a closer that does not close the
 * innermost open bracket is unexpected and gets none.
 */
function levelBrackets(lines: AssemblyToken[][], syntax: Syntax): AssemblyToken[][] {
    const open: string[] = []
    for (const token of lines.flat()) {
        if (token.kind !== 'bracket') continue
        const at = syntax.brackets.indexOf(token.text)
        if (at % 2 === 0) {
            token.level = open.length
            open.push(syntax.brackets[at + 1])
        } else if (open[open.length - 1] === token.text) {
            open.pop()
            token.level = open.length
        }
    }
    return lines
}

/**
 * The tokens of a whole program, one array per line, with the newlines left out: the renderer puts
 * them back between the lines it builds. A language the highlighter has no syntax for renders
 * plain, which is what it did before there was one.
 */
export function tokenizeAssembly(code: string, language: AvailableLanguages): AssemblyToken[][] {
    const syntax = SYNTAX[language]
    if (!syntax) return code.split('\n').map((line) => [{ kind: 'plain' as const, text: line }])
    return levelBrackets(
        code.split('\n').map((line) => tokenizeLine(line, syntax)),
        syntax
    )
}
