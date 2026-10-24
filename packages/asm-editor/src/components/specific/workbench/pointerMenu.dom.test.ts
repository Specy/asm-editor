import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ContextMenuEntry } from '#cmp/shared/menu/ContextMenu.svelte'
import type { MemoryRegion } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import type { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'
import type { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
import {
    markedMemoryAddress,
    memoryCellMenu,
    moveMemoryView,
    registerValueMenu,
    showInMemory
} from './pointerMenu'

//the menus reach the projects store, which opens its IndexedDB because this project resolves
//`browser` as true; jsdom has none, and nothing here goes near it
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))
//whether the Entry is an Executable is the ELF analysis's to say; here it is the File's text
vi.mock('#lib/executables.ts', () => ({
    executableKind: (file: { content?: string } | undefined) =>
        file?.content === 'ELF' ? 'supported' : 'none'
}))

/**
 * The pointer menus ([the design record](../../../../../../docs/design/reverse-engineering-ux.md),
 * decision 20) over a session reduced to what they read: the memory view they move and mark, the
 * memory they read a pointer from, and the code regions that decide Show in Listing.
 */

const PAGE = 0x40
const CODE: MemoryRegion = {
    id: 'text',
    name: '.text',
    kind: 'code',
    section: '.text',
    start: 0x555555555000n,
    end: 0x555555556000n
}

function fixture(
    options: { executable?: boolean; language?: AvailableLanguages; memory?: Uint8Array } = {}
) {
    const memory = options.memory ?? new Uint8Array()
    const emulator = {
        systemSize: options.language === 'M68K' ? 4 : 8,
        memory: {
            global: { pageSize: PAGE, endianess: options.language === 'M68K' ? 'big' : 'little' }
        },
        buildSources: {
            entry: 'program',
            files: { program: { encoding: 'plain', content: options.executable ? 'ELF' : 'nop' } }
        } as object,
        memoryRegions: [CODE],
        setGlobalMemoryAddress: vi.fn(),
        //the bytes from 0x1000, as a Core reads them: refused past their end
        readMemoryBytes(address: bigint, length: number) {
            const start = Number(address - 0x1000n)
            if (start < 0 || start + length > memory.length) throw new Error('unmapped')
            return memory.slice(start, start + length)
        }
    }
    const session = {
        emulator,
        project: { language: options.language ?? 'X86' },
        revealAddress: vi.fn(async () => {})
    } as unknown as WorkbenchSession
    const ui = { memoryMark: null } as WorkbenchUi
    return { emulator, session, ui }
}

/** The menu's items by label, separators left out. */
function items(entries: ContextMenuEntry[]) {
    return entries.flatMap((entry) => ('label' in entry ? [entry] : []))
}

function item(entries: ContextMenuEntry[], label: string) {
    const found = items(entries).find((entry) => entry.label === label)
    if (!found) throw new Error(`no ${label} in ${items(entries).map((entry) => entry.label)}`)
    return found
}

const copied: string[] = []
Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => void copied.push(text) }
})

afterEach(() => {
    copied.length = 0
})

describe("a register value's menu", () => {
    it('offers Show in Listing only while the program is an Executable', () => {
        const assembled = fixture()
        expect(
            items(registerValueMenu(assembled.session, assembled.ui, CODE.start, 8)).map(
                (entry) => entry.label
            )
        ).toEqual(['Show in memory', 'Copy as hex', 'Copy as decimal'])
        const executable = fixture({ executable: true })
        expect(
            items(registerValueMenu(executable.session, executable.ui, CODE.start, 8)).map(
                (entry) => entry.label
            )
        ).toEqual(['Show in memory', 'Show in Listing', 'Copy as hex', 'Copy as decimal'])
    })

    it("shows an address of the Executable's code in its Listing, and nothing else", () => {
        const { session, ui } = fixture({ executable: true })
        const inCode = item(
            registerValueMenu(session, ui, CODE.start + 0x10n, 8),
            'Show in Listing'
        )
        expect(inCode.disabled).toBe(false)
        inCode.onSelect()
        //a jump the pane's navigation history keeps (reverse-engineering-ux.md, decision 8)
        expect(session.revealAddress).toHaveBeenCalledWith(CODE.start + 0x10n, { jump: true })
        //the stack, and the byte just past the code
        for (const address of [0x7ffffffde000n, CODE.end])
            expect(
                item(registerValueMenu(session, ui, address, 8), 'Show in Listing').disabled
            ).toBe(true)
    })

    it('copies the value in the Target hex at its width, and as an unsigned decimal', async () => {
        const x86 = fixture()
        const menu = registerValueMenu(x86.session, x86.ui, 0x555555555040n, 8)
        item(menu, 'Copy as hex').onSelect()
        item(menu, 'Copy as decimal').onSelect()
        const m68k = fixture({ language: 'M68K' })
        item(registerValueMenu(m68k.session, m68k.ui, 0xfffffff0n, 4), 'Copy as hex').onSelect()
        await Promise.resolve()
        expect(copied).toEqual(['0x0000555555555040', '93824992235584', '$FFFFFFF0'])
    })
})

describe('the memory view a menu moves', () => {
    it('shows the page holding the value and marks the value there, for this Build', () => {
        const { emulator, session, ui } = fixture()
        item(registerValueMenu(session, ui, 0x1234n, 8), 'Show in memory').onSelect()
        expect(emulator.setGlobalMemoryAddress).toHaveBeenCalledWith(0x1200n)
        expect(markedMemoryAddress(session, ui)).toBe(0x1234n)
        //the next Build's memory is another run's
        emulator.buildSources = { ...emulator.buildSources }
        expect(markedMemoryAddress(session, ui)).toBe(undefined)
    })

    it('forgets the mark when the view is moved by hand', () => {
        const { emulator, session, ui } = fixture()
        showInMemory(session, ui, 0x1234n)
        moveMemoryView(session, ui, 0x2000n)
        expect(emulator.setGlobalMemoryAddress).toHaveBeenLastCalledWith(0x2000n)
        expect(markedMemoryAddress(session, ui)).toBe(undefined)
    })
})

describe("a memory cell's menu", () => {
    //from 0x1000: a pointer to 0x401230, little-endian, then four bytes
    const memory = Uint8Array.from([0x30, 0x12, 0x40, 0, 0, 0, 0, 0, 1, 2, 3, 4])

    it('follows the little-endian address stored at the cell, as wide as a register', () => {
        const { emulator, session, ui } = fixture({ memory })
        const follow = item(
            memoryCellMenu(session, ui, { address: 0x1000n, value: 0x30n, bytes: 1 }),
            'Follow pointer'
        )
        expect(follow.disabled).toBe(false)
        follow.onSelect()
        expect(emulator.setGlobalMemoryAddress).toHaveBeenCalledWith(0x401200n)
        expect(markedMemoryAddress(session, ui)).toBe(0x401230n)
    })

    it('cannot follow a pointer whose bytes cannot all be read', () => {
        const { session, ui } = fixture({ memory })
        const menu = memoryCellMenu(session, ui, { address: 0x1008n, value: 1n, bytes: 1 })
        expect(item(menu, 'Follow pointer').disabled).toBe(true)
        //the value it reads as is still there to show and copy
        expect(item(menu, 'Show in memory').disabled).toBe(false)
    })

    it('treats the value it reads as like a register value, and has none when unreadable', () => {
        const { session, ui } = fixture({ memory, executable: true })
        const selection = memoryCellMenu(session, ui, {
            address: 0x1000n,
            value: CODE.start,
            bytes: 8
        })
        expect(items(selection).map((entry) => entry.label)).toEqual([
            'Follow pointer',
            'Show in memory',
            'Show in Listing',
            'Copy as hex',
            'Copy as decimal'
        ])
        expect(item(selection, 'Show in Listing').disabled).toBe(false)
        const unreadable = memoryCellMenu(session, ui, {
            address: 0x2000n,
            value: undefined,
            bytes: 1
        })
        expect(items(unreadable).every((entry) => entry.disabled)).toBe(true)
    })
})
