import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import {
    X86_COMMON_SYSCALLS,
    X86_CONDITION_CODES,
    X86_DIRECTIVE_DOCS,
    X86_INSTRUCTIONS,
    X86_PREFIX_DOCS,
    X86_PREPROCESSOR_DOCS,
    X86_PSEUDO_OP_DOCS,
    X86_REGISTERS,
    X86_SYSCALLS,
    x86DocumentedNames
} from '#lib/languages/X86/X86-documentation.ts'
import {
    entries as instructionPages,
    load as loadInstructionPage
} from '../../../routes/documentation/x86/instruction/[instructionName]/+page.server'
import {
    documentationProblems,
    hasCodeName,
    type Chapter,
    type DocumentationEntry
} from '../entries'
import { x86SimBinding, x86SimPrototype } from './syscallBinding'
import { chapters } from './x86'

function chapter(id: string): Chapter {
    const found = chapters().find((chapter) => chapter.id === id)
    if (!found) throw new Error(`No Chapter ${id}`)
    return found
}

function namesOf(entries: DocumentationEntry[]): Set<string> {
    return new Set(entries.flatMap((entry) => entry.names))
}

function find(id: string, title: string): DocumentationEntry {
    const found = chapter(id).entries.find((entry) => entry.title === title)
    if (!found) throw new Error(`No ${title} in ${id}`)
    return found
}

function markdownOf(entry: DocumentationEntry): string {
    return entry.view.type === 'markdown' ? entry.view.markdown : ''
}

describe('the x86 Documentation', () => {
    it('has its nine Chapters at their pages', () => {
        expect(chapters().map((chapter) => [chapter.id, chapter.href])).toEqual([
            ['instructions', '/documentation/x86/instruction'],
            ['extensions', '/documentation/x86/extensions'],
            ['directives', '/documentation/x86/directive'],
            ['registers-and-flags', '/documentation/x86/registers'],
            ['vector-instructions', '/documentation/x86/vector-instructions'],
            ['syscalls', '/documentation/x86/syscall'],
            ['using-c', '/documentation/x86/using-c'],
            ['runtime-library', '/documentation/x86/runtime-library'],
            ['executables', '/documentation/x86/executables']
        ])
        expect(documentationProblems(chapters())).toEqual([])
    })

    it('explains running an Executable, one entry per heading', () => {
        const entries = chapter('executables').entries
        expect(entries.map((entry) => entry.anchor)).toEqual([
            'overview',
            'what-runs',
            'libraries',
            'hex-editor',
            'byte-edits',
            'elf-parts',
            'finding',
            'data-inspector',
            'listing',
            'names',
            'decompile',
            'pseudocode',
            'decompile-time',
            'stepping',
            'breakpoints',
            'pseudocode-debugging',
            'arguments',
            'testcases',
            'patching',
            'build-output',
            'log-notes',
            'safety'
        ])
        expect(entries[0]).toMatchObject({
            id: 'x86/executables/overview',
            title: 'Running an Executable',
            href: '/documentation/x86/executables#overview'
        })
        const text = (anchor: string) =>
            markdownOf(entries.find((entry) => entry.anchor === anchor)!)
        // the five bundled libraries, and the names a Listing uses
        for (const library of [
            'ld-linux-x86-64.so.2',
            'libc.so.6',
            'libm.so.6',
            'libstdc++.so.6',
            'libgcc_s.so.1'
        ])
            expect(text('libraries')).toContain(library)
        for (const name of [
            'FUN_',
            'DAT_',
            '.LAB_1',
            's_Enter_password',
            '@plt',
            '@got',
            '@GLIBC_'
        ])
            expect(text('names')).toContain(name)
        expect(text('patching')).toContain('**Space**')
        expect(text('patching')).toContain('long press')
        expect(text('stepping')).toContain('**Step into library code**')
        // the Hex editor's switch, what a Byte edit is, and the Build output's actions
        expect(text('hex-editor')).toContain('**Disassemble**')
        expect(text('byte-edits')).toContain('**Byte edits**')
        expect(text('byte-edits')).toContain('**Show in Hex**')
        expect(text('elf-parts')).toContain('**Show in Listing**')
        expect(text('finding')).toContain('`??`')
        expect(text('data-inspector')).toContain('**Little**')
        for (const action of ['**Download**', '**Keep as File**', '**From an earlier Build**'])
            expect(text('build-output')).toContain(action)
        // Decompile: the switch's third view, Ghidra's Pseudocode, its limit and its Breakpoints
        expect(text('hex-editor')).toContain('**Decompile**')
        expect(text('decompile')).toContain('Ghidra')
        expect(text('pseudocode')).toContain('**Go to Definition**')
        expect(text('decompile-time')).toContain('30 seconds')
        expect(text('pseudocode-debugging')).toContain('`if (iVar1 == 0) {`')
        expect(text('build-output')).toContain('Decompile')
    })

    it('has an instruction entry for every instruction page, alphabetically', () => {
        const instructions = chapter('instructions').entries
        expect(instructions).toHaveLength(273)
        const named = namesOf(instructions)
        for (const name of x86DocumentedNames) expect(named.has(name), name).toBe(true)
        const titles = instructions.map((entry) => entry.title)
        expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)))
        expect(find('instructions', 'add')).toMatchObject({
            kind: 'instruction',
            names: ['add'],
            summary:
                'Adds the source (second) operand to the destination (first) operand and leaves the sum in the destination.',
            href: '/documentation/x86/instruction/add',
            anchor: 'add'
        })
    })

    it('finds every instruction NASM accepts by its name', () => {
        const named = namesOf([
            ...chapter('instructions').entries,
            ...chapter('extensions').entries
        ])
        for (const { name } of X86_INSTRUCTIONS) expect(named.has(name), name).toBe(true)
    })

    it('files each extension once, under its NASM section, the integer ones included', () => {
        const groups = chapter('extensions').entries.filter(
            (entry) => entry.kind === 'extension-group'
        )
        // 81 sections without pages, and the 7 integer sections with instructions that need one.
        expect(groups).toHaveLength(88)
        const seen = groups.flatMap((group) => group.names)
        expect(new Set(seen).size).toBe(seen.length)
        expect(seen).toHaveLength(X86_INSTRUCTIONS.length - x86DocumentedNames.length)
        for (const name of x86DocumentedNames) expect(seen, name).not.toContain(name)

        const jumps = find('extensions', 'Jumps (extensions)')
        expect(jumps).toMatchObject({ names: ['jmpabs'], anchor: 'jumps-extensions' })
        expect(markdownOf(jumps)).toBe(
            '**This emulator does not support APX.** A program that reaches one of these instructions stops with SIGILL, an illegal instruction.\n\n- `jmpabs` (APX)'
        )
        expect(hasCodeName(jumps)).toBe(false)
        // Only an integer section's group names the extension: the others' headings do already.
        expect(markdownOf(find('extensions', 'Intel AES instructions'))).toContain(
            '- `aesenc` — Perform One Round of an AES Encryption Flow\n'
        )
    })

    it('says which vector instructions the emulator does not run', () => {
        const fp16 = markdownOf(find('extensions', 'AVX512 Bit Algorithms'))
        expect(fp16.startsWith('**This emulator does not support AVX-512.**')).toBe(true)
        expect(fp16).not.toContain('not supported:')
        // a section that shares mnemonics with AVX runs in part, and marks the ones that do not
        const avx512 = markdownOf(find('extensions', 'AVX-512 instructions'))
        expect(avx512).toContain('forms of these instructions are not supported by this emulator')
        expect(avx512).toContain(
            '- `vmovdqa32` — Move Aligned Doubleword Values *(not supported: AVX-512)*'
        )
        // SSE4 and AES run as their v forms only, and the page says what to write instead
        const sse4 = markdownOf(find('extensions', 'Penryn New Instructions (SSE4.1)'))
        expect(sse4).toContain('SSE4 instructions run only in their `v` form')
        expect(sse4).toContain(
            '- `dppd` — Dot Product of Packed Double Precision Floating-Point Values *(runs only as `vdppd`)*'
        )
        // AVX runs, with the AVX-512 forms of its instructions left out
        const avx = markdownOf(find('extensions', 'Intel AVX instructions'))
        expect(avx).toContain(
            'forms of these instructions are not supported by this emulator; the other forms run.'
        )
        expect(avx).not.toContain('**This emulator does not support')
    })

    it('files the vector instructions the emulator runs by the work they do', () => {
        const avx = markdownOf(find('extensions', 'Intel AVX instructions'))
        for (const label of [
            'Moves, loads and stores',
            'Arithmetic',
            'Shuffles, permutes and blends'
        ]) {
            expect(avx).toContain(`**${label}**\n\n- `)
        }
        const [, afterShuffles] = avx.split('**Shuffles, permutes and blends**')
        expect(afterShuffles.split('\n\n**')[0]).toContain('- `vblendpd`')
        // a group the emulator runs none of is one list
        expect(markdownOf(find('extensions', 'AVX512 Bit Algorithms'))).not.toContain(
            '**Arithmetic**'
        )
    })

    it('has an entry for each of the 26 directive docs, under its group', () => {
        const directives = chapter('directives').entries.filter(
            (entry) => entry.kind === 'directive'
        )
        const docs = [
            ...X86_DIRECTIVE_DOCS,
            ...X86_PSEUDO_OP_DOCS,
            ...X86_PREPROCESSOR_DOCS,
            ...X86_PREFIX_DOCS
        ]
        expect(directives.map((entry) => entry.title)).toEqual(docs.map((doc) => doc.name))
        expect(directives).toHaveLength(26)
        expect(find('directives', 'db, dw, dd, dq').names).toEqual(['db', 'dw', 'dd', 'dq'])
        expect(find('directives', '%rep').anchor).toBe('preprocessor-rep')
        expect(find('directives', 'rep').anchor).toBe('rep')

        const order = chapter('directives').entries.map((entry) => entry.anchor)
        expect(order.indexOf('data')).toBeLessThan(order.indexOf('db-dw-dd-dq'))
        expect(order.indexOf('db-dw-dd-dq')).toBeLessThan(order.indexOf('preprocessor'))
    })

    it('links to the NASM manual in markdown, so an Exam turns it off like any other link', () => {
        const everythingElse = chapter('directives').entries.find(
            (entry) => entry.anchor === 'everything-else'
        )!
        const markdown = markdownOf(everythingElse)
        expect(markdown).toContain('[NASM manual](https://www.nasm.us/docs.php)')
        expect(markdown).not.toContain('<a')
        // The word lists are text the search reads, not names an exact search would put first.
        expect(markdown).toContain('`sectalign`')
        expect(markdown).toContain('`%xdefine`')
        expect(everythingElse.names).toEqual([])
    })

    it('has an entry for every syscall, the common ones first', () => {
        const syscalls = chapter('syscalls').entries.filter((entry) => entry.kind === 'syscall')
        expect(syscalls).toHaveLength(X86_SYSCALLS.length)
        expect(syscalls.slice(0, X86_COMMON_SYSCALLS.length).map((entry) => entry.title)).toEqual(
            X86_COMMON_SYSCALLS
        )

        const write = find('syscalls', 'write')
        expect(write).toMatchObject({
            anchor: 'syscall-write',
            href: '/documentation/x86/syscall#syscall-write',
            signature: 'rax = 1',
            names: ['write', 'syscall 1']
        })
        expect(write.view).toMatchObject({
            type: 'fields',
            markdown: expect.stringContaining('Descriptor 1 is standard output'),
            fields: [
                {
                    label: 'In',
                    value: '`rax` = 1 (call number); `rdi` = file descriptor; `rsi` = buffer (read by the kernel); `rdx` = byte count'
                },
                {
                    label: 'Out',
                    value: '`rax` = result. Values from -1 through -4095 are error codes.'
                },
                { label: 'Waits', value: 'This call can wait for the outside world.' },
                {
                    label: 'From C',
                    value: '`long sim_write(long fd, const void *buffer, long count)`'
                }
            ]
        })
        // Linux names its calls in code, `exit_group`, where MARS names its services in words.
        expect(hasCodeName(find('syscalls', 'exit_group'))).toBe(true)

        // A call from the table: its number and its arguments, and a line built from them.
        const getppid = find('syscalls', 'getppid')
        expect(getppid.summary).toBe('Takes no arguments.')
        expect(getppid.view).toEqual({
            type: 'fields',
            fields: [
                { label: 'In', value: '`rax` = 110 (call number)' },
                {
                    label: 'Out',
                    value: '`rax` = result. Values from -1 through -4095 are error codes.'
                },
                { label: 'From C', value: '`long sim_getppid(void)`' }
            ]
        })
        expect(find('syscalls', 'lseek').summary).toBe(
            'Moves the read and write position of the descriptor in rdi to the offset in rsi, interpreted according to rdx, and returns the new position.'
        )
        expect(find('syscalls', 'stat').summary).toBe(
            'Reads file metadata for the path at rdi and writes it to the Linux struct stat buffer at rsi.'
        )
    })

    it("names each call's <sim.h> function, as the header declares it", () => {
        const syscalls = chapter('syscalls').entries.filter((entry) => entry.kind === 'syscall')
        const header = readFileSync('src/lib/sourceRuntime/generated/sim/x86_64.h', 'utf8')
        for (const syscall of X86_SYSCALLS) {
            const entry = syscalls.find((item) => item.title === syscall.name)!
            const fields = entry.view.type === 'fields' ? entry.view.fields : []
            const fromC = fields.find((field) => field.label === 'From C')
            //last, after the input and output fields, as MIPS and RISC-V show theirs
            expect(fields[fields.length - 1], syscall.name).toBe(fromC)
            const binding = x86SimBinding(syscall)
            if (!binding) {
                expect(fromC?.value).toBe(
                    'None in `<sim.h>`: only the restorer a program registers with rt_sigaction makes it, as a signal handler returns, and called from C it corrupts the program.'
                )
                continue
            }
            const prototype = x86SimPrototype(binding)
            expect(fromC?.value).toBe(`\`${prototype}\``)
            expect(header).toContain(`${prototype} {`)
            //searched as MIPS's and RISC-V's are, without it
            expect(entry.searchText).not.toContain('sim_')
        }
        expect(find('syscalls', 'exit').view).toMatchObject({
            fields: expect.arrayContaining([
                { label: 'From C', value: '`void sim_exit(long status)`' }
            ])
        })
    })

    it('keeps every anchor the pages had', () => {
        const anchors = (id: string) => chapter(id).entries.map((entry) => entry.anchor)
        expect(anchors('directives')).toEqual(
            expect.arrayContaining([
                'directives',
                'data',
                'preprocessor',
                'prefixes',
                'everything-else'
            ])
        )
        expect(anchors('registers-and-flags')).toEqual(
            expect.arrayContaining(['registers', 'flags', 'condition-codes', 'sse', 'avx', 'x87'])
        )
        expect(anchors('syscalls')).toEqual(expect.arrayContaining(['common', 'all']))
    })

    it('names a register by its every part, and a condition by its every spelling', () => {
        const entries = chapter('registers-and-flags').entries
        const general = entries.filter(
            (entry) => entry.kind === 'register' && entry.anchor.startsWith('register-')
        )
        expect(general.map((entry) => entry.title)).toEqual(X86_REGISTERS.map((r) => r.name))
        expect(entries.filter((entry) => entry.kind === 'register')).toHaveLength(11 + 7)
        expect(entries.filter((entry) => entry.kind === 'flag')).toHaveLength(7)
        expect(entries.filter((entry) => entry.kind === 'condition-code')).toHaveLength(16)

        expect(find('registers-and-flags', 'rax').names).toEqual(['rax', 'eax', 'ax', 'ah', 'al'])
        expect(find('registers-and-flags', 'r8 to r15').names).toEqual(
            expect.arrayContaining(['r8', 'r15', 'r12d', 'r12w', 'r12b'])
        )
        expect(find('registers-and-flags', 'xmm0 to xmm15').names).toContain('xmm7')
        expect(find('registers-and-flags', 'rbp').summary).not.toContain('&apos;')

        for (const condition of X86_CONDITION_CODES) {
            expect(find('registers-and-flags', condition.code).names).toEqual([
                condition.code,
                ...condition.aliases
            ])
        }
        expect(find('registers-and-flags', 'e')).toMatchObject({
            kind: 'condition-code',
            names: ['e', 'z'],
            signature: 'ZF = 1',
            summary: 'Equal, zero'
        })
    })

    it('gives every entry a one line summary, even the four instructions nothing describes', () => {
        for (const entry of chapters().flatMap((chapter) => chapter.entries)) {
            expect(entry.summary.trim(), entry.id).not.toBe('')
            expect(entry.summary, entry.id).not.toMatch(/\n|&apos;/)
        }
        // nothing describes these four, so their sentence is written in the names table
        for (const name of ['brkpt', 'jmpe', 'movrs', 'nop2']) {
            expect(find('instructions', name).summary).toMatch(/^[A-Z][^.]+\.$/)
        }
        // a summary the whole row can show, not the appendix's long first sentence
        expect(find('instructions', 'loop').summary.length).toBeLessThanOrEqual(140)
        expect(find('instructions', 'movabs').summary).toMatch(/immediate.*absolute memory offset/)
    })

    it("shows an instruction's first Form patterns, general ones first", () => {
        const signature = (name: string) => find('instructions', name).signature
        // the accumulator's short encodings are left out: `r/m, imm` covers them
        expect(signature('add')).toBe('r/m, reg | reg, r/m | r/m, imm')
        expect(signature('mov')).toBe('r/m, reg | reg, r/m | reg, imm | …')
        expect(signature('push')).toBe('reg | r/m | imm | …')
        expect(signature('pop')).toBe('reg | r/m | fs | …')
        expect(signature('shl')).toBe('r/m, imm8 | r/m, 1 | r/m, cl')
        expect(signature('ret')).toBe('[imm16]')
        expect(signature('syscall')).toBeUndefined()
    })
})

describe('the x86 instruction pages', () => {
    it('are named for every documented instruction, and only those', async () => {
        const pages = (await instructionPages()).map((page) => page.instructionName)
        expect(pages.sort()).toEqual([...x86DocumentedNames].sort())
    })

    it('answer 404 for a mnemonic without a page', async () => {
        for (const instructionName of ['vaddpd', 'jmpabs', 'not-an-instruction']) {
            await expect(
                loadInstructionPage({ params: { instructionName } } as never)
            ).rejects.toMatchObject({ status: 404 })
        }
    })
})
