import { describe, expect, it, vi } from 'vite-plus/test'
import { Z80Emulator } from '#lib/languages/Z80/Z80Emulator.svelte.ts'
import { CALL_STACK_FRAMES_SHOWN } from '#lib/languages/GenericEmulator.svelte.ts'

/**
 * Step over and Step out against the real Core
 * ([stepping-plan.md](../../../../../../docs/design/stepping-plan.md)): the machine tracks its Call
 * stack and stops a run at a call depth, and the adapter hands both to the Emulator, with the ledger
 * hooks that make a completed step one Undo.
 */

type Z80 = ReturnType<typeof Z80Emulator>

/** Builds a program, failing the test if it does not assemble, and finds its lines by their text. */
async function build(lines: string[], historySize = 1_000) {
    const code = lines.join('\n')
    const emulator = Z80Emulator(code)
    await emulator.compile(historySize, code)
    expect(emulator.errors).toEqual([])
    const lineOf = (text: string): number => {
        const index = lines.findIndex((line) => line.trim() === text)
        if (index === -1) throw new Error(`No line ${text}`)
        return index
    }
    return { emulator, lineOf }
}

function register(emulator: Z80, name: string): bigint {
    const found = emulator.registers.find((candidate) => candidate.name === name)
    if (!found) throw new Error(`No register ${name}`)
    return found.value
}

/** The routine names the Call stack panel shows, outermost first. */
function routines(emulator: Z80): string[] {
    return emulator.callStack.map((frame) => frame.name)
}

/** `main` calls a routine of two instructions that doubles `a`. */
const CALLING = [
    '        org $8000',
    '        ld a, 1',
    '        call twice',
    '        halt',
    'twice:',
    '        add a, a',
    '        ret'
]

describe('Z80 Step over', () => {
    it('is a Step on a line that calls nothing', async () => {
        const { emulator, lineOf } = await build(CALLING)
        expect(emulator.line).toBe(lineOf('ld a, 1'))

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('call twice'))
        expect(emulator.latestSteps[0].stretch).toBeUndefined()

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('ld a, 1'))
    })

    it('runs the routine a call enters, stops on the line after it, and is one row and one Undo', async () => {
        const { emulator, lineOf } = await build(CALLING)
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))
        expect(register(emulator, 'a')).toBe(2n)
        expect(emulator.callStack).toEqual([])

        const [row, before] = emulator.latestSteps
        expect(row.pc).toBe(0x8002)
        expect(row.stretch).toEqual({ kind: 'over', library: 'twice', instructions: 3 })
        expect(before.pc).toBe(0x8000)

        expect(emulator.canUndo).toBe(true)
        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('call twice'))
        expect(register(emulator, 'a')).toBe(1n)
        expect(emulator.callStack).toEqual([])
        expect(emulator.latestSteps[0].pc).toBe(0x8000)
    })

    it('ends at the depth it started at in a routine that calls itself', async () => {
        const { emulator, lineOf } = await build([
            '        org $8000',
            '        ld b, 3',
            '        call count',
            '        halt',
            'count:',
            '        dec b',
            '        ret z',
            '        call count',
            '        ret'
        ])
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))
        expect(register(emulator, 'bc') >> 8n).toBe(0n)
        expect(emulator.callStack).toEqual([])
        //the call, then dec / ret z / call twice over, then dec / ret z and the two returns
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: 'count',
            instructions: 11
        })
    })

    it('names only the newest frames of a deep recursion, and steps out of the innermost', async () => {
        const { emulator, lineOf } = await build([
            '        org $8000',
            '        ld bc, 600',
            '        call count',
            '        halt',
            'count:',
            '        dec bc',
            '        ld a, b',
            '        or c',
            '        jr z, bottom',
            '        call count',
            '        ret',
            'bottom: ret'
        ])
        emulator.toggleBreakpoint(lineOf('bottom: ret'))
        await emulator.run(100_000)
        expect(emulator.line).toBe(lineOf('bottom: ret'))

        //the panel is given the newest CALL_STACK_FRAMES_SHOWN of the 600, outermost first, each
        //with the colour of its depth, as the whole stack would give it
        const all = emulator._getCallStack()
        expect(all).toHaveLength(600)
        expect(emulator.callStack).toHaveLength(CALL_STACK_FRAMES_SHOWN)
        expect(emulator.callStack).toEqual(all.slice(-CALL_STACK_FRAMES_SHOWN))
        expect(emulator._getCallStack(2)).toEqual(all.slice(-2))

        //out of the innermost of them, its `ret` alone, which reads in the History as a Step does
        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('ret'))
        expect(emulator.latestSteps[0].stretch).toBeUndefined()
        expect(emulator._getCallStack()).toHaveLength(599)
        expect(emulator.callStack).toHaveLength(CALL_STACK_FRAMES_SHOWN)
    })

    it('is a Step on a conditional call that is not taken', async () => {
        const { emulator, lineOf } = await build([
            '        org $8000',
            '        xor a',
            '        call nz, never',
            '        ld b, 1',
            '        halt',
            'never:',
            '        ld b, 2',
            '        ret'
        ])
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('ld b, 1'))
        expect(emulator.latestSteps[0].stretch).toBeUndefined()
        expect(emulator.callStack).toEqual([])
    })

    it("stops at a Breakpoint on the routine's first instruction", async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('add a, a'))
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: false })
        expect(emulator.line).toBe(lineOf('add a, a'))
        expect(register(emulator, 'a')).toBe(1n)
        expect(routines(emulator)).toEqual(['twice'])
        expect(emulator.canStepOut).toBe(true)
    })

    it('stops at a Breakpoint inside the routine, and Step out goes on from there', async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('ret'))
        await emulator.stepOver()

        expect((await emulator.stepOver()).completed).toBe(false)
        expect(emulator.line).toBe(lineOf('ret'))
        expect(register(emulator, 'a')).toBe(2n)

        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))
    })

    it('stops once, completed, with a Breakpoint on the line the call returns to', async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('halt'))
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))
        expect(emulator.latestSteps[0].stretch?.kind).toBe('over')
    })

    it('waits for the input the routine reads, and still ends after the call', async () => {
        const { emulator, lineOf } = await build([
            '        org $8000',
            '        call read',
            '        ld b, a',
            '        halt',
            'read:',
            '        in a, (0x10)',
            '        ret'
        ])
        const terminal = emulator.peripherals.terminal
        terminal.attachConsole()

        const step = emulator.stepOver()
        await vi.waitFor(() => expect(terminal.pendingRead).not.toBeNull())
        terminal.insertText('x\n')

        expect(await step).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('ld b, a'))
        expect(register(emulator, 'a')).toBe(0x78n)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: 'read',
            instructions: 3
        })
    })

    it('runs a whole block instruction, where Step runs one pass of it', async () => {
        const { emulator, lineOf } = await build([
            '        org $8000',
            '        ld hl, source',
            '        ld de, copy',
            '        ld bc, 4',
            '        ldir',
            '        halt',
            'source: .byte 1, 2, 3, 4',
            'copy:   .byte 0, 0, 0, 0'
        ])
        for (let i = 0; i < 3; i++) await emulator.step()
        expect(emulator.line).toBe(lineOf('ldir'))

        await emulator.step()
        expect(emulator.line).toBe(lineOf('ldir'))
        expect(register(emulator, 'bc')).toBe(3n)

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))
        expect(register(emulator, 'bc')).toBe(0n)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: '',
            instructions: 3
        })

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('ldir'))
        expect(register(emulator, 'bc')).toBe(3n)
    })

    it('runs every instruction of a line that uses a macro', async () => {
        const { emulator, lineOf } = await build([
            '        org $8000',
            'quad    macro',
            '        add a, a',
            '        add a, a',
            '        endm',
            '        ld a, 1',
            '        quad',
            '        halt'
        ])
        await emulator.stepOver()
        expect(emulator.line).toBe(lineOf('quad'))

        //a Step runs one instruction of it, and the program is still on the line, not ended
        await emulator.step()
        expect(emulator.terminated).toBe(false)
        expect(emulator.line).toBe(lineOf('quad'))
        emulator.undo()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))
        expect(register(emulator, 'a')).toBe(4n)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'over',
            library: '',
            instructions: 2
        })
    })

    it("takes a routine returning into a macro's instructions for no end of the program", async () => {
        const { emulator, lineOf } = await build([
            '        org $8000',
            'callit  macro',
            '        call sub',
            '        inc a',
            '        endm',
            '        ld a, 1',
            '        callit',
            '        halt',
            'sub:',
            '        ret'
        ])
        await emulator.step()
        await emulator.step()
        expect(routines(emulator)).toEqual(['sub'])
        await emulator.step()
        expect(emulator.terminated).toBe(false)
        expect(emulator.line).toBe(lineOf('callit'))

        //and a Step over of the line runs the call and the rest of the macro
        emulator.undo(2)
        expect(emulator.line).toBe(lineOf('callit'))
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))
        expect(register(emulator, 'a')).toBe(2n)
    })

    it('keeps the Call stack of a routine that borrows SP to fill memory', async () => {
        const { emulator, lineOf } = await build([
            '        org $8000',
            '        call fill',
            '        halt',
            'fill:',
            '        ld (save), sp',
            '        ld sp, $9010',
            '        ld hl, $AAAA',
            '        push hl',
            '        push hl',
            '        ld sp, (save)',
            '        ret',
            'save:   .word 0'
        ])
        await emulator.step()
        for (let i = 0; i < 5; i++) await emulator.step()
        expect(emulator.line).toBe(lineOf('ld sp, (save)'))
        expect(routines(emulator)).toEqual(['fill'])
        expect(emulator.canStepOut).toBe(true)

        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))

        //and over the whole call at once
        emulator.undo(100)
        expect(emulator.line).toBe(lineOf('call fill'))
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))
    })

    it('ends the program when the call is its last instruction', async () => {
        const { emulator } = await build([
            '        org $8000',
            '        jp main',
            'sub:',
            '        ret',
            'main:',
            '        call sub'
        ])
        await emulator.step()
        //the call returns past the code, which is the end of the program
        const outcome = await emulator.stepOver()
        expect(outcome.terminated).toBe(true)
        expect(outcome.completed).toBe(false)
        expect(emulator.terminated).toBe(true)
    })
})

describe('Z80 Step out', () => {
    it('leaves the routine the program is in, as one row of the History', async () => {
        const { emulator, lineOf } = await build(CALLING)
        expect(emulator.canStepOut).toBe(false)
        await emulator.step()
        expect(emulator.line).toBe(lineOf('call twice'))
        expect(emulator.canStepOut).toBe(false)

        await emulator.step()
        expect(emulator.line).toBe(lineOf('add a, a'))
        expect(routines(emulator)).toEqual(['twice'])
        expect(emulator.canStepOut).toBe(true)

        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('halt'))
        expect(emulator.callStack).toEqual([])
        expect(emulator.canStepOut).toBe(false)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'out',
            library: 'twice',
            instructions: 2
        })

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('add a, a'))
        expect(routines(emulator)).toEqual(['twice'])
    })

    it('does nothing at the top level', async () => {
        const { emulator, lineOf } = await build(CALLING)
        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: false })
        expect(emulator.line).toBe(lineOf('ld a, 1'))
        expect(emulator.latestSteps).toEqual([])
    })
})

describe('Z80 Run from a Breakpoint on a line that waits for input', () => {
    it('runs the `in` once its input is given, rather than stopping on it again', async () => {
        const { emulator, lineOf } = await build([
            '        org $8000',
            '        ld b, 1',
            '        in a, (0x10)',
            '        ld b, a',
            '        halt'
        ])
        const terminal = emulator.peripherals.terminal
        terminal.attachConsole()
        emulator.toggleBreakpoint(lineOf('in a, (0x10)'))

        await emulator.run(100_000)
        expect(emulator.line).toBe(lineOf('in a, (0x10)'))
        expect(emulator.terminated).toBe(false)

        //parked on the Breakpoint, Run starts on the `in`, which waits: the first Core call runs
        //nothing, and the one that runs the `in` once the input is there must still pass it over
        const run = emulator.run(100_000)
        await vi.waitFor(() => expect(terminal.pendingRead).not.toBeNull())
        terminal.insertText('x\n')
        await run

        expect(emulator.terminated).toBe(true)
        expect(register(emulator, 'bc') >> 8n).toBe(0x78n)
    })
})
