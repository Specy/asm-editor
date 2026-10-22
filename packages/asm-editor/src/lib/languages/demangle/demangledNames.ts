/**
 * The readable forms of a C++ symbol's mangled name, as the editor shows them for an Executable,
 * the libraries it loads and a Build's output ([cpp-demangling.md](../../../../../../docs/design/cpp-demangling.md),
 * decisions 3 to 8). Pure: it takes the demangler module's `describe` (`loadDemangler.ts`), so the
 * Listing worker and the main thread read names alike.
 *
 * A Listing's label is split into the mangled name and the suffix the Listing gave it
 * ({@link splitLabel}); the module reads the name's parts off LLVM's syntax tree; the standard
 * templates in each part are shortened ({@link shortenTemplates}); and the parts are put together
 * as the forms a {@link DemangledName} carries.
 */

/**
 * What `describe` in `scripts/demangle/demangle.cpp` reads in a mangled name. `name`,
 * `parameters` and `returns` are marked: a template argument list is `OPEN … CLOSE` with its
 * arguments parted by `SEPARATOR` (never `<`, `>` and `, `, so `operator<` and a template argument
 * list never read alike), `[abi:…]` tags are left out, and `std::string`'s and the streams'
 * substitutions are spelled as the templates they stand for when the demangler would expand them.
 */
export type Description = {
    /** `function` when the name, past a special name's words, is a function's, else `data`. */
    kind: 'function' | 'data'
    /** The demangler's own text: what `__cxa_demangle` returns. */
    text: string
    /** A special name's words: `vtable for `, `non-virtual thunk to `, or ''. */
    special: string
    /** A function's qualified name, else the whole name after the special words; marked. */
    name: string
    /** A function's parameters with their parentheses, `(int, char const*)`, else ''; marked. */
    parameters: string
    /** A function's return type, which only template functions mangle, else ''; marked. */
    returns: string
    /** ` const`, ` volatile`, ` restrict`, ` &`, ` &&`, in that order, or ''. */
    qualifiers: string
    /** A constructor's or destructor's mangled variant: `C1`, `C2`, `C3`, `CI1`, `D0`, …, or ''. */
    variant: string
    /** A GCC clone suffix: `.isra.0.cold`, or ''. */
    clone: string
}

/** The module's `describe`: undefined for a name LLVM's demangler cannot read. */
export type Describe = (mangled: string) => Description | undefined

/** What a template argument list is marked by in a {@link Description}. */
export const OPEN = '\x01'
export const CLOSE = '\x02'
export const SEPARATOR = '\x03'

/** A constructor's or destructor's variant, by its mangled variant. */
export type CtorDtorVariant =
    | 'complete'
    | 'base'
    | 'deleting'
    | 'allocating'
    | 'complete inheriting'
    | 'base inheriting'
    | 'unified'
    | 'comdat'

/** The variant each mangled variant names, `D0` the deleting destructor; `C…` are constructors. */
export const VARIANTS: Record<string, CtorDtorVariant> = {
    C1: 'complete',
    C2: 'base',
    C3: 'allocating',
    C4: 'unified',
    C5: 'comdat',
    CI1: 'complete inheriting',
    CI2: 'base inheriting',
    D0: 'deleting',
    D1: 'complete',
    D2: 'base',
    D4: 'unified',
    D5: 'comdat'
}

/**
 * The word a signature carries for the variants that read alike but behave differently
 * (decision 8): the deleting destructor beside the complete one in a vtable, and the rarer
 * allocating and inheriting constructors. Complete and base variants stay unmarked.
 */
const MARKS: Partial<Record<CtorDtorVariant, string>> = {
    deleting: 'deleting',
    allocating: 'allocating',
    'complete inheriting': 'inheriting',
    'base inheriting': 'inheriting'
}

/**
 * Special data's identifiers in the Pseudocode, filed under what they are for, as Ghidra's symbol
 * tree files them (decision 16): `vtable for game::Boss` is `game::Boss::vtable`. A construction
 * vtable, `construction vtable for A-in-B`, is filed under `B`.
 */
const SPECIAL_DATA: Record<string, string> = {
    'vtable for ': 'vtable',
    'VTT for ': 'VTT',
    'typeinfo for ': 'typeinfo',
    'typeinfo name for ': 'typeinfo_name',
    'guard variable for ': 'guard',
    'reference temporary for ': 'reference_temporary',
    'construction vtable for ': 'construction_vtable'
}

/**
 * Special names of functions that stand for another function or variable, and take its name in
 * the Pseudocode, as Ghidra names a thunk (decision 16).
 */
const SPECIAL_FUNCTIONS = new Set([
    'non-virtual thunk to ',
    'virtual thunk to ',
    'covariant return thunk to ',
    'thread-local wrapper routine for ',
    'thread-local initialization routine for '
])

/** GNU's words for a `_ZGTt` transaction clone, which LLVM's demangler does not read. */
const TRANSACTION_CLONE = 'transaction clone for '

/** Special names of functions: the ones above, transaction clones and modules' initializers. */
const FUNCTION_WORDS = [...SPECIAL_FUNCTIONS, TRANSACTION_CLONE, 'initializer for module ']

/** The longest comment a signature is written in whole; a longer one is `name(…)` (decision 9). */
export const LONGEST_COMMENT = 100

/** A C++ symbol's readable forms. Each leaves out the suffix the Listing gave it unless it says. */
export type DemangledName = {
    /**
     * How the name reads: `function` for a function and for the special names standing for one
     * (thunks, transaction clones, thread-local routines), `data` for anything else, Rust's legacy
     * names included, which mangle no parameters.
     */
    kind: 'function' | 'data'
    /** The name the demangler read: `_ZNSaIcEC1Ev` for `_ZNSaIcEC1Ev@plt`. */
    mangled: string
    /**
     * The Listing's suffix after it: `@plt`, `@plt_resolver`, `@got`, a version (`@GLIBCXX_3.4`,
     * `@@GLIBCXX_3.4`), `_2` numbering, `@plt_2`, or ''.
     */
    suffix: string
    /**
     * For lists and the Pseudocode: the qualified name with standard templates shortened, without
     * return type, parameters, qualifiers and `[abi:…]` tags, keeping the function's own template
     * arguments, its clone suffix and the Listing's suffix: `std::ostream::operator<<@plt`,
     * `game::clampTo<int>`, `std::endl<char, std::char_traits<char>> [clone .isra.0.cold]`. Data
     * read as their one form: `vtable for game::Boss`, `std::cout@GLIBCXX_3.4`.
     */
    short: string
    /**
     * For hover titles and lists' collisions: the short name with its shortened parameters and
     * qualifiers, then the Listing's suffix and the variant's mark:
     * `std::allocator<char>::allocator()@plt`, `game::Player::~Player() [deleting]`. Data: as
     * `short`.
     */
    signature: string
    /**
     * The Listing's trailing comment: the signature without the Listing's suffix, which the operand
     * beside it shows, or `name(…)` when that is over {@link LONGEST_COMMENT} characters. A Listing
     * adds any `+0x10` offset and escapes `"`.
     */
    comment: string
    /**
     * The demangler's exact text, without the Listing's suffix:
     * `std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char>>::operator+=(…)`.
     * A transaction clone's starts `transaction clone for `, as GNU's `c++filt` writes it.
     */
    text: string
    /** What a list shows: `short` until {@link listForms} tells a Listing's collisions apart. */
    list: string
    /** A constructor's or destructor's variant, which a hover always names. */
    variant?: CtorDtorVariant
    /** A special name's words: `vtable for`, `non-virtual thunk to`, `transaction clone for`. */
    special?: string
    /** The Pseudocode's name for it (decision 13). */
    pseudocode: PseudocodeName
}

/**
 * A name as the decompiler package takes a function's or a datum's (`ProgramFunction`,
 * `ProgramData`): `{ name: 'operator+=', namespace: ['std', 'string'], symbol:
 * '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEpLERKS4_' }`.
 */
export type PseudocodeName = {
    /**
     * The namespaces and classes it is in, outermost first, split at top-level `::` only:
     * `['std', 'vector<std::string>']`, `['main', "'lambda'(int)"]`, `['greeting()']`; empty for
     * the global scope.
     */
    namespace: string[]
    /**
     * Its own name, never split again: `push_back`, `operator<<<char, std::char_traits<char>,
     * std::allocator<char>>`, with its clone suffix and without the Listing's suffix, which the
     * caller adds where it keeps one. Special data read as identifiers filed under what they are
     * for (`vtable` in `['game', 'Boss']`, `guard` in `['greeting()', 'text']`); special functions
     * take the name of what they stand for (a thunk to `game::Boss::~Boss` is `~Boss` in
     * `['game', 'Boss']`, a thread-local wrapper of `game::x` is `x` in `['game']`).
     */
    name: string
    /** The symbol prototypes and pointers bind by: the mangled name without the Listing's suffix. */
    symbol: string
}

/** A Pseudocode name as one text: `std::vector<std::string>::push_back`, `game::Boss::vtable`. */
export function pseudocodeText({ namespace, name }: PseudocodeName): string {
    return [...namespace, name].join('::')
}

/** A Listing label's mangled name and the suffix after it. */
export type LabelParts = { mangled: string; suffix: string }

/**
 * Splits off what the Listing adds to a symbol's name, which makes it unreadable to the demangler
 * (decision 4): everything from the first `@` (`@plt`, `@plt_resolver`, `@got`, a version, and any
 * `_N` after them), or a trailing `_N` the Listing numbered a duplicate with, when the name without
 * it can be read and with it cannot, or when it follows a GCC clone suffix, whose parts never end
 * in `_` and digits. A name with nothing to split comes back whole.
 */
export function splitLabel(label: string, describe: Describe): LabelParts {
    const at = label.indexOf('@')
    if (at > 0) return { mangled: label.slice(0, at), suffix: label.slice(at) }
    const numbered = /_\d+$/.exec(label)
    if (numbered && label.startsWith('_Z')) {
        const mangled = label.slice(0, numbered.index)
        const afterClone = mangled.indexOf('.', 2) > 0
        if (read(mangled, describe) && (afterClone || !read(label, describe)))
            return { mangled, suffix: numbered[0] }
    }
    return { mangled: label, suffix: '' }
}

/**
 * The module's reading of a mangled name, with GNU's transaction clones (`_ZGTt…`), which LLVM's
 * demangler does not know, read as the function they clone.
 */
function read(mangled: string, describe: Describe): Description | undefined {
    if (!mangled.startsWith('_ZGTt')) return describe(mangled)
    const cloned = describe(`_Z${mangled.slice('_ZGTt'.length)}`)
    return (
        cloned && {
            ...cloned,
            special: TRANSACTION_CLONE + cloned.special,
            text: TRANSACTION_CLONE + cloned.text
        }
    )
}

/**
 * The readable forms of a Listing label or a symbol's name, or undefined for a name that is not
 * mangled (`main`, `FUN_brave_otter`) or that the demangler cannot read (Rust's v0 names,
 * `_ZTIPKDF64x`, names over 8,192 characters), which show raw.
 */
export function demangledName(label: string, describe: Describe): DemangledName | undefined {
    if (!label.startsWith('_Z')) return undefined
    const { mangled, suffix } = splitLabel(label, describe)
    const description = read(mangled, describe)
    if (!description) return undefined
    const { special, qualifiers } = description
    const variant = VARIANTS[description.variant] as CtorDtorVariant | undefined
    const mark = variant && MARKS[variant] ? ` [${MARKS[variant]}]` : ''
    const clone = description.clone ? ` [clone ${description.clone}]` : ''
    const shortened = shortenTemplates(description.name)
    const name = unmark(shortened)
    const shared = {
        mangled,
        suffix,
        text: description.text,
        ...(variant ? { variant } : {}),
        ...(special ? { special: special.trimEnd() } : {}),
        pseudocode: { ...pseudocodeName(description, shortened), symbol: mangled }
    }
    const kind =
        description.kind === 'function' || FUNCTION_WORDS.some((words) => special.startsWith(words))
            ? 'function'
            : 'data'
    if (description.kind !== 'function') {
        const form = special + name + clone
        return {
            kind,
            short: form + suffix,
            signature: form + suffix,
            comment: form,
            list: form + suffix,
            ...shared
        }
    }
    const parameters = unmark(shortenTemplates(description.parameters))
    const short = special + name + clone + suffix
    const signed = special + name + parameters + qualifiers + clone
    const comment =
        (signed + mark).length > LONGEST_COMMENT
            ? `${special}${name}(…)${clone}${mark}`
            : signed + mark
    return { kind, short, signature: signed + suffix + mark, comment, list: short, ...shared }
}

/** The Pseudocode's namespace and name of a description whose name is shortened (marked). */
function pseudocodeName(
    description: Description,
    shortened: string
): Omit<PseudocodeName, 'symbol'> {
    const special = description.special.startsWith(TRANSACTION_CLONE)
        ? description.special.slice(TRANSACTION_CLONE.length)
        : description.special
    const clone = description.clone ? ` [clone ${description.clone}]` : ''
    const identifier = SPECIAL_DATA[special]
    if (identifier) {
        const target =
            special === 'construction vtable for '
                ? shortened.slice(topLevelIndexOf(shortened, '-in-') + '-in-'.length)
                : shortened
        return { namespace: splitScope(target).map(unmark), name: identifier + clone }
    }
    if (special && !SPECIAL_FUNCTIONS.has(special))
        return { namespace: [], name: special + unmark(shortened) + clone }
    const parts = splitScope(shortened).map(unmark)
    return { namespace: parts.slice(0, -1), name: parts.at(-1)! + clone }
}

/** A marked text as the demangler prints it: `<`, `>` and `, ` for the marks. */
export function unmark(marked: string): string {
    if (!marked.includes(OPEN)) return marked
    return marked.replaceAll(OPEN, '<').replaceAll(CLOSE, '>').replaceAll(SEPARATOR, ', ')
}

/** The index of the mark closing the template argument list `open` opens, or -1. */
function closingMark(text: string, open: number): number {
    let depth = 0
    for (let i = open; i < text.length; i++) {
        if (text[i] === OPEN) depth++
        else if (text[i] === CLOSE && --depth === 0) return i
    }
    return -1
}

/** A template argument list's arguments: its text between the marks, split at its own separators. */
function splitArguments(inner: string): string[] {
    const parts: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < inner.length; i++) {
        if (inner[i] === OPEN) depth++
        else if (inner[i] === CLOSE) depth--
        else if (inner[i] === SEPARATOR && depth === 0) {
            parts.push(inner.slice(start, i))
            start = i + 1
        }
    }
    parts.push(inner.slice(start))
    return parts
}

/** Whether a character opens or closes a template argument list or a bracket. */
const opens = (character: string) => character === OPEN || '([{'.includes(character)
const closes = (character: string) => character === CLOSE || ')]}'.includes(character)

/**
 * Whether a qualified name's part from `at` is a conversion operator, `operator std::string`,
 * whose type is not split at its `::`.
 */
const conversionAt = (marked: string, at: number) =>
    /^operator (?!new\b|delete\b|co_await\b)[^\s(]/.test(marked.slice(at, at + 20))

/** Where `needle` first stands outside every template argument list and bracket, or -1. */
function topLevelIndexOf(text: string, needle: string): number {
    let depth = 0
    for (let i = 0; i < text.length; i++) {
        if (opens(text[i])) depth++
        else if (closes(text[i])) depth--
        else if (depth === 0 && text.startsWith(needle, i)) return i
    }
    return -1
}

/**
 * A marked qualified name's parts, split at its top-level `::` only: `['std',
 * 'vector<std::string>', 'push_back']`, `['main', "'lambda'(int)", 'operator()']`,
 * `['(anonymous namespace)', 'hidden']`, `['greeting()', 'text']`. A conversion operator's type
 * stays whole up to its parameters: `['Foo', 'operator std::string']`.
 */
export function splitScope(marked: string): string[] {
    const parts: string[] = []
    let start = 0
    let depth = 0
    let conversion = conversionAt(marked, 0)
    for (let i = 0; i < marked.length; i++) {
        const character = marked[i]
        if (opens(character)) {
            if (character === '(' && depth === 0) conversion = false
            depth++
        } else if (closes(character)) {
            depth--
        } else if (depth === 0 && !conversion && character === ':' && marked[i + 1] === ':') {
            parts.push(marked.slice(start, i))
            start = i + 2
            i++
            conversion = conversionAt(marked, start)
        }
    }
    parts.push(marked.slice(start))
    return parts
}

const CHARACTER_PREFIXES: Record<string, string> = {
    char: '',
    wchar_t: 'w',
    char8_t: 'u8',
    char16_t: 'u16',
    char32_t: 'u32'
}
const STREAMS = new Set([
    'ios',
    'streambuf',
    'istream',
    'ostream',
    'iostream',
    'filebuf',
    'ifstream',
    'ofstream',
    'fstream'
])
const STRING_STREAMS = new Set(['stringbuf', 'istringstream', 'ostringstream', 'stringstream'])

const template = (head: string, ...args: string[]) =>
    `${head}${OPEN}${args.join(SEPARATOR)}${CLOSE}`
const allocatorOf = (type: string) => template('std::allocator', type)
const pairOf = (key: string, value: string) => template('std::pair', `${key} const`, value)
/**
 * Each container's and adaptor's arguments' defaults, built from the (shortened) arguments before
 * them; `undefined` for an argument without one.
 */
const DEFAULTS: Record<string, (args: readonly string[]) => (string | undefined)[]> = {
    vector: ([t]) => [undefined, allocatorOf(t)],
    deque: ([t]) => [undefined, allocatorOf(t)],
    list: ([t]) => [undefined, allocatorOf(t)],
    forward_list: ([t]) => [undefined, allocatorOf(t)],
    set: ([k]) => [undefined, template('std::less', k), allocatorOf(k)],
    multiset: ([k]) => [undefined, template('std::less', k), allocatorOf(k)],
    map: ([k, v]) => [undefined, undefined, template('std::less', k), allocatorOf(pairOf(k, v))],
    multimap: ([k, v]) => [
        undefined,
        undefined,
        template('std::less', k),
        allocatorOf(pairOf(k, v))
    ],
    unordered_set: ([k]) => [
        undefined,
        template('std::hash', k),
        template('std::equal_to', k),
        allocatorOf(k)
    ],
    unordered_multiset: ([k]) => [
        undefined,
        template('std::hash', k),
        template('std::equal_to', k),
        allocatorOf(k)
    ],
    unordered_map: ([k, v]) => [
        undefined,
        undefined,
        template('std::hash', k),
        template('std::equal_to', k),
        allocatorOf(pairOf(k, v))
    ],
    unordered_multimap: ([k, v]) => [
        undefined,
        undefined,
        template('std::hash', k),
        template('std::equal_to', k),
        allocatorOf(pairOf(k, v))
    ],
    unique_ptr: ([t]) => [undefined, template('std::default_delete', t)],
    stack: ([t]) => [undefined, template('std::deque', t)],
    queue: ([t]) => [undefined, template('std::deque', t)],
    priority_queue: ([t]) => [undefined, template('std::vector', t), template('std::less', t)]
}

/** An argument as the table compares it: libc++'s `std::__1::` read as `std::`. */
const canonical = (argument: string) => argument.replaceAll('std::__1::', 'std::')

/** The shorter spelling of one template-id, `head<args>`, whose arguments are shortened already. */
function shortTemplate(head: string, args: readonly string[]): string {
    const standard = /^std::(?:__cxx11::|__1::)?(\w+)$/.exec(head)
    if (!standard) return template(head, ...args)
    const name = standard[1]
    const compared = args.map(canonical)
    const [character] = compared
    const prefix = CHARACTER_PREFIXES[character]
    if (prefix !== undefined) {
        const traits = template('std::char_traits', character)
        const allocator = allocatorOf(character)
        const traitsOnly = compared.length === 2 && compared[1] === traits
        const withAllocator =
            compared.length === 3 && compared[1] === traits && compared[2] === allocator
        if (name === 'basic_string' && withAllocator) return `std::${prefix}string`
        if (name === 'basic_string_view' && traitsOnly) return `std::${prefix}string_view`
        // Only `char` and `wchar_t` have stream typedefs.
        const stream = name.replace(/^basic_/, '')
        if (prefix.length <= 1 && name.startsWith('basic_')) {
            if (STREAMS.has(stream) && traitsOnly) return `std::${prefix}${stream}`
            if (STRING_STREAMS.has(stream) && withAllocator) return `std::${prefix}${stream}`
        }
    }
    const defaults = DEFAULTS[name]?.(args)
    let kept = args.length
    if (defaults)
        while (
            kept > 1 &&
            defaults[kept - 1] !== undefined &&
            compared[kept - 1] === canonical(defaults[kept - 1]!)
        )
            kept--
    return template(`std::${name}`, ...args.slice(0, kept))
}

/**
 * The head of the template-id whose argument list `text` ends before: the qualified name written
 * just before it (`std::__cxx11::basic_string`), or '' when there is none or it is qualified by
 * something that is not a name (a template's arguments, `(anonymous namespace)`), which no table
 * entry matches.
 */
function templateHead(text: string): string {
    let start = text.length
    while (start > 0 && /[\w$:]/.test(text[start - 1])) start--
    const head = text.slice(start)
    return /^(?:[\w$]+::)*[\w$]+$/.test(head) ? head : ''
}

/**
 * Rewrites every template-id of a marked text innermost first (decision 6): the strings, string
 * views and streams of each character type become their typedefs (`std::string`, `std::wostream`),
 * containers', `unique_ptr`'s and the adaptors' trailing default arguments go, an argument that is
 * not the default stopping it, and `__cxx11` (libc++'s `__1`) goes from the names of templates
 * directly in `std`. Everything else stays as the demangler wrote it. The result is marked.
 */
export function shortenTemplates(marked: string): string {
    let out = ''
    let from = 0
    for (let open = marked.indexOf(OPEN); open >= 0; open = marked.indexOf(OPEN, from)) {
        const close = closingMark(marked, open)
        if (close < 0) break
        out += marked.slice(from, open)
        const head = templateHead(out)
        const args = splitArguments(marked.slice(open + 1, close)).map(shortenTemplates)
        out =
            out.slice(0, out.length - head.length) +
            (head ? shortTemplate(head, args) : template('', ...args))
        from = close + 1
    }
    return out + marked.slice(from)
}

/** One entry of a list a Listing names its functions in: its label and the label's forms. */
export type ListedName = { name: string; demangled?: DemangledName }

/**
 * What each of a Listing's functions is listed as (decision 7): its short name (a raw name when
 * it has no demangled forms); where two share it, their signatures; where those match too, the
 * signature with the constructor's or destructor's variant (`[complete]`, `[base]`; a signature
 * that carries a mark keeps it). Past that, only the address tells them apart, as libstdc++'s two
 * string ABIs, which read alike.
 */
export function listForms(functions: readonly ListedName[]): string[] {
    const counted = (keys: readonly string[]) => {
        const counts = new Map<string, number>()
        for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
        return (key: string) => counts.get(key)! > 1
    }
    const shorts = functions.map(({ name, demangled }) => demangled?.short ?? name)
    const shortCollides = counted(shorts)
    const signatures = functions.map(({ demangled }, i) =>
        demangled && shortCollides(shorts[i]) ? demangled.signature : shorts[i]
    )
    const signatureCollides = counted(signatures)
    return functions.map(({ demangled }, i) => {
        const variant = demangled?.variant
        return variant && !MARKS[variant] && signatureCollides(signatures[i])
            ? `${signatures[i]} [${variant}]`
            : signatures[i]
    })
}
