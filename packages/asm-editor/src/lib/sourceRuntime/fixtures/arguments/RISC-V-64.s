        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata
        .align  3
.LC0:
        .string "argc=%d\n"
        .align  3
.LC1:
        .string "argv[%d]=%s\n"
        .text
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB0:
        addi    sp,sp,-48
        sd      ra,40(sp)
        sd      s0,32(sp)
        addi    s0,sp,48
        mv      a5,a0
        sd      a1,-48(s0)
        sw      a5,-36(s0)
        lw      a5,-36(s0)
        mv      a1,a5
        lui     a5,%hi(.LC0)
        addi    a0,a5,%lo(.LC0)
        call    printf
.LBB2:
        sw      zero,-20(s0)
        j       .L2
.L3:
        lw      a5,-20(s0)
        slli    a5,a5,3
        ld      a4,-48(s0)
        add     a5,a4,a5
        ld      a4,0(a5)
        lw      a5,-20(s0)
        mv      a2,a4
        mv      a1,a5
        lui     a5,%hi(.LC1)
        addi    a0,a5,%lo(.LC1)
        call    printf
        lw      a5,-20(s0)
        addiw   a5,a5,1
        sw      a5,-20(s0)
.L2:
        lw      a5,-20(s0)
        mv      a4,a5
        lw      a5,-36(s0)
        sext.w  a4,a4
        sext.w  a5,a5
        blt     a4,a5,.L3
.LBE2:
        lw      a5,-36(s0)
        slli    a5,a5,3
        ld      a4,-48(s0)
        add     a5,a4,a5
        ld      a5,0(a5)
        snez    a5,a5
        andi    a5,a5,0xff
        sext.w  a5,a5
        mv      a0,a5
        ld      ra,40(sp)
        ld      s0,32(sp)
        addi    sp,sp,48
        jr      ra
.LFE0:
        .size   main, .-main
.Letext0:
