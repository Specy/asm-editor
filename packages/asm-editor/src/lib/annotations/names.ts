import { X86_ASSEMBLER_REGISTERS } from '#lib/languages/X86/generated/x86Tokens.ts'

/**
 * What a person's name for a label or a variable of an Executable may be
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 7):
 * a C identifier the Listing, the Patch prompt and the Pseudocode all read as one name and as
 * nothing else. Each check returns the sentence a prompt shows under the field, or undefined when
 * the name may be given.
 */

/** The longest name a person may give, in characters. */
export const NAME_LENGTH_LIMIT = 128

/** C's keywords, C23's and the underscored forms before it. */
const C_KEYWORDS = new Set([
    ...[
        'auto',
        'break',
        'case',
        'char',
        'const',
        'continue',
        'default',
        'do',
        'double',
        'else',
        'enum',
        'extern',
        'float',
        'for',
        'goto',
        'if',
        'inline',
        'int',
        'long',
        'register',
        'restrict',
        'return',
        'short',
        'signed',
        'sizeof',
        'static',
        'struct',
        'switch',
        'typedef',
        'union',
        'unsigned',
        'void',
        'volatile',
        'while'
    ],
    ...[
        'alignas',
        'alignof',
        'bool',
        'constexpr',
        'false',
        'nullptr',
        'static_assert',
        'thread_local',
        'true',
        'typeof',
        'typeof_unqual'
    ],
    ...[
        '_Alignas',
        '_Alignof',
        '_Atomic',
        '_BitInt',
        '_Bool',
        '_Complex',
        '_Decimal128',
        '_Decimal32',
        '_Decimal64',
        '_Generic',
        '_Imaginary',
        '_Noreturn',
        '_Static_assert',
        '_Thread_local'
    ]
])

/** C++23's keywords and alternative operator spellings that C does not have. */
const CPP_KEYWORDS = new Set([
    'and',
    'and_eq',
    'asm',
    'bitand',
    'bitor',
    'catch',
    'char8_t',
    'char16_t',
    'char32_t',
    'class',
    'co_await',
    'co_return',
    'co_yield',
    'compl',
    'concept',
    'const_cast',
    'consteval',
    'constinit',
    'decltype',
    'delete',
    'dynamic_cast',
    'explicit',
    'export',
    'friend',
    'mutable',
    'namespace',
    'new',
    'noexcept',
    'not',
    'not_eq',
    'operator',
    'or',
    'or_eq',
    'private',
    'protected',
    'public',
    'reinterpret_cast',
    'requires',
    'static_cast',
    'template',
    'this',
    'throw',
    'try',
    'typeid',
    'typename',
    'using',
    'virtual',
    'wchar_t',
    'xor',
    'xor_eq'
])

/**
 * The type names the decompiler prints that C does not have (`undefined4 uVar1;`): Ghidra's core
 * types, as the package builds them for x86-64 (`packages/decompiler/host/src/core_types.cc`),
 * `byte` to `qword` among NASM's words below.
 */
const GHIDRA_WORDS = new Set([
    'undefined',
    ...Array.from({ length: 8 }, (_, index) => `undefined${index + 1}`),
    'code',
    'sbyte',
    'sword',
    'sdword',
    'sqword',
    'int3',
    'int5',
    'int6',
    'int7',
    'int16',
    'uint',
    'uint3',
    'uint5',
    'uint6',
    'uint7',
    'uint16',
    'ushort',
    'ulong',
    'longlong',
    'ulonglong',
    'longdouble',
    'float2',
    'float10',
    'float16',
    'wchar16',
    'wchar32'
])

/**
 * Every x86 register NASM names, and the instruction pointer, which the disassembler writes:
 * a label named `rax` would read as the register in an operand. Compared in lower case, as NASM
 * reads registers in any case.
 */
export const X86_REGISTER_NAMES: ReadonlySet<string> = new Set([
    ...X86_ASSEMBLER_REGISTERS,
    'rip',
    'eip'
])

/** The words NASM reads in an operand, besides registers, compared in lower case. */
export const NASM_OPERAND_WORDS: ReadonlySet<string> = new Set([
    'byte',
    'word',
    'dword',
    'qword',
    'tword',
    'oword',
    'yword',
    'zword',
    'ptr',
    'rel',
    'abs',
    'short',
    'near',
    'far',
    'strict',
    'wrt',
    'seg'
])

/**
 * The shapes of the names the decompiler gives a function's variables and parameters
 * (`ScopeInternal::buildVariableName` and `ScopeLocal::buildVariableName`), and Ghidra's window's
 * `local_10`: a type's letters (`pc`, `au`) before `Var1`, `Stack_98` or a storage space and its
 * address; `param_2`; `in_`, `unaff_` and `extraout_` before a register. The printer adds `_` to a
 * stack variable read at another size (`_uStack_60`).
 */
const GHIDRA_LOCAL_NAMES = [
    /^_?[a-z]*Var\d+$/,
    /^_?[a-z]*Stack[XY]?_[0-9a-f]+$/,
    /^_?[a-z]*(?:Ram|Register|Unique|Join|Stack)[0-9a-f]+$/,
    /^local_(?:res)?[0-9a-f]+$/,
    /^param_\d+$/,
    /^(?:in|unaff|extraout)_\w+$/
]
/** What `makeNameUnique` adds to a name another symbol has: `_00`, or `_x00100` past 99. */
const UNIQUE_SUFFIX = /_(?:\d{2}|x\d{5})$/

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** A character of `name` a C identifier cannot hold, said as the sentence can name it. */
function foreignCharacter(name: string): string {
    const character = Array.from(name).find((each) => !/[A-Za-z0-9_]/.test(each))!
    if (character === ' ') return 'a space'
    if (character === '\t') return 'a tab'
    if (character === '\n' || character === '\r') return 'a line break'
    const code = character.codePointAt(0)!
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return 'a control character'
    if (/\s/u.test(character)) return 'a blank'
    return `“${character}”`
}

/**
 * Why `name` cannot be any name a person gives, label or variable, from its text alone: not a C
 * identifier of at most {@link NAME_LENGTH_LIMIT} characters, or a word that already means
 * something where names are written (a C or C++ keyword, a type of the decompiler's, an x86
 * register, a word of NASM's operands). Undefined when it can be.
 */
export function nameProblem(name: string): string | undefined {
    if (!name) return 'Write a name'
    if (!IDENTIFIER.test(name)) {
        if (/^[0-9]/.test(name)) return 'A name cannot start with a digit'
        return `A name holds letters, digits and underscores only, not ${foreignCharacter(name)}`
    }
    if (name.length > NAME_LENGTH_LIMIT)
        return `A name has at most ${NAME_LENGTH_LIMIT} characters, and this one has ${name.length}`
    if (C_KEYWORDS.has(name)) return `${name} is a keyword of C`
    if (CPP_KEYWORDS.has(name)) return `${name} is a keyword of C++`
    if (GHIDRA_WORDS.has(name)) return `${name} is a type the decompiler writes`
    const lower = name.toLowerCase()
    if (X86_REGISTER_NAMES.has(lower)) return `${name} is the name of an x86 register`
    if (NASM_OPERAND_WORDS.has(lower)) return `${name} is a word NASM reads in operands`
    return undefined
}

/**
 * Whether `name` reads as one the decompiler gives a variable (`iVar1`, `local_10`, `param_2`,
 * `uStack_48`, `in_RAX`, `iVar1_00`), which a person's name for a local must not, so that a
 * Pseudocode reader never takes it for the decompiler's.
 */
export function looksLikeGhidraName(name: string): boolean {
    const bare = name.replace(UNIQUE_SUFFIX, '')
    return GHIDRA_LOCAL_NAMES.some((pattern) => pattern.test(name) || pattern.test(bare))
}

/**
 * A label as a name check reads it, which a `ListingLabel` is: its name as defined (`main`,
 * `.LAB_3`, `puts@plt`) and its link-time address.
 */
export type NamedLabel = Readonly<{ name: string; address: number }>

const hex = (address: number) => `0x${address.toString(16)}`

/**
 * Why `name` cannot be a person's name for the label at link-time `address`, or undefined when it
 * can. `labels` are the names it must differ from, as the Listing defines them, and which a caller
 * passes depends on the label:
 * - a function, data or string label: every label of the Listing, raw, invented or renamed. A
 *   library symbol's label counts by its library name too, since the Pseudocode prints `puts@plt`
 *   as `puts`;
 * - a jump target (`jumpTarget`), written `.name` in its function: that function's labels, among
 *   which it must differ from the other jump targets alone.
 *
 * Labels at `address` itself never clash: the label being renamed, and its aliases, which name the
 * same place.
 */
export function globalNameProblem(
    name: string,
    labels: Iterable<NamedLabel>,
    address: number,
    { jumpTarget = false }: { jumpTarget?: boolean } = {}
): string | undefined {
    const problem = nameProblem(name)
    if (problem) return problem
    if (jumpTarget) {
        const written = `.${name}`
        for (const label of labels)
            if (label.address !== address && label.name === written)
                return `${name} is the name of another jump target of this function, at ${hex(label.address)}`
        return undefined
    }
    for (const label of labels) {
        if (label.address === address) continue
        if (label.name === name)
            return `${name} is the name of another label, at ${hex(label.address)}`
        if (libraryName(label.name) === name)
            return `${name} is the name of another label, ${label.name}, at ${hex(label.address)}`
    }
    return undefined
}

/**
 * Why `name` cannot be a person's name for a variable or parameter of one function's Pseudocode,
 * or undefined when it can. `variables` are the names the function's other variables have now, as
 * the Pseudocode prints them, the one being renamed left out; `globals` are every label name of
 * the Listing, which a local must not hide (Ghidra would then print the global as `::printf`).
 */
export function localNameProblem(
    name: string,
    variables: Iterable<string>,
    globals: Iterable<string>
): string | undefined {
    const problem = nameProblem(name)
    if (problem) return problem
    if (looksLikeGhidraName(name))
        return `${name} reads as a name the decompiler gives; choose one that does not`
    for (const variable of variables)
        if (variable === name) return `${name} is the name of another variable of this function`
    for (const global of globals)
        if (global === name || libraryName(global) === name)
            return `${name} is the name of a global, which the Pseudocode would then write as ::${name}`
    return undefined
}

/**
 * The library symbol a label stands for, the part before its `@`: `puts` for `puts@plt`,
 * `puts@plt_resolver` and `puts@got`, `memcpy` for a versioned `memcpy@GLIBC_2.14`; undefined for
 * a name without one.
 */
function libraryName(name: string): string | undefined {
    const at = name.indexOf('@')
    return at > 0 ? name.slice(0, at) : undefined
}

/** A PLT stub's or a GOT slot's name, which its library symbol fixes. */
const LIBRARY_BOUND = /^(.+)@(?:plt|plt_resolver|got)$/

/**
 * Why the label named `name` cannot be renamed at all, or undefined when it can: a PLT stub
 * (`name@plt`, `name@plt_resolver`) or a GOT slot (`name@got`) is named after the library symbol
 * the dynamic linker binds there, and the Pseudocode prints it as that library function
 * (decision 6).
 */
export function libraryNameProblem(name: string): string | undefined {
    const match = LIBRARY_BOUND.exec(name)
    return match ? `${match[1]} is named by the library it comes from` : undefined
}
