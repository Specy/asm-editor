        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .align  2
        .type   skip_line, @function
skip_line:
.LFB0:
        addi    sp,sp,-32
        sd      s0,16(sp)
        sd      s1,8(sp)
        sd      ra,24(sp)
        li      s0,10
        li      s1,-1
        j       .L3
.L7:
        beq     a0,s1,.L1
.L3:
        call    getchar
        bne     a0,s0,.L7
.L1:
        ld      ra,24(sp)
        ld      s0,16(sp)
        ld      s1,8(sp)
        addi    sp,sp,32
        jr      ra
.LFE0:
        .size   skip_line, .-skip_line
        .section        .rodata.str1.8,"aMS",@progbits,1
        .align  3
.LC0:
        .string "%d %d"
        .align  3
.LC1:
        .string "1: r=%d a=%d b=%d\n"
        .align  3
.LC2:
        .string "%i %i %i %i"
        .align  3
.LC3:
        .string "2: r=%d %d %d %d %d\n"
        .align  3
.LC4:
        .string "%x %X %o %u"
        .align  3
.LC5:
        .string "3: r=%d %d %d %d %u\n"
        .align  3
.LC6:
        .string "%3d%2d%d"
        .align  3
.LC7:
        .string "4: r=%d %d %d %d\n"
        .align  3
.LC8:
        .string "%d,%d ; %d"
        .align  3
.LC9:
        .string "5: r=%d %d %d %d\n"
        .align  3
.LC10:
        .string "%*d %d%n"
        .align  3
.LC11:
        .string "6: r=%d a=%d n=%d\n"
        .align  3
.LC12:
        .string "%hhd %hd %ld %lld %llu"
        .align  3
.LC13:
        .string "7: r=%d %d %d %ld %lld %llu\n"
        .align  3
.LC14:
        .string "%d"
        .align  3
.LC15:
        .string "8: r=%d (matching failure), next char '%c'\n"
        .align  3
.LC16:
        .string "%d%d"
        .align  3
.LC17:
        .string "9: r=%d a=%d (partial), next char '%c'\n"
        .align  3
.LC18:
        .string "%u"
        .align  3
.LC19:
        .string "10: r=%d u=%u\n"
        .align  3
.LC20:
        .string " total: %d%%"
        .align  3
.LC21:
        .string "11: r=%d a=%d\n"
        .align  3
.LC22:
        .string "12: r=%d at end\n"
        .align  3
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
        addi    a2,sp,8
        addi    a1,sp,4
        addi    a0,a0,%lo(.LC0)
        sd      ra,72(sp)
        sd      s0,64(sp)
        sd      s1,56(sp)
        sd      s2,48(sp)
        sw      zero,4(sp)
        sw      zero,8(sp)
        sw      zero,12(sp)
        sw      zero,16(sp)
        sw      zero,20(sp)
        call    scanf
        lw      a3,8(sp)
        lw      a2,4(sp)
        mv      a1,a0
        lui     a0,%hi(.LC1)
        addi    a0,a0,%lo(.LC1)
        call    printf
        lui     a0,%hi(.LC2)
        addi    a4,sp,16
        addi    a3,sp,12
        addi    a2,sp,8
        addi    a1,sp,4
        addi    a0,a0,%lo(.LC2)
        call    scanf
        lw      a5,16(sp)
        lw      a4,12(sp)
        lw      a3,8(sp)
        lw      a2,4(sp)
        mv      a1,a0
        lui     a0,%hi(.LC3)
        addi    a0,a0,%lo(.LC3)
        call    printf
        lui     a0,%hi(.LC4)
        addi    a4,sp,20
        addi    a3,sp,12
        addi    a2,sp,8
        addi    a1,sp,4
        addi    a0,a0,%lo(.LC4)
        call    scanf
        lw      a5,20(sp)
        lw      a4,12(sp)
        lw      a3,8(sp)
        lw      a2,4(sp)
        mv      a1,a0
        lui     a0,%hi(.LC5)
        addi    a0,a0,%lo(.LC5)
        call    printf
        lui     a0,%hi(.LC6)
        addi    a3,sp,12
        addi    a2,sp,8
        addi    a1,sp,4
        addi    a0,a0,%lo(.LC6)
        call    scanf
        lw      a4,12(sp)
        lw      a3,8(sp)
        lw      a2,4(sp)
        mv      a1,a0
        lui     a0,%hi(.LC7)
        addi    a0,a0,%lo(.LC7)
        call    printf
        lui     a0,%hi(.LC8)
        addi    a3,sp,12
        addi    a2,sp,8
        addi    a1,sp,4
        addi    a0,a0,%lo(.LC8)
        call    scanf
        lw      a4,12(sp)
        lw      a3,8(sp)
        lw      a2,4(sp)
        mv      a1,a0
        lui     a0,%hi(.LC9)
        addi    a0,a0,%lo(.LC9)
        call    printf
        lui     a0,%hi(.LC10)
        addi    a2,sp,16
        addi    a1,sp,4
        addi    a0,a0,%lo(.LC10)
        call    scanf
        lw      a3,16(sp)
        lw      a2,4(sp)
        mv      a1,a0
        lui     a0,%hi(.LC11)
        addi    a0,a0,%lo(.LC11)
        call    printf
        lui     a0,%hi(.LC12)
        addi    a5,sp,40
        addi    a4,sp,32
        addi    a3,sp,24
        addi    a2,sp,2
        addi    a1,sp,1
        addi    a0,a0,%lo(.LC12)
        sb      zero,1(sp)
        sh      zero,2(sp)
        sd      zero,24(sp)
        sd      zero,32(sp)
        sd      zero,40(sp)
        call    scanf
        ld      a6,40(sp)
        ld      a5,32(sp)
        ld      a4,24(sp)
        lh      a3,2(sp)
        lb      a2,1(sp)
        mv      a1,a0
        lui     a0,%hi(.LC13)
        addi    a0,a0,%lo(.LC13)
        call    printf
        call    skip_line
        lui     s0,%hi(.LC14)
        addi    a1,sp,4
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
        addi    a2,sp,8
        addi    a1,sp,4
        addi    a0,a0,%lo(.LC16)
        sw      zero,8(sp)
        sw      zero,4(sp)
        call    scanf
        lw      s2,4(sp)
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
        addi    a1,sp,20
        addi    a0,a0,%lo(.LC18)
        call    scanf
        lw      a2,20(sp)
        mv      a1,a0
        lui     a0,%hi(.LC19)
        addi    a0,a0,%lo(.LC19)
        call    printf
        lui     a0,%hi(.LC20)
        addi    a1,sp,4
        addi    a0,a0,%lo(.LC20)
        call    scanf
        lw      a2,4(sp)
        mv      a1,a0
        lui     a0,%hi(.LC21)
        addi    a0,a0,%lo(.LC21)
        call    printf
        addi    a1,sp,4
        addi    a0,s0,%lo(.LC14)
        call    scanf
        mv      a1,a0
        lui     a0,%hi(.LC22)
        addi    a0,a0,%lo(.LC22)
        call    printf
        addi    a1,sp,4
        addi    a0,s0,%lo(.LC14)
        call    scanf
        mv      a1,a0
        lui     a0,%hi(.LC23)
        addi    a0,a0,%lo(.LC23)
        call    printf
        ld      ra,72(sp)
        ld      s0,64(sp)
        ld      s1,56(sp)
        ld      s2,48(sp)
        li      a0,0
        addi    sp,sp,80
        jr      ra
.LFE1:
        .size   main, .-main
        .text
.Letext0:
