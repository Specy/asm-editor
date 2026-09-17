import { describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import MutationStep from './MutationStep.svelte'
import { historyRowProps } from './MutationStep.fixture.svelte'
import {
    type ExecutionStep,
    type MutationOperation,
    type PokeWrite,
    RegisterSize
} from '$lib/languages/commonLanguageFeatures.svelte'

//the row reaches `$lib/utils`, which reaches the projects store, which opens its IndexedDB because
//this project resolves `browser` as true; jsdom has no IndexedDB, so the database is stubbed away
vi.mock('$lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

//the row reads a 68000 CCR through `@specy/s68k`, whose wasm jsdom cannot fetch; a Poke row draws
//no flags at all, so the one function it calls is enough of the Core here
vi.mock('@specy/s68k', () => ({ ccrToFlagsArray: () => [0, 0, 0, 0, 0] }))

/**
 * A Poke's History row ([the design record](../../../../../docs/design/pokes.md)): what was poked
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
            unmount(app)
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
            unmount(app)
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
