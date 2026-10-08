        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.8,"aMS",@progbits,1
        .align  3
.LC0:
        .string "Shape constructor calls describe()"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB9:
.LBB26:
.LBB27:
.LBB28:
        lui     a0,%hi(.LC0)
.LBE28:
.LBE27:
.LBE26:
        addi    sp,sp,-16
.LBB35:
.LBB33:
.LBB31:
        addi    a0,a0,%lo(.LC0)
.LBE31:
.LBE33:
.LBE35:
        sd      ra,8(sp)
.LBB36:
.LBB34:
.LBB32:
        call    puts
        lui     a5,%hi(stdout)
        ld      a0,%lo(stdout)(a5)
        call    fflush
.LBB29:
.LBB30:
        call    __cxa_pure_virtual
.LBE30:
.LBE29:
.LBE32:
.LBE34:
.LBE36:
.LFE9:
        .size   main, .-main
        .weak   __cxa_pure_virtual
        .text
.Letext0:
