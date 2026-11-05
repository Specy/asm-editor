import { fillPlaceholders, proseEntries, type DocumentationEntry } from '../entries'
import mipsTemplate from './interrupts.mips.md?raw'
import riscvTemplate from './interrupts.riscv.md?raw'

/**
 * The "Interrupts and the timer" Chapter of MIPS and RISC-V
 * ([ADR 0074](../../../../../../docs/adr/0074-mips-and-risc-v-timers-count-what-their-references-count.md)):
 * the handler, the timer each reference has, keyboard interrupts and debugging. The two Targets
 * deliver interrupts differently enough to have a page each; the examples are run by the
 * Emulators' tests, which read them from these entries.
 */

type Variant = 'MIPS' | 'RISC-V'

function fence(variant: Variant, code: string): string {
    return `\`\`\`${variant === 'MIPS' ? 'mips' : 'riscv'}\n${code}\n\`\`\``
}

/** Five timer interrupts, counted in the handler, then the count printed. */
export const TIMER_EXAMPLE: Record<Variant, string> = {
    MIPS: `        .text
main:   li      $t0, 1000
        mtc0    $t0, $11        # Compare: the first interrupt at Count 1000
wait:   lw      $t1, ticks
        blt     $t1, 5, wait    # spin until the handler has counted 5
        move    $a0, $t1
        li      $v0, 1          # print it
        syscall
        li      $v0, 10
        syscall

        .kdata
ticks:  .word   0

        .ktext  0x80000180
        lui     $k1, 0x9000     # the address of ticks, without $at
        lw      $k0, 0($k1)
        addiu   $k0, $k0, 1
        sw      $k0, 0($k1)
        mfc0    $k0, $11        # the next interrupt 1000 Counts later:
        addiu   $k0, $k0, 1000  # writing Compare also clears this one
        mtc0    $k0, $11
        eret                    # back to the interrupted instruction`,
    'RISC-V': `        .text
main:   la      t0, handler
        csrw    t0, utvec       # where interrupts go
        li      t0, 0x10        # uie bit 4: the timer
        csrs    t0, uie
        li      s0, 0xffff0018  # time, and timecmp 8 bytes on
        lw      t1, 0(s0)
        addi    t1, t1, 100
        sw      t1, 8(s0)       # timecmp = time + 100 ms
        sw      zero, 12(s0)
        li      s1, 0           # ticks counted
        csrsi   ustatus, 1      # interrupts on
wait:   wfi                     # sleep until the next interrupt
        li      t2, 5
        blt     s1, t2, wait
        mv      a0, s1
        li      a7, 1           # print it
        ecall
        li      a7, 10
        ecall

handler:
        addi    s1, s1, 1       # one more tick
        lw      t1, 8(s0)       # the next one 100 ms after this one:
        addi    t1, t1, 100     # writing timecmp arms the timer again
        sw      t1, 8(s0)
        uret                    # back to the interrupted instruction`
}

/** Every key echoed by the receiver's interrupt handler, until Enter. */
export const KEYBOARD_EXAMPLE: Record<Variant, string> = {
    MIPS: `        .text
main:   li      $t0, 0xffff0000
        li      $t1, 2          # receiver control bit 1: interrupt when a key waits
        sw      $t1, 0($t0)
loop:   j       loop            # nothing to do: the handler does the work

        .ktext  0x80000180
        lui     $k1, 0xffff     # the receiver and the console, without $at
        lw      $k0, 4($k1)     # the key: reading it withdraws the request
        sw      $k0, 12($k1)    # echo it on the console
        li      $k1, 10
        beq     $k0, $k1, quit  # Enter ends the program
        eret
quit:   li      $v0, 10
        syscall`,
    'RISC-V': `        .text
main:   la      t0, handler
        csrw    t0, utvec
        li      t0, 0x100       # uie bit 8: external interrupts
        csrs    t0, uie
        csrsi   ustatus, 1
        li      s0, 0xffff0000  # the receiver and the console
        li      t0, 2           # receiver control bit 1: interrupt when a key waits
        sw      t0, 0(s0)
loop:   wfi                     # nothing to do: the handler does the work
        j       loop

handler:                        # main leaves s0, t1 and t2 to the handler
        lw      t1, 4(s0)       # the key: reading it withdraws the request
        sw      t1, 12(s0)      # echo it on the console
        li      t2, 10
        beq     t1, t2, quit    # Enter ends the program
        uret
quit:   li      a7, 10
        ecall`
}

/** An exception reported by the handler, which then ends the program: prints 4. */
export const EXCEPTION_EXAMPLE: Record<Variant, string> = {
    MIPS: `        .text
main:   lw      $t0, 1($zero)   # a misaligned load: an address error
        li      $v0, 10
        syscall

        .ktext  0x80000180
        mfc0    $k0, $13        # Cause
        srl     $a0, $k0, 2
        andi    $a0, $a0, 31    # the exception code: 4, an address error on a load
        li      $v0, 1          # print it
        syscall
        li      $v0, 10         # and end the program
        syscall`,
    'RISC-V': `        .text
main:   la      t0, handler
        csrw    t0, utvec
        csrsi   ustatus, 1      # the handler takes exceptions while UIE is set
        li      t1, 0x10010001
        lw      t2, 0(t1)       # a misaligned load
        li      a7, 10
        ecall

handler:
        csrr    a0, ucause      # 4: a misaligned load
        li      a7, 1           # print it
        ecall
        li      a7, 10          # and end the program
        ecall`
}

export function interruptsEntries(
    variant: Variant,
    language: 'mips' | 'risc-v',
    chapterHref: string
): DocumentationEntry[] {
    const markdown = fillPlaceholders(variant === 'MIPS' ? mipsTemplate : riscvTemplate, {
        timerExample: fence(variant, TIMER_EXAMPLE[variant]),
        keyboardExample: fence(variant, KEYBOARD_EXAMPLE[variant]),
        exceptionExample: fence(variant, EXCEPTION_EXAMPLE[variant])
    })
    return proseEntries({ language, chapter: 'interrupts', chapterHref, markdown })
}
