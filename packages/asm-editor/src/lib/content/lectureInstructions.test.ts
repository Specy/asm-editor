import { describe, expect, it } from 'vite-plus/test'
import { instructionLessons, lectureInstructions } from './lectureInstructions'

function names(markdown: string) {
    return lectureInstructions(markdown).map((group) => [
        group.language,
        group.instructions.map((instruction) => instruction.name)
    ])
}

describe('the instructions a Lecture uses', () => {
    it('reads the mnemonic of each line, past labels, comments, directives and size suffixes', () => {
        const markdown = [
            '```m68k|playground|memory',
            '    ORG $1000',
            'start:',
            'loop    move.l #1, d0 ; move.w in a comment',
            '        add.w d0, d1',
            '        MOVE.B d1, d2',
            '        dbra d0, loop',
            'msg     dc.b "hi", 0',
            '```'
        ].join('\n')
        expect(names(markdown)).toEqual([['m68k', ['move', 'add', 'dbra']]])
    })

    it('counts another spelling as the instruction it stands for, and a prefix is not one', () => {
        const markdown = [
            '```x86',
            'section .text',
            'global _start',
            '_start:',
            '    cmp rax, 0',
            '    jz done',
            '    je done',
            '    rep movsb',
            'done:',
            '```'
        ].join('\n')
        expect(names(markdown)).toEqual([['x86', ['cmp', 'je', 'movsb']]])
    })

    it('reads only the assembly fences, a RISC-V-64 one as RISC-V, and groups by language', () => {
        const markdown = [
            'Some text with `move.l` inline, which is not a code block.',
            '',
            '```riscv64',
            '    ld t0, 0(sp)',
            '```',
            '',
            '```testcase',
            'add: 1',
            '```',
            '',
            '```c',
            'int add(int a, int b) { return a + b; }',
            '```',
            '',
            '- a list',
            '',
            '    ```mips',
            '    addi $t0, $zero, 1',
            '    my_macro $t0',
            '    ```'
        ].join('\n')
        expect(names(markdown)).toEqual([
            ['risc-v', ['ld']],
            ['mips', ['addi']]
        ])
    })

    it('links each instruction to its page', () => {
        const [group] = lectureInstructions('```z80\n    ld a, 1\n```')
        expect(group.instructions).toEqual([
            { name: 'ld', pathname: '/documentation/z80/instruction/ld' }
        ])
    })
})

describe('the Lectures that use an instruction', () => {
    it('lists the language course before the General course, at most ten', async () => {
        const lessons = await instructionLessons('m68k', 'move')
        expect(lessons.length).toBeGreaterThan(0)
        expect(lessons.length).toBeLessThanOrEqual(10)
        const courses = lessons.map((lesson) => lesson.courseSlug)
        expect(courses.indexOf('assembly-basics')).not.toBe(0)
        expect(courses.slice(0, courses.lastIndexOf('m68k') + 1).every((c) => c === 'm68k')).toBe(
            true
        )
    })

    it('answers an alias with its instruction and a mnemonic with no page with nothing', async () => {
        expect(await instructionLessons('x86', 'jz')).toEqual(await instructionLessons('x86', 'je'))
        expect(await instructionLessons('x86', 'not_an_instruction')).toEqual([])
    })
})
