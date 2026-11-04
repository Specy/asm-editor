import { describe, expect, it } from 'vite-plus/test'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { RISCVEmulator } from '#lib/languages/RISC-V/RISC-VEmulator.svelte.ts'
import { ProgramClock } from '#lib/languages/peripherals/ProgramClock.ts'
import type { ProjectDisplay } from '#lib/languages/mars/marsDisplay.ts'

/**
 * The Call stack panel after Step back shows what it showed before the step, on MIPS and RISC-V:
 * across a call, a return, a call through a pointer, a recursion whose calls return to a branch,
 * and an interrupt whose handler calls a function of its own. The Cores journal their call frames
 * with each instruction's other restores, so an Undo puts back the frame a return popped, with the
 * registers of its own call, and takes off the one a call pushed.
 */

const SMALL: ProjectDisplay = {
    unitWidth: 8,
    unitHeight: 8,
    width: 64,
    height: 64,
    baseAddress: 0x10010000
}

const PROGRAMS = {
    //the timer interrupts once Count, one for every two instructions, reaches 20
    MIPS: `
        .text
main:   li $t0, 20
        mtc0 $t0, $11
        jal a
        la $t9, b
        jalr $t9
        li $a0, 3
        jal r
        li $v0, 10
        syscall
a:      addiu $sp, $sp, -4
        sw $ra, 0($sp)
        jal b
        lw $ra, 0($sp)
        addiu $sp, $sp, 4
        jr $ra
b:      jr $ra
r:      addiu $sp, $sp, -8
        sw $ra, 4($sp)
        beq $a0, $zero, rdone
        addiu $a0, $a0, -1
        jal r
        b rdone
rdone:  lw $ra, 4($sp)
        addiu $sp, $sp, 8
        jr $ra
        .ktext 0x80000180
handler: move $k1, $ra
        jal kf
        move $ra, $k1
        li $k0, 0x7fffffff
        mtc0 $k0, $11
        eret
kf:     jr $ra
`,
    //the program asks for the software interrupt at the recursion's deepest
    'RISC-V': `
        .text
main:   la t0, handler
        csrw t0, utvec
        csrsi uie, 1
        csrsi ustatus, 1
        jal a
        la t1, b
        jalr t1
        li a0, 3
        jal r
        li a7, 10
        ecall
a:      addi sp, sp, -4
        sw ra, 0(sp)
        jal b
        lw ra, 0(sp)
        addi sp, sp, 4
        ret
b:      ret
r:      addi sp, sp, -8
        sw ra, 4(sp)
        beqz a0, deepest
        addi a0, a0, -1
        jal r
        j rdone
deepest: csrsi uip, 1
rdone:  lw ra, 4(sp)
        addi sp, sp, 8
        ret
handler: mv t6, ra
        jal kf
        mv ra, t6
        uret
kf:     ret
`
}

describe.each(['MIPS', 'RISC-V'] as const)('the call stack after Step back on %s', (language) => {
    it('is the one from before the step, through calls, returns and an interrupt', async () => {
        const code = PROGRAMS[language]
        const make = language === 'MIPS' ? MIPSEmulator : RISCVEmulator
        const emulator = make(code, {
            display: SMALL,
            peripherals: { clock: new ProgramClock({ mode: 'virtual' }) }
        })
        await emulator.check()
        await emulator.compile(2_000, code)
        const panel = () =>
            emulator.callStack.map(({ name, address, destination, sp, line }) => ({
                name,
                address,
                destination,
                sp,
                line
            }))

        const shown = [panel()]
        while (!emulator.terminated && shown.length < 500) {
            await emulator.step()
            shown.push(panel())
            //the History row of a call or a return lists what the program wrote, the link register
            //and the program counter, and nothing of the frame the Core journals beside them
            if (shown.at(-1)!.length !== shown.at(-2)!.length)
                for (const mutation of emulator.latestSteps[0].mutations)
                    expect(mutation.type).toBe('WriteRegister')
        }
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        const names = shown.map((frames) => frames.map((frame) => frame.name).join(' > '))
        expect(names).toContain('a > b')
        expect(names).toContain('r > r > r > r')
        //the handler's call, on top of the frames of the code it interrupted
        expect(names.some((stack) => /^r( > r)* > kf$/.test(stack))).toBe(true)
        expect(names.at(-1)).toBe('')

        for (let step = shown.length - 1; step > 0; step--) {
            expect(emulator.undo()).toBe(1)
            expect(panel(), `after undoing step ${step}`).toEqual(shown[step - 1])
        }
        expect(emulator.canUndo).toBe(false)
        //and the same frames again on the way forward, from the ones the Undo put back
        for (let step = 1; step < shown.length; step++) {
            await emulator.step()
            expect(panel(), `stepping ${step} again`).toEqual(shown[step])
        }
    })
})
