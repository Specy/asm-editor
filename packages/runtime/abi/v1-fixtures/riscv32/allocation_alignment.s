        .option nopic
        .attribute arch, "rv32i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
.LC0:
        .string "malloc aligned=%d calloc aligned=%d\n"
        .align  2
.LC1:
        .string "realloc aligned=%d\n"
        .align  2
.LC2:
        .string "new aligned=%d array aligned=%d alignas16=%d\n"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB12:
        addi    sp,sp,-32
        li      a0,1
        sw      ra,28(sp)
        sw      s0,24(sp)
        sw      s1,20(sp)
        sw      s2,16(sp)
        sw      s3,12(sp)
        call    malloc
        li      a1,7
        mv      s1,a0
        li      a0,3
        call    calloc
        mv      s0,a0
        li      a1,0
.LBB12:
.LBB13:
        beq     s1,zero,.L2
        andi    a1,s1,15
        seqz    a1,a1
.L2:
.LBE13:
.LBE12:
.LBB14:
.LBB15:
        li      a2,0
        beq     s0,zero,.L3
        andi    a2,s0,15
        seqz    a2,a2
.L3:
.LBE15:
.LBE14:
        lui     a0,%hi(.LC0)
        addi    a0,a0,%lo(.LC0)
        call    printf
        mv      a0,s1
        li      a1,73
        call    realloc
        mv      s1,a0
.LBB16:
.LBB17:
        li      a1,0
        beq     a0,zero,.L4
        andi    a1,a0,15
        seqz    a1,a1
.L4:
.LBE17:
.LBE16:
        lui     a0,%hi(.LC1)
        addi    a0,a0,%lo(.LC1)
        call    printf
        li      a0,16
        call    _Znwj
        mv      s3,a0
        li      a0,48
        call    _Znaj
.LBB18:
.LBB19:
        andi    a3,s3,15
        seqz    a3,a3
.LBE19:
.LBE18:
        mv      s2,a0
.LBB20:
.LBB21:
        andi    a2,a0,15
.LBE21:
.LBE20:
        lui     a0,%hi(.LC2)
        mv      a1,a3
        seqz    a2,a2
        addi    a0,a0,%lo(.LC2)
        call    printf
        mv      a0,s1
        call    free
        mv      a0,s0
        call    free
        mv      a0,s3
        li      a1,16
        call    _ZdlPvj
        mv      a0,s2
        call    _ZdaPv
        lw      ra,28(sp)
        lw      s0,24(sp)
        lw      s1,20(sp)
        lw      s2,16(sp)
        lw      s3,12(sp)
        li      a0,0
        addi    sp,sp,32
        jr      ra
.LFE12:
        .size   main, .-main
        .text
.Letext0:
