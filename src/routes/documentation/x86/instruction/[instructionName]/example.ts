/**
 * Builds the program the interactive editor on an x86 instruction page starts with.
 *
 * There are 240 documented mnemonics with several thousand operand shapes between them, so the
 * examples are generated from the instruction table rather than written by hand: pick the first
 * shape that can be filled with concrete registers, give those registers values, and wrap the line
 * in a program that exits cleanly.
 *
 * Not every instruction can be demonstrated that way. Control flow needs a label to jump to, the
 * string instructions need pointers, `div` needs `rdx` cleared, and some instructions stop the
 * program by design. Those are written out below, and anything left over returns `null`, which the
 * page reads as "show the forms, not an editor". A generated program that does not assemble is
 * worse than no program, so `example.test.ts` assembles every one of them.
 */

import {
    X86_CONDITION_CODES,
    x86InstructionMap,
    type X86Instruction,
    type X86InstructionForm
} from '$lib/languages/X86/X86-documentation'

/** Registers the generic path fills operands with, widest name first. */
const OPERAND_REGISTERS = [
    { 64: 'rax', 32: 'eax', 16: 'ax', 8: 'al' },
    { 64: 'rbx', 32: 'ebx', 16: 'bx', 8: 'bl' },
    { 64: 'rsi', 32: 'esi', 16: 'si', 8: 'sil' }
] as const

/** Values the setup loads, chosen so a result is visibly different from its inputs. */
const SETUP = [
    '        mov rax, 12',
    '        mov rbx, 5',
    '        mov rcx, 3',
    '        mov rsi, 9'
]

const EXIT = [
    '        mov rax, 60         ; syscall 60: exit',
    '        xor rdi, rdi',
    '        syscall'
]

/** Operand spellings the generic path understands. Anything else means "write it by hand". */
const WIDTH = /^(r\/m|reg|imm|mem)(8|16|32|64)?$/

const CONDITIONS = new Set(
    X86_CONDITION_CODES.flatMap((condition) => [condition.code, ...condition.aliases])
)

/** `jne` is `j` and the condition `ne`; `jmp` is not a condition and `setssbsy` is its own thing. */
function conditionOf(name: string, prefix: string): string | null {
    if (!name.startsWith(prefix)) return null
    const condition = name.slice(prefix.length)
    return CONDITIONS.has(condition) ? condition : null
}

function program(body: string[], data: string[] = []): string {
    const lines = ['global _start', '']
    if (data.length) lines.push('section .data', ...data, '')
    lines.push('section .text', '_start:', ...body, '', ...EXIT)
    return lines.join('\n')
}

/**
 * Instructions whose point is lost, or whose program stops, when they are dropped into the generic
 * skeleton. Each one is a program rather than a line, because what makes them worth reading is the
 * setup around them.
 */
const WRITTEN: Record<string, string> = {
    syscall: program(
        [
            '        mov rax, 1          ; syscall 1: write',
            '        mov rdi, 1          ; to standard output',
            '        mov rsi, message    ; from this address',
            '        mov rdx, 14         ; this many bytes',
            '        syscall'
        ],
        ['message: db "hello, world", 10, 0']
    ),
    call: program([
        '        mov rax, 12',
        '        call double         ; pushes the return address and jumps',
        '        jmp done',
        '',
        'double:',
        '        add rax, rax',
        '        ret                 ; pops it and comes back',
        '',
        'done:'
    ]),
    ret: program([
        '        mov rax, 12',
        '        call double',
        '        jmp done',
        '',
        'double:',
        '        add rax, rax',
        '        ret                 ; back to the line after the call',
        '',
        'done:'
    ]),
    jmp: program([
        '        mov rax, 1',
        '        jmp skip',
        '        mov rax, 99         ; never runs',
        'skip:',
        '        mov rbx, rax'
    ]),
    jrcxz: program([
        '        mov rcx, 2',
        '        jrcxz zero          ; jumps only when rcx is zero, without reading the flags',
        '        mov rax, 1          ; runs, because rcx is 2',
        'zero:'
    ]),
    push: program([
        '        mov rax, 12',
        '        push rax            ; rsp moves down by 8',
        '        mov rax, 99',
        '        pop rax             ; and back up, with 12 in rax again'
    ]),
    pop: program([
        '        mov rax, 12',
        '        push rax',
        '        mov rax, 99',
        '        pop rax             ; 12 again'
    ]),
    div: program([
        '        mov rax, 100        ; the dividend is rdx:rax',
        '        xor rdx, rdx        ; so the high half has to be cleared',
        '        mov rbx, 7',
        '        div rbx             ; quotient in rax, remainder in rdx'
    ]),
    idiv: program([
        '        mov rax, -100       ; the dividend is rdx:rax',
        '        cqo                 ; sign extends rax into rdx',
        '        mov rbx, 7',
        '        idiv rbx            ; quotient in rax, remainder in rdx'
    ]),
    enter: program([
        '        enter 16, 0         ; a 16 byte frame, no nesting',
        '        mov qword [rbp - 8], 12',
        '        leave               ; undoes it'
    ]),
    leave: program([
        '        enter 16, 0',
        '        mov qword [rbp - 8], 12',
        '        leave               ; undoes the frame enter made'
    ]),
    xlatb: program(
        [
            '        mov rbx, table      ; the table to look in',
            '        mov al, 2           ; the index',
            '        xlatb               ; al is now table[2]'
        ],
        ['table: db 10, 20, 30, 40']
    )
}

/**
 * The loop family: they all count down with `rcx` and differ in what else they test, so one
 * program with the mnemonic swapped in shows each of them.
 */
const LOOP_FAMILY: Record<string, string> = {
    loop: 'decrements rcx and jumps while it is not zero',
    loopd: 'decrements ecx and jumps while it is not zero',
    loopq: 'decrements rcx and jumps while it is not zero',
    loope: 'jumps while rcx is not zero and the last comparison was equal',
    looped: 'jumps while ecx is not zero and the last comparison was equal',
    loopeq: 'jumps while rcx is not zero and the last comparison was equal',
    loopz: 'jumps while rcx is not zero and the zero flag is set',
    loopzd: 'jumps while ecx is not zero and the zero flag is set',
    loopzq: 'jumps while rcx is not zero and the zero flag is set',
    loopne: 'jumps while rcx is not zero and the last comparison differed',
    loopned: 'jumps while ecx is not zero and the last comparison differed',
    loopneq: 'jumps while rcx is not zero and the last comparison differed',
    loopnz: 'jumps while rcx is not zero and the zero flag is clear',
    loopnzd: 'jumps while ecx is not zero and the zero flag is clear',
    loopnzq: 'jumps while rcx is not zero and the zero flag is clear'
}

function loopExample(name: string): string | null {
    const comment = LOOP_FAMILY[name]
    if (!comment) return null
    return program([
        '        mov rcx, 5          ; the counter this family reads',
        '        xor rax, rax',
        'again:',
        '        add rax, rcx',
        '        cmp rax, 0          ; the conditional forms read the flags too',
        `        ${name} again${' '.repeat(Math.max(1, 14 - name.length))}; ${comment}`
    ])
}

/** The string instructions all want the same setup, so they are generated from one shape. */
const STRING_EXAMPLES: Record<string, { line: string; comment: string }> = {
    movsb: { line: 'movsb', comment: 'copies one byte from [rsi] to [rdi]' },
    movsw: { line: 'movsw', comment: 'copies two bytes' },
    movsd: { line: 'movsd', comment: 'copies four bytes' },
    movsq: { line: 'movsq', comment: 'copies eight bytes' },
    lodsb: { line: 'lodsb', comment: 'reads one byte from [rsi] into al' },
    lodsq: { line: 'lodsq', comment: 'reads eight bytes from [rsi] into rax' },
    stosb: { line: 'stosb', comment: 'writes al to [rdi]' },
    stosq: { line: 'stosq', comment: 'writes rax to [rdi]' },
    cmpsb: { line: 'cmpsb', comment: 'compares [rsi] with [rdi] and sets the flags' },
    scasb: { line: 'scasb', comment: 'compares al with [rdi] and sets the flags' }
}

function stringExample(name: string): string | null {
    const example = STRING_EXAMPLES[name]
    if (!example) return null
    return program(
        [
            '        cld                 ; count upwards',
            '        mov rsi, source',
            '        mov rdi, destination',
            '        mov rax, 7',
            `        ${example.line}${' '.repeat(Math.max(1, 20 - example.line.length))}; ${example.comment}`
        ],
        ['source: db 1, 2, 3, 4, 5, 6, 7, 8', 'destination: times 8 db 0']
    )
}

/** The conditional families, which are all the same program with one line changed. */
function conditionalExample(name: string): string | null {
    const jump = conditionOf(name, 'j')
    if (jump) {
        return program([
            '        mov rax, 12',
            '        cmp rax, 12         ; sets the flags the condition reads',
            `        ${name} taken`,
            '        mov rbx, 1          ; runs when the condition is false',
            '        jmp done',
            'taken:',
            '        mov rbx, 2          ; runs when it is true',
            'done:'
        ])
    }
    const set = conditionOf(name, 'set')
    if (set) {
        return program([
            '        mov rax, 12',
            '        cmp rax, 12',
            `        ${name} bl             ; bl becomes 1 when the condition holds, 0 when it does not`
        ])
    }
    const move = conditionOf(name, 'cmov')
    if (move) {
        return program([
            '        mov rax, 12',
            '        mov rbx, 99',
            '        cmp rax, 12',
            `        ${name} rax, rbx      ; copies rbx into rax only when the condition holds`
        ])
    }
    return null
}

/** Fills one operand of a form with something concrete, or gives up on the whole form. */
function fillOperand(operand: string, index: number): string | null {
    if (operand === '1') return '1'
    if (operand === 'cl') return 'cl'
    if (['al', 'ax', 'eax', 'rax'].includes(operand)) return operand
    const match = WIDTH.exec(operand)
    if (!match) return null
    const [, kind, width] = match
    const bits = Number(width ?? 64)
    if (kind === 'imm') return bits === 8 ? '5' : '5'
    if (kind === 'mem') return '[value]'
    const register = OPERAND_REGISTERS[index]
    if (!register) return null
    return register[bits as 8 | 16 | 32 | 64] ?? null
}

/** The widest operand a form names, so the generic path can prefer the 64 bit shape. */
function widthOf(form: X86InstructionForm): number {
    return form.operands.reduce((widest, operand) => {
        const match = WIDTH.exec(operand)
        return Math.max(widest, match?.[2] ? Number(match[2]) : 0)
    }, 0)
}

function fillForm(instruction: X86Instruction, form: X86InstructionForm): string | null {
    if (form.notes.includes('NOLONG') || form.notes.includes('PRIV')) return null
    const operands: string[] = []
    for (const [index, operand] of form.operands.entries()) {
        const filled = fillOperand(operand, index)
        if (filled === null) return null
        operands.push(filled)
    }
    return operands.length ? `${instruction.name} ${operands.join(', ')}` : instruction.name
}

/**
 * Instructions the generic path can fill in but should not: they stop the program, fault on
 * purpose, or leave the machine somewhere the reader cannot follow.
 */
const NEVER_GENERATED = new Set([
    'hlt',
    'int',
    'int1',
    'int3',
    'int03',
    'into',
    'iret',
    'iretq',
    'iretw',
    'ud0',
    'ud1',
    'ud2',
    'sysret',
    'sysexit',
    'syscall',
    'sysenter',
    'popf',
    'popfq',
    'popfw',
    'nop2',
    'pause',
    'rsm',
    // Long mode has no 32 bit stack width, so the assembler rejects these spellings even though
    // NASM's table lists them without a long mode marker. The 16 bit ones assemble.
    'enterd',
    'leaved',
    'popfd',
    'pushfd'
])

/** The program shown on the page of `name`, or null when there is nothing safe to show. */
export function buildX86Example(name: string): string | null {
    const written = WRITTEN[name]
    if (written) return written
    const loop = loopExample(name)
    if (loop) return loop
    const string = stringExample(name)
    if (string) return string
    const conditional = conditionalExample(name)
    if (conditional) return conditional
    if (NEVER_GENERATED.has(name)) return null

    const instruction = x86InstructionMap.get(name)
    if (!instruction) return null
    // Nothing that only exists outside long mode can run here: blink runs a 64 bit program.
    if (instruction.forms.every((form) => form.notes.includes('NOLONG'))) return null

    // Widest first: this is a 64 bit editor, and `add rax, rbx` reads better than `add al, bl`,
    // which is the form NASM's table happens to list first.
    const widest = [...instruction.forms].sort((left, right) => widthOf(right) - widthOf(left))
    for (const form of widest) {
        const line = fillForm(instruction, form)
        if (!line) continue
        const usesMemory = line.includes('[value]')
        return program([...SETUP, '', `        ${line}`], usesMemory ? ['value: dq 7'] : [])
    }
    return null
}
