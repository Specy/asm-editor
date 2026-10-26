import type {
    MutationOperation,
    RegisterSize
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
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

/**
 * The part of a back step both Cores report alike, typed structurally like the rest of this folder:
 * `param1` is the address of a memory restore, unsigned, or the number of the register a restore
 * writes, and both sides of the write are signed decimal strings, read at the width it was made.
 * Which action a step is stays each Core's own, their enums numbering the actions differently.
 */
type MarsBackStep = {
    readonly param1: number
    readonly oldValue: string
    readonly newValue: string
}

/** A memory restore as a write: what the store replaced and what it left, `size` bytes wide. */
export function memoryBackstepMutation(step: MarsBackStep, size: RegisterSize): MutationOperation {
    return {
        type: 'WriteMemory',
        value: {
            address: BigInt(step.param1),
            size,
            old: backstepValue(step.oldValue, size),
            new: backstepValue(step.newValue, size)
        }
    }
}

/**
 * A register restore as a write of `register`, `size` bytes wide: a 32 bit target's registers and
 * CSRs show their word and not a sign-extended long. `PC_RESTORE` is one too, its `oldValue` the
 * address it puts back and its `newValue` the address the instruction set.
 */
export function registerBackstepMutation(
    step: MarsBackStep,
    register: string,
    size: RegisterSize
): MutationOperation {
    return {
        type: 'WriteRegister',
        value: {
            register,
            old: backstepValue(step.oldValue, size),
            new: backstepValue(step.newValue, size),
            size
        }
    }
}

function backstepValue(value: string, size: RegisterSize): bigint {
    return BigInt.asUintN(8 * size, BigInt(value))
}
