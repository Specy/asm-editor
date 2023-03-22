export function parseCcr(value: number) {
    return  [
        (value & 0x1) === 0x1,
        (value & 0x2) === 0x2,
        (value & 0x4) === 0x4,
        (value & 0x8) === 0x8,
        (value & 0x10) === 0x10
    ]
}
