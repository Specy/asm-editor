/**
 * Types for `deviceTable.mjs`: the parts of the x86 device table the editor's tests read.
 */
export type DeviceHeader = {
    path: string
    summary: string
    nasmSummary?: string
    includes?: string[]
    includeNext?: string
    guard?: string
    /** False for `errno.h`, which the Runtime library declares for C. */
    c?: false
    /** C linkage for a header with no functions but code that needs it, `bits/syscall.h`. */
    externC?: true
    items: unknown[]
}

export const DEVICE_HEADERS: DeviceHeader[]
export const IOC_DIRECTIONS: Record<'' | 'W' | 'R' | 'WR', number>
/** The error numbers, with what each means; a string value is another code's name. */
export const ERRNO_CODES: { name: string; value: number | string; doc: string }[]
