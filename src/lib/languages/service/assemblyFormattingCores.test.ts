import { describe, expect, it } from 'vitest'
import { MIPS } from '@specy/mips'
import { RISCV } from '@specy/risc-v'
import { assemble as assembleZ80 } from '@specy/z80'
import { createX86Emulator } from '@specy/x86'
import { Interpreter, S68k } from '@specy/s68k'
import { MIPS_TEXT_OPTIONS } from '$lib/languages/MIPS/MIPS-language'
import { RISCV_TEXT_OPTIONS } from '$lib/languages/RISC-V/RISC-V-language'
import { X86_TEXT_OPTIONS } from '$lib/languages/X86/X86-language'
import { Z80_TEXT_OPTIONS } from '$lib/languages/Z80/Z80-language'
import { formatM68kSource } from '$lib/languages/M68K/M68K-language'
import { formatAssemblySource } from './assemblyText'

function marsBinary(source: string): Array<{ address: number; binary: number }> {
    const core = MIPS.makeMipsFromFiles({ 'main.asm': source }, 'main.asm')
    const result = core.assemble()
    expect(result.hasErrors, result.report).toBe(false)
    return core
        .getCompiledStatements()
        .map((statement) => ({ address: statement.address, binary: statement.binaryStatement }))
}

function riscvBinary(source: string): Array<{ address: number; binary: number }> {
    RISCV.setIs64Bit(false)
    const core = RISCV.makeRiscVFromFiles({ 'main.asm': source }, 'main.asm')
    const result = core.assemble()
    expect(result.hasErrors, result.report).toBe(false)
    return core
        .getCompiledStatements()
        .map((statement) => ({ address: statement.address, binary: statement.binaryStatement }))
}

function z80Binary(source: string): Array<{ address: number; bytes: number[] }> {
    const result = assembleZ80(source)
    expect(result.hasErrors(), result.diagnostics.map((item) => item.message).join('\n')).toBe(
        false
    )
    return result.segments().map((segment) => ({
        address: segment.address,
        bytes: [...segment.bytes]
    }))
}

describe('assembly formatting against the real cores', () => {
    it('preserves MIPS and RISC-V machine statements', () => {
        const mips = [
            '.data',
            'message:  .asciiz "a,b"',
            '.text',
            'main: addiu $t0,$zero,1 # keep, comment',
            'li $v0,10',
            'syscall'
        ].join('\n')
        const riscv = [
            '.data',
            'message:  .asciz "a,b"',
            '.text',
            'main: addi t0,zero,1 # keep, comment',
            'li a7,10',
            'ecall'
        ].join('\n')
        expect(marsBinary(formatAssemblySource(mips, MIPS_TEXT_OPTIONS))).toEqual(marsBinary(mips))
        expect(riscvBinary(formatAssemblySource(riscv, RISCV_TEXT_OPTIONS))).toEqual(
            riscvBinary(riscv)
        )
    })

    it('preserves Z80 segments', () => {
        const source = [
            'value  equ 1',
            '    org $8000',
            'start:ld a,value ; keep, comment',
            '    halt'
        ].join('\n')
        expect(z80Binary(formatAssemblySource(source, Z80_TEXT_OPTIONS))).toEqual(z80Binary(source))
    })

    // This is the one case that boots a real Core rather than calling an assembler
    // directly: it starts the x86 WASM emulator and links the program twice. That costs
    // a few seconds on its own and rather more when the rest of the suite is running in
    // parallel, so it needs a timeout well above Vitest's 5s default.
    it('preserves compiler generated MIPS, including its directive spellings', () => {
        const source = [
            '\t.rdata',
            '$LC0:',
            '\t.ascii\t"sum=\\000"',
            '\t.data',
            '\t.4byte\t1',
            '\t.2byte\t2',
            '\t.comm\ttotal,4,4',
            '\t.text',
            '\t.type\tmain, @function',
            '\t.ent\tmain',
            'main:',
            '\tlui\t$t0,%hi(total) # keep, comment',
            '\tsw\t$a0,%lo(total)($t0)',
            '\t.size\tmain, .-main',
            '\tli\t$v0,10',
            '\tsyscall'
        ].join('\n')
        const formatted = formatAssemblySource(source, MIPS_TEXT_OPTIONS)
        expect(marsBinary(formatted)).toEqual(marsBinary(source))
        //a directive whose name begins with a digit is still an operation to indent
        expect(formatted).toContain('    .4byte 1')
        expect(formatted).toContain('    lui $t0, %hi(total)')
    })

    it('preserves compiler generated RISC-V, including its directive spellings', () => {
        const source = [
            '\t.section\t.rodata',
            '.LC0:',
            '\t.string\t"sum="',
            '\t.data',
            '\t.4byte\t1',
            '\t.8byte\t2',
            '\t.comm\ttotal,4,4',
            '\t.text',
            '\t.type\tmain, @function',
            'main:',
            '\tlui\ta5,%hi(total) # keep, comment',
            '\tsw\ta0,%lo(total)(a5)',
            '\t.cfi_startproc',
            '\t.size\tmain, .-main',
            '\tli\ta7,10',
            '\tecall'
        ].join('\n')
        const formatted = formatAssemblySource(source, RISCV_TEXT_OPTIONS)
        expect(riscvBinary(formatted)).toEqual(riscvBinary(source))
        expect(formatted).toContain('    .4byte 1')
        expect(formatted).toContain('    lui a5, %hi(total)')
    })

    it('preserves the linked x86 executable', async () => {
        const source = [
            'bits 64',
            'global _start',
            'section .text',
            '_start:mov rax,60 ; keep, comment',
            'xor rdi,rdi',
            'syscall'
        ].join('\n')
        const emulator = await createX86Emulator()
        try {
            const original = await emulator.compile(source)
            expect(original.ok, original.report).toBe(true)
            const before = emulator.module.FS.readFile('/program', { encoding: 'binary' })
            const formatted = await emulator.compile(formatAssemblySource(source, X86_TEXT_OPTIONS))
            expect(formatted.ok, formatted.report).toBe(true)
            const after = emulator.module.FS.readFile('/program', { encoding: 'binary' })
            expect([...before]).toEqual([...after])
        } finally {
            emulator.dispose()
        }
    }, 30_000)

    it('preserves M68K instructions and initialized memory', () => {
        const source = [
            'org $1000',
            'start:move.w #1,d0 ; keep, comment',
            "dc.b 'a,b',1",
            'simhalt',
            'end start'
        ].join('\n')
        const assemble = (code: string) => {
            const result = S68k.assemble(code)
            expect(
                result.program,
                result.diagnostics.map((item) => item.message).join('\n')
            ).toBeDefined()
            const program = result.program!
            const interpreter = new Interpreter(program, { keep_history: false, history_size: 0 })
            const info = program.getInfo()
            const snapshot = {
                info,
                bytes: [...interpreter.readMemoryBytes(0x1000, program.getEndAddress() - 0x1000)]
            }
            interpreter.dispose()
            program.dispose()
            return snapshot
        }
        expect(assemble(formatM68kSource(source))).toEqual(assemble(source))
    })
})
