import { describe, expect, it } from 'vite-plus/test'
import { M68KEmulator } from '#lib/languages/M68K/M68KEmulator.svelte.ts'
import { CALL_STACK_FRAMES_SHOWN } from '#lib/languages/GenericEmulator.svelte.ts'
import { KEY_CODES } from '#lib/languages/peripherals/keyCodes.ts'

/**
 * Step over and Step out against the real Core
 * ([stepping-plan.md](../../../../../../docs/design/stepping-plan.md)): the Core tracks its Call
 * stack by stack pointer and stops a run at a call depth, and the adapter hands both to the
 * Emulator, with the ledger hooks that make a completed step one Undo.
 */

type M68K = ReturnType<typeof M68KEmulator>

/** Builds a program, failing the test if it does not assemble, and finds its lines by their text. */
async function build(lines: string[], historySize = 1_000) {
    const code = lines.join('\n')
    const emulator = M68KEmulator(code)
    await emulator.compile(historySize, code)
    expect(emulator.errors).toEqual([])
    const lineOf = (text: string): number => {
        const index = lines.findIndex((line) => line.trim() === text)
        if (index === -1) throw new Error(`No line ${text}`)
        return index
    }
    return { emulator, lineOf }
}

function register(emulator: M68K, name: string): bigint {
    const found = emulator.registers.find((candidate) => candidate.name.toLowerCase() === name)
    if (!found) throw new Error(`No register ${name}`)
    return found.value
}

/** The routine names the Call stack panel shows, outermost first. */
function routines(emulator: M68K): string[] {
    return emulator.callStack.map((frame) => frame.name)
}

/** `main` calls a routine of two instructions that doubles `d0`. */
const CALLING = [
    '    ORG $1000',
    '    move.l #1, d0',
    '    bsr twice',
    '    move.l d0, d1',
    '    simhalt',
    'twice:',
    '    add.l d0, d0',
    '    rts'
]

describe('M68K Step over', () => {
    it('is a Step on a line that calls nothing', async () => {
        const { emulator, lineOf } = await build(CALLING)
        expect(emulator.line).toBe(lineOf('move.l #1, d0'))

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('bsr twice'))
        expect(emulator.latestSteps[0].stretch).toBeUndefined()

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('move.l #1, d0'))
    })

    it('runs the routine a call enters, stops on the line after it, and is one row and one Undo', async () => {
        const { emulator, lineOf } = await build(CALLING)
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('move.l d0, d1'))
        expect(register(emulator, 'd0')).toBe(2n)
        expect(emulator.callStack).toEqual([])

        const [row, before] = emulator.latestSteps
        expect(row.line).toBe(lineOf('bsr twice'))
        expect(row.stretch).toEqual({ kind: 'over', library: 'twice', instructions: 3 })
        expect(before.line).toBe(lineOf('move.l #1, d0'))

        expect(emulator.canUndo).toBe(true)
        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('bsr twice'))
        expect(register(emulator, 'd0')).toBe(1n)
        expect(emulator.callStack).toEqual([])
    })

    it('works with no Undo history, where a step is not a group', async () => {
        const { emulator, lineOf } = await build(CALLING, 0)
        await emulator.stepOver()
        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('move.l d0, d1'))
        expect(emulator.canUndo).toBe(false)
    })

    it('ends at the depth it started at in a routine that calls itself', async () => {
        //the sum of 1..4, each level calling the next from the same line
        const { emulator, lineOf } = await build([
            '    ORG $1000',
            '    move.l #4, d0',
            '    clr.l d1',
            '    bsr sum',
            '    simhalt',
            'sum:',
            '    add.l d0, d1',
            '    subq.l #1, d0',
            '    beq.s done',
            '    bsr sum',
            'done:',
            '    rts'
        ])
        await emulator.stepOver()
        await emulator.stepOver()
        expect(emulator.line).toBe(lineOf('bsr sum'))

        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('simhalt'))
        expect(register(emulator, 'd1')).toBe(10n)
        expect(emulator.callStackDepth).toBe(0)
    })

    it('stops at a Breakpoint on the first instruction of the routine, and inside it', async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('add.l d0, d0'))
        await emulator.stepOver()

        expect(await emulator.stepOver()).toEqual({ terminated: false, completed: false })
        expect(emulator.line).toBe(lineOf('add.l d0, d0'))
        expect(routines(emulator)).toEqual(['twice'])
        //a step that stopped early is undone an instruction at a time, as after a Run
        expect(emulator.latestSteps[0].stretch).toBeUndefined()
        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('bsr twice'))

        emulator.toggleBreakpoint(lineOf('add.l d0, d0'))
        emulator.toggleBreakpoint(lineOf('rts'))
        expect((await emulator.stepOver()).completed).toBe(false)
        expect(emulator.line).toBe(lineOf('rts'))
    })

    it('counts a Breakpoint on the line after the call as the end of the step, with one stop', async () => {
        const { emulator, lineOf } = await build(CALLING)
        emulator.toggleBreakpoint(lineOf('move.l d0, d1'))
        await emulator.stepOver()

        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move.l d0, d1'))
        expect(emulator.latestSteps[0].stretch?.kind).toBe('over')
        //and the next step runs the line rather than stopping on its Breakpoint again
        await emulator.stepOver()
        expect(emulator.line).toBe(lineOf('simhalt'))
        expect(register(emulator, 'd1')).toBe(2n)
    })

    it('waits for the input the routine reads, and still ends after the call', async () => {
        const { emulator, lineOf } = await build([
            '    ORG $1000',
            '    bsr ask',
            '    move.l d1, d2',
            '    simhalt',
            'ask:',
            '    move.b #4, d0',
            '    trap #15',
            '    rts'
        ])
        emulator.peripherals.terminal.useScriptedInput(['21'])

        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move.l d1, d2'))
        expect(register(emulator, 'd1')).toBe(21n)
    })

    it('runs a `trap` handler the line enters, and stops on the line after the trap', async () => {
        const { emulator, lineOf } = await build([
            '    ORG $1000',
            '    move.l #handler, $84',
            '    trap #1',
            '    move.l d0, d1',
            '    simhalt',
            'handler:',
            '    move.l #7, d0',
            '    rte'
        ])
        await emulator.stepOver()
        expect(emulator.line).toBe(lineOf('trap #1'))

        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move.l d0, d1'))
        expect(register(emulator, 'd0')).toBe(7n)
        expect(emulator.callStackDepth).toBe(0)

        //Step enters it, and Step out leaves it
        emulator.undo()
        expect(emulator.line).toBe(lineOf('trap #1'))
        await emulator.step()
        expect(emulator.line).toBe(lineOf('move.l #7, d0'))
        expect(emulator.canStepOut).toBe(true)
        expect((await emulator.stepOut()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move.l d0, d1'))
    })

    it('ends where a routine that skips data after its call returns to', async () => {
        const { emulator, lineOf } = await build([
            '    ORG $1000',
            '    bsr skip',
            '    dc.w $1234',
            '    move.l #5, d0',
            '    simhalt',
            'skip:',
            '    addq.l #2, (sp)',
            '    rts'
        ])
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move.l #5, d0'))
        expect(emulator.callStackDepth).toBe(0)
    })

    it('ends with the program when the routine ends it', async () => {
        const { emulator } = await build([
            '    ORG $1000',
            '    bsr quit',
            '    simhalt',
            'quit:',
            '    move.b #9, d0',
            '    trap #15'
        ])
        expect(await emulator.stepOver()).toEqual({ terminated: true, completed: false })
        expect(emulator.terminated).toBe(true)
    })
})

describe('M68K Undo of a step', () => {
    it('takes back what the routine printed, and a long routine in one go', async () => {
        //the routine prints a line and then counts down, a few thousand instructions
        const { emulator, lineOf } = await build(
            [
                '    ORG $1000',
                '    bsr report',
                '    move.l d2, d3',
                '    simhalt',
                'report:',
                '    lea text, a1',
                '    move.b #14, d0',
                '    trap #15',
                '    move.l #2000, d2',
                'spin:',
                '    subq.l #1, d2',
                '    bne spin',
                '    rts',
                "text: dc.b 'done',0"
            ],
            20_000
        )
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('move.l d2, d3'))
        expect(emulator.stdOut).toContain('done')
        const entries = emulator.latestSteps[0].stretch?.instructions ?? 0
        expect(entries).toBeGreaterThan(4000)

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('bsr report'))
        expect(emulator.stdOut).not.toContain('done')
        expect(emulator.canUndo).toBe(false)
        expect(emulator.callStackDepth).toBe(0)

        //and the step runs again as it did, printing once
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.stdOut.match(/done/g)).toHaveLength(1)
        expect(emulator.latestSteps[0].stretch?.instructions).toBe(entries)
    })
})

describe('M68K Step over and an IRQ', () => {
    it('runs the handler of an IRQ that is ready out, and then the line', async () => {
        const { emulator, lineOf } = await build([
            '    ORG $1000',
            '    move.l #key, $74',
            '    move.b #62, d0',
            '    move.w #$0501, d1',
            '    trap #15',
            '    moveq #1, d2',
            '    moveq #2, d3',
            '    simhalt',
            'key:',
            '    addq.l #1, d6',
            '    rte'
        ])
        for (let i = 0; i < 4; i++) await emulator.stepOver()
        expect(emulator.line).toBe(lineOf('moveq #1, d2'))

        //a key the program asked an IRQ for: the next step takes the IRQ instead of the line
        emulator.peripherals.keyboard.pressKey(KEY_CODES.SPACE)
        expect((await emulator.stepOver()).completed).toBe(true)
        expect(emulator.line).toBe(lineOf('moveq #2, d3'))
        expect(register(emulator, 'd6')).toBe(1n)
        expect(register(emulator, 'd2')).toBe(1n)
        expect(emulator.callStackDepth).toBe(0)

        //one Undo takes the handler and the line back, and the request is pending again
        expect(emulator.latestSteps[0].stretch?.kind).toBe('over')
        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('moveq #1, d2'))
        expect(register(emulator, 'd6')).toBe(0n)
        //where a Step enters the handler
        await emulator.step()
        expect(emulator.line).toBe(lineOf('addq.l #1, d6'))
        expect(routines(emulator)).toHaveLength(1)
    })
})

describe('M68K Step out', () => {
    it('runs the rest of the routine and is one row of the History', async () => {
        const { emulator, lineOf } = await build(CALLING)
        expect(emulator.canStepOut).toBe(false)
        expect(await emulator.stepOut()).toEqual({
            terminated: false,
            completed: false,
            refused: true
        })
        expect(emulator.line).toBe(lineOf('move.l #1, d0'))

        await emulator.step()
        await emulator.step()
        expect(emulator.line).toBe(lineOf('add.l d0, d0'))
        expect(emulator.canStepOut).toBe(true)

        expect(await emulator.stepOut()).toEqual({ terminated: false, completed: true })
        expect(emulator.line).toBe(lineOf('move.l d0, d1'))
        expect(emulator.canStepOut).toBe(false)
        expect(emulator.latestSteps[0].stretch).toEqual({
            kind: 'out',
            library: 'twice',
            instructions: 2
        })

        expect(emulator.undo()).toBe(1)
        expect(emulator.line).toBe(lineOf('add.l d0, d0'))
        expect(routines(emulator)).toEqual(['twice'])
    })

    it('leaves one level of a routine that calls itself', async () => {
        const { emulator, lineOf } = await build([
            '    ORG $1000',
            '    move.l #3, d0',
            '    bsr down',
            '    simhalt',
            'down:',
            '    subq.l #1, d0',
            '    beq.s bottom',
            '    bsr down',
            'bottom:',
            '    rts'
        ])
        emulator.toggleBreakpoint(lineOf('rts'))
        await emulator.run(0)
        expect(emulator.callStackDepth).toBe(3)

        expect((await emulator.stepOut()).completed).toBe(true)
        expect(emulator.callStackDepth).toBe(2)
        expect(emulator.line).toBe(lineOf('rts'))
    })
})

describe('the M68K Call stack panel', () => {
    it('is given the newest frames of a deep recursion, and their number in all', async () => {
        const depth = CALL_STACK_FRAMES_SHOWN + 100
        const { emulator, lineOf } = await build(
            [
                '    ORG $1000',
                `    move.l #${depth}, d0`,
                '    bsr down',
                '    simhalt',
                'down:',
                '    subq.l #1, d0',
                '    beq.s bottom',
                '    bsr down',
                'bottom:',
                '    nop',
                '    rts'
            ],
            0
        )
        emulator.toggleBreakpoint(lineOf('nop'))
        await emulator.run(0)

        expect(emulator.callStackDepth).toBe(depth)
        expect(emulator.callStack).toHaveLength(CALL_STACK_FRAMES_SHOWN)
        expect(routines(emulator).every((name) => name === 'down')).toBe(true)
        expect((await emulator.stepOut()).completed).toBe(true)
        expect(emulator.callStackDepth).toBe(depth - 1)
    })
})
