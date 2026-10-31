/**
 * Types for `deviceHeaders.mjs`, which is plain JavaScript written for Node: TypeScript reads this
 * file in its place when the editor's tests import it.
 */

/** What the generator needs of a system call: `X86Syscall` of the x86 syscall table. */
export type DeviceSyscall = { number: number; name: string }

/** One value the layout test compares, as a C expression over the headers. */
export type DeviceProbeEntry = {
    header: string
    expression: string
    value: number
    /** False for what Linux's own headers do not have, which only the table can check. */
    linux: boolean
    /** False for what only the kernel's or the C library's headers have, such as `SYS_read`. */
    c: boolean
    /** Why the guest's Linux 6.12 has this value where a later kernel's headers differ. */
    guest?: string
    /** A POSIX call's type, compared with the C library's declaration. */
    function?: true
}

export type DeviceNasmProbeEntry = { file: string; expression: string; value: number }

export type DeviceFunction = {
    name: string
    header: string
    declaration: string
    doc: string
    documentation: string
}

export const DEVICE_DIRECTORY: string
export const DEVICE_C_HEADERS: string[]
export function generateDeviceFiles(syscalls: readonly DeviceSyscall[]): Record<string, string>
export function deviceFunctions(): DeviceFunction[]
export function deviceProbe(syscalls: readonly DeviceSyscall[]): DeviceProbeEntry[]
export function deviceNasmProbe(syscalls: readonly DeviceSyscall[]): DeviceNasmProbeEntry[]
export function typeLayout(type: string): { size: number; align: number }
/** A structure of the table laid out as GCC lays it out: each field with its offset and size. */
export function structLayout(item: unknown): {
    size: number
    align: number
    fields: { name: string; type: string; doc?: string; offset: number; size: number }[]
}
export function evaluate(text: string): bigint
export function valueOf(name: string): bigint
