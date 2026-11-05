import type { DirectoryRecord, FileDetails } from '#lib/languages/peripherals/FileSystem.ts'
import type { MarsTarget } from './marsCheck'

/**
 * The structures the MIPS and RISC-V folder calls answer with, laid out as Linux lays them out on
 * each Target ([folder-calls.md](../../../../../../docs/design/folder-calls.md), decision 5): the
 * Cores store the bytes made here where the program asked, as they store what a read returns. The
 * Runtime library's `<sys/stat.h>` and `<dirent.h>` declare the same layouts. Memory is
 * little-endian on all three.
 */

/** `st_mode`'s type bits, with every permission set, as x86's Project mount reports them. */
const S_IFDIR = 0o040000
const S_IFREG = 0o100000
const PERMISSIONS = 0o777

/** `d_type`: Linux's DT_DIR and DT_REG. */
const DT_DIR = 4
const DT_REG = 8

/** The size of Linux's `unsigned long`, the width of `linux_dirent`'s first two fields. */
function longBytes(target: MarsTarget): 4 | 8 {
    return target === 'RISC-V-64' ? 8 : 4
}

/**
 * Where each field the editor fills sits in the Target's structure, and how long it is. MIPS
 * (o32) and RV32 take stat64 for their stat, `struct stat64`, the two in their own arrangements;
 * RV64 takes the generic `struct stat`, which matches RV32's stat64 up to the times. Every other
 * field, the times and the owners included, reads 0.
 */
const STAT_LAYOUTS: Readonly<
    Record<MarsTarget, { size: number; ino: number; mode: number; nlink: number; size64: number }>
> = {
    //arch/mips/include/uapi/asm/stat.h, _MIPS_SIM_ABI32
    MIPS: { size: 104, ino: 16, mode: 24, nlink: 28, size64: 56 },
    //include/uapi/asm-generic/stat.h
    'RISC-V': { size: 104, ino: 8, mode: 16, nlink: 20, size64: 48 },
    'RISC-V-64': { size: 128, ino: 8, mode: 16, nlink: 20, size64: 48 }
}

/** The size of the structure stat (1038) stores: 104 bytes on MIPS and RV32, 128 on RV64. */
export function statSize(target: MarsTarget): number {
    return STAT_LAYOUTS[target].size
}

/** The bytes of the Target's stat structure for what `FileSystemSession.inspect` reported. */
export function encodeStat(target: MarsTarget, details: FileDetails): Uint8Array {
    const layout = STAT_LAYOUTS[target]
    const bytes = new Uint8Array(layout.size)
    const view = new DataView(bytes.buffer)
    view.setBigUint64(layout.ino, BigInt(details.inode), true)
    view.setUint32(
        layout.mode,
        (details.kind === 'directory' ? S_IFDIR : S_IFREG) | PERMISSIONS,
        true
    )
    view.setUint32(layout.nlink, details.links, true)
    view.setBigInt64(layout.size64, BigInt(details.size), true)
    return bytes
}

const encoder = new TextEncoder()

/**
 * The length of one `linux_dirent` record: `d_ino` and `d_off`, both `unsigned long`, the 2-byte
 * `d_reclen`, the name and its NUL, then `d_type` in the record's last byte, the whole rounded up to
 * a multiple of `unsigned long`, as Linux's `fs/readdir.c` sizes it.
 */
export function direntLength(target: MarsTarget, name: string): number {
    const long = longBytes(target)
    const unaligned = long * 2 + 2 + encoder.encode(name).length + 2
    return Math.ceil(unaligned / long) * long
}

/**
 * `linux_dirent` records for the entries getdents (1065) took, one after the other, as Linux
 * writes them: `d_off` is the position after the entry, and padding bytes are 0.
 */
export function encodeDirents(target: MarsTarget, records: readonly DirectoryRecord[]): Uint8Array {
    const long = longBytes(target)
    const lengths = records.map((record) => direntLength(target, record.name))
    const bytes = new Uint8Array(lengths.reduce((sum, length) => sum + length, 0))
    const view = new DataView(bytes.buffer)
    let at = 0
    records.forEach((record, index) => {
        const length = lengths[index]
        if (long === 8) {
            view.setBigUint64(at, BigInt(record.inode), true)
            view.setBigUint64(at + 8, BigInt(record.next), true)
        } else {
            view.setUint32(at, record.inode, true)
            view.setUint32(at + 4, record.next, true)
        }
        view.setUint16(at + long * 2, length, true)
        bytes.set(encoder.encode(record.name), at + long * 2 + 2)
        bytes[at + length - 1] = record.kind === 'directory' ? DT_DIR : DT_REG
        at += length
    })
    return bytes
}
