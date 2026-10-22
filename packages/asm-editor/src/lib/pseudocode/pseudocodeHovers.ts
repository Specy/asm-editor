import type { TokenKind } from '@specy/decompiler'
import { PSEUDOCODE_DOCUMENTATION } from '#lib/documentation/x86/executableSections.ts'

/**
 * What a hover says about the words of a Pseudocode that are Ghidra's own rather than the
 * program's ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md),
 * decisions 5 and 6): a number's value, the types it gives bytes it cannot type, and the names it
 * gives the variables it finds, each explained in a line or two with a link to the Documentation's
 * Pseudocode section. The names follow Ghidra's decompiler (`ScopeInternal::buildVariableName`
 * and `ScopeLocal::buildVariableName`): a type's letters, then where the variable lives.
 */

/**
 * The link every explanation ends with, at the page's own address: Monaco drops a hover's link
 * without a scheme. A Workbench opens it in its Documentation panel (`openDocumentationLink`).
 */
export const PSEUDOCODE_LINK = `[Reading the Pseudocode](${globalThis.location?.origin ?? ''}${PSEUDOCODE_DOCUMENTATION})`

/**
 * The value of a constant as the decompiler prints it: decimal or hexadecimal, maybe negative,
 * with any integer suffix, or a character (`'A'`, `'\n'`, `L'\x7f'`). Undefined for anything else,
 * such as a floating-point number or a string.
 */
export function constantValue(text: string): bigint | undefined {
    const number = /^(-)?(0[xX][\da-fA-F]+|\d+)[uUlL]*$/.exec(text)
    if (number) {
        const value = BigInt(number[2])
        return number[1] ? -value : value
    }
    const character = /^[LuU]?'(.+)'$/.exec(text)
    if (!character) return undefined
    const body = character[1]
    if (!body.startsWith('\\'))
        return [...body].length === 1 ? BigInt(body.codePointAt(0)!) : undefined
    const escape = /^\\(?:x([\da-fA-F]+)|([0-7]{1,3})|(.))$/.exec(body)
    if (!escape) return undefined
    if (escape[1]) return BigInt(`0x${escape[1]}`)
    if (escape[2]) return BigInt(`0o${escape[2]}`)
    const named = ESCAPES[escape[3]]
    return named === undefined ? undefined : BigInt(named)
}

const ESCAPES: Record<string, number> = {
    a: 7,
    b: 8,
    t: 9,
    n: 10,
    v: 11,
    f: 12,
    r: 13,
    '\\': 0x5c,
    "'": 0x27,
    '"': 0x22,
    '?': 0x3f
}

/**
 * What the letters before `Var`, `Stack` or `Ram` in a name say its type is: Ghidra writes the
 * first letter of the type's name, after `p` for a pointer to it or `a` for an array of it, so
 * `pcVar2` is a `char *` and `sVar1` may be a `size_t`.
 */
function typeOfLetters(letters: string): string | undefined {
    //Ghidra's `code` type starts with a c too, and is only ever pointed to
    if (letters === 'pc') return 'pointer to char, or to code (a function)'
    const [first, rest] = [letters[0], letters.slice(1)]
    if (first === undefined) return undefined
    if ((first === 'p' || first === 'a') && rest) {
        const inner = typeOfLetters(rest)
        return inner && `${first === 'p' ? 'pointer to' : 'array of'} ${inner}`
    }
    if (rest) return undefined
    return TYPE_LETTERS[first] ?? `a type whose name starts with ${first}`
}

const TYPE_LETTERS: Record<string, string> = {
    u: 'undefined, or unsigned (uint, ulong)',
    i: 'int',
    l: 'long',
    s: 'short, or size_t',
    c: 'char',
    b: 'bool or byte',
    f: 'float',
    d: 'double',
    w: 'wchar_t',
    v: 'void',
    p: 'pointer'
}

/** "`pc` stands for the type the decompiler gave it: pointer to char." */
function lettersSentence(letters: string): string {
    const type = typeOfLetters(letters)
    return type ? ` \`${letters}\` stands for the type the decompiler gave it: ${type}.` : ''
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth']

/**
 * How far from the stack pointer's value on entry a stack offset as Ghidra prints it in a name is,
 * as many hexadecimal digits as the stack's addresses have, so `ffffffe8` is 0x18 below.
 */
function stackOffset(digits: string): string {
    const value = BigInt(`0x${digits}`)
    const span = 1n << BigInt(digits.length * 4)
    return value >= span / 2n
        ? `0x${(span - value).toString(16)} bytes below`
        : `0x${value.toString(16)} bytes above`
}

/** One of Ghidra's types for bytes of no known type: `undefined` is one byte, `undefined8` eight. */
function typeMarkdown(word: string): string | undefined {
    const unknown = /^undefined([1-8])?$/.exec(word)
    if (unknown) {
        const size = Number(unknown[1] ?? 1)
        return `**${word}**: ${size === 1 ? 'one byte' : `${size} bytes`} whose type the decompiler could not work out. ${size === 1 ? 'It' : 'They'} may hold a number, a character, a pointer or part of something larger: how the code uses ${size === 1 ? 'it' : 'them'} is the clue.`
    }
    if (word === 'code')
        return "**code**: Ghidra's type for machine code. A `code *` is a pointer to a function, which the program calls through."
    return undefined
}

/** A name the decompiler gave a variable it found. */
function variableMarkdown(word: string): string | undefined {
    const parameter = /^param_(\d+)$/.exec(word)
    if (parameter) {
        const index = Number(parameter[1])
        const which = ORDINALS[index - 1] ?? `number ${index}`
        return `**${word}**: the function's ${which} parameter, named by its position. On x86-64 Linux the first six whole-number or pointer parameters arrive in \`rdi\`, \`rsi\`, \`rdx\`, \`rcx\`, \`r8\` and \`r9\`.`
    }
    const local = /^local_([\da-f]+)$/.exec(word)
    if (local)
        return `**${word}**: a variable in the function's stack frame, named by where it is: it starts 0x${local[1]} bytes below where the stack pointer was when the function was entered.`
    const stack = /^([a-zA-Z]*)Stack(X|Y)?_([\da-f]+)$/.exec(word)
    if (stack) {
        const [, letters, region, offset] = stack
        const where =
            region === 'X'
                ? `0x${offset} bytes above where the stack pointer was when the function was entered: past the return address, where a caller leaves arguments`
                : `0x${offset} bytes below where the stack pointer was when the function was entered`
        return `**${word}**: a variable the decompiler found in the stack frame and named by where it is: it starts ${where}.${lettersSentence(letters)}`
    }
    const numbered = /^([a-zA-Z]+)Var(\d+)$/.exec(word)
    if (numbered)
        return `**${word}**: a local variable the decompiler made for a value the code keeps in a register or works out along the way, numbered to tell it apart.${lettersSentence(numbered[1])}`
    const global = /^([a-zA-Z]+)Ram([\da-f]+)$/.exec(word)
    if (global)
        return `**${word}**: a global variable nothing names, named by the decompiler after its address, 0x${global[2].replace(/^0+(?=.)/, '')}.${lettersSentence(global[1])}`
    const stackAddress = /^stack0x([\da-f]+)$/.exec(word)
    if (stackAddress)
        return `**${word}**: the place on the stack ${stackOffset(stackAddress[1])} where the stack pointer was when the function was entered, which the code takes the address of, \`&${word}\`.`
    if (word === 'in_FS_OFFSET')
        return "**in_FS_OFFSET**: where the FS segment starts, which the function reads without being given it. x86-64 Linux keeps the running thread's data there, and `in_FS_OFFSET + 0x28` holds the stack canary: a random value the function checks before it returns, which a buffer overflow would have overwritten."
    const stackInput = /^in_stack_([\da-f]+)$/.exec(word)
    if (stackInput)
        return `**${word}**: a value the function reads from the stack, ${stackOffset(stackInput[1])} where the stack pointer was when it was entered, though its prototype lists no such parameter: \`in_\` and where the value is.`
    const input = /^in_(.+)$/.exec(word)
    if (input)
        return `**${word}**: a value the function reads from \`${input[1]}\` before writing it, though its prototype lists no such parameter: \`in_\` and where the value comes from.`
    if (word === 'unaff_retaddr')
        return '**unaff_retaddr**: the return address the call left on the stack, which says where the function returns to. `unaff_` marks a value the function finds as its caller left it.'
    const unaffected = /^unaff_(.+)$/.exec(word)
    if (unaffected)
        return `**${word}**: the value \`${unaffected[1]}\` had when the function was called, which it uses before setting it. A function must leave this register as it found it (callee-saved), so the decompiler calls the value unaffected.`
    const extra = /^extraout_(.+)$/.exec(word)
    if (extra)
        return extra[1] === 'var'
            ? `**${word}**: a value a call left behind that the called function's prototype does not say it returns: an extra output.`
            : `**${word}**: a value a call left in \`${extra[1]}\` that the called function's prototype does not say it returns: an extra output.`
    return undefined
}

/**
 * The hover of one of Ghidra's own words, with the link to the Documentation: an `undefined`
 * type, or a variable named the decompiler's way. Undefined for any other word, the program's own
 * names included: a C++ name qualified by its namespaces (`std::`, `game::in_range`, the part of
 * one the printer broke onto two lines) is never Ghidra's, whatever its last part looks like.
 */
export function ghidraWordMarkdown(word: string, kind: TokenKind): string | undefined {
    if (word.includes('::')) return undefined
    const explained =
        kind === 'type'
            ? typeMarkdown(word)
            : kind === 'variable'
              ? variableMarkdown(word)
              : undefined
    return explained && `${explained}\n\n${PSEUDOCODE_LINK}`
}
