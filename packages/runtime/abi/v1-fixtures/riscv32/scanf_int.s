        .option nopic
        .attribute arch, "rv32i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .align  2
        .type   skip_line, @function
skip_line:
.LFB0:
        addi    sp,sp,-16
        sw      s0,8(sp)
        sw      s1,4(sp)
        sw      ra,12(sp)
        li      s0,10
        li      s1,-1
        j       .L3
.L7:
        beq     a0,s1,.L1
.L3:
        call    getchar
        bne     a0,s0,.L7
.L1:
        lw      ra,12(sp)
        lw      s0,8(sp)
        lw      s1,4(sp)
        addi    sp,sp,16
        jr      ra
.LFE0:
        .size   skip_line, .-skip_line
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
.LC0:
        .string "%d %d"
        .align  2
.LC1:
        .string "1: r=%d a=%d b=%d\n"
        .align  2
.LC2:
        .string "%i %i %i %i"
        .align  2
.LC3:
        .string "2: r=%d %d %d %d %d\n"
        .align  2
.LC4:
        .string "%x %X %o %u"
        .align  2
.LC5:
        .string "3: r=%d %d %d %d %u\n"
        .align  2
.LC6:
        .string "%3d%2d%d"
        .align  2
.LC7:
        .string "4: r=%d %d %d %d\n"
        .align  2
.LC8:
        .string "%d,%d ; %d"
        .align  2
.LC9:
        .string "5: r=%d %d %d %d\n"
        .align  2
.LC10:
        .string "%*d %d%n"
        .align  2
.LC11:
        .string "6: r=%d a=%d n=%d\n"
        .align  2
.LC12:
        .string "%hhd %hd %ld %lld %llu"
        .align  2
.LC13:
        .string "7: r=%d %d %d %ld %lld %llu\n"
        .align  2
.LC14:
        .string "%d"
        .align  2
.LC15:
        .string "8: r=%d (matching failure), next char '%c'\n"
        .align  2
.LC16:
        .string "%d%d"
        .align  2
.LC17:
        .string "9: r=%d a=%d (partial), next char '%c'\n"
        .align  2
.LC18:
        .string "%u"
        .align  2
.LC19:
        .string "10: r=%d u=%u\n"
        .align  2
.LC20:
        .string " total: %d%%"
        .align  2
.LC21:
        .string "11: r=%d a=%d\n"
        .align  2
.LC22:
        .string "12: r=%d at end\n"
        .align  2
.LC23:
        .string "13: r=%d still at end\n"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB1:
        addi    sp,sp,-80
        lui     a0,%hi(.LC0)
        addi    a2,sp,28
        addi    a1,sp,24
        addi    a0,a0,%lo(.LC0)
        sw      ra,76(sp)
        sw      s0,72(sp)
        sw      s1,68(sp)
        sw      s2,64(sp)
        sw      zero,24(sp)
        sw      zero,28(sp)
        sw      zero,32(sp)
        sw      zero,36(sp)
        sw      zero,40(sp)
        call    scanf
        lw      a3,28(sp)
        lw      a2,24(sp)
        mv      a1,a0
        lui     a0,%hi(.LC1)
        addi    a0,a0,%lo(.LC1)
        call    printf
        lui     a0,%hi(.LC2)
        addi    a4,sp,36
        addi    a3,sp,32
        addi    a2,sp,28
        addi    a1,sp,24
        addi    a0,a0,%lo(.LC2)
        call    scanf
        lw      a5,36(sp)
        lw      a4,32(sp)
        lw      a3,28(sp)
        lw      a2,24(sp)
        mv      a1,a0
        lui     a0,%hi(.LC3)
        addi    a0,a0,%lo(.LC3)
        call    printf
        lui     a0,%hi(.LC4)
        addi    a4,sp,40
        addi    a3,sp,32
        addi    a2,sp,28
        addi    a1,sp,24
        addi    a0,a0,%lo(.LC4)
        call    scanf
        lw      a5,40(sp)
        lw      a4,32(sp)
        lw      a3,28(sp)
        lw      a2,24(sp)
        mv      a1,a0
        lui     a0,%hi(.LC5)
        addi    a0,a0,%lo(.LC5)
        call    printf
        lui     a0,%hi(.LC6)
        addi    a3,sp,32
        addi    a2,sp,28
        addi    a1,sp,24
        addi    a0,a0,%lo(.LC6)
        call    scanf
        lw      a4,32(sp)
        lw      a3,28(sp)
        lw      a2,24(sp)
        mv      a1,a0
        lui     a0,%hi(.LC7)
        addi    a0,a0,%lo(.LC7)
        call    printf
        lui     a0,%hi(.LC8)
        addi    a3,sp,32
        addi    a2,sp,28
        addi    a1,sp,24
        addi    a0,a0,%lo(.LC8)
        call    scanf
        lw      a4,32(sp)
        lw      a3,28(sp)
        lw      a2,24(sp)
        mv      a1,a0
        lui     a0,%hi(.LC9)
        addi    a0,a0,%lo(.LC9)
        call    printf
        lui     a0,%hi(.LC10)
        addi    a2,sp,36
        addi    a1,sp,24
        addi    a0,a0,%lo(.LC10)
        call    scanf
        lw      a3,36(sp)
        lw      a2,24(sp)
        mv      a1,a0
        lui     a0,%hi(.LC11)
        addi    a0,a0,%lo(.LC11)
        call    printf
        lui     a0,%hi(.LC12)
        addi    a5,sp,56
        li      a6,0
        li      a7,0
        addi    a4,sp,48
        addi    a3,sp,44
        addi    a2,sp,22
        addi    a1,sp,21
        addi    a0,a0,%lo(.LC12)
        sw      a6,48(sp)
        sw      a7,52(sp)
        sw      a6,56(sp)
        sw      a7,60(sp)
        sb      zero,21(sp)
        sh      zero,22(sp)
        sw      zero,44(sp)
        call    scanf
        lw      t1,56(sp)
        lw      t2,60(sp)
        lw      a6,48(sp)
        lw      a7,52(sp)
        lw      a4,44(sp)
        lh      a3,22(sp)
        lb      a2,21(sp)
        mv      a1,a0
        lui     a0,%hi(.LC13)
        sw      t1,0(sp)
        sw      t2,4(sp)
        addi    a0,a0,%lo(.LC13)
        call    printf
        call    skip_line
        lui     s0,%hi(.LC14)
        addi    a1,sp,24
        addi    a0,s0,%lo(.LC14)
        call    scanf
        mv      s1,a0
        call    getchar
        mv      a2,a0
        lui     a0,%hi(.LC15)
        mv      a1,s1
        addi    a0,a0,%lo(.LC15)
        call    printf
        call    skip_line
        lui     a0,%hi(.LC16)
        addi    a2,sp,28
        addi    a1,sp,24
        addi    a0,a0,%lo(.LC16)
        sw      zero,28(sp)
        sw      zero,24(sp)
        call    scanf
        lw      s2,24(sp)
        mv      s1,a0
        call    getchar
        mv      a3,a0
        lui     a0,%hi(.LC17)
        mv      a2,s2
        mv      a1,s1
        addi    a0,a0,%lo(.LC17)
        call    printf
        call    skip_line
        lui     a0,%hi(.LC18)
        addi    a1,sp,40
        addi    a0,a0,%lo(.LC18)
        call    scanf
        lw      a2,40(sp)
        mv      a1,a0
        lui     a0,%hi(.LC19)
        addi    a0,a0,%lo(.LC19)
        call    printf
        lui     a0,%hi(.LC20)
        addi    a1,sp,24
        addi    a0,a0,%lo(.LC20)
        call    scanf
        lw      a2,24(sp)
        mv      a1,a0
        lui     a0,%hi(.LC21)
        addi    a0,a0,%lo(.LC21)
        call    printf
        addi    a1,sp,24
        addi    a0,s0,%lo(.LC14)
        call    scanf
        mv      a1,a0
        lui     a0,%hi(.LC22)
        addi    a0,a0,%lo(.LC22)
        call    printf
        addi    a1,sp,24
        addi    a0,s0,%lo(.LC14)
        call    scanf
        mv      a1,a0
        lui     a0,%hi(.LC23)
        addi    a0,a0,%lo(.LC23)
        call    printf
        lw      ra,76(sp)
        lw      s0,72(sp)
        lw      s1,68(sp)
        lw      s2,64(sp)
        li      a0,0
        addi    sp,sp,80
        jr      ra
.LFE1:
        .size   main, .-main
        .text
.Letext0:
