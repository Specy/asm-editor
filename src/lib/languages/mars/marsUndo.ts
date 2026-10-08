import type { FileSystemSession } from '../peripherals/FileSystem'

type MarsUndoHistory = {
    getUndoGroupsRange(skip: number, max: number): readonly { serial: string }[]
}

/** Preflight a group using its boundary serials, without loading the intervening CPU mutations. */
export function canUndoMarsHistoryRange(
    core: MarsUndoHistory | null,
    fileSystem: FileSystemSession | null,
    skip: number,
    count: number
): boolean {
    if (
        !core ||
        !Number.isSafeInteger(skip) ||
        !Number.isSafeInteger(count) ||
        skip < 0 ||
        count < 0 ||
        skip + count > 0x7fffffff
    )
        return false
    if (count === 0) return true
    const oldest = core.getUndoGroupsRange(skip + count - 1, 1)[0]
    if (!oldest) return false
    if (!fileSystem) return true
    const newest = count === 1 ? oldest : core.getUndoGroupsRange(skip, 1)[0]
    return !!newest && fileSystem.canUndoSerialRange(BigInt(oldest.serial), BigInt(newest.serial))
}
