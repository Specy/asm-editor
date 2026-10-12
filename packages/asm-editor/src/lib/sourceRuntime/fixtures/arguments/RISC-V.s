        .option nopic
        .attribute arch, "rv32i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata
        .align  2
.LC0:
        .string "argc=%d\n"
        .align  2
.LC1:
        .string "argv[%d]=%s\n"
        .text
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB0:
        addi    sp,sp,-48
        sw      ra,44(sp)
        sw      s0,40(sp)
        addi    s0,sp,48
        sw      a0,-36(s0)
        sw      a1,-40(s0)
        lw      a1,-36(s0)
        lui     a5,%hi(.LC0)
        addi    a0,a5,%lo(.LC0)
        call    printf
.LBB2:
        sw      zero,-20(s0)
        j       .L2
.L3:
        lw      a5,-20(s0)
        slli    a5,a5,2
        lw      a4,-40(s0)
        add     a5,a4,a5
        lw      a5,0(a5)
        mv      a2,a5
        lw      a1,-20(s0)
        lui     a5,%hi(.LC1)
        addi    a0,a5,%lo(.LC1)
        call    printf
        lw      a5,-20(s0)
        addi    a5,a5,1
        sw      a5,-20(s0)
.L2:
        lw      a4,-20(s0)
        lw      a5,-36(s0)
        blt     a4,a5,.L3
.LBE2:
        lw      a5,-36(s0)
        slli    a5,a5,2
        lw      a4,-40(s0)
        add     a5,a4,a5
        lw      a5,0(a5)
        snez    a5,a5
        andi    a5,a5,0xff
        mv      a0,a5
        lw      ra,44(sp)
        lw      s0,40(sp)
        addi    sp,sp,48
        jr      ra
.LFE0:
        .size   main, .-main
.Letext0:
