/**
 * What each operand symbol of an x86 Form pattern stands for, in NASM's own notation
 * ([the design record](../../../../../../docs/design/instruction-layout.md), decision 7). One line
 * of markdown each; a page's Operands legend shows the ones its rows use.
 */
export const X86_OPERAND_MEANINGS: Record<string, string> = {
    reg: 'A general-purpose register of the size the row is used at: `al`, `ax`, `eax` or `rax` and their kin.',
    reg8: 'An 8-bit register: `al`, `bl`, `cl`, `dl`, `ah`… `sil`, `dil`, `r8b` to `r15b`.',
    reg16: 'A 16-bit register: `ax`, `bx`, `cx`, `dx`, `si`, `di`, `sp`, `bp`, `r8w` to `r15w`.',
    reg32: 'A 32-bit register: `eax` to `edi`, `r8d` to `r15d`. Writing one clears the upper half of its 64-bit register.',
    reg64: 'A 64-bit register: `rax`, `rbx`, `rcx`, `rdx`, `rsi`, `rdi`, `rsp`, `rbp`, `r8` to `r15`.',
    'r/m': 'A register or a memory operand of the size the row is used at, such as `rax` or `qword [rbp-8]`.',
    'r/m8': 'An 8-bit register or a byte in memory, such as `byte [rsi]`.',
    'r/m16': 'A 16-bit register or a word in memory, such as `word [rsi]`.',
    'r/m32': 'A 32-bit register or a doubleword in memory, such as `dword [rsi]`.',
    'r/m64': 'A 64-bit register or a quadword in memory, such as `qword [rsi]`.',
    mem: 'A memory operand, written in brackets: `[rbx+8]`, `[label]`.',
    mem8: 'A byte in memory: `byte [rbx+8]`.',
    mem16: 'A word in memory: `word [rbx+8]`.',
    mem32: 'A doubleword in memory: `dword [rbx+8]`.',
    mem64: 'A quadword in memory: `qword [rbx+8]`.',
    mem128: 'Sixteen bytes in memory: `oword [rbx]`.',
    imm: 'An immediate: a number, a character or a label, encoded in the size the row is used at.',
    imm8: 'An 8-bit immediate, `-128` to `255`. In a wider operation it is sign-extended.',
    imm16: 'A 16-bit immediate, `-32768` to `65535`.',
    imm32: 'A 32-bit immediate. In a 64-bit operation it is sign-extended, so it reaches `-2³¹` to `2³¹-1`.',
    imm64: 'A full 64-bit immediate, which only `mov reg64, imm64` takes.',
    acc: 'The accumulator of the size the row is used at: `al`, `ax`, `eax` or `rax`. NASM gives it a shorter encoding of the general forms.',
    moffs: 'A plain address with no base or index register, such as `[label]`: a short encoding for moving the accumulator to or from memory.',
    segreg: 'A segment register: `es`, `cs`, `ss`, `ds`, `fs` or `gs`.',
    creg: 'A control register, `cr0` to `cr8`.',
    dreg: 'A debug register, `dr0` to `dr7`.',
    treg: 'A test register of the 386 and 486, `tr3` to `tr7`.',
    'imm16:imm16': 'A far address written as segment and offset, `0x10:0x1234`.',
    'imm16:imm32': 'A far address written as a 16-bit segment and a 32-bit offset.',
    'imm32:imm32': 'A far address written as segment and offset, both 32-bit.'
}
