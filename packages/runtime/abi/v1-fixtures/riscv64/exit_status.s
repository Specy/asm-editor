        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.8,"aMS",@progbits,1
        .align  3
.LC0:
        .string "handler ran"
        .text
        .align  2
        .type   handler, @function
handler:
.LFB0:
        lui     a0,%hi(.LC0)
        addi    a0,a0,%lo(.LC0)
        tail    puts
.LFE0:
        .size   handler, .-handler
        .section        .rodata.str1.8
        .align  3
.LC1:
        .string "exiting at level %d\n"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB2:
        lui     a0,%hi(handler)
        addi    sp,sp,-16
        addi    a0,a0,%lo(handler)
        sd      ra,8(sp)
        call    atexit
.LBB4:
.LBB5:
        lui     a0,%hi(.LC1)
        addi    a0,a0,%lo(.LC1)
        li      a1,3
        call    printf
        li      a0,7
        call    exit
.LBE5:
.LBE4:
.LFE2:
        .size   main, .-main
        .text
.Letext0:
