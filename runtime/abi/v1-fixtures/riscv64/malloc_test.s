        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.8,"aMS",@progbits,1
        .align  3
.LC0:
        .string "malloc(10) non-null=%d aligned8=%d\n"
        .align  3
.LC1:
        .string "abcdefghi"
        .align  3
.LC2:
        .string "grown keeps=%s\n"
        .align  3
.LC3:
        .string "shrunk keeps=%s\n"
        .align  3
.LC4:
        .string "calloc zero sum=%d\n"
        .align  3
.LC5:
        .string "calloc overflow null=%d errno==ENOMEM %d\n"
        .align  3
.LC6:
        .string "malloc huge null=%d errno==ENOMEM %d\n"
        .align  3
.LC7:
        .string "still here"
        .align  3
.LC8:
        .string "realloc huge null=1 errno==ENOMEM %d old=%s\n"
        .align  3
.LC9:
        .string "malloc(0) non-null=%d\n"
        .align  3
.LC10:
        .string "realloc(NULL)=%s\n"
        .align  3
.LC11:
        .string "interleaved corrupted bytes=%d\n"
        .align  3
.LC12:
        .string "repeated alloc/free ok=%d\n"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB2:
        addi    sp,sp,-1712
        li      a5,-1
        sd      a5,0(sp)
        srli    a5,a5,1
        sd      a5,8(sp)
        sd      s1,1688(sp)
        li      a0,10
        li      s1,4
        sd      ra,1704(sp)
        sd      s0,1696(sp)
        sd      s2,1680(sp)
        sd      s3,1672(sp)
        sd      s4,1664(sp)
        sd      s5,1656(sp)
        sd      s6,1648(sp)
        sd      s7,1640(sp)
        sd      s1,16(sp)
        call    malloc
        mv      s0,a0
        lui     a0,%hi(.LC0)
        li      a2,1
        snez    a1,s0
        addi    a0,a0,%lo(.LC0)
        call    printf
        lui     a5,%hi(.LC1)
        addi    a5,a5,%lo(.LC1)
        ld      a4,0(a5)
        lhu     a5,8(a5)
        mv      a0,s0
        sd      a4,0(s0)
        sh      a5,8(s0)
        li      a1,100
        call    realloc
        mv      s0,a0
        lui     a0,%hi(.LC2)
        mv      a1,s0
        addi    a0,a0,%lo(.LC2)
        call    printf
        li      a2,89
        addi    a0,s0,10
        li      a1,120
        call    memset
        mv      a0,s0
        sb      zero,99(s0)
        li      a1,5
        call    realloc
        mv      s0,a0
        lui     a0,%hi(.LC3)
        mv      a1,s0
        sb      zero,4(s0)
        addi    a0,a0,%lo(.LC3)
        call    printf
        mv      a0,s0
        call    free
        mv      a1,s1
        li      a0,1000
        call    calloc
        li      a5,4096
        addi    a3,a5,-96
        mv      s0,a0
        mv      a5,a0
        add     a3,a0,a3
        li      a1,0
.L2:
.LBB25:
        lw      a4,0(a5)
        addi    a5,a5,4
        addw    a1,a4,a1
        bne     a5,a3,.L2
.LBE25:
        lui     a0,%hi(.LC4)
        addi    a0,a0,%lo(.LC4)
        call    printf
.LBB26:
.LBB27:
        lui     s1,%hi(errno)
.LBE27:
.LBE26:
        mv      a0,s0
        call    free
.LBB29:
.LBB28:
        sw      zero,%lo(errno)(s1)
.LBE28:
.LBE29:
        ld      a0,8(sp)
        ld      a1,16(sp)
        call    calloc
        sd      a0,24(sp)
        ld      a1,24(sp)
.LBB30:
.LBB31:
        lw      a5,%lo(errno)(s1)
.LBE31:
.LBE30:
        lui     a0,%hi(.LC5)
        seqz    a1,a1
.LBB33:
.LBB32:
        addi    a5,a5,-12
.LBE32:
.LBE33:
        seqz    a2,a5
        addi    a0,a0,%lo(.LC5)
        call    printf
.LBB34:
.LBB35:
        sw      zero,%lo(errno)(s1)
.LBE35:
.LBE34:
        ld      a0,0(sp)
        call    malloc
        sd      a0,24(sp)
        ld      a1,24(sp)
.LBB36:
.LBB37:
        lw      a5,%lo(errno)(s1)
.LBE37:
.LBE36:
        lui     a0,%hi(.LC6)
        seqz    a1,a1
.LBB39:
.LBB38:
        addi    a5,a5,-12
.LBE38:
.LBE39:
        seqz    a2,a5
        addi    a0,a0,%lo(.LC6)
        call    printf
        li      a0,16
        call    malloc
        lui     a5,%hi(.LC7)
        addi    a5,a5,%lo(.LC7)
.LBB40:
.LBB41:
        sw      zero,%lo(errno)(s1)
.LBE41:
.LBE40:
        ld      a3,0(a5)
        lhu     a4,8(a5)
        ld      a1,0(sp)
        lbu     a5,10(a5)
        li      a2,-4096
        add     a1,a1,a2
        sd      a3,0(a0)
        sh      a4,8(a0)
        sb      a5,10(a0)
        mv      s0,a0
        call    realloc
        beq     a0,zero,.L3
.L21:
        call    free
        li      a0,0
        call    malloc
        mv      s0,a0
        lui     a0,%hi(.LC9)
        snez    a1,s0
        addi    a0,a0,%lo(.LC9)
        call    printf
        mv      a0,s0
        call    free
        li      a0,8
        call    malloc
        li      a5,1936027648
        mv      s0,a0
        addi    a5,a5,614
        li      a4,104
        lui     a0,%hi(.LC10)
        mv      a1,s0
        sw      a5,0(s0)
        sh      a4,4(s0)
        addi    a0,a0,%lo(.LC10)
        call    printf
        mv      a0,s0
        addi    s1,sp,32
.LBB42:
.LBB43:
        li      s4,458129408
.LBE43:
.LBE42:
        call    free
        mv      s3,s1
.LBB49:
.LBB44:
        addi    s4,s4,437
.LBE44:
.LBE49:
        li      s7,0
.LBB50:
        li      s2,0
.LBB45:
        li      s6,300
.LBE45:
        li      s5,200
.L5:
.LBB46:
        slli    s0,s7,32
        srli    s0,s0,32
        mul     s0,s0,s4
.LBE46:
        addi    s3,s3,8
.LBB47:
        srli    s0,s0,37
        mulw    s0,s6,s0
        subw    s0,s7,s0
        addiw   s0,s0,1
        mv      a0,s0
        call    malloc
        mv      a1,s2
        sd      a0,-8(s3)
        mv      a2,s0
.LBE47:
        addiw   s2,s2,1
.LBB48:
        call    memset
.LBE48:
        addiw   s7,s7,37
        bne     s2,s5,.L5
        mv      s0,s1
.L6:
.LBE50:
.LBB51:
        ld      a0,0(s0)
        addi    s0,s0,16
        call    free
        addi    a5,sp,1632
        bne     s0,a5,.L6
.LBE51:
.LBB52:
.LBB53:
        li      a7,458129408
        addi    a7,a7,437
        addi    a6,sp,40
.LBE53:
.LBE52:
.LBB57:
        li      a0,37
.LBE57:
.LBB58:
        li      a1,1
.LBE58:
        li      s0,0
.LBB59:
.LBB55:
        li      t3,300
.LBE55:
        li      t1,201
.L8:
.LBB56:
        slli    a3,a0,32
        srli    a3,a3,32
        mul     a3,a3,a7
        ld      a4,0(a6)
        srli    a3,a3,37
        mulw    a3,t3,a3
        subw    a3,a0,a3
        add     a3,a3,a4
.L7:
.LBB54:
        lbu     a5,0(a4)
        mv      a2,a4
        addi    a4,a4,1
        sub     a5,a5,a1
        snez    a5,a5
        addw    s0,a5,s0
        bne     a3,a2,.L7
.LBE54:
.LBE56:
        addiw   a1,a1,2
        addiw   a0,a0,74
        addi    a6,a6,16
        bne     a1,t1,.L8
        mv      s2,s1
.L9:
.LBE59:
.LBB60:
        li      a0,64
        call    malloc
        sd      a0,0(s2)
        addi    a5,sp,1632
        addi    s2,s2,16
        bne     s2,a5,.L9
.L10:
.LBE60:
.LBB61:
        ld      a0,0(s1)
        addi    s1,s1,8
        call    free
        addi    a5,sp,1632
        bne     s1,a5,.L10
.LBE61:
        lui     a0,%hi(.LC11)
        mv      a1,s0
        addi    a0,a0,%lo(.LC11)
        call    printf
        li      s0,1000
        li      s1,0
.L11:
.LBB62:
.LBB63:
        li      a0,1000
        call    malloc
        snez    a5,a0
.LBE63:
        addiw   s0,s0,-1
.LBB64:
        addw    s1,a5,s1
        call    free
.LBE64:
        bne     s0,zero,.L11
.LBE62:
        lui     a0,%hi(.LC12)
        mv      a1,s1
        addi    a0,a0,%lo(.LC12)
        call    printf
        ld      ra,1704(sp)
        ld      s0,1696(sp)
        ld      s1,1688(sp)
        ld      s2,1680(sp)
        ld      s3,1672(sp)
        ld      s4,1664(sp)
        ld      s5,1656(sp)
        ld      s6,1648(sp)
        ld      s7,1640(sp)
        li      a0,0
        addi    sp,sp,1712
        jr      ra
.L3:
.LBB65:
.LBB66:
        lw      a5,%lo(errno)(s1)
.LBE66:
.LBE65:
        lui     a0,%hi(.LC8)
        addi    a0,a0,%lo(.LC8)
.LBB68:
.LBB67:
        addi    a5,a5,-12
.LBE67:
.LBE68:
        seqz    a1,a5
        mv      a2,s0
        call    printf
        mv      a0,s0
        j       .L21
.LFE2:
        .size   main, .-main
        .text
.Letext0:
