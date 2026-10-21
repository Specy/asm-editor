import type { ContextMenuEntry } from '#cmp/shared/menu/ContextMenu.svelte'
import { byteSliceToNum, type MemoryCell } from '#cmp/specific/project/memory/memoryTabUtils.ts'
import { MEMORY_SIZE } from '#lib/Config.ts'
import { executableKind } from '#lib/executables.ts'
import { regionsAt } from '#lib/languages/memoryRegions.ts'
import { formatHex, hexPrefix } from '#lib/testcases.ts'
import { clampBigInt } from '#lib/utils.ts'
import type { WorkbenchSession } from '#lib/workbench/WorkbenchSession.svelte.ts'
import type { WorkbenchUi } from '#lib/workbench/WorkbenchUi.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import FaCopy from '~icons/fa-solid/copy'
import FaHashtag from '~icons/fa-solid/hashtag'
import FaListOl from '~icons/fa-solid/list-ol'
import FaLongArrowAltRight from '~icons/fa-solid/long-arrow-alt-right'
import FaMemory from '~icons/fa-solid/memory'

/**
 * The pointer menus of a Debug session
 * ([the design record](../../../../../../docs/design/reverse-engineering-ux.md), decision 20): what
 * a right click on a register's value or on a memory cell offers. Both read the value as an
 * address: Show in memory moves the memory view to the page holding it and marks it there, and Show
 * in Listing, offered while the program is an Executable, reveals it when it is in that
 * Executable's code. The copies write the value in the Target's hex at its width, or as an unsigned
 * decimal. A memory cell adds Follow pointer, which reads the address stored at the cell, as wide as
 * the Target's registers and in its byte order (8 bytes, little-endian, on x86-64), and shows it in
 * the memory view.
 */

/** Moves the memory view to the page holding an address, which it marks there. */
export function showInMemory(session: WorkbenchSession, ui: WorkbenchUi, address: bigint) {
    const emulator = session.emulator
    const page = address - (address % BigInt(emulator.memory.global.pageSize))
    emulator.setGlobalMemoryAddress(clampBigInt(page, 0n, MEMORY_SIZE[session.project.language]))
    ui.memoryMark = { address, build: emulator.buildSources }
}

/** A move of the memory view by hand, from its address box or its page buttons: the mark goes. */
export function moveMemoryView(session: WorkbenchSession, ui: WorkbenchUi, address: bigint) {
    ui.memoryMark = null
    session.emulator.setGlobalMemoryAddress(address)
}

/** The address the memory view marks, while the Build it was read in is still the one shown. */
export function markedMemoryAddress(
    session: WorkbenchSession,
    ui: WorkbenchUi
): bigint | undefined {
    const mark = ui.memoryMark
    return mark && mark.build === session.emulator.buildSources ? mark.address : undefined
}

/** Whether the program of the Debug session is an Executable, which has a Listing. */
function runsExecutable(session: WorkbenchSession): boolean {
    const sources = session.emulator.buildSources
    return !!sources && executableKind(sources.files[sources.entry]) === 'supported'
}

/**
 * Whether an address is in the code of the running Executable, by the memory regions the Core
 * lays its sections out as. Its libraries are left out: their Listings are made only once the
 * program runs in them, which a menu opening must not start.
 */
function inExecutableCode(session: WorkbenchSession, address: bigint): boolean {
    return regionsAt(session.emulator.memoryRegions, address).some(
        (region) => region.kind === 'code'
    )
}

/** The address stored at a memory cell, or undefined when its bytes cannot be read. */
function pointerAt(session: WorkbenchSession, address: bigint): bigint | undefined {
    const emulator = session.emulator
    const width = Number(emulator.systemSize)
    try {
        const bytes = emulator.readMemoryBytes(address, width)
        if (bytes.length !== width) return undefined
        return byteSliceToNum(bytes, emulator.memory.global.endianess)
    } catch {
        return undefined
    }
}

function copy(text: string) {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    if (!clipboard) {
        toast.error('The clipboard is not available here')
        return
    }
    clipboard.writeText(text).then(
        () => {},
        () => toast.error('Could not copy to the clipboard')
    )
}

/**
 * Show in memory and Show in Listing, for a value that may be an address; an item a value it cannot
 * be read as disables is never picked, so `value` is there whenever one runs.
 */
function addressItems(
    session: WorkbenchSession,
    ui: WorkbenchUi,
    value: bigint | undefined
): ContextMenuEntry[] {
    const items: ContextMenuEntry[] = [
        {
            label: 'Show in memory',
            icon: FaMemory,
            disabled: value === undefined,
            onSelect: () => showInMemory(session, ui, value!)
        }
    ]
    if (runsExecutable(session))
        items.push({
            label: 'Show in Listing',
            icon: FaListOl,
            disabled: value === undefined || !inExecutableCode(session, value),
            //a jump the navigation history keeps, as Show in Listing from the Hex editor is
            onSelect: () => void session.revealAddress(value!, { jump: true })
        })
    return items
}

/** The copies of a value `bytes` wide, the hex padded to that width as a register row draws it. */
function copyItems(
    session: WorkbenchSession,
    value: bigint | undefined,
    bytes: number
): ContextMenuEntry[] {
    const prefix = hexPrefix(session.project.language)
    return [
        {
            label: 'Copy as hex',
            icon: FaCopy,
            disabled: value === undefined,
            onSelect: () => copy(formatHex(value!, { prefix, bytes, minDigits: bytes * 2 }))
        },
        {
            label: 'Copy as decimal',
            icon: FaHashtag,
            disabled: value === undefined,
            onSelect: () => copy(value!.toString())
        }
    ]
}

/** The menu of a register's value, unsigned at its width of `bytes`. */
export function registerValueMenu(
    session: WorkbenchSession,
    ui: WorkbenchUi,
    value: bigint,
    bytes: number
): ContextMenuEntry[] {
    return [
        ...addressItems(session, ui, value),
        { separator: true },
        ...copyItems(session, value, bytes)
    ]
}

/** The menu of a memory cell: Follow pointer, then the value it reads as, as a register's. */
export function memoryCellMenu(
    session: WorkbenchSession,
    ui: WorkbenchUi,
    cell: MemoryCell
): ContextMenuEntry[] {
    const pointer = pointerAt(session, cell.address)
    return [
        {
            label: 'Follow pointer',
            icon: FaLongArrowAltRight,
            disabled: pointer === undefined,
            onSelect: () => showInMemory(session, ui, pointer!)
        },
        { separator: true },
        ...addressItems(session, ui, cell.value),
        { separator: true },
        ...copyItems(session, cell.value, cell.bytes)
    ]
}
