export const PAGE_SIZE = 16 * 16
export const PAGE_ELEMENTS_PER_ROW = Math.sqrt(PAGE_SIZE)
export const MEMORY_SIZE = {
    M68K: 0xffffff,
    MIPS: 0xffffffff
} //16mb

export const DEFAULT_MEMORY_VALUE = {
    M68K: 0xff,
    MIPS: 0x00
}
