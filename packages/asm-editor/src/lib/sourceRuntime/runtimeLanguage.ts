import type monaco from 'monaco-editor'
import { languageSession } from '#lib/languages/service/sessionRegistry.ts'
import { parseProjectSourceUri } from '#lib/languages/service/uri.ts'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import {
    loadedRuntimeFunctions,
    loadedRuntimeLibrary,
    loadRuntimeFunctions,
    type RuntimeFunction
} from './runtimeLibrary'

/**
 * The Runtime library functions an editor model can call: those of the ABI its Build links, or
 * none when the Build links no library (hand-written assembly with the Setting off). The list loads
 * on first use; until it arrives the model offers none, and the next request has them.
 */
export function runtimeFunctionsForModel(
    model: monaco.editor.ITextModel
): readonly RuntimeFunction[] {
    const identity = model.uri ? parseProjectSourceUri(model.uri) : null
    if (!identity) return []
    const sources = languageSession(identity.sessionId)?.sourcesFor(
        identity.sourceKind,
        identity.sourceKind === 'build' ? identity.buildGeneration : undefined
    )
    const abi = sources?.runtimeAbi
    if (!abi) return []
    const list = loadedRuntimeFunctions(abi)
    if (!list) {
        void loadRuntimeFunctions(abi)
        return []
    }
    return list.functions
}

/**
 * Where a library function is defined, for go to definition from `call printf`: its member and the
 * line of its label there, when the library the model's Build links is loaded.
 */
export function runtimeDefinition(
    abi: string | undefined,
    language: AvailableLanguages,
    name: string
): { path: string; line: number } | undefined {
    if (!abi) return undefined
    const library = loadedRuntimeLibrary(abi, language)
    const path = library?.index[name]
    if (!library || !path) return undefined
    const lines = library.members[path].split('\n')
    const line = lines.findIndex((text) => text.startsWith(`${name}:`))
    return { path, line: Math.max(0, line) }
}

/** The parameters of a prototype, split at top-level commas. */
function parameters(prototype: string): { returns: string; name: string; params: string[] } | null {
    const match = /^(.*?)\b([A-Za-z_]\w*)\s*\((.*)\)\s*$/.exec(prototype.trim())
    if (!match) return null
    const params: string[] = []
    let depth = 0,
        current = ''
    for (const character of match[3]) {
        if (character === '(') depth++
        if (character === ')') depth--
        if (character === ',' && depth === 0) {
            params.push(current.trim())
            current = ''
        } else current += character
    }
    if (current.trim() && current.trim() !== 'void') params.push(current.trim())
    return { returns: match[1].trim(), name: match[2], params }
}

const isFloating = (type: string) => /\b(?:float|double)\b/.test(type) && !type.includes('*')

/** Whether a type is a 64-bit integer, which the library's `time.h` makes `time_t` too. */
const isWideInteger = (type: string) =>
    /\b(?:long long|int64_t|uint64_t|intmax_t|uintmax_t|time_t)\b/.test(type) && !type.includes('*')

/** What a parameter is called in the prototype, or its type when it has no name. */
function parameterLabel(param: string): string {
    const name = /([A-Za-z_]\w*)\s*(?:\[\s*\])?$/.exec(param)?.[1]
    const keywords = [
        'int',
        'char',
        'long',
        'short',
        'double',
        'float',
        'unsigned',
        'signed',
        'void',
        'size_t'
    ]
    return name && !keywords.includes(name) && param.trim() !== name ? name : param.trim()
}

/**
 * Where a RISC-V program puts a call's arguments and finds its result, read from the prototype
 * with the ILP32D/LP64D conventions the library is compiled for: integers and pointers in a0-a7,
 * floating point in fa0-fa7, variadic arguments in the next integer registers, the result in a0 or
 * fa0. On RV32 a 64-bit integer takes the next two registers, low word first and with no even
 * register to start at, its low word in a7 and its high word on the stack when a7 is the last, and
 * comes back in a0:a1. A summary for completion and hover, not a full ABI: structs passed by value
 * are not modelled.
 */
export function riscvCallingConvention(prototype: string, xlen: 32 | 64 = 32): string {
    const parsed = parameters(prototype)
    if (!parsed) return ''
    const pair = (type: string) => xlen === 32 && isWideInteger(type)
    let integer = 0,
        floating = 0
    const placed: string[] = []
    for (const param of parsed.params) {
        if (param === '...') {
            placed.push(`the remaining arguments → a${integer}…a7, then the stack`)
            break
        }
        const label = parameterLabel(param)
        if (isFloating(param) && floating < 8) placed.push(`${label} → fa${floating++}`)
        else if (pair(param) && integer < 8) {
            placed.push(
                `${label} → ${integer < 7 ? `a${integer}:a${integer + 1}` : 'a7 and the stack'}`
            )
            integer += 2
        } else if (integer < 8) placed.push(`${label} → a${integer++}`)
        else placed.push(`${label} → stack`)
    }
    const result =
        parsed.returns === 'void' ||
        /\bvoid\s*$/.test(parsed.returns) ||
        parsed.returns.endsWith('_Noreturn')
            ? 'returns nothing'
            : `returns ${parsed.returns} in ${
                  isFloating(parsed.returns) ? 'fa0' : pair(parsed.returns) ? 'a0:a1' : 'a0'
              }`
    return [...placed, result].join('; ')
}

/** The size in 32-bit words of a parameter or result in the MIPS O32 ABI. */
const o32Words = (type: string) =>
    isWideInteger(type) || (/\bdouble\b/.test(type) && !type.includes('*')) ? 2 : 1

/**
 * The same summary for MIPS's O32 convention: the first four argument words in $a0-$a3, a 64-bit
 * value in an aligned pair, floating point leading arguments in $f12 and $f14, everything after the
 * fourth word on the stack (whose first 16 bytes the caller reserves), the result in $v0 ($v0 and
 * $v1 for 64 bits) or $f0.
 */
export function mipsCallingConvention(prototype: string): string {
    const parsed = parameters(prototype)
    if (!parsed) return ''
    let word = 0
    let floating = 0
    let leadingFloats = true
    const placed: string[] = []
    for (const param of parsed.params) {
        if (param === '...') {
            placed.push(
                word < 4
                    ? `the remaining arguments → $a${word}…$a3, then the stack`
                    : 'the remaining arguments → the stack'
            )
            break
        }
        const words = o32Words(param)
        if (words === 2 && word % 2 === 1) word++
        if (isFloating(param) && leadingFloats && floating < 2) {
            placed.push(`${parameterLabel(param)} → $f${12 + 2 * floating++}`)
        } else {
            leadingFloats = false
            placed.push(
                word + words <= 4
                    ? `${parameterLabel(param)} → ${
                          words === 2 ? `$a${word}:$a${word + 1}` : `$a${word}`
                      }`
                    : `${parameterLabel(param)} → stack`
            )
        }
        word += words
    }
    const result =
        parsed.returns === 'void' || /\bvoid\s*$/.test(parsed.returns)
            ? 'returns nothing'
            : `returns ${parsed.returns} in ${
                  isFloating(parsed.returns)
                      ? '$f0'
                      : o32Words(parsed.returns) === 2
                        ? '$v0:$v1'
                        : '$v0'
              }`
    return [...placed, result].join('; ')
}

const X86_INTEGER_ARGUMENTS = ['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9']

/**
 * The same summary for x86-64's System V convention: integers and pointers in rdi, rsi, rdx, rcx,
 * r8 and r9, floating point in xmm0-xmm7, each sequence assigned independently, the rest on the
 * stack; a variadic call also sets al to the number of xmm registers it fills. The result is in
 * rax, or xmm0, and a 16-byte quotient and remainder pair (`ldiv_t`) comes back in rax and rdx.
 */
export function x86CallingConvention(prototype: string): string {
    const parsed = parameters(prototype)
    if (!parsed) return ''
    let integer = 0,
        floating = 0
    const placed: string[] = []
    for (const param of parsed.params) {
        if (param === '...') {
            placed.push(
                'the remaining arguments → the next free integer or xmm registers, then the stack; al = how many xmm registers hold arguments'
            )
            break
        }
        if (isFloating(param) && floating < 8)
            placed.push(`${parameterLabel(param)} → xmm${floating++}`)
        else if (!isFloating(param) && integer < X86_INTEGER_ARGUMENTS.length)
            placed.push(`${parameterLabel(param)} → ${X86_INTEGER_ARGUMENTS[integer++]}`)
        else placed.push(`${parameterLabel(param)} → stack`)
    }
    const result =
        parsed.returns === 'void' ||
        /\bvoid\s*$/.test(parsed.returns) ||
        parsed.returns.endsWith('_Noreturn')
            ? 'returns nothing'
            : `returns ${parsed.returns} in ${
                  isFloating(parsed.returns)
                      ? 'xmm0'
                      : /^(?:ldiv_t|lldiv_t|imaxdiv_t)$/.test(parsed.returns)
                        ? 'rax:rdx'
                        : 'rax'
              }`
    return [...placed, result].join('; ')
}

/** Where a call's arguments go on a Target, from the prototype. */
export function callingConvention(prototype: string, language: AvailableLanguages): string {
    return language === 'MIPS'
        ? mipsCallingConvention(prototype)
        : language === 'X86'
          ? x86CallingConvention(prototype)
          : riscvCallingConvention(prototype, language === 'RISC-V-64' ? 64 : 32)
}

/** The hover and completion documentation of one library function. */
export function runtimeFunctionDocumentation(
    entry: RuntimeFunction,
    language: AvailableLanguages = 'RISC-V'
): string {
    const convention = callingConvention(entry.prototype, language)
    const call = language === 'MIPS' ? `jal ${entry.name}` : `call ${entry.name}`
    return [
        `\`\`\`c\n${entry.prototype}\n\`\`\``,
        entry.doc,
        convention ? `Call it with \`${call}\`: ${convention}.` : '',
        `Runtime library, \`<${entry.header}>\``
    ]
        .filter(Boolean)
        .join('\n\n')
}
