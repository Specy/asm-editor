import { beforeAll, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import RegisterFileRows from './RegisterFileRows.svelte'
import {
    makeRegister,
    type RegisterFileDescriptor,
    RegisterSize,
    resolveRegisterFileLayout
} from '#lib/languages/commonLanguageFeatures.svelte.ts'

//the rows reach the projects store, which opens its IndexedDB because this project resolves
//`browser` as true; jsdom has none, and nothing here goes near it
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))

//jsdom has no popovers, which the pointer menu opens as
beforeAll(() => {
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
})

/**
 * What a Run, a Build or a Step does to the rows when it takes the Core and gives it back: the
 * values stay the same elements, their Poke buttons only enabled and disabled, and their hover
 * cards are built when the pointer first asks for one.
 */

const descriptor: RegisterFileDescriptor = {
    id: 'cpu',
    label: 'CPU',
    size: RegisterSize.Long,
    formats: ['hex'],
    registers: [{ name: 'd0' }, { name: 'd1' }, { name: 'pc' }]
}
const file = { ...descriptor, layout: resolveRegisterFileLayout(descriptor), blanks: [] }

function render() {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const props = $state({
        file,
        registers: [
            makeRegister('d0', 0x11223344n, RegisterSize.Long),
            makeRegister('d1', 0n, RegisterSize.Long),
            makeRegister('pc', 0x1000n, RegisterSize.Long)
        ],
        format: 'hex' as const,
        groupSize: RegisterSize.Word,
        pokeable: true,
        //the Emulator's answers: `pc` never takes a Poke, the others whenever one is possible
        canPokeRegister: (register: string) => props.pokeable && register !== 'pc',
        takesPokes: (register: string) => register !== 'pc',
        onPoke: () => {}
    })
    const app = mount(RegisterFileRows, { target, props })
    flushSync()
    return {
        props,
        target,
        chunks: () => [...target.querySelectorAll<HTMLElement>('.chunk-button')],
        close: () => {
            void unmount(app)
            target.remove()
        }
    }
}

it('keeps the values while the Core is taken and given back, only enabling their buttons', () => {
    const panel = render()
    try {
        const before = panel.chunks()
        //d0 and d1, two groups each; the PC's row is the read-only cell it always was
        expect(before).toHaveLength(4)
        expect(before.every((chunk) => !chunk.hasAttribute('aria-disabled'))).toBe(true)
        panel.props.pokeable = false
        flushSync()
        expect(panel.chunks()).toEqual(before)
        expect(before.every((chunk) => chunk.getAttribute('aria-disabled') === 'true')).toBe(true)
        panel.props.pokeable = true
        flushSync()
        expect(panel.chunks()).toEqual(before)
        expect(before.every((chunk) => !chunk.hasAttribute('aria-disabled'))).toBe(true)
        expect(before.map((chunk) => chunk.title)).toEqual([
            'Poke d0',
            'Poke d0',
            'Poke d1',
            'Poke d1'
        ])
    } finally {
        panel.close()
    }
})

it("builds a value's hover card on its first hover, with the readings it shows", () => {
    const panel = render()
    try {
        const content = () => [...panel.target.querySelectorAll('.hover-content')]
        //every value has the card's empty shell
        expect(content().length).toBeGreaterThan(0)
        expect(content().every((card) => card.childElementCount === 0)).toBe(true)
        const value = panel.target.querySelector('.tooltip-base')!
        value.parentElement!.dispatchEvent(new Event('pointerenter'))
        flushSync()
        //d0's top group, 0x1122, hovers its decimal
        expect(content()[0].textContent?.trim()).toBe('4386')
        expect(
            content()
                .slice(1)
                .every((card) => card.childElementCount === 0)
        ).toBe(true)
    } finally {
        panel.close()
    }
})
