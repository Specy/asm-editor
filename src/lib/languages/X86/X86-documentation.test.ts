import { describe, expect, it } from 'vitest'
import {
    X86_ADDRESS_KEYWORDS,
    X86_COMMON_SYSCALLS,
    X86_CONDITION_CODES,
    X86_DIRECTIVE_DOCS,
    X86_DIRECTIVES,
    X86_DOCUMENTED_SECTIONS,
    X86_INSTRUCTIONS,
    X86_PREFIX_DOCS,
    X86_PREFIXES,
    X86_PREPROCESSOR_DIRECTIVES,
    X86_PREPROCESSOR_DOCS,
    X86_PSEUDO_OP_DOCS,
    X86_PSEUDO_OPS,
    X86_SIZE_SPECIFIERS,
    X86_SYSCALLS,
    describeX86Instruction,
    describeX86Syscall,
    formatX86InstructionSummary,
    hasX86Description,
    hasX86InstructionPage,
    x86DocumentedNames,
    x86InstructionMap,
    x86SyscallArgs,
    x86SyscallMap
} from './X86-documentation'

const formsOf = (name: string) =>
    (x86InstructionMap.get(name)?.forms ?? []).map((form) => form.operands.join(', '))

describe('the generated instruction table', () => {
    it('covers the instructions a program in this editor is written from', () => {
        for (const name of [
            'mov',
            'lea',
            'add',
            'sub',
            'imul',
            'cmp',
            'jmp',
            'jne',
            'call',
            'ret',
            'push',
            'pop',
            'syscall',
            'xor'
        ]) {
            expect(x86InstructionMap.has(name), name).toBe(true)
        }
    })

    it('describes the 64 bit forms, not only the ones the appendix knew', () => {
        expect(formsOf('add')).toContain('r/m64, reg64')
        expect(formsOf('mov')).toContain('reg64, r/m64')
        expect(formsOf('lea')).toContain('reg64, mem')
    })

    it('gives every instruction a section and at least one form', () => {
        const sectionless = X86_INSTRUCTIONS.filter((instruction) => !instruction.section)
        const formless = X86_INSTRUCTIONS.filter((instruction) => instruction.forms.length === 0)
        // Every accepted mnemonic reaches a row of the table, including the ones NASM writes as
        // templates: `Jcc`, `CCMPscc` and the infix `CMPccXADD`.
        expect(sectionless.map((instruction) => instruction.name)).toEqual([])
        expect(formless.map((instruction) => instruction.name)).toEqual([])
    })

    it('marks where an instruction can be used', () => {
        const push = x86InstructionMap.get('push')!
        const segment = push.forms.find((form) => form.operands[0] === 'es')!
        expect(segment.notes).toContain('NOLONG')
        const wide = x86InstructionMap
            .get('add')!
            .forms.find((form) => form.operands[0] === 'r/m64')!
        expect(wide.cpu).toBe('X86_64')
        expect(wide.notes).toContain('LOCK')
    })

    it('files an instruction under the section that holds most of its forms', () => {
        expect(x86InstructionMap.get('push')?.section).toBe('Stack operations')
        expect(x86InstructionMap.get('jnz')?.section).toBe('Jumps')
        expect(x86InstructionMap.get('syscall')?.section).toBe(
            'Interrupts, system calls, and returns'
        )
    })

    it('reports the extensions an instruction needs, and no mode markers', () => {
        expect(x86InstructionMap.get('movapd')?.features).toEqual(['SSE2'])
        // `add` has APX encoded forms in NASM 3.00; it is still a base instruction.
        expect(x86InstructionMap.get('add')?.features).toEqual([])
    })
})

describe('descriptions', () => {
    it('takes the condition families from the entry that documents them', () => {
        expect(describeX86Instruction('jnz')).toContain('conditional jump')
        expect(describeX86Instruction('setne')).toContain('condition')
    })

    it('never hands a conditional entry to an unconditional instruction', () => {
        // `Jcc` expands over the condition list, so it can reach `jz` and never `jmp` or `jecxz`,
        // both of which are their own instructions with their own entries.
        expect(describeX86Instruction('jmp')).not.toContain('conditional jump')
        expect(describeX86Instruction('jecxz')).toContain('CX')
        expect(describeX86Instruction('movsb')).toContain('copies the byte')
    })

    it('follows the size suffix aliases', () => {
        expect(describeX86Instruction('retq')).toBe(describeX86Instruction('ret'))
        expect(describeX86Instruction('stosq')).toBe(describeX86Instruction('stosb'))
        expect(describeX86Instruction('pushf')).toContain('flags')
    })

    it('prefers what is written here over what was generated', () => {
        const syscall = describeX86Instruction('syscall')
        expect(syscall).toContain('rax')
        expect(syscall).toContain('/documentation/x86/syscall')
        expect(describeX86Instruction('movabs')).toContain('64 bit immediate')
    })

    it('falls back to the summary, and says so', () => {
        // An AVX-512 instruction no prose source covers still answers with its one liner.
        expect(describeX86Instruction('vpmovm2b').length).toBeGreaterThan(0)
        expect(hasX86Description('vpmovm2b')).toBe(false)
        expect(hasX86Description('add')).toBe(true)
    })

    it('summarises the operand shapes', () => {
        const summary = formatX86InstructionSummary(x86InstructionMap.get('lea')!)
        expect(summary).toContain('lea reg64, mem')
        expect(summary.split(' | ').length).toBe(x86InstructionMap.get('lea')!.forms.length)
    })
})

describe('the documented set', () => {
    it('is the integer instruction set, and every name in it has a page', () => {
        expect(x86DocumentedNames.length).toBeGreaterThan(200)
        for (const name of ['mov', 'add', 'jne', 'call', 'push', 'syscall', 'stosb', 'setg']) {
            expect(hasX86InstructionPage(name), name).toBe(true)
        }
        // Vector and system instructions stay on the index page, and so do the APX conditionals.
        expect(hasX86InstructionPage('vaddpd')).toBe(false)
        expect(hasX86InstructionPage('ccmpa')).toBe(false)
        expect(hasX86InstructionPage('cfcmovz')).toBe(false)
    })

    it('names sections that exist in the table', () => {
        const sections = new Set(X86_INSTRUCTIONS.map((instruction) => instruction.section))
        for (const section of X86_DOCUMENTED_SECTIONS) {
            expect(sections.has(section), section).toBe(true)
        }
    })

    it('has prose for nearly all of it', () => {
        const undescribed = x86DocumentedNames.filter((name) => !hasX86Description(name))
        expect(undescribed.length / x86DocumentedNames.length).toBeLessThan(0.05)
        // What is left is what arrived after 2008 and is not worth writing by hand yet: the
        // instructions that matter in a 64 bit program (`cdqe`, `cqo`, `movabs`, `movsxd`) are
        // written in this module instead.
        for (const name of ['cdqe', 'cqo', 'movabs', 'movsxd', 'syscall']) {
            expect(hasX86Description(name), name).toBe(true)
        }
    })
})

describe('condition codes', () => {
    it('are all spellings the assembler accepts', () => {
        const accepted = new Set(X86_INSTRUCTIONS.map((instruction) => instruction.name))
        const codes = X86_CONDITION_CODES.flatMap((condition) => [
            condition.code,
            ...condition.aliases
        ])
        // Every documented condition has to be a condition NASM knows, on all three families that
        // take one, or the table is describing something the assembler will reject.
        const missing = codes.filter(
            (code) =>
                !accepted.has(`j${code}`) ||
                !accepted.has(`set${code}`) ||
                !accepted.has(`cmov${code}`)
        )
        expect(missing).toEqual([])
        // 16 conditions, each with the aliases x86 gives it, is the whole table.
        expect(new Set(codes).size).toBe(30)
    })
})

describe('syscalls', () => {
    it('are the ones blink implements, with their numbers', () => {
        expect(x86SyscallMap.get('write')).toMatchObject({ number: 1, blocking: true })
        expect(x86SyscallMap.get('exit')).toMatchObject({ number: 60, arity: 1 })
        expect(x86SyscallMap.get('exit_group')?.number).toBe(231)
        expect(X86_SYSCALLS.length).toBeGreaterThan(150)
    })

    it('describe the ones a program starts with', () => {
        for (const name of X86_COMMON_SYSCALLS) {
            expect(x86SyscallMap.has(name), name).toBe(true)
            expect(describeX86Syscall(name), name).not.toBe('')
        }
    })

    it('names the register a syscall reads each argument from', () => {
        expect(describeX86Syscall('write')).toContain('rsi')
        expect(x86SyscallArgs(x86SyscallMap.get('write')!)).toEqual([
            'file descriptor',
            'buffer (read by the kernel)',
            'byte count'
        ])
    })

    it('names the arguments of the calls blink answers outside its traced table', () => {
        // `exit` and `clock_gettime` never reach the dispatch table, so their argument types are
        // written down here rather than read from a trace signature.
        expect(x86SyscallArgs(x86SyscallMap.get('exit')!)).toEqual(['status'])
        expect(x86SyscallArgs(x86SyscallMap.get('clock_gettime')!)).toEqual(['clock', 'timespec'])
    })
})

describe('the assembler documentation', () => {
    /** Everything NASM accepts that is not an instruction, plus the two it parses specially. */
    const known = new Set([
        ...X86_DIRECTIVES,
        ...X86_PREPROCESSOR_DIRECTIVES,
        ...X86_PSEUDO_OPS,
        ...X86_PREFIXES,
        ...X86_SIZE_SPECIFIERS,
        ...X86_ADDRESS_KEYWORDS,
        'times'
    ])

    it('documents only words the assembler knows', () => {
        const documented = [
            ...X86_DIRECTIVE_DOCS,
            ...X86_PSEUDO_OP_DOCS,
            ...X86_PREPROCESSOR_DOCS,
            ...X86_PREFIX_DOCS
        ].flatMap((doc) => doc.name.split(',').map((name) => name.trim()))
        // The compound entries name a family ("o16, o32, o64"), so every part has to be real.
        const unknown = documented.filter((name) => !known.has(name.replace(/ .*$/, '')))
        expect(unknown).toEqual([])
    })

    it('explains what it lists', () => {
        for (const doc of [
            ...X86_DIRECTIVE_DOCS,
            ...X86_PSEUDO_OP_DOCS,
            ...X86_PREPROCESSOR_DOCS
        ]) {
            expect(doc.description.length, doc.name).toBeGreaterThan(30)
        }
    })
})
