/**
 * What a person's name for a label or a variable may be
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 7).
 */
import glibc from '@specy/decompiler/prototypes/glibc'
import { describe, expect, it } from 'vite-plus/test'
import { NASM_OPERAND_WORDS, NASM_REGISTERS } from '#lib/listing/nasmWords.ts'
import {
    globalNameProblem,
    libraryNameProblem,
    localNameProblem,
    looksLikeGhidraName,
    nameProblem,
    NAME_LENGTH_LIMIT,
    type NamedLabel
} from './names'

describe('any name', () => {
    it('is a C identifier of at most 128 characters', () => {
        for (const name of ['password', 'check_flag', '_start2', 'A', '_', 'x'.repeat(128)])
            expect(nameProblem(name), name).toBeUndefined()
        expect(nameProblem('')).toBe('Write a name.')
        expect(nameProblem('2fast')).toBe('A name cannot start with a digit.')
        expect(nameProblem('x'.repeat(NAME_LENGTH_LIMIT + 1))).toBe(
            'Names can be up to 128 characters long. This one has 129.'
        )
    })

    it('says which character is not one, since the Pseudocode would print it as given', () => {
        expect(nameProblem('my main')).toBe(
            'The name can only have letters, digits and underscores. This name has a space.'
        )
        expect(nameProblem('a\tb')).toContain('This name has a tab.')
        expect(nameProblem('a\nb')).toContain('This name has a line break.')
        expect(nameProblem('a\u0007b')).toContain('This name has a control character.')
        expect(nameProblem('a\u00a0b')).toContain('This name has a blank.')
        //`@` and `.` already mean something in the Listing, `$` is NASM's
        for (const [name, character] of [
            ['puts@plt', '@'],
            ['FUN_x.loop', '.'],
            ['$money', '$'],
            ['caf\u00e9', '\u00e9'],
            ['end*/', '*'],
            ['a-b', '-'],
            ['\u{1f600}', '\u{1f600}']
        ])
            expect(nameProblem(name)).toBe(
                `The name can only have letters, digits and underscores. This name has “${character}”.`
            )
    })

    it("is no keyword of C's or C++'s, in their own case", () => {
        for (const keyword of ['int', 'if', 'return', '_Bool', 'typeof', 'true', 'bool', 'void'])
            expect(nameProblem(keyword)).toBe(`“${keyword}” is a C keyword. Choose another name.`)
        for (const keyword of ['class', 'co_await', 'operator', 'this', 'wchar_t', 'xor_eq'])
            expect(nameProblem(keyword)).toBe(`“${keyword}” is a C++ keyword. Choose another name.`)
        expect(nameProblem('Int')).toBeUndefined()
        expect(nameProblem('If')).toBeUndefined()
        //contextual words are names
        expect(nameProblem('override')).toBeUndefined()
        expect(nameProblem('final')).toBeUndefined()
    })

    it("is no type of the decompiler's", () => {
        for (const word of ['undefined', 'undefined1', 'undefined8', 'code', 'uint', 'ulonglong'])
            expect(nameProblem(word)).toBe(
                `“${word}” is the name of a type used in the Pseudocode. Choose another name.`
            )
        expect(nameProblem('undefined9')).toBeUndefined()
        expect(nameProblem('Code')).toBeUndefined()
    })

    it('is no x86 register nor a word of NASM operands, in any case', () => {
        for (const register of ['rax', 'RAX', 'eAx', 'al', 'r8d', 'r15b', 'xmm15', 'zmm31', 'rip'])
            expect(nameProblem(register)).toBe(
                `“${register}” is an x86 register. Choose another name.`
            )
        for (const word of ['byte', 'QWORD', 'zword', 'ptr', 'rel', 'abs', 'near', 'wrt', 'seg'])
            expect(nameProblem(word)).toBe(
                `“${word}” is a special word in assembly. Choose another name.`
            )
        //`short` is C's before it is NASM's
        expect(nameProblem('short')).toBe('“short” is a C keyword. Choose another name.')
        for (const name of ['raxes', 'r8x', 'flags', 'ptr2', 'top', 'stop'])
            expect(nameProblem(name), name).toBeUndefined()
    })

    it('is no word the Patch prompt reads as no name, so a renamed label can be typed back', () => {
        //`fadd to st1`, `[nosplit rel x]`, the x87 stack's top, `ip`, and `r8l` for `r8b`
        for (const register of ['st', 'ST', 'ip', 'r8l', 'r15l'])
            expect(nameProblem(register)).toBe(
                `“${register}” is an x86 register. Choose another name.`
            )
        for (const word of ['to', 'nosplit'])
            expect(nameProblem(word)).toBe(
                `“${word}” is a special word in assembly. Choose another name.`
            )
        //one list for both
        for (const word of [...NASM_REGISTERS, ...NASM_OPERAND_WORDS])
            expect(nameProblem(word), word).toBeDefined()
    })

    it("is no type or constant of the C library's, which the Pseudocode writes", () => {
        for (const type of ['size_t', 'FILE', 'DIR', 'va_list', 'pid_t', 'uint8_t', 'tm'])
            expect(nameProblem(type)).toBe(`“${type}” is a C library type. Choose another name.`)
        for (const name of ['NULL', 'EOF', 'SEEK_SET', 'EXIT_FAILURE'])
            expect(nameProblem(name)).toBe(
                `“${name}” is a C library constant. Choose another name.`
            )
        expect(nameProblem('Size_t')).toBeUndefined()
        expect(nameProblem('null')).toBeUndefined()
    })

    it('is none of the type names the prototypes the Pseudocode is decompiled with declare', () => {
        const code = glibc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ')
        const types = new Set<string>()
        //each typedef's name, to its `;` outside braces: `size_t`, `(*__sighandler_t)`, `} sigset_t`
        for (let at = code.indexOf('typedef'); at >= 0; at = code.indexOf('typedef', at + 1)) {
            let depth = 0
            let end = at
            for (; end < code.length; end++) {
                if (code[end] === '{') depth++
                else if (code[end] === '}') depth--
                else if (code[end] === ';' && depth === 0) break
            }
            const statement = code.slice(at, end)
            types.add(
                (/\(\s*\*\s*(\w+)\s*\)/.exec(statement) ??
                    /(\w+)\s*(?:\[[^\]]*\])?\s*$/.exec(statement))![1]
            )
        }
        for (const [, tag] of code.matchAll(/\b(?:struct|union|enum)\s+([A-Za-z_]\w*)/g))
            types.add(tag)
        //a broken read would make every check below pass
        expect(types).toContain('size_t')
        expect(types).toContain('FILE')
        expect(types).toContain('sigset_t')
        expect(types).toContain('tm')
        for (const type of types) expect(nameProblem(type), type).toBeDefined()
    })
})

describe('a global name', () => {
    const labels: NamedLabel[] = [
        { name: 'main', address: 0x1139 },
        { name: 'FUN_brave_otter', address: 0x1200 },
        { name: '.LAB_3', address: 0x1210 },
        { name: 'puts@plt', address: 0x1030 },
        { name: 'puts@got', address: 0x3fc8 },
        { name: 'memcpy@GLIBC_2.14', address: 0x1040 },
        { name: 'check', address: 0x1300 },
        { name: 'check_alias', address: 0x1300 }
    ]

    it('differs from every other label of the Listing, raw, invented or renamed', () => {
        expect(globalNameProblem('validate', labels, 0x1200)).toBeUndefined()
        expect(globalNameProblem('main', labels, 0x1200)).toBe(
            'Another label is already called “main” (at 0x1139).'
        )
        expect(globalNameProblem('FUN_brave_otter', labels, 0x1139)).toBe(
            'Another label is already called “FUN_brave_otter” (at 0x1200).'
        )
        //`main` keeps its own name, and may take an alias's, which names the same place
        expect(globalNameProblem('main', labels, 0x1139)).toBeUndefined()
        expect(globalNameProblem('check_alias', labels, 0x1300)).toBeUndefined()
    })

    it("differs from a library symbol's name, which the Pseudocode prints for its stub", () => {
        expect(globalNameProblem('puts', labels, 0x1200)).toBe(
            '“puts” is already used by puts@plt (at 0x1030).'
        )
        expect(globalNameProblem('memcpy', labels, 0x1200)).toBe(
            '“memcpy” is already used by memcpy@GLIBC_2.14 (at 0x1040).'
        )
    })

    it("keeps a renamed library datum's name taken, as the Listing settles renames", () => {
        //`stdin@GLIBC_2.2.5` renamed `my_in`: the Listing still keeps `stdin` for it
        const renamed: NamedLabel[] = [
            ...labels,
            { name: 'my_in', address: 0x4010, raw: 'stdin@GLIBC_2.2.5' }
        ]
        expect(globalNameProblem('stdin_copy', renamed, 0x1200)).toBeUndefined()
        expect(globalNameProblem('stdin', renamed, 0x1200)).toBe(
            '“stdin” is already used by stdin@GLIBC_2.2.5, which was renamed to my_in (at 0x4010).'
        )
        //its own label may take it back
        expect(globalNameProblem('stdin', renamed, 0x4010)).toBeUndefined()
        //a renamed label of the program's own frees its raw name, as the Listing does
        const own: NamedLabel[] = [{ name: 'check', address: 0x1139, raw: 'main' }]
        expect(globalNameProblem('main', own, 0x1200)).toBeUndefined()
    })

    it('differs from the variables the person named, whose Pseudocode would write it ::name', () => {
        const locals = [
            { name: 'password', owner: 'main' },
            { name: 'count', owner: 'FUN_brave_otter' }
        ]
        expect(globalNameProblem('secret', labels, 0x4040, { locals })).toBeUndefined()
        expect(globalNameProblem('password', labels, 0x4040, { locals })).toBe(
            '“password” is already a variable defined in main. Choose another name.'
        )
        //a jump target's `.password` is no global
        expect(
            globalNameProblem('password', labels, 0x1210, { jumpTarget: true, locals })
        ).toBeUndefined()
    })

    it('is refused for what it is before whom it clashes with', () => {
        expect(globalNameProblem('rax', labels, 0x1200)).toBe(
            '“rax” is an x86 register. Choose another name.'
        )
        expect(globalNameProblem('my main', labels, 0x1200)).toContain('This name has a space.')
    })

    it("of a jump target differs from its function's other jump targets alone", () => {
        const ownFunction: NamedLabel[] = [
            { name: 'FUN_brave_otter', address: 0x1200 },
            { name: '.LAB_3', address: 0x1210 },
            { name: '.loop', address: 0x1220 }
        ]
        expect(globalNameProblem('done', ownFunction, 0x1210, { jumpTarget: true })).toBeUndefined()
        expect(globalNameProblem('loop', ownFunction, 0x1210, { jumpTarget: true })).toBe(
            'Another jump target in this function is already called “loop” (at 0x1220).'
        )
        //written `.FUN_brave_otter`, it clashes with no global
        expect(
            globalNameProblem('FUN_brave_otter', ownFunction, 0x1210, { jumpTarget: true })
        ).toBeUndefined()
        expect(globalNameProblem('loop', ownFunction, 0x1220, { jumpTarget: true })).toBeUndefined()
        //and a global may be named as a jump target is
        expect(globalNameProblem('loop', ownFunction, 0x1300)).toBeUndefined()
    })

    it('is never given to a PLT stub or a GOT slot, which the library names', () => {
        expect(libraryNameProblem('puts@plt')).toBe(
            "“puts” can't be renamed, as it comes from a shared library."
        )
        expect(libraryNameProblem('__libc_start_main@plt_resolver')).toBe(
            "“__libc_start_main” can't be renamed, as it comes from a shared library."
        )
        expect(libraryNameProblem('stdin@got')).toBe(
            "“stdin” can't be renamed, as it comes from a shared library."
        )
        for (const name of ['main', 'FUN_brave_otter', 'memcpy@GLIBC_2.14', '@plt', '.LAB_3'])
            expect(libraryNameProblem(name), name).toBeUndefined()
    })
})

describe('a local name', () => {
    const variables = ['acStack_98', 'iVar1', 'sVar2', 'len']
    const globals = ['main', 'FUN_brave_otter', 'printf@plt', '.LAB_3']

    it("differs from the function's other variables and from every global", () => {
        expect(localNameProblem('password', variables, globals)).toBeUndefined()
        expect(localNameProblem('len', variables, globals)).toBe(
            'Another variable in this function is already called “len”.'
        )
        expect(localNameProblem('main', variables, globals)).toBe(
            'The name “main” is already used as a function or global variable. Choose another name.'
        )
        expect(localNameProblem('printf', variables, globals)).toBe(
            'The name “printf” is already used as a function or global variable. Choose another name.'
        )
        expect(localNameProblem('LAB_3', variables, globals)).toBeUndefined()
    })

    it("does not read as one of the decompiler's own names", () => {
        for (const name of [
            'iVar1',
            'pcVar2',
            'ppcVar10',
            'Var3',
            'iVar1_00',
            'uVar2_x00100',
            'local_10',
            'local_res8',
            'param_2',
            'uStack_48',
            'acStack_98',
            'auStack_128',
            '_uStack_60',
            'StackX_8',
            'uRam00104010',
            'in_RAX',
            'in_FS_OFFSET',
            'in_stack_00000008',
            'unaff_RBX',
            'unaff_retaddr',
            'extraout_RAX',
            'extraout_var'
        ]) {
            expect(looksLikeGhidraName(name), name).toBe(true)
            expect(localNameProblem(name, [], [])).toBe(
                `The name “${name}” uses the same format that the decompiler uses. Choose a different name.`
            )
        }
        for (const name of [
            'password',
            'result',
            'Variable1',
            'local',
            'local_name',
            'param',
            'params_2',
            'input',
            'inner',
            'stack_top',
            'uStack',
            'counter_00'
        ])
            expect(looksLikeGhidraName(name), name).toBe(false)
    })

    it('follows the rules of any name first', () => {
        expect(localNameProblem('int', [], [])).toBe('“int” is a C keyword. Choose another name.')
        expect(localNameProblem('', ['x'], [])).toBe('Write a name.')
    })
})
