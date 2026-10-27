/**
 * The debug column collapsing to a strip
 * ([the design record](../../../../../../docs/design/reverse-engineering-ux.md), decision 19): the
 * button at the end of memory's controls collapses it, the strip opens it again, each hands the
 * focus to the other, the choice is the layout's, the column is only hidden meanwhile, and the
 * strip names everything collapsing hid.
 */
import { afterEach, beforeAll, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import { makeRegister, RegisterSize } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'
import type { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
import { workbenchLayout } from '#stores/workbenchLayoutStore.svelte.ts'
import WorkbenchPartHarness from './__fixtures__/WorkbenchPartHarness.svelte'

//the column reaches the projects store, which opens its IndexedDB because this project resolves
//`browser` as true; jsdom has none, and nothing here goes near it
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))

//svelte/motion, which the side panel beside it in the harness loads, reads the reduced motion
//query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})

//jsdom has no popovers, and no ResizeObserver, which the column measures itself with
beforeAll(() => {
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver
})

//the debug column's sections, folded so that a test builds none of what they hold
const SECTIONS = ['debug:screen', 'debug:memory-stack', 'debug:history', 'debug:callstack']

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    workbenchLayout.setDebugCollapsed(false)
    SECTIONS.forEach((id) => workbenchLayout.setCollapsed(id, id === 'debug:screen'))
    document.body.replaceChildren()
})

/**
 * A session reduced to what registers and memory draw, x86's by default: x86 has no Screen to
 * draw too, and its Debug tools float in windows of their own.
 */
function column({ language = 'X86', floating = true } = {}) {
    const registers = [
        makeRegister('rax', 0x401000n, RegisterSize.Double),
        makeRegister('rsp', 0x7ffffffde000n, RegisterSize.Double)
    ]
    const page = new Uint8Array(64)
    const emulator = {
        systemSize: RegisterSize.Double,
        statusRegisters: [],
        registerFiles: [
            {
                id: 'cpu',
                label: 'CPU',
                size: RegisterSize.Double,
                formats: ['hex'],
                layout: [],
                registers,
                flags: [],
                blanks: []
            }
        ],
        canPokeRegister: () => true,
        memory: {
            global: {
                address: 0x1000n,
                pageSize: 64,
                rowSize: 8,
                endianess: 'little',
                data: { current: page, prevState: page, unreadable: null }
            },
            tabs: [{ id: 'stack', name: 'Stack' }]
        },
        memoryRegions: [],
        dataLabels: [],
        readOnlyMemory: [],
        callStack: [],
        sp: 0n,
        buildSources: undefined,
        setGlobalMemoryAddress: vi.fn(),
        resolveMemoryLabel: () => undefined
    }
    const session = {
        emulator,
        project: { language },
        pc: makeRegister('PC', 0x401000n, RegisterSize.Double),
        pokeable: false
    } as unknown as WorkbenchSession
    const ui = { floatingDebugTools: floating, memoryMark: null } as unknown as WorkbenchUi
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(WorkbenchPartHarness, {
        target,
        props: { session, ui, part: 'debug-column' }
    })
    flushSync()
    disposers.push(() => unmount(app))
    return {
        aside: () => target.querySelector<HTMLElement>('aside[aria-label="Debugger"]')!,
        collapse: () => target.querySelector<HTMLButtonElement>('button[aria-label="Collapse"]')!,
        strip: () => target.querySelector<HTMLButtonElement>('button.strip-button')
    }
}

it('collapses to a strip from its button and opens again from the strip', async () => {
    const debug = column()
    const aside = debug.aside()
    expect(debug.strip()).toBe(null)
    expect(debug.collapse().getAttribute('aria-expanded')).toBe('true')
    expect(debug.collapse().getAttribute('aria-controls')).toBe(aside.id)

    debug.collapse().click()
    flushSync()
    await tick()
    expect(workbenchLayout.values.debugCollapsed).toBe(true)
    expect(aside.classList.contains('collapsed')).toBe(true)
    const strip = debug.strip()!
    //x86 has no Screen, and its Debug tools are windows that collapsing leaves where they are
    expect(strip.textContent!.trim()).toBe('Registers · Memory')
    expect(strip.getAttribute('aria-expanded')).toBe('false')
    expect(strip.getAttribute('aria-controls')).toBe(aside.id)
    expect(document.activeElement).toBe(strip)

    strip.click()
    flushSync()
    await tick()
    expect(workbenchLayout.values.debugCollapsed).toBe(false)
    expect(debug.strip()).toBe(null)
    //only hidden meanwhile: the same column, registers and memory included, comes back
    expect(debug.aside()).toBe(aside)
    expect(aside.classList.contains('collapsed')).toBe(false)
    expect(document.activeElement).toBe(debug.collapse())
})

it('opens collapsed when the layout was left collapsed', () => {
    workbenchLayout.setDebugCollapsed(true)
    const debug = column()
    expect(debug.strip()).not.toBe(null)
    expect(debug.aside().classList.contains('collapsed')).toBe(true)
})

it('names the Screen and the Debug tools on the strip where it hides them too', async () => {
    SECTIONS.forEach((id) => workbenchLayout.setCollapsed(id, true))
    workbenchLayout.setDebugCollapsed(true)
    const debug = column({ language: 'M68K', floating: false })
    expect(debug.strip()!.textContent!.trim()).toBe(
        'Registers · Memory · Screen · Stack pointer · History · Call stack'
    )
})
