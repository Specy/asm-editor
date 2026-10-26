import { beforeAll, describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import RegisterFileRows from './RegisterFileRows.svelte'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import type { ContextMenuEntry } from '#cmp/shared/menu/ContextMenu.svelte'
import {
    makeRegister,
    type Register,
    type RegisterFileDescriptor,
    type RegisterFormat,
    type RegisterPoke,
    RegisterSize,
    resolveRegisterFileLayout
} from '#lib/languages/commonLanguageFeatures.svelte.ts'

//the rows reach `#lib/utils.ts`, which reaches the projects store, which opens its IndexedDB because
//this project resolves `browser` as true. jsdom has no IndexedDB and Dexie's rejection would fail
//the run, so the database is stubbed away: nothing a Register file row does goes near it
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))

//jsdom has no popovers, which the pointer menu opens as
beforeAll(() => {
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
})

/**
 * Poking a register from its row ([the design record](../../../../../../../docs/design/pokes.md)): a
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
        /** A pointer menu, whose calls are recorded with what they were given. */
        withMenu?: boolean
    } = {}
) {
    const pokes: { writes: RegisterPoke[] }[] = []
    const menus: { value: bigint; bytes: number }[] = []
    const picked: string[] = []
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
            onPoke: (writes: RegisterPoke[]) => pokes.push({ writes }),
            valueMenu: options.withMenu
                ? (value: bigint, bytes: number): ContextMenuEntry[] => {
                      menus.push({ value, bytes })
                      return [
                          { label: 'Show in memory', onSelect: () => picked.push('memory') },
                          { label: 'Copy as hex', onSelect: () => picked.push('hex') }
                      ]
                  }
                : undefined
        }
    })
    flushSync()
    return {
        app,
        target,
        pokes,
        menus,
        picked,
        registers,
        chunks: () => [...target.querySelectorAll<HTMLElement>('.chunk-button')],
        input: () => target.querySelector<HTMLInputElement>('.chunk-input'),
        values: () => [...target.querySelectorAll<HTMLElement>('.register-hex')],
        menu: () => document.querySelector<HTMLElement>('[role="menu"]'),
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

/**
 * A right click on an element, which reports whether something took it from the browser. A menu it
 * opens focuses its first item a tick later, which a test waits for before closing it.
 */
function rightClick(element: Element): boolean {
    const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 40,
        clientY: 50
    })
    element.dispatchEvent(event)
    flushSync()
    return event.defaultPrevented
}

describe("a register name's hover", () => {
    it('reads a negative value in hexadecimal at the register width under the decimal preference', () => {
        const decimal = preferencesStore.values.useDecimalAsDefault
        const previous = decimal.value
        decimal.value = true
        onTestFinished(() => {
            decimal.value = previous
        })
        //MIPS and RISC-V report their CPU registers signed
        const panel = render({
            registers: [
                makeRegister('d0', -1n, RegisterSize.Long),
                makeRegister('d1', 0x1234n, RegisterSize.Long)
            ]
        })
        const hovers = [...panel.target.querySelectorAll('.hover-register-value')]
        expect(hovers.map((hover) => hover.textContent?.trim())).toEqual(['ffffffff', '00001234'])
        panel.close()
    })
})

describe("a register value's pointer menu", () => {
    it('opens on a right click with the value unsigned at the register width', async () => {
        //MIPS and RISC-V report their CPU registers signed: an address above the middle of memory
        //reads negative, and is still the address it names
        const panel = render({
            withMenu: true,
            registers: [
                makeRegister('d0', -0x10n, RegisterSize.Long),
                makeRegister('d1', 0x1000n, RegisterSize.Long)
            ]
        })
        expect(rightClick(panel.values()[0].querySelector('.chunk-button')!)).toBe(true)
        await tick()
        expect(panel.menus).toEqual([{ value: 0xfffffff0n, bytes: 4 }])
        const items = [...panel.menu()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        expect(items.map((item) => item.textContent?.trim())).toEqual([
            'Show in memory',
            'Copy as hex'
        ])
        items[1].click()
        flushSync()
        expect(panel.picked).toEqual(['hex'])
        expect(panel.menu()).toBe(null)
        //nothing was poked, and no input opened
        expect(panel.input()).toBe(null)
        expect(panel.pokes).toEqual([])
        panel.close()
    })

    it('leaves a click on the value poking it, as before', () => {
        const panel = render({ withMenu: true })
        panel.chunks()[1].click()
        flushSync()
        expect(panel.input()?.value).toBe('3344')
        expect(panel.menus).toEqual([])
        //the input being typed into keeps the browser's own menu, for pasting into it
        expect(rightClick(panel.input()!)).toBe(false)
        expect(panel.menu()).toBe(null)
        panel.close()
    })

    it('opens on a value that takes no Pokes, and never on a floating-point one', async () => {
        const readOnly = render({ withMenu: true, pokeable: false })
        expect(rightClick(readOnly.values()[1])).toBe(true)
        await tick()
        expect(readOnly.menus).toEqual([{ value: 0n, bytes: 4 }])
        readOnly.close()
        document.body.replaceChildren()
        const float = render({
            withMenu: true,
            file: floatFile,
            format: 'single',
            pokeableRegisters: ['ft0'],
            registers: [makeRegister('ft0', 5n, RegisterSize.Double)]
        })
        expect(rightClick(float.values()[0])).toBe(false)
        expect(float.menus).toEqual([])
        float.close()
    })

    it("is the browser's menu when the panel has none", () => {
        const panel = render()
        expect(rightClick(panel.values()[0])).toBe(false)
        expect(panel.menu()).toBe(null)
        panel.close()
    })
})
