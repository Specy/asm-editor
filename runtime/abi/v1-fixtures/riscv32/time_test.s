        .option nopic
        .attribute arch, "rv32i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
.LC1:
        .string "%s: %04d-%02d-%02d %02d:%02d:%02d wday=%d yday=%d isdst=%d\n"
        .text
        .align  2
        .type   show, @function
show:
.LFB0:
        lw      a3,16(a1)
        lw      a2,20(a1)
        lw      t5,32(a1)
        lw      t4,28(a1)
        lw      t3,24(a1)
        lw      a7,0(a1)
        lw      a6,4(a1)
        lw      a5,8(a1)
        lw      a4,12(a1)
        addi    sp,sp,-32
        mv      a1,a0
        lui     a0,%hi(.LC1)
        sw      t5,8(sp)
        sw      t4,4(sp)
        sw      t3,0(sp)
        addi    a3,a3,1
        addi    a2,a2,1900
        addi    a0,a0,%lo(.LC1)
        sw      ra,28(sp)
        call    printf
        lw      ra,28(sp)
        addi    sp,sp,32
        jr      ra
.LFE0:
        .size   show, .-show
        .section        .rodata.str1.4
        .align  2
.LC2:
        .string "time plausible=%d stored equals returned=%d\n"
        .align  2
.LC3:
        .string "time(NULL) not before=%d\n"
        .align  2
.LC4:
        .string "clock non-decreasing=%d CLOCKS_PER_SEC=%ld\n"
        .align  2
.LC5:
        .string "difftime=%g %g\n"
        .align  2
.LC6:
        .string "gmtime(%lld)"
        .align  2
.LC7:
        .string "localtime"
        .align  2
.LC8:
        .string "mktime=%lld\n"
        .align  2
.LC9:
        .string "normalized"
        .align  2
.LC10:
        .string "mktime(gmtime(now)) == now: %d\n"
        .align  2
.LC11:
        .string "y2k=%lld\n"
        .align  2
.LC12:
        .string "month 13"
        .align  2
.LC13:
        .string "asctime: %s"
        .align  2
.LC14:
        .string "ctime: %s"
        .section        .rodata
        .align  3
.LC0:
        .word   0
        .word   0
        .word   86399
        .word   0
        .word   951782400
        .word   0
        .word   951868800
        .word   0
        .word   1234567890
        .word   0
        .word   2147483647
        .word   0
        .word   -2147483648
        .word   0
        .word   -192522496
        .word   0
        .word   -86400
        .word   -1
        .word   2085978496
        .word   -1
        .word   -769665
        .word   58
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB1:
        addi    sp,sp,-336
        li      a5,0
        li      a6,0
        addi    a0,sp,24
        sw      a5,24(sp)
        sw      ra,332(sp)
        sw      s0,328(sp)
        sw      s1,324(sp)
        sw      s2,320(sp)
        sw      s3,316(sp)
        sw      a6,28(sp)
        call    time
        lw      a3,28(sp)
        lw      a5,24(sp)
        mv      a4,a1
        xor     a3,a3,a1
        xor     a2,a5,a0
        sw      a1,36(sp)
        or      a2,a2,a3
        sw      a0,32(sp)
        seqz    a2,a2
        li      a1,1
        ble     a4,zero,.L18
.L5:
        lui     a0,%hi(.LC2)
        addi    a0,a0,%lo(.LC2)
        call    printf
        li      a0,0
        call    time
        lw      a4,36(sp)
        mv      a5,a1
        li      a1,1
        bgt     a4,a5,.L8
        beq     a4,a5,.L19
.L7:
        lui     a0,%hi(.LC3)
        addi    a0,a0,%lo(.LC3)
        call    printf
        call    clock
.LBB2:
        li      a4,200704
.LBE2:
        sw      zero,40(sp)
        sw      zero,44(sp)
        mv      s2,a0
.LBB3:
        addi    a4,a4,-704
        li      a5,0
.L9:
        fld     fa4,40(sp)
        fcvt.d.w        fa5,a5
        addi    a5,a5,1
        fadd.d  fa5,fa5,fa4
        fsd     fa5,40(sp)
        bne     a5,a4,.L9
.LBE3:
        call    clock
        li      a1,0
        bgt     s2,a0,.L10
        not     s2,s2
        srli    a1,s2,31
.L10:
        li      a2,999424
        lui     a0,%hi(.LC4)
        addi    a2,a2,576
        addi    a0,a0,%lo(.LC4)
        call    printf
        li      a2,3
        li      a3,0
        li      a0,10
        li      a1,0
        call    difftime
        li      a2,86016
        fsd     fa0,8(sp)
        addi    a2,a2,384
        li      a3,0
        li      a0,0
        li      a1,0
        lw      s3,8(sp)
        lw      s2,12(sp)
        call    difftime
        fsd     fa0,8(sp)
        lw      a4,8(sp)
        lw      a5,12(sp)
        lui     a0,%hi(.LC5)
        mv      a3,s2
        mv      a2,s3
        addi    a0,a0,%lo(.LC5)
        call    printf
        lui     a5,%hi(.LC0)
        addi    a5,a5,%lo(.LC0)
        addi    a4,sp,216
        addi    a3,a5,80
.L11:
        lw      a6,0(a5)
        lw      a0,4(a5)
        lw      a1,8(a5)
        lw      a2,12(a5)
        sw      a6,0(a4)
        sw      a0,4(a4)
        sw      a1,8(a4)
        sw      a2,12(a4)
        addi    a5,a5,16
        addi    a4,a4,16
        bne     a5,a3,.L11
        lw      a3,0(a5)
        lw      a5,4(a5)
        addi    s0,sp,216
        sw      a3,0(a4)
        sw      a5,4(a4)
        lui     s1,%hi(.LC6)
.L12:
.LBB4:
.LBB5:
        lw      a5,4(s0)
        lw      a4,0(s0)
        addi    a2,s1,%lo(.LC6)
        li      a1,32
        addi    a0,sp,180
        call    snprintf
        mv      a0,s0
        call    gmtime
        mv      a1,a0
        addi    a0,sp,180
        call    show
.LBE5:
        addi    s0,s0,8
        addi    a5,sp,304
        bne     s0,a5,.L12
.LBE4:
        li      a4,1699999744
        addi    a4,a4,256
        li      a5,0
        addi    a0,sp,48
        sw      a4,48(sp)
        sw      a5,52(sp)
        call    localtime
        mv      a1,a0
        lui     a0,%hi(.LC7)
        addi    a0,a0,%lo(.LC7)
        call    show
        li      a4,-30
        li      a5,-1
        li      a2,61
        li      a3,25
        li      a1,124
        addi    a0,sp,72
        sw      a4,76(sp)
        sw      a5,104(sp)
        sw      a2,84(sp)
        sw      a3,80(sp)
        sw      zero,72(sp)
        sw      zero,88(sp)
        sw      zero,96(sp)
        sw      zero,100(sp)
        sw      a1,92(sp)
        call    mktime
        mv      a2,a0
        lui     a0,%hi(.LC8)
        mv      a3,a1
        addi    a0,a0,%lo(.LC8)
        call    printf
        lui     a0,%hi(.LC9)
        addi    a1,sp,72
        addi    a0,a0,%lo(.LC9)
        call    show
        addi    a0,sp,32
        call    gmtime
        lw      t3,0(a0)
        lw      t1,4(a0)
        lw      a7,8(a0)
        lw      a6,12(a0)
        lw      a2,20(a0)
        lw      a3,24(a0)
        lw      a4,28(a0)
        lw      a5,32(a0)
        lw      a1,16(a0)
        addi    a0,sp,108
        sw      t3,108(sp)
        sw      t1,112(sp)
        sw      a7,116(sp)
        sw      a6,120(sp)
        sw      a2,128(sp)
        sw      a3,132(sp)
        sw      a4,136(sp)
        sw      a5,140(sp)
        sw      a1,124(sp)
        call    mktime
        lw      a5,32(sp)
        lw      a4,36(sp)
        lui     a3,%hi(.LC10)
        xor     a5,a5,a0
        xor     a4,a4,a1
        or      a5,a5,a4
        seqz    a1,a5
        addi    a0,a3,%lo(.LC10)
        call    printf
        li      a5,100
        li      s0,1
        addi    a0,sp,144
        sw      a5,164(sp)
        sw      s0,156(sp)
        sw      zero,144(sp)
        sw      zero,148(sp)
        sw      zero,152(sp)
        sw      zero,160(sp)
        sw      zero,168(sp)
        sw      zero,172(sp)
        sw      zero,176(sp)
        call    mktime
        mv      a2,a0
        lui     a0,%hi(.LC11)
        mv      a3,a1
        addi    a0,a0,%lo(.LC11)
        call    printf
        li      a4,13
        li      a5,99
        addi    a0,sp,180
        sw      a4,196(sp)
        sw      a5,200(sp)
        sw      s0,192(sp)
        sw      zero,180(sp)
        sw      zero,184(sp)
        sw      zero,188(sp)
        sw      zero,204(sp)
        sw      zero,208(sp)
        sw      zero,212(sp)
        call    mktime
        lui     a0,%hi(.LC12)
        addi    a1,sp,180
        addi    a0,a0,%lo(.LC12)
        call    show
        li      a6,0
        li      a5,0
        addi    a0,sp,56
        sw      a6,60(sp)
        sw      a5,56(sp)
        call    gmtime
        call    asctime
        mv      a1,a0
        lui     a0,%hi(.LC13)
        addi    a0,a0,%lo(.LC13)
        call    printf
        li      a4,951783424
        addi    a4,a4,-1024
        li      a5,0
        addi    a0,sp,64
        sw      a4,64(sp)
        sw      a5,68(sp)
        call    ctime
        mv      a1,a0
        lui     a0,%hi(.LC14)
        addi    a0,a0,%lo(.LC14)
        call    printf
        lw      ra,332(sp)
        lw      s0,328(sp)
        lw      s1,324(sp)
        lw      s2,320(sp)
        lw      s3,316(sp)
        li      a0,0
        addi    sp,sp,336
        jr      ra
.L19:
        lw      a5,32(sp)
        bleu    a5,a0,.L7
.L8:
        li      a1,0
        j       .L7
.L18:
        bne     a4,zero,.L6
        li      a5,946683904
        addi    a5,a5,895
        bgtu    a0,a5,.L5
.L6:
        li      a1,0
        j       .L5
.LFE1:
        .size   main, .-main
        .text
.Letext0:
