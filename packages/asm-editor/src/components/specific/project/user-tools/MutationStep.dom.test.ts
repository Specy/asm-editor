import { describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import MutationStep from './MutationStep.svelte'
import MutationsRenderer from './MutationsRenderer.svelte'
import { historyRowProps } from './MutationStep.fixture.svelte'
import { tooltipText } from '#cmp/shared/floating/__fixtures__/tooltipText.ts'
import {
    type ExecutionStep,
    type MutationOperation,
    type PokeWrite,
    RegisterSize
} from '#lib/languages/commonLanguageFeatures.svelte.ts'

//the row reaches `#lib/utils.ts`, which reaches the projects store, which opens its IndexedDB because
//this project resolves `browser` as true; jsdom has no IndexedDB, so the database is stubbed away
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))

/**
 * A Poke's History row ([the design record](../../../../../../../docs/design/pokes.md)): what was poked
 * and the value it held before, with no PC line and nothing to jump to, since no instruction ran.
 */

function render(writes: PokeWrite[]) {
    const step: ExecutionStep = {
        kind: 'poke',
        mutations: [],
        pc: -1,
        line: -1,
        old_ccr: { bits: 0 },
        new_ccr: { bits: 0 },
        writes
    }
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(MutationStep, {
        target,
        props: { step, flags: ['X', 'N', 'Z', 'V', 'C'], language: 'Z80' as const }
    })
    flushSync()
    return {
        /** The sentence of the first write, with its whitespace collapsed the way the browser draws it. */
        sentence: () =>
            target
                .querySelector<HTMLElement>('.poke-write')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim(),
        values: () =>
            [...target.querySelectorAll<HTMLElement>('.poke-value')].map((span) =>
                span.textContent?.trim()
            ),
        text: () => target.textContent ?? '',
        close: () => {
            void unmount(app)
            target.remove()
        }
    }
}

/**
 * An instruction's History row: one line per write, opening on a click to the values its Core
 * reports and closing on another, with a register named the way the panel beside it draws it.
 */
function renderInstruction(mutations: MutationOperation[], pc = 0x1000) {
    const step: ExecutionStep = {
        kind: 'instruction',
        mutations,
        pc,
        line: 3,
        old_ccr: { bits: 0 },
        new_ccr: { bits: 0 },
        writes: []
    }
    const target = document.createElement('div')
    document.body.appendChild(target)
    const props = historyRowProps(step)
    const app = mount(MutationStep, { target, props })
    flushSync()
    const rows = () => [...target.querySelectorAll<HTMLElement>('.mutation, .mutation-plain')]
    return {
        rows: () => rows().map((row) => row.textContent?.replace(/\s+/g, ' ').trim()),
        expandable: () => rows().map((row) => row.classList.contains('mutation')),
        text: () => target.textContent ?? '',
        cycles: () => target.querySelector<HTMLElement>('.cycles'),
        expanded: () => rows().map((row) => row.classList.contains('expanded')),
        click: (index: number) => {
            rows()[index].click()
            flushSync()
        },
        show: (next: ExecutionStep) => {
            props.step = next
            flushSync()
        },
        close: () => {
            void unmount(app)
            target.remove()
        }
    }
}

describe('a Poke in the History panel', () => {
    it('reads as one sentence, naming the register the way the panel beside it draws the row', () => {
        //every Register file row is drawn upper-cased, so a Z80 `hl` reads as HL here too, and the
        //value the Poke found follows in parentheses so nothing needs a legend
        const row = render([{ type: 'register', name: 'hl', old: 0x11223344n, new: 5n }])
        expect(row.sentence()).toBe('Wrote 0x00000005 to HL (was 0x11223344)')
        //the two values line up: neither is truncated and the shorter one is padded to the other
        expect(row.values()).toEqual(['0x00000005', '0x11223344'])
        //no instruction ran, so there is no PC line to go to
        expect(row.text()).not.toContain('PC')
        row.close()
    })

    it('names a memory Poke by its address, each byte in its two digits', () => {
        const row = render([
            { type: 'memory', address: 0x2000n, old: [0xff, 0x01], new: [0xde, 0xad] }
        ])
        expect(row.sentence()).toBe('Wrote DE AD to $2000 (was FF 01)')
        expect(row.values()).toEqual(['DE AD', 'FF 01'])
        row.close()
    })
})

describe('an instruction in the History panel', () => {
    it('names each write by its width and target, upper-cased as the panel draws it', () => {
        const row = renderInstruction([
            { type: 'WriteRegister', value: { register: 'd1', old: 0n, size: RegisterSize.Word } },
            {
                type: 'WriteMemory',
                value: { address: 0x2000n, old: 0xffffn, size: RegisterSize.Word }
            }
        ])
        expect(row.rows()).toEqual(['Wrote Word to D1', 'Wrote Word to $2000'])
        expect(row.expanded()).toEqual([false, false])
        //the address behind the 0x is hexadecimal, as the prefix promises
        expect(row.text().replace(/\s+/g, '')).toContain('0x1000')
        row.close()
    })

    it('opens a write on a click to what the Core reports, and closes it on another', () => {
        const row = renderInstruction([
            { type: 'WriteRegister', value: { register: 'd1', old: 0n, size: RegisterSize.Word } }
        ])
        row.click(0)
        //what the Core keeps of a write is what it replaced, in the digits of the write's width
        expect(row.rows()).toEqual(['Wrote Word to D1 (was 0x0000)'])
        expect(row.expanded()).toEqual([true])
        row.click(0)
        expect(row.rows()).toEqual(['Wrote Word to D1'])
        expect(row.expanded()).toEqual([false])
        row.close()
    })

    it('shows the value written too when the Core reports it', () => {
        const row = renderInstruction([
            {
                type: 'WriteRegister',
                value: { register: 'hl', old: 0x1234n, new: 0x2000n, size: RegisterSize.Word }
            },
            {
                type: 'WriteMemoryBytes',
                value: { address: 0x3000n, old: [0xff, 0x01], new: [0xde, 0xad] }
            }
        ])
        row.click(0)
        row.click(1)
        expect(row.rows()).toEqual([
            'Wrote Word 0x2000 to HL (was 0x1234)',
            'Wrote 2 bytes DE AD to $3000 (was FF 01)'
        ])
        row.close()
    })

    it('leaves a write neither side of which the Core can show as plain text', () => {
        //a Core may hand over neither side of a write it could not account for, which the x86
        //wrapper does for a store whose bytes the machine did not capture
        const row = renderInstruction([
            { type: 'WriteRegister', value: { register: 'ft0', size: RegisterSize.Double } },
            { type: 'PushCallStack', value: { from: 0x1000n, to: 0x2000n } }
        ])
        expect(row.expandable()).toEqual([false, false])
        expect(row.rows()).toEqual(['Wrote Double to FT0', 'Pushed call from 1000 to 2000'])
        row.close()
    })

    it('closes what was open when another step lands at its index', () => {
        const row = renderInstruction([
            { type: 'WriteRegister', value: { register: 'd1', old: 0n, size: RegisterSize.Word } }
        ])
        row.click(0)
        expect(row.expanded()).toEqual([true])
        //a refresh that rebuilds the same step leaves it open
        row.show({
            kind: 'instruction',
            mutations: [
                {
                    type: 'WriteRegister',
                    value: { register: 'd1', old: 0n, size: RegisterSize.Word }
                }
            ],
            pc: 0x1000,
            line: 3,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            writes: []
        })
        expect(row.expanded()).toEqual([true])
        //the next instruction stepping in under it does not inherit the open row
        row.show({
            kind: 'instruction',
            mutations: [
                {
                    type: 'WriteRegister',
                    value: { register: 'd2', old: 7n, size: RegisterSize.Long }
                }
            ],
            pc: 0x1004,
            line: 4,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            writes: []
        })
        expect(row.rows()).toEqual(['Wrote Long to D2'])
        expect(row.expanded()).toEqual([false])
        row.close()
    })
})

/**
 * An exception in its row ([m68k-machine.md](../../../../../../../docs/design/m68k-machine.md),
 * decision 28): what the instruction raised, the vector and the handler it went to, ahead of the
 * frame the processor pushed, and the return from it as an `rte` row says it.
 */
describe('an exception in the History panel', () => {
    it('names the exception, its vector and the handler, by label and address', () => {
        const row = renderInstruction([
            {
                type: 'TakeException',
                value: {
                    vector: 5,
                    name: 'Divide by zero',
                    from: 0x1008n,
                    handler: 0x1040n,
                    label: 'div_handler'
                }
            },
            {
                type: 'WriteMemory',
                value: { address: 0xfffffan, old: 0xffffn, new: 0x2000n, size: RegisterSize.Word }
            }
        ])
        expect(row.rows()).toEqual([
            'Divide by zero → vector 5, div_handler at $1040',
            'Wrote Word to $FFFFFA'
        ])
        //the exception stands out from the frame, and is no write to open
        expect(row.expandable()).toEqual([false, true])
        row.close()
    })

    it('names the handler by its address alone where no label is, and the return from it', () => {
        const row = renderInstruction([
            {
                type: 'TakeException',
                value: { vector: 35, name: 'TRAP #3', from: 0x100an, handler: 0x2000n }
            },
            { type: 'ReturnFromException', value: { from: 0x2002n, to: 0x100cn } }
        ])
        expect(row.rows()).toEqual([
            'TRAP #3 → vector 35, the handler at $2000',
            'Returned from exception to $100C'
        ])
        row.close()
    })
})

/**
 * An IRQ in its row of its own (M68K, [m68k-machine.md](../../../../../../../docs/design/m68k-machine.md),
 * decision 28): no instruction ran, so it reads as the request taken and the handler it went to,
 * with what taking it wrote underneath.
 */
describe('an IRQ in the History panel', () => {
    function irqRow(mutations: MutationOperation[], title?: string) {
        const row = renderInstruction([])
        row.show({
            kind: 'irq',
            mutations,
            pc: 0x102a,
            line: -1,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            ...(title === undefined ? {} : { title })
        })
        return row
    }

    it('heads its row with the request and the handler, and lists what taking it wrote', () => {
        const row = irqRow([
            {
                type: 'TakeException',
                value: {
                    vector: 26,
                    name: 'IRQ 2',
                    from: 0x102an,
                    handler: 0x102cn,
                    label: 'timer'
                }
            },
            {
                type: 'WriteMemory',
                value: { address: 0xfffffan, old: 0xffffn, new: 0x2000n, size: RegisterSize.Word }
            },
            { type: 'Other', value: 'Woke from stop' }
        ])
        expect(row.text().replace(/\s+/g, ' ')).toContain('IRQ 2 → timer at $102C')
        //no instruction ran: no PC line to go to, and the heading is not repeated below it
        expect(row.text()).not.toContain('PC')
        expect(row.rows()).toEqual(['Wrote Word to $FFFFFA', 'Woke from stop'])
        row.close()
    })

    it('says why an IRQ that pushed nothing ended the program', () => {
        const row = irqRow([], 'IRQ 3: vector 27 at $00006C holds no handler')
        expect(row.text().replace(/\s+/g, ' ').trim()).toBe(
            'IRQ 3: vector 27 at $00006C holds no handler'
        )
        expect(row.rows()).toEqual([])
        row.close()
    })
})

describe('what an instruction ran where the source does not say', () => {
    it('shows the disassembly of a step on no line, and nothing of the kind on a source line', () => {
        const row = renderInstruction([])
        expect(row.text()).not.toContain('Ran')
        row.show({
            kind: 'instruction',
            mutations: [],
            pc: 0x1002,
            line: -1,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            disassembly: 'ILLEGAL'
        })
        expect(row.text().replace(/\s+/g, ' ')).toContain('Ran ILLEGAL')
        row.close()
    })
})

describe('the flags of an instruction row', () => {
    it("light the Target's own flags, reading x86's EFLAGS rather than a 68000 CCR", () => {
        const step: ExecutionStep = {
            kind: 'instruction',
            mutations: [],
            pc: 0x401000,
            line: 3,
            old_ccr: { bits: 0 },
            //CF, PF and ZF
            new_ccr: { bits: 0x45 },
            writes: []
        }
        const target = document.createElement('div')
        document.body.appendChild(target)
        const app = mount(MutationStep, {
            target,
            props: {
                step,
                flags: ['CF', 'PF', 'AF', 'ZF', 'SF', 'TF', 'DF', 'OF'],
                language: 'X86' as const
            }
        })
        flushSync()
        const lit = [...target.querySelectorAll<HTMLElement>('.flag.flag-active')].map((flag) =>
            flag.textContent?.trim()
        )
        expect(lit).toEqual(['CF', 'PF', 'ZF'])
        void unmount(app)
        target.remove()
    })
})

describe('irreversible History rows', () => {
    it('retains the row and explains why its grouped call cannot be undone', async () => {
        const target = document.createElement('div')
        document.body.appendChild(target)
        const step: ExecutionStep = {
            kind: 'instruction',
            undoable: false,
            mutations: [],
            pc: 4096,
            line: 3,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            stretch: { library: 'read', instructions: 8 }
        }
        const app = mount(MutationStep, { target, props: { step, flags: [], language: 'X86' } })
        flushSync()
        try {
            expect(target.textContent).toContain('Called read: 8 instructions')
            expect(target.textContent).toContain('Undo stops here: effects are not recorded.')
        } finally {
            await unmount(app)
            target.remove()
        }
    })
})

describe('Undo to here', () => {
    it('undoes the rows above, so it is off on the newest row and below one Undo cannot take back', async () => {
        const row = (pc: number, undoable?: boolean): ExecutionStep => ({
            kind: 'instruction',
            ...(undoable === undefined ? {} : { undoable }),
            mutations: [],
            pc,
            line: pc,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 }
        })
        const target = document.createElement('div')
        document.body.appendChild(target)
        const undos: number[] = []
        const app = mount(MutationsRenderer, {
            target,
            props: {
                //newest first: the library call at row 1 recorded nothing Undo can restore
                steps: [row(3), row(2, false), row(1), row(0)],
                statusRegisterNames: [],
                language: 'X86' as const,
                onUndo: (index: number) => undos.push(index)
            }
        })
        flushSync()
        try {
            const buttons = [...target.querySelectorAll<HTMLButtonElement>('.undo-to-here')]
            expect(buttons.map((button) => button.disabled)).toEqual([true, false, true, true])
            expect(tooltipText(buttons[0])).toBe('The program is already here')
            expect(tooltipText(buttons[2])).toBe('Undo stops before effects that are not recorded')
            //one Undo, of the newest row, which leaves the call's own effects alone
            buttons[1].click()
            expect(undos).toEqual([1])
        } finally {
            await unmount(app)
            target.remove()
        }
    })
})

describe('Go to line', () => {
    it('hands the host the row it was pressed on', async () => {
        const row = (pc: number): ExecutionStep => ({
            kind: 'instruction',
            mutations: [],
            pc,
            line: pc,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 }
        })
        const target = document.createElement('div')
        document.body.appendChild(target)
        const shown: number[] = []
        const app = mount(MutationsRenderer, {
            target,
            props: {
                steps: [row(2), row(1)],
                statusRegisterNames: [],
                language: 'X86' as const,
                onHighlight: (step: ExecutionStep) => shown.push(step.pc)
            }
        })
        flushSync()
        try {
            target.querySelectorAll<HTMLButtonElement>('.go-to-line')[1].click()
            expect(shown).toEqual([1])
        } finally {
            await unmount(app)
            target.remove()
        }
    })
})

describe('library calls in the History', () => {
    it('names a C++ function short, its signature and raw name first in the tooltip', async () => {
        const target = document.createElement('div')
        document.body.appendChild(target)
        const step: ExecutionStep = {
            kind: 'instruction',
            mutations: [],
            pc: 4096,
            line: 3,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            stretch: {
                library: 'std::ostream::operator<< in libstdc++.so.6',
                detail: 'std::ostream::operator<<(int)\n_ZNSolsEi',
                instructions: 40
            }
        }
        const app = mount(MutationStep, { target, props: { step, flags: [], language: 'X86' } })
        flushSync()
        try {
            const stretch = target.querySelector<HTMLElement>('.stretch')!
            expect(stretch.textContent).toContain(
                'Called std::ostream::operator<< in libstdc++.so.6: 40 instructions'
            )
            expect(stretch.title).toBe(
                'std::ostream::operator<<(int)\n_ZNSolsEi\nOne Undo takes back the call and the library code it ran'
            )
        } finally {
            await unmount(app)
            target.remove()
        }
    })
})

/**
 * The cycles a step took, in its row, on a Target that counts them (M68K,
 * [m68k-machine.md](../../../../../../../docs/design/m68k-machine.md), decision 30).
 */
describe('the cycles of a step in the History panel', () => {
    const cyclesOf = (text: string) => text.replace(/\s+/g, ' ').match(/Cycles (\S+)/)?.[1]

    it('says what an instruction took, and nothing for a step that carries no count', () => {
        const row = renderInstruction([])
        expect(row.text()).not.toContain('Cycles')
        row.show({
            kind: 'instruction',
            mutations: [],
            pc: 0x1000,
            line: 3,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            cycles: 1234
        })
        expect(cyclesOf(row.text())).toBe('1,234')
        row.close()
    })

    it('says what taking an IRQ took, under its heading', () => {
        const row = renderInstruction([])
        row.show({
            kind: 'irq',
            mutations: [
                {
                    type: 'TakeException',
                    value: { vector: 26, name: 'IRQ 2', from: 0x102an, handler: 0x102cn }
                }
            ],
            pc: 0x102a,
            line: -1,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            cycles: 44
        })
        expect(row.text().replace(/\s+/g, ' ')).toContain('IRQ 2 → the handler at $102C')
        expect(cyclesOf(row.text())).toBe('44')
        row.close()
    })

    //a 68020 program's, which are the manual's cache case
    it('marks an estimate, and says on hover why it is one', () => {
        const row = renderInstruction([])
        row.show({
            kind: 'instruction',
            mutations: [],
            pc: 0x1000,
            line: 3,
            old_ccr: { bits: 0 },
            new_ccr: { bits: 0 },
            cycles: 8,
            cyclesEstimate: true
        })
        expect(row.text().replace(/\s+/g, ' ')).toContain('Cycles ≈ 8')
        expect(tooltipText(row.cycles())).toMatch(
            /^An estimate\. 68020 timings depend on overlapping instruction execution/
        )
        row.close()
    })

    //a 68000 program's whose `opt bit` gave it a bit field, which takes the 68020's time
    it('says a bit field under opt bit is why a 68000 program’s count is an estimate', () => {
        const target = document.createElement('div')
        document.body.appendChild(target)
        const app = mount(MutationsRenderer, {
            target,
            props: {
                language: 'M68K',
                processor: '68000 with bit fields',
                statusRegisterNames: [],
                steps: [
                    {
                        kind: 'instruction',
                        mutations: [],
                        pc: 0x1000,
                        line: 3,
                        old_ccr: { bits: 0 },
                        new_ccr: { bits: 0 },
                        cycles: 8,
                        cyclesEstimate: true
                    }
                ]
            }
        })
        flushSync()
        expect(tooltipText(target.querySelector('.cycles'))).toMatch(
            /^An estimate\. Bit-field instructions enabled by opt bit/
        )
        void unmount(app)
        target.remove()
    })
})
