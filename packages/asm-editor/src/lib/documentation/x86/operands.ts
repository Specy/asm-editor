/**
 * What each operand symbol of an x86 Form pattern stands for, in NASM's own notation
 * ([the design record](../../../../../../docs/design/instruction-layout.md), decision 7). One line
 * of markdown each; a page's Operands legend shows the ones its rows use.
 */
export const X86_OPERAND_MEANINGS: Record<string, string> = {
    reg: 'A general-purpose register matching the operation’s size, for example `al`, `ax`, `eax` or `rax`. The byte registers `ah`, `bh`, `ch` and `dh` cannot be used with a REX prefix, which is required by `spl`, `bpl`, `sil`, `dil` and `r8`–`r15`.',
    reg8: 'An 8-bit general-purpose register: `al`, `bl`, `cl`, `dl`, `ah`, `bh`, `ch`, `dh`, `spl`, `bpl`, `sil`, `dil` or `r8b` to `r15b`. The high-byte registers `ah`, `bh`, `ch` and `dh` cannot be used with a REX prefix, required by `spl`, `bpl`, `sil`, `dil` and `r8b` to `r15b`.',
    reg16: 'A 16-bit general-purpose register: `ax`, `bx`, `cx`, `dx`, `si`, `di`, `sp`, `bp` or `r8w` to `r15w`.',
    reg32: 'A 32-bit general-purpose register: `eax`, `ebx`, `ecx`, `edx`, `esi`, `edi`, `esp`, `ebp` or `r8d` to `r15d`. Writing it clears the upper 32 bits of the corresponding 64-bit register.',
    reg64: 'A 64-bit general-purpose register: `rax`, `rbx`, `rcx`, `rdx`, `rsi`, `rdi`, `rsp`, `rbp` or `r8` to `r15`.',
    'r/m': 'A general-purpose register or memory location matching the operation’s size, for example `rax` or `qword [rbp-8]`. The byte registers `ah`, `bh`, `ch` and `dh` cannot be used with a REX prefix, including when the memory address uses `r8`–`r15`.',
    'r/m8': 'An 8-bit general-purpose register or byte in memory, for example `al` or `byte [rsi]`. The high-byte registers `ah`, `bh`, `ch` and `dh` cannot be used with a REX prefix, including when the memory address uses an extended register such as `r8`.',
    'r/m16':
        'A 16-bit general-purpose register or word in memory, for example `ax` or `word [rsi]`.',
    'r/m32':
        'A 32-bit general-purpose register or doubleword in memory, for example `eax` or `dword [rsi]`.',
    'r/m64':
        'A 64-bit general-purpose register or quadword in memory, for example `rax` or `qword [rsi]`.',
    mem: 'A memory location addressed with square brackets, for example `[rbx+8]` or `[label]`.',
    mem8: 'An 8-bit value in memory, for example `byte [rbx+8]`.',
    mem16: 'A 16-bit value in memory, for example `word [rbx+8]`.',
    mem32: 'A 32-bit value in memory, for example `dword [rbx+8]`.',
    mem64: 'A 64-bit value in memory, for example `qword [rbx+8]`.',
    mem128: 'A 128-bit value in memory, for example `oword [rbx]`.',
    imm: 'An immediate value encoded in the instruction, written as a number, character or label. Its encoded width and any sign extension depend on the instruction; arithmetic immediates may be sign-extended, while shift counts are used without sign extension.',
    imm8: 'An 8-bit immediate, `-128` to `255`. Instructions that sign-extend it to a wider operand interpret the byte as `-128` to `127`; shift counts do not use this sign extension.',
    imm16: 'A 16-bit immediate, `-32768` to `65535`.',
    imm32: 'A 32-bit immediate, `-2147483648` to `4294967295`. Instructions that sign-extend it to 64 bits interpret the encoded value as `-2³¹` to `2³¹-1`.',
    imm64: 'A 64-bit value or target address. The instruction determines how it is encoded.',
    acc: 'The accumulator matching the operation’s size: `al`, `ax`, `eax` or `rax`. A shorter encoding may be available.',
    moffs: 'An absolute memory address with no base or index register, such as `[label]`, used by `mov` to transfer data to or from the accumulator.',
    segreg: 'A segment register: `es`, `cs`, `ss`, `ds`, `fs` or `gs`.',
    creg: 'A control register defined by the processor, such as `cr0`, `cr2`, `cr3`, `cr4` or `cr8`. Availability depends on the processor and execution mode.',
    dreg: 'A debug register, `dr0` to `dr7`. `dr4` and `dr5` are legacy aliases whose availability depends on the processor’s debug configuration.',
    treg: 'A test register from the 386/486 architecture, `tr3` to `tr7`.',
    'imm16:imm16':
        'A far address written as `segment:offset`, with a 16-bit segment and 16-bit offset, for example `0x10:0x1234`.',
    'imm16:imm32':
        'A far address written as `segment:offset`, with a 16-bit segment and 32-bit offset.',
    'imm32:imm32':
        'A far address written as `segment:offset`, with both values specified as 32-bit immediates.'
}
