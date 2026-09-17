import { describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import RegisterFileRows from './RegisterFileRows.svelte'
import {
    makeRegister,
    type Register,
    type RegisterFileDescriptor,
    type RegisterFormat,
    type RegisterPoke,
    RegisterSize,
    resolveRegisterFileLayout
} from '$lib/languages/commonLanguageFeatures.svelte'

//the rows reach `$lib/utils`, which reaches the projects store, which opens its IndexedDB because
//this project resolves `browser` as true. jsdom has no IndexedDB and Dexie's rejection would fail
//the run, so the database is stubbed away: nothing a Register file row does goes near it
vi.mock('$lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

/**
 * Poking a register from its row ([the design record](../../../../../docs/design/pokes.md)): a
 * chunk that takes Pokes becomes an input holding what it shows, Enter commits the writes
 * `parseRegisterPoke` computed and Escape puts the row back. The parsing itself is tested without a
 * component in `registerFormats.test.ts`; what is tested here is the input around it.
 */

const descriptor: RegisterFileDescriptor = {
    id: 'cpu',
    label: 'CPU',
    size: RegisterSize.Long,
    formats: ['hex'],
    registers: [{ name: 'd0' }, { name: 'd1' }]
}

const file = { ...descriptor, layout: resolveRegisterFileLayout(descriptor), blanks: [] }

/** RISC-V's FPU file, whose singles are NaN-boxed: a register that is not boxed reads `NaN`. */
const floatDescriptor: RegisterFileDescriptor = {
    id: 'fpu',
    label: 'FPU',
    size: RegisterSize.Double,
    formats: ['double', 'single', 'hex'],
    nanBoxedSingles: true,
    registers: [{ name: 'ft0', kind: 'float' }]
}

const floatFile = {
    ...floatDescriptor,
    layout: resolveRegisterFileLayout(floatDescriptor),
    blanks: []
}

function render(
    options: {
        pokeable?: boolean
        pokeableRegisters?: string[]
        file?: typeof file | typeof floatFile
        registers?: Register[]
        format?: RegisterFormat
    } = {}
) {
    const pokes: { writes: RegisterPoke[] }[] = []
    const target = document.createElement('div')
    document.body.appendChild(target)
    const registers = options.registers ?? [
        makeRegister('d0', 0x11223344n, RegisterSize.Long),
        makeRegister('d1', 0n, RegisterSize.Long)
    ]
    const app = mount(RegisterFileRows, {
        target,
        props: {
            file: options.file ?? file,
            registers,
            format: options.format ?? ('hex' as const),
            groupSize: RegisterSize.Word,
            pokeable: options.pokeable ?? true,
            canPokeRegister: (register: string) =>
                (options.pokeableRegisters ?? ['d0', 'd1']).includes(register),
            onPoke: (writes: RegisterPoke[]) => pokes.push({ writes })
        }
    })
    flushSync()
    return {
        app,
        target,
        pokes,
        registers,
        chunks: () => [...target.querySelectorAll<HTMLElement>('.chunk-button')],
        input: () => target.querySelector<HTMLInputElement>('.chunk-input'),
        close: () => {
            unmount(app)
            target.remove()
        }
    }
}

function type(input: HTMLInputElement, text: string) {
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
}

function press(input: HTMLInputElement, key: string) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    flushSync()
}

describe('poking a register row', () => {
    it('opens an input holding what the chunk shows', () => {
        const panel = render()
        //two rows of two groups each, and every one of them takes a Poke
        expect(panel.chunks()).toHaveLength(4)
        panel.chunks()[1].click()
        flushSync()
        expect(panel.input()?.value).toBe('3344')
        panel.close()
    })

    it('commits the writes the helper computes, replacing only that group', () => {
        const panel = render()
        panel.chunks()[0].click()
        flushSync()
        const input = panel.input()!
        type(input, 'ffff')
        press(input, 'Enter')
        expect(panel.pokes).toEqual([{ writes: [{ register: 'd0', value: 0xffff3344n }] }])
        //the row goes back to its cells; the change highlight comes from the refresh, not from here
        expect(panel.input()).toBe(null)
        panel.close()
    })

    it('cancels on Escape, writing nothing', () => {
        const panel = render()
        panel.chunks()[0].click()
        flushSync()
        const input = panel.input()!
        type(input, 'ffff')
        press(input, 'Escape')
        expect(panel.pokes).toEqual([])
        expect(panel.input()).toBe(null)
        panel.close()
    })

    it('records nothing when the commit leaves the value as it was', () => {
        const panel = render()
        panel.chunks()[0].click()
        flushSync()
        press(panel.input()!, 'Enter')
        expect(panel.pokes).toEqual([])
        expect(panel.input()).toBe(null)
        panel.close()
    })

    it('keeps a refused commit open and says why, rather than truncating it', () => {
        const panel = render()
        panel.chunks()[0].click()
        flushSync()
        const input = panel.input()!
        type(input, '1ffff')
        press(input, 'Enter')
        expect(panel.pokes).toEqual([])
        const open = panel.input()!
        expect(open.value).toBe('1ffff')
        expect(open.classList.contains('refused')).toBe(true)
        expect(open.title).toContain('16 bits')
        panel.close()
    })

    it('commits by blurring the input, which is a click anywhere else on the page', () => {
        const panel = render()
        panel.chunks()[0].click()
        flushSync()
        const input = panel.input()!
        type(input, 'ffff')
        input.dispatchEvent(new FocusEvent('blur'))
        flushSync()
        expect(panel.pokes).toEqual([{ writes: [{ register: 'd0', value: 0xffff3344n }] }])
        panel.close()
    })

    it('records nothing for a value the register holds under another sign', () => {
        //MIPS and RISC-V report their CPU registers signed, so a register of all ones reads `-1n`
        //here while the row draws `ffff ffff` and sends that back unsigned: the two are the same
        //bits and the commit changes nothing
        const panel = render({
            registers: [makeRegister('d0', -1n, RegisterSize.Long)]
        })
        panel.chunks()[0].click()
        flushSync()
        const input = panel.input()!
        expect(input.value).toBe('ffff')
        type(input, '0xffff')
        press(input, 'Enter')
        expect(panel.pokes).toEqual([])
        panel.close()
    })

    it('leaves a lane that only reads NaN as it is when it is committed unchanged', () => {
        //a RISC-V register that is not NaN-boxed draws `NaN` under the Single Format whatever it
        //holds, so committing what the lane opened on has to leave those bits alone rather than
        //writing the canonical NaN back over them
        const panel = render({
            file: floatFile,
            format: 'single',
            pokeableRegisters: ['ft0'],
            registers: [makeRegister('ft0', 5n, RegisterSize.Double)]
        })
        panel.chunks()[0].click()
        flushSync()
        const input = panel.input()!
        expect(input.value).toBe('NaN')
        press(input, 'Enter')
        expect(panel.pokes).toEqual([])
        expect(panel.input()).toBe(null)
        //a lane that was actually typed into is still poked, NaN-boxed as the Core reads it
        panel.chunks()[0].click()
        flushSync()
        type(panel.input()!, '1.5')
        press(panel.input()!, 'Enter')
        expect(panel.pokes).toEqual([{ writes: [{ register: 'ft0', value: 0xffffffff3fc00000n }] }])
        panel.close()
    })

    it('draws no input at all for a row that takes no Pokes', () => {
        const panel = render({ pokeableRegisters: ['d0'] })
        //only `d0`'s two groups are buttons; `d1` is drawn exactly as a read-only row is
        expect(panel.chunks()).toHaveLength(2)
        const readOnly = render({ pokeable: false })
        expect(readOnly.chunks()).toHaveLength(0)
        expect(readOnly.input()).toBe(null)
        panel.close()
        readOnly.close()
    })
})
