        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.8,"aMS",@progbits,1
        .align  3
.LC0:
        .string "valid argv=%d\n"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB0:
        addi    sp,sp,-16
        sd      ra,8(sp)
        beq     a1,zero,.L3
        slli    a0,a0,3
        add     a1,a1,a0
        ld      a1,0(a1)
        seqz    a1,a1
.L2:
        lui     a0,%hi(.LC0)
        addi    a0,a0,%lo(.LC0)
        call    printf
        ld      ra,8(sp)
        li      a0,0
        addi    sp,sp,16
        jr      ra
.L3:
        li      a1,0
        j       .L2
.LFE0:
        .size   main, .-main
        .text
.Letext0:
