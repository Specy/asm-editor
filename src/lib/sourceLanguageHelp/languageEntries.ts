import type { HelpLanguage } from './context'
import type { CompilationTarget } from '$lib/sourceCompilation/records'

export type LanguageEntry = {
    name: string
    summary: string
    kind: 'keyword' | 'snippet'
    insertText?: string
}
const common: Record<string, string> = {
    break: 'Leaves the nearest loop or switch statement.',
    case: 'Labels a value handled by a switch statement.',
    char: 'Character-sized integer type.',
    const: 'Prevents modifying an object through this declaration.',
    continue: 'Starts the next iteration of the nearest loop.',
    default: 'Handles switch values without a matching case.',
    do: 'Starts a loop whose condition is checked after its body.',
    double: 'Double-precision floating-point type.',
    else: 'Runs the alternative branch when an if condition is false.',
    enum: 'Declares a set of named integer values.',
    extern: 'Declares an object or function defined elsewhere.',
    float: 'Single-precision floating-point type.',
    for: 'Repeats a body with initialization, a condition and an update.',
    if: 'Runs a branch when its condition is true.',
    int: 'Ordinary signed integer type; its size depends on the selected compilation target.',
    long: 'Integer type modifier; its size depends on the selected compilation target.',
    return: 'Returns from a function, optionally with a result.',
    short: 'Short integer type modifier.',
    signed: 'Declares an integer type that can represent negative values.',
    sizeof: 'Size of a type or expression, measured in bytes.',
    static: 'Gives a local object a lifetime lasting the program, or limits a global declaration to this source file.',
    struct: 'Groups named fields into one type.',
    switch: 'Selects a case by an integer or enumeration value.',
    typedef: 'Gives an existing type another name.',
    union: 'Groups fields that share the same storage.',
    unsigned: 'Declares an integer type with nonnegative values.',
    void: 'No return value, or an unspecified pointed-to type in void *.',
    volatile: 'Preserves accesses to an object that can change outside ordinary program flow.',
    while: 'Repeats a body while its condition is true.'
}
const c: Record<string, string> = {
    auto: 'Declares automatic storage duration for a local object.',
    inline: 'Allows a function definition to be used at its call sites; it does not force inlining.',
    restrict:
        'Promises that this pointer is the primary way to access the pointed-to object during its scope.',
    _Bool: 'C boolean type, holding zero or one.',
    _Alignas: 'Requests an alignment for an object.',
    _Alignof: 'Reports the alignment required by a type.',
    _Generic: 'Chooses an expression based on the type of another expression.',
    _Noreturn: 'Declares a function that never returns to its caller.',
    _Static_assert: 'Checks a constant expression at compile time.'
}
const cpp: Record<string, string> = {
    auto: 'Infers a variable type from its initializer.',
    inline: 'Allows a function or variable definition to appear in multiple source files.',
    alignas: 'Requests an alignment for an object.',
    alignof: 'Reports the alignment required by a type.',
    bool: 'Boolean type, holding true or false.',
    class: 'Defines a class; its members are private by default.',
    constexpr: 'Declares a value or function that can be evaluated at compile time.',
    decltype: 'Uses the type of an expression in a declaration.',
    false: 'False boolean value.',
    final: 'Prevents further inheritance or overriding.',
    namespace: 'Groups names under a qualifier such as std::.',
    new: 'Constructs an object; ordinary new uses dynamic allocation, while placement new uses storage supplied by the caller. Ordinary allocation needs a target runtime allocator.',
    delete: 'Destroys an object created by new and releases its allocated storage.',
    noexcept: 'Declares that a function does not throw an exception.',
    nullptr: 'Null pointer value.',
    override: 'Checks that a member function overrides a base-class function.',
    private: 'Makes following class members accessible only from the class and its friends.',
    protected: 'Allows following members to be used by the class and derived classes.',
    public: 'Makes following class members accessible to callers.',
    static_assert: 'Checks a constant expression at compile time.',
    template: 'Defines a family of functions or types parameterized by types or values.',
    this: 'Pointer to the current object inside a nonstatic member function.',
    true: 'True boolean value.',
    typename: 'Introduces a template type parameter or identifies a dependent type.',
    using: 'Introduces a type alias or makes an existing name available in a scope.',
    virtual: 'Allows a derived class to override a member function.'
}
const snippets: LanguageEntry[] = [
    {
        name: 'main function',
        kind: 'snippet',
        summary: 'Program entry returning a success status.',
        insertText: 'int main(void) {\n\t$0\n\treturn 0;\n}'
    },
    {
        name: 'for loop',
        kind: 'snippet',
        summary: 'Counted loop; replace count with your upper bound.',
        insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:count}; ++${1:i}) {\n\t$0\n}'
    },
    {
        name: 'while loop',
        kind: 'snippet',
        summary: 'Loop with a condition checked before each iteration.',
        insertText: 'while (${1:condition}) {\n\t$0\n}'
    },
    {
        name: 'if block',
        kind: 'snippet',
        summary: 'Conditional branch.',
        insertText: 'if (${1:condition}) {\n\t$0\n}'
    },
    {
        name: 'do while loop',
        kind: 'snippet',
        summary: 'Loop that runs its body at least once.',
        insertText: 'do {\n\t$0\n} while (${1:condition});'
    },
    {
        name: 'function definition',
        kind: 'snippet',
        summary: 'Function that returns no value.',
        insertText: 'void ${1:do_work}(void) {\n\t$0\n}'
    },
    {
        name: 'array declaration',
        kind: 'snippet',
        summary: 'Fixed-size integer array initialized to zero.',
        insertText: 'int ${1:values}[${2:8}] = {0};'
    },
    {
        name: 'struct definition',
        kind: 'snippet',
        summary: 'Structure with an integer field.',
        insertText: 'struct ${1:Point} {\n\tint ${2:x};\n\t$0\n};'
    }
]

export function languageEntries(
    language: HelpLanguage,
    target?: CompilationTarget
): LanguageEntry[] {
    const descriptions = { ...common, ...(language === 'c' ? c : language === 'cpp' ? cpp : {}) }
    if (target === 'X86') {
        delete descriptions.new
        delete descriptions.delete
    }
    return [
        ...Object.entries(descriptions).map(([name, summary]) => ({
            name,
            summary,
            kind: 'keyword' as const
        })),
        ...snippets
    ]
}
