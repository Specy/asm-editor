import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { analyze } from '@specy/x86/elf'
import { elfRegions, regionAt, regionHover, regionSpans, type FileRegion } from './elfRegions'

const fixture = (name: string) =>
    new Uint8Array(
        readFileSync(
            new URL(`../../../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url)
        )
    )

/**
 * `readelf -S -W crackme` (GNU readelf 2.46), the sections the tints must match: name, type,
 * address, offset, size, entry size and flags.
 */
const READELF_SECTIONS = `
  [ 1] .note.gnu.build-id NOTE            0000000000000350 000350 000024 00   A  0   0  4
  [ 2] .interp           PROGBITS        0000000000000374 000374 00001c 00   A  0   0  1
  [ 3] .gnu.hash         GNU_HASH        0000000000000390 000390 000028 00   A  4   0  8
  [ 4] .dynsym           DYNSYM          00000000000003b8 0003b8 000138 18   A  5   1  8
  [ 5] .dynstr           STRTAB          00000000000004f0 0004f0 0000ca 00   A  0   0  1
  [ 6] .gnu.version      VERSYM          00000000000005ba 0005ba 00001a 02   A  4   0  2
  [ 7] .gnu.version_r    VERNEED         00000000000005d8 0005d8 000040 00   A  5   1  8
  [ 8] .rela.dyn         RELA            0000000000000618 000618 0000d8 18   A  4   0  8
  [ 9] .rela.plt         RELA            00000000000006f0 0006f0 000090 18  AI  4  24  8
  [10] .init             PROGBITS        0000000000001000 001000 00001b 00  AX  0   0  4
  [11] .plt              PROGBITS        0000000000001020 001020 000070 10  AX  0   0 16
  [12] .plt.got          PROGBITS        0000000000001090 001090 000010 10  AX  0   0 16
  [13] .plt.sec          PROGBITS        00000000000010a0 0010a0 000060 10  AX  0   0 16
  [14] .text             PROGBITS        0000000000001100 001100 0001bb 00  AX  0   0 16
  [15] .fini             PROGBITS        00000000000012bc 0012bc 00000d 00  AX  0   0  4
  [16] .rodata           PROGBITS        0000000000002000 002000 00002f 00   A  0   0  4
  [17] .eh_frame_hdr     PROGBITS        0000000000002030 002030 000034 00   A  0   0  4
  [18] .eh_frame         PROGBITS        0000000000002068 002068 0000ac 00   A  0   0  8
  [19] .note.gnu.property NOTE            0000000000002118 002118 000030 00   A  0   0  8
  [20] .note.ABI-tag     NOTE            0000000000002148 002148 000020 00   A  0   0  4
  [21] .init_array       INIT_ARRAY      0000000000003d90 002d90 000008 08  WA  0   0  8
  [22] .fini_array       FINI_ARRAY      0000000000003d98 002d98 000008 08  WA  0   0  8
  [23] .dynamic          DYNAMIC         0000000000003da0 002da0 0001f0 10  WA  5   0  8
  [24] .got              PROGBITS        0000000000003f90 002f90 000070 08  WA  0   0  8
  [25] .data             PROGBITS        0000000000004000 003000 000010 00  WA  0   0  8
  [26] .bss              NOBITS          0000000000004010 003010 000010 00  WA  0   0 16
  [27] .comment          PROGBITS        0000000000000000 003010 000026 01  MS  0   0  1
  [28] .symtab           SYMTAB          0000000000000000 003038 0003f0 18     29  18  8
  [29] .strtab           STRTAB          0000000000000000 003428 000256 00      0   0  1
  [30] .shstrtab         STRTAB          0000000000000000 00367e 00011a 00      0   0  1`

/** The tints `readelf` says each section should have: its bytes, kind and addresses. */
function expectedSections(): FileRegion[] {
    return READELF_SECTIONS.trim()
        .split('\n')
        .flatMap((line) => {
            const [, name, type, address, offset, size, flags] = line.match(
                /\]\s+(\S+)\s+(\S+)\s+([0-9a-f]{16}) ([0-9a-f]{6}) ([0-9a-f]{6}) [0-9a-f]{2}\s+([A-Z]*)/
            )!
            //`.bss` has no bytes in the file
            if (type === 'NOBITS') return []
            const start = parseInt(offset, 16)
            const length = parseInt(size, 16)
            const loaded = flags.includes('A')
            return [
                {
                    name,
                    kind: flags.includes('X') ? 'code' : loaded ? 'data' : 'metadata',
                    start,
                    end: start + length,
                    ...(loaded
                        ? {
                              address: {
                                  start: parseInt(address, 16),
                                  end: parseInt(address, 16) + length
                              }
                          }
                        : {})
                } satisfies FileRegion
            ]
        })
}

describe('the tints of an Executable', () => {
    it("match crackme's sections as readelf lists them, and its headers' tables", () => {
        const bytes = fixture('crackme')
        const regions = elfRegions(bytes, analyze(bytes))
        expect(regions.filter((region) => !region.name.includes(' '))).toEqual(expectedSections())
        //`readelf -h`: a 64-byte header, 14 program headers of 56 bytes at 64, 31 section
        //headers of 64 bytes at 14232, which end the file
        expect(regions.filter((region) => region.name.includes(' '))).toEqual([
            { name: 'ELF header', kind: 'metadata', start: 0, end: 64 },
            { name: 'Program header table', kind: 'metadata', start: 64, end: 64 + 14 * 56 },
            { name: 'Section header table', kind: 'metadata', start: 14232, end: 16216 }
        ])
        expect(bytes.length).toBe(16216)
    })

    it('names a byte by its smallest region, with offsets and run-time addresses', () => {
        const bytes = fixture('crackme')
        const spans = regionSpans(elfRegions(bytes, analyze(bytes), 0x555555554000))
        const text = regionAt(spans, 0x1105)!
        expect(text.name).toBe('.text')
        expect(regionHover(text)).toBe(
            '.text · offset 0x1100–0x12ba · address 0x555555555100–0x5555555552ba'
        )
        expect(regionHover(regionAt(spans, 0x10)!)).toBe('ELF header · offset 0x0–0x3f')
        expect(regionAt(spans, 0x350)!.name).toBe('.note.gnu.build-id')
        //the padding between the read-only data and the code is no region's
        expect(regionAt(spans, 0x800)).toBeUndefined()
        expect(regionAt(spans, 16216)).toBeUndefined()
    })

    it('tints the load segments of a program without section headers', () => {
        const bytes = fixture('crackme').slice()
        const view = new DataView(bytes.buffer)
        view.setBigUint64(40, 0n, true)
        view.setUint16(60, 0, true)
        view.setUint16(62, 0, true)
        const regions = elfRegions(bytes, analyze(bytes))
        expect(
            regions.map((region) => [region.name, region.kind, region.start, region.end])
        ).toEqual([
            ['load.2', 'data', 0, 0x780],
            ['ELF header', 'metadata', 0, 64],
            ['Program header table', 'metadata', 64, 848],
            ['load.3', 'code', 0x1000, 0x12c9],
            ['load.4', 'data', 0x2000, 0x2168],
            ['load.5', 'data', 0x2d90, 0x3010]
        ])
        const spans = regionSpans(regions)
        expect(regionAt(spans, 0x20)!.name).toBe('ELF header')
        expect(regionAt(spans, 0x400)!.name).toBe('load.2')
        expect(regionHover(regionAt(spans, 0x1100)!)).toBe(
            'load.3 · PT_LOAD r-x · offset 0x1000–0x12c8 · address 0x1000–0x12c8'
        )
    })

    it('tints nothing of what is no ELF', () => {
        const bytes = Uint8Array.from([1, 2, 3])
        expect(elfRegions(bytes, analyze(bytes))).toEqual([])
    })
})
