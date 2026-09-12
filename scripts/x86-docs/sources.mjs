#!/usr/bin/env node
/**
 * The parsers behind the x86 documentation: one function per source file, no merging and no
 * output, so that `x86-docs-coverage.mjs` (which measures) and `x86-docs-generate.mjs` (which
 * writes `src/lib/languages/X86/generated`) read the same tables the same way.
 *
 * Where each source comes from, and why it is trusted, is written down in
 * `docs/design/x86-documentation.md`. The short version: everything under `emulators/` is the
 * toolchain this editor actually runs, so it is true by construction; the two cached files are
 * prose, fetched at pinned revisions.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
export const nasmRoot = join(projectRoot, 'emulators/x86/wasm_nasm/nasm')
export const blinkRoot = join(projectRoot, 'emulators/x86/libblink')
export const cacheDir = join(projectRoot, '.cache', 'x86-docs')

/** Pinned, so that two runs of the generator produce the same file. */
export const REMOTE = {
    'insref.src':
        'https://raw.githubusercontent.com/netwide-assembler/nasm/nasm-2.05.01/doc/insref.src',
    'x86_64.xml': 'https://raw.githubusercontent.com/Maratyszcza/Opcodes/master/opcodes/x86_64.xml'
}

/** Fetches a pinned source once and keeps it in `.cache/x86-docs`, which is not committed. */
export async function cached(name, { fetch: allowFetch = false } = {}) {
    const path = join(cacheDir, name)
    if (existsSync(path)) return readFileSync(path, 'utf8')
    if (!allowFetch) {
        throw new Error(`missing ${path}; re-run with --fetch to download it from ${REMOTE[name]}`)
    }
    const response = await fetch(REMOTE[name])
    if (!response.ok) throw new Error(`${REMOTE[name]}: ${response.status}`)
    const text = await response.text()
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(path, text)
    return text
}

const read = (path) => readFileSync(path, 'utf8')

// --- NASM: what assembles ------------------------------------------------------------------------

/**
 * Every mnemonic NASM accepts, from the table it generates for its own tokenizer. Condition code
 * families are already expanded here (`jz`, `setnbe`, `cmovg`), which is what makes it the list to
 * join everything else onto.
 */
export function readNasmNames() {
    return [...read(join(nasmRoot, 'x86/insnsn.c')).matchAll(/^\t"([^"]+)",$/gm)].map((m) => m[1])
}

/**
 * The macro-expanded instruction table: `MNEMONIC operands [encoding] FLAGS`, with `ignore` where
 * the pseudo-ops have no encoding. A `;#` comment opens the section that every instruction below it
 * belongs to, which is how NASM builds the section headings of its own manual.
 */
export function readNasmTable() {
    const byMnemonic = new Map()
    const sections = []
    let section = 'Uncategorised'
    for (const line of read(join(nasmRoot, 'x86/insns.xda')).split('\n')) {
        if (line.startsWith(';#')) {
            section = line.slice(2).trim()
            sections.push(section)
            continue
        }
        if (!line.trim() || line.startsWith(';')) continue
        const match = /^(\S+)\s+(\S+)\s+(\[.*?\]|\S+)\s+(\S+)\s*$/.exec(line)
        if (!match) continue
        const [, mnemonic, operands, encoding, flags] = match
        const key = mnemonic.toLowerCase()
        const entry = byMnemonic.get(key) ?? { sections: new Set(), forms: [] }
        entry.sections.add(section)
        entry.forms.push({
            section,
            operands: operands === 'void' ? [] : operands.split(','),
            encoding: encoding.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim(),
            flags: flags.split(',')
        })
        byMnemonic.set(key, entry)
    }
    return { byMnemonic, sections }
}

/**
 * The meaning of every flag in the table's fourth column, with the group it belongs to. NASM's
 * flag list is ordered, and two alignment markers cut it into three: everything before `FEATURE` is
 * assembler behaviour, everything between `FEATURE` and `CPU` is an instruction set extension, and
 * the rest are processor levels.
 */
export function readNasmFlags() {
    const byName = new Map()
    let group = 'encoding'
    for (const line of read(join(nasmRoot, 'x86/iflags.ph')).split('\n')) {
        const align = /^if_align\('(\w+)'\)/.exec(line)
        if (align) {
            group = align[1] === 'CPU' ? 'cpu' : 'feature'
            continue
        }
        const flag = /^if_\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*\)/.exec(line)
        if (flag) {
            byName.set(flag[1].toUpperCase(), { description: flag[2], group })
            continue
        }
        // The single-CPUID-bit instructions are declared as a Perl list rather than one call each.
        const oneins = /^my @oneins = qw\(([^)]*)\)/s.exec(line)
        if (oneins) {
            for (const name of oneins[1].split(/\s+/).filter(Boolean)) {
                byName.set(name.toUpperCase(), {
                    description: `${name.toUpperCase()} instruction`,
                    group
                })
            }
        }
    }
    return byName
}

/** `lock`, `rep`, `o64`, `byte`, `near`: accepted in source, and not instructions. */
export function readNasmTokens() {
    const groups = []
    let current = null
    for (const line of read(join(nasmRoot, 'asm/tokens.dat')).split('\n')) {
        const header = /^%\s*(TOKEN_\w+)\s*,\s*(\S+?)\s*,/.exec(line)
        if (header) {
            current = { kind: header[1], role: header[2], tokens: [] }
            groups.push(current)
            continue
        }
        const token = /^([a-z][a-z0-9]*)\s*$/.exec(line)
        if (token && current) current.tokens.push(token[1])
    }
    return groups
}

/** The assembler directives, from the list NASM parses them with. */
export function readNasmDirectives() {
    const directives = []
    let inGlobals = false
    for (const line of read(join(nasmRoot, 'asm/directiv.dat')).split('\n')) {
        if (line.startsWith('; ---')) {
            inGlobals = line.includes('Global directives')
            continue
        }
        if (!inGlobals) continue
        const name = /^([a-z][a-z0-9_]*)\s*$/.exec(line.trim())
        if (name) directives.push(name[1])
    }
    return directives
}

/**
 * Every register name the assembler accepts. The table writes families as ranges, so `r8-31b` is
 * `r8b` through `r31b` and `st0-7` is the x87 stack.
 */
export function readNasmRegisters() {
    const registers = []
    for (const line of read(join(nasmRoot, 'x86/regs.dat')).split('\n')) {
        const match = /^([a-z][a-z0-9-]*)\s+\S+/.exec(line)
        if (!match) continue
        const range = /^([a-z]+)(\d+)-(\d+)([a-z]*)$/.exec(match[1])
        if (!range) {
            registers.push(match[1])
            continue
        }
        const [, prefix, from, to, suffix] = range
        for (let index = Number(from); index <= Number(to); index += 1) {
            registers.push(`${prefix}${index}${suffix}`)
        }
    }
    return [...new Set(registers)]
}

/**
 * The user level directives NASM implements as macros rather than in its parser: `struc`, `align`,
 * and the spellings of `section` and `global` a program actually writes. They are in the standard
 * macro package, which NASM assembles into every build.
 */
export function readNasmStandardMacros() {
    const macros = [
        ...read(join(nasmRoot, 'macros/standard.mac')).matchAll(/^%i?macro\s+(\S+)/gm)
    ].map((match) => match[1])
    return [...new Set(macros)].sort()
}

/**
 * The preprocessor directives. `%if*` is a stem that combines with the condition tests on the `*`
 * lines (`%ifdef`, `%ifmacro`), each of which also has an auto-generated negative (`%ifndef`), and
 * `%!name` marks the ones with a case insensitive `%iname` twin.
 */
export function readNasmPreprocessorDirectives() {
    const stems = []
    const conditions = []
    const plain = []
    for (const raw of read(join(nasmRoot, 'asm/pptok.dat')).split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        if (line.startsWith('%') && line.endsWith('*')) {
            stems.push(line.slice(1, -1))
            continue
        }
        if (line.startsWith('*')) {
            conditions.push(line.slice(1))
            continue
        }
        if (line.startsWith('%')) plain.push(line.slice(1).replace('!', ''))
    }
    const directives = new Set()
    for (const stem of stems) {
        for (const condition of conditions) {
            if (condition.startsWith('_')) continue
            directives.add(`%${stem}${condition}`)
            directives.add(`%${stem}n${condition}`)
        }
    }
    for (const name of plain) directives.add(`%${name}`)
    return [...directives].sort()
}

// --- blink: what the program can ask the world for -----------------------------------------------

/** How an strace argument type reads on the page. Unlisted types fall back to their own name. */
const SYSCALL_ARG_TYPES = {
    FD: 'file descriptor',
    DIRFD: 'directory descriptor',
    PATH: 'path',
    STR: 'string',
    I_BUF: 'buffer (read by the kernel)',
    O_BUF: 'buffer (written by the kernel)',
    I_IOVEC: 'iovec array (read)',
    O_IOVEC: 'iovec array (written)',
    BUFSZ: 'byte count',
    SIZE: 'size',
    OFF: 'offset',
    MODE: 'mode',
    OFLAGS: 'open flags',
    PROT: 'protection flags',
    MAPFLAGS: 'mapping flags',
    SIG: 'signal',
    PID: 'process id',
    HEX: 'value',
    PTR: 'pointer',
    I32: 'int',
    I64: 'long',
    RC0: 'status',
    SSIZE_: 'byte count'
}

/**
 * The syscalls blink implements, which is a different list from the ones Linux defines: the number,
 * the name, how many arguments the dispatcher reads, and what each one is. The argument types come
 * from the strace signature the table names, which is the only place blink writes them down.
 */
export function readBlinkSyscalls() {
    const strace = new Map()
    for (const line of read(join(blinkRoot, 'blink/strace.h')).split('\n')) {
        const match = /^#define\s+(STRACE_\w+)\s+(\w+)\s+(\w+)\s+(.*)$/.exec(line)
        if (!match) continue
        const [, name, kind, returns, rest] = match
        strace.set(name, { kind, returns, args: rest.trim().split(/\s+/) })
    }
    const syscalls = []
    // Matched over the whole file rather than line by line: two entries wrap onto a second line.
    const table = read(join(blinkRoot, 'blink/syscall.c'))
    for (const match of table.matchAll(
        /\bSYSCALL\((\d+),\s*(0x[0-9A-Fa-f]+),\s*"([^"]+)",\s*(\w+),\s*(\w+)\)\s*;/g
    )) {
        const [, arity, ordinal, name, , signature] = match
        const shape = strace.get(signature)
        const args = (shape?.args ?? [])
            .slice(0, Number(arity))
            .map((type) => SYSCALL_ARG_TYPES[type] ?? type.toLowerCase())
        syscalls.push({
            number: Number.parseInt(ordinal, 16),
            name,
            arity: Number(arity),
            args,
            /** `BLOCKY` and `CANCPT` mean the call can wait; the others return at once. */
            blocking: shape?.kind === 'BLOCKY' || shape?.kind === 'CANCPT'
        })
    }
    // `exit`, `exit_group` and `rt_sigreturn` never return, so blink handles them as plain `case`
    // arms outside the table. The log line is where their name and arguments are written down, and
    // `exit` matters more here than most of the table: it is how every program ends.
    for (const match of table.matchAll(/case\s+(0x[0-9A-Fa-f]+):\s*\n\s*SYS_LOGF\(([^;]*)\);/g)) {
        const [, ordinal, call] = match
        // The format string is spliced together from `PRIx64` macros, so the name is the first
        // quoted word that is a bare identifier and the arguments are what follows it.
        const named = /"(\w+)"((?:\s*,\s*\w+)*)\s*$/.exec(call)
        if (!named) continue
        const [, name, rest] = named
        // Only the traced calls declare their argument types; these declare how many they read.
        const arity = rest.split(',').filter((argument) => argument.trim()).length
        syscalls.push({
            number: Number.parseInt(ordinal, 16),
            name,
            arity,
            args: [],
            blocking: false
        })
    }
    // `clock_gettime` is answered before the dispatcher runs, because blink exempts it from
    // tracing, so it appears in neither the table nor the logged cases. Reading the early-exit
    // branch keeps it in the list rather than hardcoding a number that may move.
    for (const match of table.matchAll(
        /Get64\(m->ax\)\s*==\s*(0x[0-9A-Fa-f]+)\)\s*\{[\s\S]{0,600}?=\s*Sys(\w+)\(m,([^;]*)\);/g
    )) {
        const [, ordinal, fn, argumentList] = match
        const number = Number.parseInt(ordinal, 16)
        if (syscalls.some((syscall) => syscall.number === number)) continue
        syscalls.push({
            number,
            name: fn.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(),
            arity: [...argumentList.matchAll(/Get64\(m->(\w+)\)/g)].length,
            args: [],
            blocking: false
        })
    }
    return syscalls.sort((a, b) => a.number - b.number)
}

// --- insref: the prose ---------------------------------------------------------------------------

/** The tables the appendix points at but does not itself contain; see `toMarkdown`. */
const IREF_SECTIONS = {
    cc: 'the condition codes',
    'SSE-cc': 'the SSE condition predicates',
    rv: 'the register values',
    ea: 'the effective address encoding',
    Flags: 'the status flags'
}

/** NASM's doc markup, reduced to the markdown the documentation pages already render. */
export function toMarkdown(source) {
    return (
        source
            // The appendix quotes words the TeX way, `like this', which markdown reads as an
            // unclosed code span. Done first, while a backtick still means only that: the
            // conversions below introduce backticks of their own.
            .replace(/`([^`\n]{1,40})'/g, "'$1'")
            // `\b` opens a bullet, and the text of the bullet runs to the next blank line.
            .replace(/^\\b\s+/, '- ')
            .replace(/\\W\{([^}]*)\}\\c\{([^}]*)\}/g, '[$2]($1)')
            .replace(/\\I(?:\\c)?\{[^}]*\}/g, '')
            .replace(/\\(?:i\\)?c\{([^}]*)\}/g, '`$1`')
            .replace(/\\e\{([^}]*)\}/g, '*$1*')
            .replace(/\\i\{([^}]*)\}/g, '$1')
            // `\k{insSETcc}` is a cross reference to another entry; the page it lands on is ours,
            // so it keeps the mnemonic and loses the appendix's section id.
            .replace(/\\[kK]\{iref-([^}]*)\}/g, (_, id) => IREF_SECTIONS[id] ?? 'the reference')
            .replace(/\\[kK]\{ins([^}]*)\}/g, '`$1`')
            .replace(/\\[kK]\{[^}]*\}/g, '')
            .replace(/\\#/g, '#')
            .replace(/[ \t]+/g, ' ')
            .trim()
    )
}

/**
 * The condition suffixes `Jcc`, `SETcc`, `CMOVcc` and `CCMPscc` stand for. NASM keeps the list in
 * `asm/preproc.c` for its own `%if` conditions; `cxz`, `ecxz` and `rcxz` are dropped because
 * `jcxz` and its two siblings are instructions in their own right rather than conditional jumps,
 * and letting them through hands `jecxz` the conditional branch description.
 */
export function readConditionCodes() {
    const list = /static const char \* const conditions\[\] = \{([^}]*)\}/s.exec(
        read(join(nasmRoot, 'asm/preproc.c'))
    )
    if (!list) throw new Error('could not find the condition list in asm/preproc.c')
    return [...list[1].matchAll(/"(\w+)"/g)]
        .map((match) => match[1])
        .filter((condition) => !/^[a-z]?cxz$/.test(condition))
}

/**
 * The size suffixes an `x` template stands for: the operand size letters, and the digits that `UDx`
 * uses. The empty suffix is included because `POPAx` documents `popa` as well as `popad`.
 */
const SIZE_SUFFIXES = ['', 'b', 'w', 'd', 'q', 't', 'o', 'y', 'z', '0', '1', '2', '3']

/**
 * APX writes its condition into the encoding rather than the opcode, which gives its templates two
 * conditions the jumps do not have, `f` and `t` for the constant answers, and a bare form that takes
 * the condition as an operand.
 */
const EXTRA_CONDITIONS = ['', 'f', 't']

/**
 * The table and the appendix both write families as templates: `Jcc` for the 30 `jz`/`jnbe`/… names,
 * `CCMPscc` for the APX conditional compares, `POPAx` for `popa`/`popad`/`popaw`. A template expands
 * over its own suffix list and then keeps only the names NASM accepts, so a template can never claim
 * a mnemonic that merely starts with the same letters: `Jcc` covers `jz`, never `jmp` or `jecxz`.
 */
export function expandTemplate(pattern, accepted, conditions) {
    const conditional = pattern.includes('cc')
    const at = pattern.lastIndexOf('cc')
    // NASM writes the APX templates `CCMPscc` and `CTESTscc`, where `scc` is the whole placeholder:
    // the `s` stands for "source condition code" and is not part of the mnemonic.
    const placeholder = conditional && at > 0 && pattern[at - 1] === 's' ? at - 1 : at
    const cut = conditional ? placeholder : pattern.endsWith('x') ? pattern.length - 1 : -1
    if (cut === -1) return [pattern]
    // `CMPccXADD` puts its condition in the middle, so the tail after the placeholder is part of
    // every name it stands for.
    const tail = conditional ? pattern.slice(at + 2) : ''
    const suffixes = conditional ? [...conditions, ...EXTRA_CONDITIONS] : SIZE_SUFFIXES
    const expand = (prefix) =>
        suffixes
            .map((suffix) => `${prefix}${suffix}${tail}`)
            .filter((name) => accepted.includes(name))
    return expand(pattern.slice(0, cut))
}

/** `adcx` and `bndldx` end in `x` and are names, not templates; only unaccepted spellings expand. */
export function isTemplate(mnemonic, accepted) {
    return !accepted.includes(mnemonic) && (mnemonic.includes('cc') || mnemonic.endsWith('x'))
}

/**
 * An entry is a `\S{insADD}` heading, a block of `\c` form lines, and prose. One entry can document
 * several mnemonics (`\i\c{MOVSX}, \i\c{MOVZX}: …`), so the map is per mnemonic and the entry is
 * shared.
 */
export function parseInsref(text, accepted, conditions) {
    const byMnemonic = new Map()
    const entries = []
    let current = null
    const flush = () => {
        if (!current) return
        const entry = {
            id: current.id,
            title: toMarkdown(current.title),
            mnemonics: current.mnemonics,
            forms: current.forms,
            description: current.prose
                .join('\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim()
        }
        entries.push(entry)
        for (const mnemonic of entry.mnemonics) {
            const names = isTemplate(mnemonic, accepted)
                ? expandTemplate(mnemonic, accepted, conditions)
                : [mnemonic]
            for (const name of names) if (!byMnemonic.has(name)) byMnemonic.set(name, entry)
        }
        current = null
    }
    /** Closes an example block opened in the prose, so a flush never leaves a fence open. */
    const closeExample = () => {
        if (!current?.inExample) return
        current.prose.push('```')
        current.inExample = false
    }
    for (const line of text.split('\n')) {
        const header = /^\\S\{ins([^}]+)\}\s*(.*)$/.exec(line)
        if (header) {
            closeExample()
            flush()
            const [, id, title] = header
            const mnemonics = [...title.split(':')[0].matchAll(/\\c\{([^}]+)\}/g)].map((m) =>
                m[1].toLowerCase()
            )
            current = {
                id,
                title,
                mnemonics,
                forms: [],
                prose: [],
                inExample: false,
                // A heading can wrap: "…: ASCII" on one line, "Adjustments" on the next. Until the
                // blank line that ends it, what follows is still the heading.
                inTitle: true
            }
            continue
        }
        if (!current) continue
        if (current.inTitle) {
            if (line.trim()) {
                current.title = `${current.title} ${line.trim()}`
                continue
            }
            current.inTitle = false
        }
        if (/^\\[AHS]\{/.test(line)) {
            closeExample()
            flush()
            continue
        }
        const code = /^\\c\s(.*)$/.exec(line)
        if (code) {
            // The block of `\c` lines that opens an entry is its form table. Later ones are worked
            // examples inside the prose, and belong in the description as code.
            if (current.prose.some((prose) => prose.length > 0)) {
                if (!current.inExample) {
                    current.prose.push('```')
                    current.inExample = true
                }
                current.prose.push(code[1].trimEnd())
                continue
            }
            const form = code[1].trim()
            const split = /^(.*?);\s*(.*?)\s*\[([^\]]*)\]\s*$/.exec(form)
            current.forms.push(
                split
                    ? { form: split[1].trim(), encoding: split[2], cpu: split[3] }
                    : { form, encoding: '', cpu: '' }
            )
            continue
        }
        closeExample()
        current.prose.push(toMarkdown(line))
    }
    flush()
    return { byMnemonic, entries }
}

// --- Opcodes: one line summaries -----------------------------------------------------------------

export function parseOpcodes(text) {
    const byMnemonic = new Map()
    for (const match of text.matchAll(/<Instruction name="([^"]+)" summary="([^"]*)"/g)) {
        byMnemonic.set(match[1].toLowerCase(), match[2])
    }
    return byMnemonic
}

// --- operands ------------------------------------------------------------------------------------

/** The operand spellings that are not simply `type` + bit width. */
const OPERAND_NAMES = {
    unity: '1',
    mem_offs: 'moffs',
    imm: 'imm',
    mem: 'mem',
    fpureg: 'st(i)',
    fpu0: 'st0',
    mmxreg: 'mmxreg',
    mmxrm: 'mmxreg/mem64',
    segreg: 'segreg',
    kreg: 'kreg',
    tmmreg: 'tmmreg',
    bndreg: 'bndreg',
    sbyte: 'imm8',
    sbyteword: 'imm8',
    sbytedword: 'imm8',
    sdword: 'imm32',
    udword: 'imm32',
    reg_al: 'al',
    reg_ax: 'ax',
    reg_eax: 'eax',
    reg_rax: 'rax',
    reg_cl: 'cl',
    reg_cx: 'cx',
    reg_ecx: 'ecx',
    reg_rcx: 'rcx',
    reg_dx: 'dx',
    reg_edx: 'edx',
    reg_dess: 'ds/es/ss',
    reg_fsgs: 'fs/gs',
    reg_creg: 'creg',
    reg_dreg: 'dreg',
    reg_treg: 'treg',
    reg_sreg: 'segreg'
}

/**
 * Turns the table's internal operand spelling into the one the documentation uses: `rm64` is
 * `r/m64`, `reg_al` is `al`, and the `|` modifiers (`near`, `mask`, the AVX-512 broadcast widths)
 * become a suffix rather than part of the type.
 */
export function normaliseOperand(token) {
    const [base, ...modifiers] = token.split('|')
    // A trailing `?` marks an operand NASM lets you leave out, `*` marks a vector-form marker that
    // says nothing to a reader.
    const optional = base.endsWith('?')
    const bare = base.replace(/[?*]+$/, '')
    const sized =
        /^(rm|reg|mem|imm|xmmrm|ymmrm|zmmrm|mmxrm|krm|bndrm|sbyteword|sbytedword|sbyte|sdword|udword|kreg|xmmreg|ymmreg|zmmreg)(\d*)$/.exec(
            bare
        )
    let name = OPERAND_NAMES[bare] ?? bare
    // `reg_es`, `reg_al`: the table spells implicit operands as registers with a `reg_` prefix, and
    // the ones that are a plain register name need no table entry of their own.
    if (!OPERAND_NAMES[bare] && bare.startsWith('reg_')) name = bare.slice(4)
    if (!OPERAND_NAMES[bare] && sized) {
        const [, type, width] = sized
        const widths = {
            rm: `r/m${width}`,
            reg: `reg${width}`,
            mem: `mem${width}`,
            imm: `imm${width}`,
            xmmrm: `xmmreg/mem${width}`,
            ymmrm: `ymmreg/mem${width}`,
            zmmrm: `zmmreg/mem${width}`,
            mmxrm: `mmxreg/mem${width}`,
            krm: `kreg/mem${width}`,
            bndrm: `bndreg/mem${width}`,
            kreg: `kreg${width}`,
            // A signed byte that stands in for a wider immediate, and the 32 bit immediates long
            // mode sign or zero extends: the width in the name is the operand's, not the
            // immediate's, which is what a reader is looking for.
            sbyte: 'imm8',
            sbyteword: 'imm8',
            sbytedword: 'imm8',
            sdword: 'imm32',
            udword: 'imm32',
            xmmreg: 'xmmreg',
            ymmreg: 'ymmreg',
            zmmreg: 'zmmreg'
        }
        name = widths[type] ?? bare
    }
    const shown = modifiers.filter((modifier) => !/^\w+\*$/.test(modifier))
    const suffix = shown.length ? ` {${shown.join('|')}}` : ''
    return optional ? `[${name}${suffix}]` : `${name}${suffix}`
}
