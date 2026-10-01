import { describe, expect, it } from 'vitest'
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
} from '$lib/languages/X86/X86-documentation'
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
    it('has its five Chapters at the pages they have always had', () => {
        expect(chapters().map((chapter) => [chapter.id, chapter.href])).toEqual([
            ['instructions', '/documentation/x86/instruction'],
            ['extensions', '/documentation/x86/extensions'],
            ['directives', '/documentation/x86/directive'],
            ['registers-and-flags', '/documentation/x86/registers'],
            ['syscalls', '/documentation/x86/syscall']
        ])
        expect(documentationProblems(chapters())).toEqual([])
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
            summary: 'Add',
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
        expect(markdownOf(jumps)).toBe('- `jmpabs` (APX)')
        expect(hasCodeName(jumps)).toBe(false)
        // Only an integer section's group names the extension: the others' headings do already.
        expect(markdownOf(find('extensions', 'Intel AES instructions'))).toContain(
            '- `aesenc` — Perform One Round of an AES Encryption Flow\n'
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
        expect(syscalls).toHaveLength(181)
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
                { label: 'rax', value: '1' },
                { label: 'rdi', value: 'file descriptor' },
                { label: 'rsi', value: 'buffer (read by the kernel)' },
                { label: 'rdx', value: 'byte count' },
                { label: 'Waits', value: 'This call can wait for the outside world.' }
            ]
        })
        // Linux names its calls in code, `exit_group`, where MARS names its services in words.
        expect(hasCodeName(find('syscalls', 'exit_group'))).toBe(true)

        // A call from the table: its number and its arguments, and a line built from them.
        const fork = find('syscalls', 'fork')
        expect(fork.summary).toBe('Takes no arguments.')
        expect(fork.view).toEqual({ type: 'fields', fields: [{ label: 'rax', value: '57' }] })
        expect(find('syscalls', 'lseek').summary).toBe(
            'Moves the read and write position of the descriptor in rdi to the offset in rsi, interpreted according to rdx, and returns the new position.'
        )
        expect(find('syscalls', 'stat').summary).toBe('Takes path in rdi, o_stat in rsi.')
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
            expect.arrayContaining(['registers', 'flags', 'condition-codes', 'sse', 'x87'])
        )
        expect(anchors('syscalls')).toEqual(expect.arrayContaining(['common', 'all']))
    })

    it('names a register by its every part, and a condition by its every spelling', () => {
        const entries = chapter('registers-and-flags').entries
        const general = entries.filter(
            (entry) => entry.kind === 'register' && entry.anchor.startsWith('register-')
        )
        expect(general.map((entry) => entry.title)).toEqual(X86_REGISTERS.map((r) => r.name))
        expect(entries.filter((entry) => entry.kind === 'register')).toHaveLength(11 + 6)
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
        for (const name of ['brkpt', 'jmpe', 'movrs', 'nop2']) {
            expect(find('instructions', name).summary).toBe(name)
        }
        // The appendix's heading, which is also the page's title, before a long first sentence.
        expect(find('instructions', 'loop').summary).toBe('Loop with Counter')
        expect(find('instructions', 'movabs').summary).toBe(
            'Moves a full 64 bit immediate into a register.'
        )
    })

    it("shows an instruction's operand shapes without their widths", () => {
        const signature = (name: string) => find('instructions', name).signature
        expect(signature('add')).toBe('r/m, reg | reg, r/m | r/m, imm')
        expect(signature('mov')).toBe('r/m, reg | reg, r/m | r/m, imm | …')
        expect(signature('push')).toBe('r/m | imm | …')
        expect(signature('pop')).toBe('r/m | fs | gs')
        expect(signature('shl')).toBe('r/m, imm | r/m, cl')
        expect(signature('ret')).toBe('[imm]')
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
