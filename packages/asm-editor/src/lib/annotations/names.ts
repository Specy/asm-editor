import { NASM_OPERAND_WORDS, NASM_REGISTERS } from '#lib/listing/nasmWords.ts'

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
 * The names the C library's declarations give types, which the decompiler writes as they are
 * (`size_t`, `FILE *`, `tm *`): every typedef and every struct and union tag of the prototypes the
 * Pseudocode is decompiled with (`@specy/decompiler/prototypes/glibc.h`, which a test reads them
 * from), so that no variable reads `size_t size_t;`.
 */
const C_LIBRARY_TYPES = new Set([
    ...['size_t', 'ssize_t', 'intptr_t', 'uintptr_t', 'intmax_t', 'uintmax_t'],
    ...['int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t'],
    ...['off_t', 'pid_t', 'uid_t', 'gid_t', 'mode_t', 'time_t', 'clock_t', 'clockid_t'],
    ...['suseconds_t', 'useconds_t', 'socklen_t', 'sa_family_t', 'in_port_t', 'in_addr_t'],
    ...['nfds_t', 'sigset_t', '__sighandler_t', 'FILE', 'DIR', 'va_list'],
    ...['pthread_t', 'pthread_key_t', 'pthread_once_t', 'pthread_attr_t', 'pthread_mutex_t'],
    ...['pthread_mutexattr_t', 'pthread_cond_t', 'pthread_condattr_t'],
    ...['_IO_FILE', '__dirstream', '__va_list_tag', '__jmp_buf_tag', 'tm', 'timespec', 'timeval'],
    ...['in_addr', 'sockaddr', 'sockaddr_in', 'pollfd', 'option', 'dirent', 'addrinfo'],
    ...['hostent', '_Unwind_Exception', '_Unwind_Context']
])

/**
 * The C library's constants, which a reader of C takes for the library's wherever they are
 * written: `NULL`, `EOF`. Its objects (`stdin`, `errno`) are labels of a program that uses them,
 * which a name differs from as from any label.
 */
const C_LIBRARY_CONSTANTS = new Set([
    ...['NULL', 'EOF', 'BUFSIZ', 'FILENAME_MAX', 'RAND_MAX', 'EXIT_SUCCESS', 'EXIT_FAILURE'],
    ...['SEEK_SET', 'SEEK_CUR', 'SEEK_END']
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
 * something where names are written (a C or C++ keyword, a type of the decompiler's or of the C
 * library's, a constant of the C library, an x86 register, a word of NASM's operands,
 * `nasmWords.ts`). Undefined when it can be.
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
    if (C_LIBRARY_TYPES.has(name))
        return `${name} is a type of the C library, which the decompiler writes`
    if (C_LIBRARY_CONSTANTS.has(name)) return `${name} is a constant of the C library`
    const lower = name.toLowerCase()
    if (NASM_REGISTERS.has(lower)) return `${name} is the name of an x86 register`
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
 * A label as a name check reads it: its name as defined (`main`, `.LAB_3`, `puts@plt`), its
 * address, and for a label the person renamed, `raw`, the name the Listing gave it
 * (`ListingLabel.renamed.from`), whose library symbol the Listing still keeps for it.
 */
export type NamedLabel = Readonly<{ name: string; address: number; raw?: string }>

/** A variable the person named in a function's Pseudocode, and that function, as a refusal names it. */
export type NamedLocal = Readonly<{ name: string; owner: string }>

const hex = (address: number) => `0x${address.toString(16)}`

/**
 * Why `name` cannot be a person's name for the label at link-time `address`, or undefined when it
 * can. `labels` are the names it must differ from, as the Listing defines them, and which a caller
 * passes depends on the label:
 * - a function, data or string label: every label of the Listing, raw, invented or renamed. A
 *   library symbol's label counts by its library name too, since the Pseudocode prints `puts@plt`
 *   as `puts`, and keeps it when the person renamed a versioned datum (`stdin@GLIBC_2.2.5` named
 *   `my_in` still holds `stdin`), as the Listing settles renames (`generateListing`'s `rename`);
 *   `locals` are the variables the person named in the Executable's functions, whose Pseudocode
 *   would then write the label as `::name`;
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
    {
        jumpTarget = false,
        locals = []
    }: { jumpTarget?: boolean; locals?: Iterable<NamedLocal> } = {}
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
        if (libraryName(label.raw ?? label.name) !== name) continue
        return label.raw === undefined
            ? `${name} is the name of another label, ${label.name}, at ${hex(label.address)}`
            : `${name} is the name of another label, ${label.raw}, which you renamed ${label.name}, at ${hex(label.address)}`
    }
    for (const local of locals)
        if (local.name === name)
            return `${name} is the name of a variable of ${local.owner}, whose Pseudocode would then write this label as ::${name}`
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
