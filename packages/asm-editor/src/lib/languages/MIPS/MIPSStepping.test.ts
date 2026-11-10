import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { CALL_STACK_FRAMES_SHOWN } from '#lib/languages/GenericEmulator.svelte.ts'
import { ProgramClock } from '#lib/languages/peripherals/ProgramClock.ts'
import type { ProjectDisplay } from '#lib/languages/mars/marsDisplay.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'

/**
 * Step over and Step out on MIPS against the real Core
 * ([stepping-plan.md](../../../../../../docs/design/stepping-plan.md)): MARS keeps its Call stack as
 * the program runs, frames for `jal`, `jalr`, a taken `bal` and the exception handler included, and
 * stops a run at a call depth, and the shared MARS adapter hands both to the Emulator, with the
 * ledger hooks that make a completed step one Undo. The RISC-V twin of this file covers the same
 * adapter through RARS.
 */

type Emulator = ReturnType<typeof MIPSEmulator>

const SMALL: ProjectDisplay = {
    unitWidth: 8,
    unitHeight: 8,
    width: 64,
    height: 64,
    baseAddress: 0x10010000
}

/** Builds a program, failing the test if it does not assemble, and finds its lines by their text. */
async function build(lines: string[]) {
    const code = lines.join('\n')
    const emulator = MIPSEmulator(code, {
        display: SMALL,
        peripherals: { clock: new ProgramClock({ mode: 'virtual' }) }
    })
    await emulator.check()
    await emulator.compile(10_000, code)
    expect(emulator.errors).toEqual([])
    const lineOf = (text: string): number => {
        const index = lines.findIndex((line) => line.trim() === text)
        if (index === -1) throw new Error(`No line ${text}`)
        return index
    }
    return { emulator, lineOf }
}

function register(emulator: Emulator, name: string): bigint {
    const found = emulator.registers.find((candidate) => candidate.name === name)
    if (!found) throw new Error(`No register ${name}`)
    return found.value
}

/** The routine names the Call stack panel shows, outermost first. */
function routines(emulator: Emulator): string[] {
    return emulator.callStack.map((frame) => frame.name)
}

const EXIT = ['        li $v0, 10', '        syscall']

/** `main` calls a routine of two instructions that doubles `$a0`. */
const CALLING = [
    '        .text',
    'main:   li $a0, 1',
    '        jal twice',
    '        move $a1, $a0',
    ...EXIT,
    'twice:  add $a0, $a0, $a0',
    '        jr $ra'
]

beforeEach(() => Prompt.cancel())

describe('MIPS Step over', () => {
    it('is a Step on a line that calls nothing', async () => {
        const { emulator, lineOf } = await build(CALLING)
        expect(emulator.line).toBe(lineOf('main:   li $a0, 1'))

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('jal twice'))
        expect(emulator.latestSteps[0].stretch).toBeUndefined()

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('main:   li $a0, 1'))
    })

    it('runs the routine jal enters, stops on the line after it, and is one row and one Undo', async () => {
        const { emulator, lineOf } = await build(CALLING)
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('move $a1, $a0'))
        expect(register(emulator, '$a0')).toBe(2n)
        expect(emulator.callStack).toEqual([])
        expect(emulator.callStackDepth).toBe(0)

        const [row, before] = emulator.latestSteps
        expect(row.line).toBe(lineOf('jal twice'))
        expect(row.stretch).toEqual({ kind: 'over', library: 'twice', instructions: 3 })
        expect(before.line).toBe(lineOf('main:   li $a0, 1'))

        expect(emulator.canUndo).toBe(true)
        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('jal twice'))
        expect(register(emulator, '$a0')).toBe(1n)
        expect(emulator.callStack).toEqual([])
    })

    it('runs every instruction of a line that assembles to several', async () => {
        const { emulator, lineOf } = await build([
            '        .data',
            'value:  .word 7',
            '        .text',
            'main:   la $t0, value',
            '        li $t1, 0x12345',
            '        lw $t2, 0($t0)',
            ...EXIT
        ])
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('li $t1, 0x12345'))
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('lw $t2, 0($t0)'))
        expect(register(emulator, '$t1')).toBe(0x12345n)
        //and Step still takes them one machine instruction at a time
        emulator.undo()
        expect(emulator.line).toBe(lineOf('li $t1, 0x12345'))
        await emulator.step()
        expect(emulator.line).toBe(lineOf('li $t1, 0x12345'))
    })

    it('ends at the depth it started at in a routine that calls itself', async () => {
        //the sum of 1..4, each level saving `$ra` on the stack and calling the next
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   li $a0, 4',
            '        jal sum',
            '        move $s1, $v0',
            ...EXIT,
            'sum:    addi $sp, $sp, -8',
            '        sw $ra, 4($sp)',
            '        sw $a0, 0($sp)',
            '        li $v0, 0',
            '        beq $a0, $zero, done',
            '        addi $a0, $a0, -1',
            '        jal sum',
            '        lw $a0, 0($sp)',
            '        add $v0, $v0, $a0',
            'done:   lw $ra, 4($sp)',
            '        addi $sp, $sp, 8',
            '        jr $ra'
        ])
        await emulator.stepOver()
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move $s1, $v0'))
        expect(register(emulator, '$v0')).toBe(10n)
        expect(emulator.callStackDepth).toBe(0)
    })

    it('stops at a Breakpoint on the first instruction of the routine, and inside it', async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('twice:  add $a0, $a0, $a0'))
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: false })
        expect(emulator.line).toBe(lineOf('twice:  add $a0, $a0, $a0'))
        expect(routines(emulator)).toEqual(['twice'])
        expect(emulator.latestSteps[0].stretch).toBeUndefined()
        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('jal twice'))

        emulator.toggleBreakpoint(lineOf('twice:  add $a0, $a0, $a0'))
        emulator.toggleBreakpoint(lineOf('jr $ra'))
        expect((await emulator.stepOver()).completed).toBe(false)
        expect(emulator.line).toBe(lineOf('jr $ra'))
        expect((await emulator.stepOut()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move $a1, $a0'))
    })

    it('stops once, completed, with a Breakpoint on the line the call returns to', async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('move $a1, $a0'))
        await emulator.stepOver()
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move $a1, $a0'))
        expect(emulator.latestSteps[0].stretch?.kind).toBe('over')
        await emulator.stepOver()
        expect(register(emulator, '$a1')).toBe(2n)
    })

    it('waits for the input the routine reads, and still ends after the call', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   jal read',
            '        move $s1, $v0',
            ...EXIT,
            'read:   li $v0, 5',
            '        syscall',
            '        jr $ra'
        ])
        const terminal = emulator.peripherals.terminal
        terminal.attachConsole()

        const step = emulator.stepOver()
        await vi.waitFor(() => expect(terminal.pendingRead?.kind).toBe('line'))
        terminal.insertText('7')
        terminal.pressEnter()

        expect(await step).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('move $s1, $v0'))
        expect(register(emulator, '$v0')).toBe(7n)
    })

    it('goes on after the routine sleeps, and still ends after the call', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   jal nap',
            '        move $s1, $v0',
            ...EXIT,
            'nap:    li $v0, 32',
            '        li $a0, 50',
            '        syscall',
            '        li $v0, 9',
            '        jr $ra'
        ])
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('move $s1, $v0'))
        expect(register(emulator, '$v0')).toBe(9n)
    })

    it('is a Step on a branch-and-link that is not taken, and runs the routine of one that is', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   li $t0, -1',
            '        bgezal $t0, twice',
            '        li $t0, 1',
            '        bgezal $t0, twice',
            '        move $a1, $a0',
            ...EXIT,
            'twice:  add $a0, $a0, $a0',
            '        jr $ra'
        ])
        await emulator.stepOver()
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('li $t0, 1'))
        expect(emulator.latestSteps[0].stretch).toBeUndefined()

        await emulator.stepOver()
        await emulator.step()
        //the frame returns to the line after the branch, not to the routine it branched to
        expect(routines(emulator)).toEqual(['twice'])
        expect(emulator.callStack[0].destination).toBe(emulator._resolveMemoryLabel('twice')! - 12n)
        emulator.undo()
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move $a1, $a0'))
    })

    it('runs a routine that returns through another register', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   jal bump',
            '        move $s1, $a0',
            ...EXIT,
            'bump:   addi $a0, $a0, 1',
            '        move $t0, $ra',
            '        jr $t0'
        ])
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move $s1, $a0'))
        expect(emulator.callStackDepth).toBe(0)
    })

    it('ends the program when the call is its last instruction', async () => {
        //the routine returns to the address after the `jal`, where the program has nothing
        const { emulator } = await build([
            '        .text',
            'main:   j start',
            'leaf:   jr $ra',
            'start:  jal leaf'
        ])
        await emulator.stepOver()
        expect(await emulator.stepOver()).toEqual({ terminated: true, completed: false })
        expect(emulator.terminated).toBe(true)
    })

    it('is a Step on a call to the very next instruction, which enters no routine', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   jal next',
            'next:   move $s1, $ra',
            ...EXIT
        ])
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('next:   move $s1, $ra'))
        expect(emulator.callStackDepth).toBe(0)
    })
})

describe('MIPS Undo of a step', () => {
    it('takes back what the routine printed, and a long routine in one go', async () => {
        //the routine prints a line and then counts down, a few thousand instructions
        const { emulator, lineOf } = await build([
            '        .data',
            'text:   .asciiz "done"',
            '        .text',
            'main:   jal report',
            '        move $s1, $t0',
            ...EXIT,
            'report: la $a0, text',
            '        li $v0, 4',
            '        syscall',
            '        li $t0, 2000',
            'spin:   addi $t0, $t0, -1',
            '        bne $t0, $zero, spin',
            '        jr $ra'
        ])
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move $s1, $t0'))
        expect(emulator.stdOut).toContain('done')
        const entries = emulator.latestSteps[0].stretch?.instructions ?? 0
        expect(entries).toBeGreaterThan(4000)

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('main:   jal report'))
        expect(emulator.stdOut).not.toContain('done')
        expect(emulator.canUndo).toBe(false)
        expect(emulator.callStackDepth).toBe(0)

        //and the step runs again as it did, printing once
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.stdOut.match(/done/g)).toHaveLength(1)
        expect(emulator.latestSteps[0].stretch?.instructions).toBe(entries)
    })
})

describe('MIPS Step out', () => {
    it('leaves the routine the program is in, as one row of the History', async () => {
        const { emulator, lineOf } = await build(CALLING)
        expect(emulator.canStepOut).toBe(false)
        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: false })

        await emulator.step()
        await emulator.step()
        expect(routines(emulator)).toEqual(['twice'])
        expect(emulator.canStepOut).toBe(true)

        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('move $a1, $a0'))
        expect(emulator.canStepOut).toBe(false)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'out',
            library: 'twice',
            instructions: 2
        })
        expect(emulator.undo()).toBe(1)
        expect(routines(emulator)).toEqual(['twice'])
    })

    it('leaves an exception handler, which a Step over of the line that trapped runs out', async () => {
        const { emulator, lineOf } = await build([
            '        .text',
            'main:   li $t0, 1',
            '        teq $t0, $t0',
            '        move $s1, $k1',
            ...EXIT,
            '        .ktext 0x80000180',
            '        mfc0 $k0, $14',
            '        addiu $k0, $k0, 4',
            '        mtc0 $k0, $14',
            '        li $k1, 7',
            '        eret'
        ])
        await emulator.stepOver()
        expect(emulator.line).toBe(lineOf('teq $t0, $t0'))

        //the trap enters the handler, which is a frame: Step over runs it to its `eret`
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move $s1, $k1'))
        expect(register(emulator, '$k1')).toBe(7n)
        expect(emulator.callStackDepth).toBe(0)

        //Step enters it, where the Call stack names it, and Step out leaves it
        emulator.undo()
        await emulator.step()
        expect(emulator.line).toBe(lineOf('mfc0 $k0, $14'))
        expect(routines(emulator)).toEqual(['Exception handler'])
        expect((await emulator.stepOut()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move $s1, $k1'))
    })
})

describe('MIPS Call stack', () => {
    it('gives the panel the newest frames of a deep recursion and counts all of them', async () => {
        const depth = CALL_STACK_FRAMES_SHOWN + 100
        const { emulator, lineOf } = await build([
            '        .text',
            `main:   li $a0, ${depth}`,
            '        jal down',
            ...EXIT,
            'down:   addi $sp, $sp, -4',
            '        sw $ra, 0($sp)',
            '        addi $a0, $a0, -1',
            '        beq $a0, $zero, bottom',
            '        jal down',
            'bottom: lw $ra, 0($sp)',
            '        addi $sp, $sp, 4',
            '        jr $ra'
        ])
        emulator.toggleBreakpoint(lineOf('bottom: lw $ra, 0($sp)'))
        await emulator.run(0)

        expect(emulator.callStackDepth).toBe(depth)
        expect(emulator.callStack).toHaveLength(CALL_STACK_FRAMES_SHOWN)
        expect(routines(emulator).every((name) => name === 'down')).toBe(true)
        expect((await emulator.stepOut()).completed).toBe(true)
        expect(emulator.callStackDepth).toBe(depth - 1)
    })
})
