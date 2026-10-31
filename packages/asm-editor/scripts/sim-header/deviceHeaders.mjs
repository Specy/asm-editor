/**
 * The x86 device headers as text: the C headers and NASM include files of `deviceTable.mjs`
 * ([ADR 0070](../../../../docs/adr/0070-the-x86-runtime-library-offers-the-linux-device-interfaces.md)),
 * and what the layout test compares them on. The C headers are header-only and x86-only, as
 * `<sim.h>` is: their POSIX calls are `static inline` over the `syscall` instruction.
 *
 * Plain JavaScript and no imports but the table, so `generate.mjs` runs it under Node and the
 * editor's tests regenerate the committed files in memory. The system call numbers come in as an
 * argument: the x86 syscall table, `src/lib/languages/X86/generated/x86Syscalls.ts`.
 */
import { DEVICE_HEADERS, IOC_DIRECTIONS } from './deviceTable.mjs'

/** Where the committed files live, relative to the editor's package. */
export const DEVICE_DIRECTORY = 'src/lib/sourceRuntime/generated/x86/include'

/** The registers the kernel reads a call's number and arguments from. */
const SYSCALL_REGISTERS = ['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9']

/** Size and alignment of the scalar types, as GCC lays them out for x86-64. */
const SCALARS = {
    char: 1,
    'signed char': 1,
    'unsigned char': 1,
    short: 2,
    'unsigned short': 2,
    int: 4,
    'unsigned int': 4,
    unsigned: 4,
    long: 8,
    'unsigned long': 8,
    'long long': 8,
    'unsigned long long': 8,
    __SIZE_TYPE__: 8
}

const headers = DEVICE_HEADERS
const byName = new Map()
for (const header of headers)
    for (const item of header.items) {
        const keys =
            item.kind === 'struct'
                ? [item.name && `struct ${item.name}`, item.typedef].filter(Boolean)
                : [item.name].filter(Boolean)
        for (const key of keys) {
            //a typedef may be repeated, as C11 allows: <time.h> and <sys/types.h> both give clockid_t
            if (byName.has(key) && item.kind !== 'typedef')
                throw new Error(`The device table defines ${key} twice`)
            if (!byName.has(key)) byName.set(key, { ...item, header: header.path })
        }
    }

function lookup(name) {
    const item = byName.get(name)
    if (!item) throw new Error(`The device table has no ${name}`)
    return item
}

/** `{ size, align }` of a C type the table uses: a scalar, a typedef, a pointer, a structure, an array. */
export function typeLayout(type) {
    const text = type.replace(/\s+/g, ' ').trim()
    const array = /^(.*?)\s*\[([^\]]+)\]$/.exec(text)
    if (array) {
        const element = typeLayout(array[1])
        return { size: element.size * Number(evaluate(array[2])), align: element.align }
    }
    if (text.endsWith('*')) return { size: 8, align: 8 }
    if (text in SCALARS) return { size: SCALARS[text], align: SCALARS[text] }
    const item = lookup(text)
    if (item.kind === 'typedef') return typeLayout(item.type)
    if (item.kind === 'struct') return structLayout(item)
    throw new Error(`${type} is not a type`)
}

const align = (offset, to) => Math.ceil(offset / to) * to

/**
 * A structure's layout, as GCC's: each field at the next multiple of its alignment, the size a
 * multiple of the largest. A bit-field holds the whole unit of its type, the only kind the table has.
 */
export function structLayout(item) {
    let offset = 0
    let largest = 1
    const fields = item.fields.map((field) => {
        const element = typeLayout(field.type)
        const count = field.count === undefined ? 1 : Number(evaluate(String(field.count)))
        offset = align(offset, element.align)
        largest = Math.max(largest, element.align)
        const placed = {
            ...field,
            countText: field.count,
            offset,
            size: element.size * count,
            element,
            count
        }
        offset += placed.size
        return placed
    })
    return { size: align(offset, largest), align: largest, fields }
}

/** The C spelling of a structure or typedef for sizeof: `struct input_id`, `fd_set`. */
const typeName = (item) => (item.name ? `struct ${item.name}` : item.typedef)

// --- Evaluating the table's C expressions ---------------------------------------------------

const TOKEN =
    /\s*(?:('(?:\\.|[^'\\])')|(0[xX][0-9a-fA-F]+|\d+)[uUlL]*|([A-Za-z_]\w*)|(<<|>>|[-+*/%|&^~(),[\]]))/y

function tokenize(text) {
    const tokens = []
    TOKEN.lastIndex = 0
    for (let at = 0; at < text.length;) {
        TOKEN.lastIndex = at
        const match = TOKEN.exec(text)
        if (!match) {
            if (/^\s*$/.test(text.slice(at))) break
            throw new Error(`Cannot read ${JSON.stringify(text)} at ${at}`)
        }
        at = TOKEN.lastIndex
        if (match[1]) tokens.push({ kind: 'number', value: BigInt(charCode(match[1])) })
        else if (match[2])
            tokens.push({
                kind: 'number',
                value: /^0\d/.test(match[2]) ? BigInt(`0o${match[2].slice(1)}`) : BigInt(match[2])
            })
        else if (match[3]) tokens.push({ kind: 'name', value: match[3] })
        else tokens.push({ kind: 'operator', value: match[4] })
    }
    return tokens
}

function charCode(literal) {
    const body = literal.slice(1, -1)
    return body.startsWith('\\')
        ? { n: 10, t: 9, 0: 0, '\\': 92, "'": 39 }[body[1]]
        : body.charCodeAt(0)
}

/** The text of a call's arguments, split at the commas outside parentheses. */
function splitArguments(text) {
    const parts = []
    let depth = 0
    let current = ''
    for (const character of text) {
        if (character === ',' && depth === 0) {
            parts.push(current.trim())
            current = ''
            continue
        }
        if (character === '(') depth++
        if (character === ')') depth--
        current += character
    }
    if (current.trim() || parts.length) parts.push(current.trim())
    return parts
}

/** A macro's replacement with its parameters replaced by the arguments, as the preprocessor does. */
function expand(item, args) {
    if (args.length !== item.params.length)
        throw new Error(`${item.name} takes ${item.params.length} arguments, not ${args.length}`)
    if (!args.length) return item.c
    //in one pass, so an argument that spells a parameter's name is not replaced again
    const parameter = new RegExp(`\\b(?:${item.params.join('|')})\\b`, 'g')
    return item.c.replace(parameter, (name) => args[item.params.indexOf(name)])
}

const values = new Map()

/** The value of a constant of the table. */
export function valueOf(name) {
    if (values.has(name)) return values.get(name)
    const item = lookup(name)
    if (item.kind !== 'define') throw new Error(`${name} is not a constant`)
    const value = item.ioctl ? ioctlValue(item.ioctl) : BigInt(evaluate(String(item.value)))
    values.set(name, value)
    return value
}

function ioctlValue({ direction, type, number, argument }) {
    const size = argument === undefined ? 0 : typeLayout(argument).size
    return ioc(IOC_DIRECTIONS[direction], evaluate(type), BigInt(number), BigInt(size))
}

function ioc(direction, type, number, size) {
    return (BigInt(direction) << 30n) | (size << 16n) | (type << 8n) | number
}

/**
 * The value of a C integer expression over the table's names: numbers, character constants,
 * the arithmetic and bitwise operators, `sizeof(type)` and calls of the table's macros.
 */
export function evaluate(text) {
    const tokens = tokenize(text)
    let at = 0
    const peek = () => tokens[at]
    const next = () => tokens[at++]
    const expect = (value) => {
        const token = next()
        if (token?.value !== value) throw new Error(`Expected ${value} in ${text}`)
    }
    /** The raw text of a parenthesised argument list, from the tokens' own spelling. */
    const argumentText = () => {
        expect('(')
        let depth = 1
        const parts = []
        while (depth > 0) {
            const token = next()
            if (!token) throw new Error(`Unbalanced parentheses in ${text}`)
            if (token.value === '(') depth++
            if (token.value === ')') depth--
            if (depth > 0) parts.push(token.kind === 'number' ? String(token.value) : token.value)
        }
        return parts.join(' ')
    }
    const primary = () => {
        const token = next()
        if (!token) throw new Error(`${text} ends early`)
        if (token.kind === 'number') return token.value
        if (token.value === '(') {
            const value = binary(0)
            expect(')')
            return value
        }
        if (token.value === '-') return -primary()
        if (token.value === '+') return primary()
        if (token.value === '~') return ~primary()
        if (token.kind !== 'name') throw new Error(`Unexpected ${token.value} in ${text}`)
        if (token.value === 'sizeof') return BigInt(typeLayout(argumentText()).size)
        const item = byName.get(token.value)
        if (item?.kind === 'macro') {
            if (item.params.length === 0) {
                //an object-like macro naming another, as OSS's _SIOWR names _IOWR
                tokens.splice(at - 1, 1, ...tokenize(item.c))
                at--
                return primary()
            }
            return evaluate(expand(item, splitArguments(argumentText())))
        }
        return valueOf(token.value)
    }
    const PRECEDENCE = {
        '|': 1,
        '^': 2,
        '&': 3,
        '<<': 4,
        '>>': 4,
        '+': 5,
        '-': 5,
        '*': 6,
        '/': 6,
        '%': 6
    }
    const binary = (minimum) => {
        let left = primary()
        for (;;) {
            const token = peek()
            const precedence = token?.kind === 'operator' ? PRECEDENCE[token.value] : undefined
            if (precedence === undefined || precedence <= minimum) return left
            next()
            const right = binary(precedence)
            left = {
                '|': () => left | right,
                '^': () => left ^ right,
                '&': () => left & right,
                '<<': () => left << right,
                '>>': () => left >> right,
                '+': () => left + right,
                '-': () => left - right,
                '*': () => left * right,
                '/': () => left / right,
                '%': () => left % right
            }[token.value]()
        }
    }
    const value = binary(0)
    if (at !== tokens.length) throw new Error(`Cannot evaluate ${text}`)
    return value
}

// --- Writing ---------------------------------------------------------------------------------

/** The words of `text` on lines of at most `width` columns, each starting with `prefix`. */
function wrap(text, prefix, width = 100) {
    const lines = []
    let line = prefix
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (line.length + 1 + word.length > width && line !== prefix) {
            lines.push(line)
            line = prefix
        }
        line += ` ${word}`
    }
    return [...lines, line]
}

const sentence = (text) => (/[.!?)]$/.test(text) ? text : `${text}.`)

function cComment(text, indent = '') {
    const lines = wrap(sentence(text), `${indent} *`)
    if (lines.length === 1 && lines[0].length + 4 <= 100)
        return [`${indent}/*${lines[0].slice(indent.length + 2)} */`]
    return [`${indent}/*`, ...lines, `${indent} */`]
}

function docComment(text, indent = '') {
    const lines = wrap(sentence(text), `${indent} *`)
    if (lines.length === 1 && lines[0].length + 5 <= 100)
        return [`${indent}/**${lines[0].slice(indent.length + 2)} */`]
    return [`${indent}/**`, ...lines, `${indent} */`]
}

const nasmComment = (text, indent = '') => wrap(sentence(text), `${indent};`)

function number(value, radix) {
    if (value < 0) return String(value)
    if (radix === 16) return `0x${value.toString(16)}`
    if (radix === 8) return value === 0 ? '0' : `0${value.toString(8)}`
    return String(value)
}

/** A C expression as a `#define` writes it: in parentheses unless it is one name or one call. */
function parenthesize(text) {
    if (/^(?:0[xX][0-9a-fA-F]+|\d+)[uUlL]*$/.test(text)) return text
    return /^[A-Za-z_]\w*(?:\(.*\))?$/.test(text) && balancedCall(text) ? text : `(${text})`
}

function balancedCall(text) {
    const open = text.indexOf('(')
    if (open === -1) return true
    let depth = 0
    for (let index = open; index < text.length; index++) {
        if (text[index] === '(') depth++
        if (text[index] === ')') depth--
        if (depth === 0) return index === text.length - 1
    }
    return false
}

/** C's spelling of a number or expression in NASM: octal with `0o`, no `U` or `L` suffixes. */
function nasmExpression(text) {
    return text
        .replace(/\b0([0-7]+)\b/g, '0o$1')
        .replace(/\b(0[xX][0-9a-fA-F]+|\d+)[uUlL]+\b/g, '$1')
}

/** `_IOR('E', 0x02, struct input_id)`; OSS spells the same macros `_SIOR`. */
function ioctlText({ direction, type, number: request, argument }, spelling = '_IO') {
    //the kernel numbers the input, framebuffer and ALSA requests in hex and OSS's in decimal
    const nr = /^'[EFW]'$/.test(type)
        ? `0x${request.toString(16).padStart(2, '0')}`
        : String(request)
    const parts = [type, nr, argument].filter((part) => part !== undefined)
    return `${spelling}${direction}(${parts.join(', ')})`
}

/** A constant's C replacement text. */
function cValue(item) {
    if (item.c !== undefined) return item.c
    if (item.ioctl) return ioctlText(item.ioctl, item.spelling)
    if (typeof item.value === 'number') return number(item.value, item.radix)
    return parenthesize(item.value)
}

/** A constant's NASM replacement text: a number for an ioctl request, which NASM has no sizeof for. */
function nasmValue(item) {
    if (item.ioctl) return `0x${valueOf(item.name).toString(16)}`
    if (typeof item.value === 'number') {
        if (item.radix === 8) return item.value === 0 ? '0' : `0o${item.value.toString(8)}`
        return number(item.value, item.radix)
    }
    return nasmExpression(parenthesize(item.value))
}

/** Lines of `left` and an aligned trailing comment, or the comment above when it does not fit. */
function aligned(rows, comment, column) {
    const lines = []
    for (const { text, doc } of rows) {
        if (!doc) {
            lines.push(text)
            continue
        }
        const [single] = comment(doc)
        const line = `${text.padEnd(column)} ${single.trimStart()}`
        if (comment(doc).length === 1 && line.length <= 100) lines.push(line)
        else lines.push(...comment(doc, text.match(/^\s*/)[0]), text)
    }
    return lines
}

/**
 * The column a run's trailing comments start at: past the longest line whose comment fits on it
 * within 100 columns. A line whose comment does not fit there has it on the line above.
 */
function columnOf(rows, comment) {
    const fitting = rows.filter(
        (row) => row.doc && row.text.length + 1 + comment(row.doc)[0].trimStart().length <= 100
    )
    return Math.max(0, ...fitting.map((row) => row.text.length))
}

/** The groups of consecutive items of one kind, so a run of constants aligns its comments. */
function runs(items) {
    const groups = []
    for (const item of items) {
        const last = groups[groups.length - 1]
        if (last && ['define', 'typedef'].includes(item.kind) && last[0].kind === item.kind)
            last.push(item)
        else groups.push([item])
    }
    return groups
}

function cDefines(group) {
    const width = Math.max(...group.map((item) => item.name.length))
    const rows = group.map((item) => ({
        text: `#define ${item.name.padEnd(Math.min(width, 32))} ${cValue(item)}`,
        doc: item.doc
    }))
    return aligned(rows, cComment, columnOf(rows, cComment))
}

function cStruct(item) {
    const layout = structLayout(item)
    const rows = layout.fields.map((field) => ({
        text: `    ${field.type} ${field.name}${field.countText === undefined ? '' : `[${field.countText}]`}${field.bits ? ` : ${field.bits}` : ''};`,
        doc: field.doc
    }))
    const head = item.typedef
        ? `typedef struct${item.name ? ` ${item.name}` : ''} {`
        : `struct ${item.name} {`
    const tail = item.typedef ? `} ${item.typedef};` : '};'
    return [
        ...(item.doc ? docComment(item.doc) : []),
        head,
        ...aligned(rows, cComment, columnOf(rows, cComment)),
        tail
    ]
}

function parameterName(parameter) {
    return /([A-Za-z_]\w*)\s*$/.exec(parameter)[1]
}

function cFunction(item, syscalls) {
    const parameters = item.params.join(', ')
    const signature = `static inline ${item.returns}${item.returns.endsWith('*') ? '' : ' '}${item.name}(${parameters})`
    const body = []
    if (item.body) body.push(...item.body)
    else {
        const call = syscalls.find((entry) => entry.name === item.syscall)
        if (!call)
            throw new Error(
                `${item.name} makes ${item.syscall}, which the x86 Core does not implement`
            )
        const named = item.params.filter((parameter) => parameter !== '...')
        const args =
            item.args ??
            named.map((parameter) =>
                parameter.includes('*')
                    ? `(long)${parameterName(parameter)}`
                    : parameterName(parameter)
            )
        if (args.length > SYSCALL_REGISTERS.length)
            throw new Error(`${item.name} has too many arguments`)
        const registers = SYSCALL_REGISTERS.slice(0, args.length)
        body.push(
            ...(item.before ?? []),
            `register long rax __asm__("rax") = ${call.number}; /* ${call.name} */`,
            ...args.map(
                (arg, index) =>
                    `register long ${registers[index]} __asm__("${registers[index]}") = ${arg};`
            ),
            `__asm__ volatile("syscall" : "+r"(rax) : ${registers.map((register) => `"r"(${register})`).join(', ')} : "rcx", "r11", "memory");`
        )
        const result = item.result ?? '__aed_syscall_return(rax)'
        const cast =
            item.result || ['long', 'ssize_t', 'off_t'].includes(item.returns)
                ? ''
                : `(${item.returns})`
        body.push(`return ${cast}${result};`)
    }
    return [...docComment(item.doc), `${signature} {`, ...body.map((line) => `    ${line}`), '}']
}

function cMacro(item) {
    const head = item.params.length ? `${item.name}(${item.params.join(', ')})` : item.name
    return [...(item.doc ? docComment(item.doc) : []), `#define ${head} ${item.c}`]
}

function guardOf(header) {
    return header.guard ?? `_${header.path.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`
}

const GENERATED =
    'Generated by scripts/sim-header/generate.mjs from scripts/sim-header/deviceTable.mjs. Do not edit it: regenerate it.'

/** One C header of the table. */
function cHeader(header, syscalls) {
    const functions = header.items.some((item) => item.kind === 'function')
    const preamble = [
        `<${header.path}>: ${header.summary}`,
        '',
        "Part of the x86 Runtime library, written for the editor in the shape of Linux's own header: the same names, values and layouts, with only what the editor's devices use.",
        ...(functions
            ? [
                  '',
                  'Its functions are static inline, so the system call each one makes is part of your own Generated assembly, and they report a failure as the C library does: -1, with the error number in errno.'
              ]
            : []),
        '',
        GENERATED
    ]
    const body = []
    let previous
    for (const group of runs(header.items)) {
        const [item] = group
        //a comment introduces what follows it, and a macro without one belongs with the one before
        if (
            previous?.kind !== 'comment' &&
            !(item.kind === 'macro' && !item.doc && previous?.kind === 'macro')
        )
            body.push('')
        previous = item
        if (item.kind === 'define') body.push(...cDefines(group))
        else if (item.kind === 'comment') body.push(...cComment(item.text))
        else if (item.kind === 'typedef') {
            const rows = group.map((entry) => ({
                text: `typedef ${entry.type} ${entry.name};`,
                doc: entry.doc
            }))
            body.push(...aligned(rows, cComment, columnOf(rows, cComment)))
        } else if (item.kind === 'struct') body.push(...cStruct(item))
        else if (item.kind === 'macro') body.push(...cMacro(item))
        else if (item.kind === 'function') body.push(...cFunction(item, syscalls))
        else if (item.kind === 'include') body.push(`#include <${item.path}>`)
        else if (item.kind === 'code') body.push(...docComment(item.doc), ...item.c)
    }
    const guard = guardOf(header)
    return [
        '/*',
        ...preamble.flatMap((paragraph) => (paragraph ? wrap(paragraph, ' *') : [' *'])),
        ' */',
        `#ifndef ${guard}`,
        `#define ${guard}`,
        '',
        '#if !defined(__x86_64__)',
        `#error "This <${header.path}> is the x86 one, included in a compilation for another Target"`,
        '#endif',
        ...(header.includeNext || header.includes?.length ? [''] : []),
        ...(header.includeNext ? [`#include_next <${header.includeNext}>`] : []),
        ...(header.includes ?? []).map((path) => `#include <${path}>`),
        ...(functions ? ['', '#ifdef __cplusplus', 'extern "C" {', '#endif'] : []),
        ...body,
        ...(functions ? ['', '#ifdef __cplusplus', '}', '#endif'] : []),
        '',
        '#endif',
        ''
    ].join('\n')
}

// --- NASM --------------------------------------------------------------------------------------

const RES = { 1: 'resb', 2: 'resw', 4: 'resd', 8: 'resq' }

/** A structure's `struc` lines; a nested structure's fields are `.outer.inner` labels. */
function nasmFields(layout, prefix, base) {
    const lines = []
    let offset = base
    for (const field of layout.fields) {
        const at = base + field.offset
        if (at > offset) lines.push({ text: `    resb ${at - offset}`, doc: 'padding' })
        const label = `${prefix}.${field.name}`
        const nested = field.element.fields && field.count === 1
        if (nested) {
            lines.push({ text: `    ${label}:`, doc: field.doc })
            const inner = nasmFields(field.element, label, at)
            lines.push(...inner.lines)
            if (at + field.size > inner.end)
                lines.push({ text: `    resb ${at + field.size - inner.end}`, doc: 'padding' })
        } else {
            const unit = field.element.fields ? 1 : field.element.size
            const count = field.element.fields ? field.size : field.count
            //C's bit-field is the low bits of its unit
            const doc = field.bits
                ? `${field.doc ? `${field.doc}: ` : ''}bit${field.bits > 1 ? `s 0 to ${field.bits - 1}` : ' 0'} of this ${RES[unit].slice(3) === 'd' ? 'dword' : 'unit'}`
                : field.doc
            lines.push({ text: `    ${label}: ${RES[unit]} ${count}`, doc })
        }
        offset = at + field.size
    }
    return { lines, end: offset }
}

function nasmStruct(item) {
    const layout = structLayout(item)
    const name = item.name ?? item.typedef
    const { lines, end } = nasmFields(layout, '', 0)
    if (layout.size > end) lines.push({ text: `    resb ${layout.size - end}`, doc: 'padding' })
    //the reservations in one column, after the longest label
    const labels = lines.map((line) => /^\s*(\.\S+:)?\s*(.*)$/.exec(line.text))
    const width = Math.max(...labels.map((match) => match[1]?.length ?? 0))
    labels.forEach((match, index) => {
        lines[index].text = `    ${(match[1] ?? '').padEnd(width)} ${match[2]}`.trimEnd()
    })
    return [
        ...(item.doc ? nasmComment(item.doc) : []),
        ...nasmComment(`${name}_size is ${layout.size}`),
        `struc ${name}`,
        ...aligned(lines, nasmComment, columnOf(lines, nasmComment)),
        'endstruc'
    ]
}

function nasmDefines(group) {
    const kept = group.filter((item) => item.nasm !== false)
    if (!kept.length) return []
    const width = Math.max(...kept.map((item) => item.name.length))
    const rows = kept.map((item) => ({
        text: `%define ${item.name.padEnd(Math.min(width, 32))} ${nasmValue(item)}`,
        //NASM gets the number; the comment says how C spells it
        doc: item.ioctl
            ? [
                  ioctlText(item.ioctl, item.spelling),
                  item.doc && item.doc[0].toLowerCase() + item.doc.slice(1)
              ]
                  .filter(Boolean)
                  .join(': ')
            : item.doc
    }))
    return aligned(rows, nasmComment, columnOf(rows, nasmComment))
}

function nasmMacro(item) {
    const head = item.params.length ? `${item.name}(${item.params.join(',')})` : item.name
    return [
        ...(item.doc ? nasmComment(item.doc) : []),
        `%define ${head} ${nasmExpression(item.nasm ?? item.c)}`
    ]
}

/** Whether a header has anything NASM can use: constants, value macros or structures. */
function hasNasm(header) {
    return header.items.some(
        (item) =>
            (item.kind === 'define' && item.nasm !== false) ||
            item.kind === 'struct' ||
            (item.kind === 'macro' && (item.samples || item.nasm))
    )
}

const nasmPath = (path) => path.replace(/\.h$/, '.inc')

function nasmFile(header) {
    const name = nasmPath(header.path)
    const guard = name.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()
    const includes = [
        ...(header.includes ?? []),
        ...header.items.filter((item) => item.kind === 'include').map((item) => item.path)
    ]
        .map((path) => headers.find((other) => other.path === path))
        .filter((other) => other && hasNasm(other) && other !== header)
    const body = []
    let previous
    for (const group of runs(header.items)) {
        const [item] = group
        let lines = []
        if (item.kind === 'define') lines = nasmDefines(group)
        else if (item.kind === 'comment') lines = nasmComment(item.text)
        else if (item.kind === 'struct') lines = nasmStruct(item)
        else if (item.kind === 'macro' && (item.samples || item.nasm)) lines = nasmMacro(item)
        if (!lines.length) continue
        if (
            previous?.kind !== 'comment' &&
            !(item.kind === 'macro' && !item.doc && previous?.kind === 'macro')
        )
            body.push('')
        previous = item
        body.push(...lines)
    }
    const preamble = [
        `${name}: the constants and structures of <${header.path}> for NASM, under the same names: ${header.nasmSummary ?? header.summary}`,
        '',
        "A structure is a struc: name.field is a field's offset, name.outer.inner one of a structure inside it, and name_size its size. Use it as [rdi + input_event.code], or reserve one with resb input_event_size.",
        '',
        GENERATED
    ]
    return [
        ...preamble.flatMap((paragraph) => (paragraph ? wrap(paragraph, ';') : [';'])),
        `%ifndef ${guard}`,
        `%define ${guard}`,
        ...(includes.length
            ? ['', ...includes.map((other) => `%include "${nasmPath(other.path)}"`)]
            : []),
        ...body,
        '',
        '%endif',
        ''
    ].join('\n')
}

function syscallFile(syscalls) {
    const width = Math.max(...syscalls.map((call) => call.name.length)) + 4
    return [
        ...wrap(
            "sys/syscall.inc: the number of every Linux system call the x86 Core implements, as SYS_ and its name, the names <sys/syscall.h> gives them in C: mov eax, SYS_write puts write's number in eax.",
            ';'
        ),
        ';',
        ...wrap(
            'Generated by scripts/sim-header/generate.mjs from src/lib/languages/X86/generated/x86Syscalls.ts. Do not edit it: regenerate it.',
            ';'
        ),
        '%ifndef SYS_SYSCALL_INC',
        '%define SYS_SYSCALL_INC',
        '',
        ...syscalls.map((call) => `%define ${`SYS_${call.name}`.padEnd(width)} ${call.number}`),
        '',
        '%endif',
        ''
    ].join('\n')
}

/**
 * Every file of the table, by its path under the include directory: the C headers, and a NASM
 * include file for each header with constants or structures, plus `sys/syscall.inc`.
 */
export function generateDeviceFiles(syscalls) {
    const files = {}
    for (const header of headers) {
        if (header.c !== false) files[header.path] = cHeader(header, syscalls)
        if (hasNasm(header)) files[nasmPath(header.path)] = nasmFile(header)
    }
    files['sys/syscall.inc'] = syscallFile(syscalls)
    return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)))
}

/** The C headers a compile can include, `linux/fb.h` and the rest. */
export const DEVICE_C_HEADERS = headers
    .filter((header) => header.c !== false)
    .map((header) => header.path)

/**
 * The POSIX calls, for the help catalog: the declaration a program sees, its header, and the
 * system call whose Documentation entry explains it.
 */
export function deviceFunctions() {
    return headers.flatMap((header) =>
        header.items
            .filter((item) => item.kind === 'function')
            .map((item) => ({
                name: item.name,
                header: header.path,
                declaration: `${item.returns}${item.returns.endsWith('*') ? '' : ' '}${item.name}(${item.params.join(', ')})`,
                doc: item.doc,
                documentation: item.documentation ?? item.syscall
            }))
    )
}

/**
 * What the layout test compares: a C expression, the header that gives it, and its value as this
 * table computes it, for every constant, value macro (at its samples), structure (size, alignment
 * and each field's offset), typedef (size) and POSIX call (its type matches the C library's).
 * `linux` is false for what Linux's headers do not have; `guest` explains a value that follows
 * the guest's Linux 6.12 where later kernels differ.
 */
export function deviceProbe(syscalls) {
    const entries = []
    const add = (header, expression, value, extra = {}) =>
        entries.push({ header, expression, value: Number(value), linux: true, c: true, ...extra })
    for (const header of headers)
        for (const item of header.items) {
            const extra = {
                ...(item.linux === false ? { linux: false } : {}),
                ...(item.guest ? { guest: item.guest } : {})
            }
            if (item.kind === 'define')
                add(header.path, item.probe ?? item.name, valueOf(item.name), extra)
            else if (item.kind === 'macro')
                for (const sample of item.samples ?? [])
                    add(
                        header.path,
                        `${item.name}(${sample.join(', ')})`,
                        evaluate(expand(item, sample)),
                        extra
                    )
            else if (item.kind === 'typedef')
                add(header.path, `sizeof(${item.name})`, typeLayout(item.name).size)
            else if (item.kind === 'struct') {
                const name = typeName(item)
                const layout = structLayout(item)
                add(header.path, `sizeof(${name})`, layout.size)
                add(header.path, `_Alignof(${name})`, layout.align)
                for (const field of layout.fields)
                    if (!field.bits)
                        add(
                            header.path,
                            `offsetof(${name}, ${field.name})`,
                            field.offset,
                            field.guest ? { guest: field.guest } : {}
                        )
            } else if (item.kind === 'function') {
                const params = item.params.join(', ') || 'void'
                add(
                    header.path,
                    `__builtin_types_compatible_p(__typeof__(${item.name}), ${item.returns} (${params}))`,
                    1,
                    {
                        function: true
                    }
                )
            }
        }
    for (const call of syscalls) add('sys/syscall.h', `SYS_${call.name}`, call.number, { c: false })
    return entries
}

/**
 * What the NASM test checks of the include files, as NASM spells it: every constant, every value
 * macro at its samples (a C type among a sample's arguments becomes its size, which NASM's
 * `_IOR` takes), each structure's size and each field's offset, and every system call number.
 */
export function deviceNasmProbe(syscalls) {
    const entries = []
    const add = (file, expression, value) =>
        entries.push({ file, expression, value: Number(value) })
    for (const header of headers) {
        if (!hasNasm(header)) continue
        const file = nasmPath(header.path)
        for (const item of header.items) {
            if (item.kind === 'define' && item.nasm !== false)
                add(file, item.name, valueOf(item.name))
            else if (item.kind === 'macro' && (item.samples || item.nasm))
                for (const sample of item.samples ?? []) {
                    const args = sample.map((arg) => {
                        try {
                            evaluate(arg)
                            return arg
                        } catch {
                            return String(typeLayout(arg).size)
                        }
                    })
                    add(file, `${item.name}(${args.join(', ')})`, evaluate(expand(item, sample)))
                }
            else if (item.kind === 'struct') {
                const name = item.name ?? item.typedef
                const layout = structLayout(item)
                add(file, `${name}_size`, layout.size)
                for (const field of layout.fields) add(file, `${name}.${field.name}`, field.offset)
            }
        }
    }
    for (const call of syscalls) add('sys/syscall.inc', `SYS_${call.name}`, call.number)
    return entries
}
