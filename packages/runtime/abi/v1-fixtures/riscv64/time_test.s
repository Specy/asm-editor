        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.8,"aMS",@progbits,1
        .align  3
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
        addi    sp,sp,-48
        mv      a1,a0
        lui     a0,%hi(.LC1)
        sd      t5,16(sp)
        sd      t4,8(sp)
        sd      t3,0(sp)
        addiw   a3,a3,1
        addiw   a2,a2,1900
        addi    a0,a0,%lo(.LC1)
        sd      ra,40(sp)
        call    printf
        ld      ra,40(sp)
        addi    sp,sp,48
        jr      ra
.LFE0:
        .size   show, .-show
        .section        .rodata.str1.8
        .align  3
.LC2:
        .string "time plausible=%d stored equals returned=%d\n"
        .align  3
.LC3:
        .string "time(NULL) not before=%d\n"
        .align  3
.LC4:
        .string "clock non-decreasing=%d CLOCKS_PER_SEC=%ld\n"
        .align  3
.LC5:
        .string "difftime=%g %g\n"
        .align  3
.LC6:
        .string "gmtime(%lld)"
        .align  3
.LC7:
        .string "localtime"
        .align  3
.LC8:
        .string "mktime=%lld\n"
        .align  3
.LC9:
        .string "normalized"
        .align  3
.LC10:
        .string "mktime(gmtime(now)) == now: %d\n"
        .align  3
.LC11:
        .string "y2k=%lld\n"
        .align  3
.LC12:
        .string "month 13"
        .align  3
.LC13:
        .string "asctime: %s"
        .align  3
.LC14:
        .string "ctime: %s"
        .section        .rodata
        .align  3
.LC0:
        .dword  0
        .dword  86399
        .dword  951782400
        .dword  951868800
        .dword  1234567890
        .dword  2147483647
        .dword  2147483648
        .dword  4102444800
        .dword  -86400
        .dword  -2208988800
        .dword  253402300799
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB1:
        addi    sp,sp,-352
        addi    a0,sp,8
        sd      ra,344(sp)
        sd      s0,336(sp)
        sd      s1,328(sp)
        fsd     fs0,312(sp)
        sd      zero,8(sp)
        call    time
        ld      a4,8(sp)
        li      a1,946683904
        mv      a5,a0
        sub     a4,a4,a0
        addi    a1,a1,895
        lui     a0,%hi(.LC2)
        seqz    a2,a4
        sgt     a1,a5,a1
        addi    a0,a0,%lo(.LC2)
        sd      a5,16(sp)
        call    printf
        li      a0,0
        call    time
        ld      a4,16(sp)
        mv      a5,a0
        lui     a0,%hi(.LC3)
        slt     a5,a5,a4
        xori    a1,a5,1
        addi    a0,a0,%lo(.LC3)
        call    printf
        call    clock
.LBB2:
        li      a4,200704
.LBE2:
        sd      zero,24(sp)
        mv      s0,a0
.LBB3:
        addi    a4,a4,-704
        li      a5,0
.L5:
        fld     fa4,24(sp)
        fcvt.d.w        fa5,a5
        addiw   a5,a5,1
        fadd.d  fa5,fa5,fa4
        fsd     fa5,24(sp)
        bne     a5,a4,.L5
.LBE3:
        call    clock
        li      a1,0
        bgt     s0,a0,.L6
        not     s0,s0
        srli    a1,s0,63
.L6:
        li      a2,999424
        lui     a0,%hi(.LC4)
        addi    a2,a2,576
        addi    a0,a0,%lo(.LC4)
        call    printf
        li      a1,3
        li      a0,10
        call    difftime
        fmv.d   fs0,fa0
        li      a1,86016
        addi    a1,a1,384
        li      a0,0
        call    difftime
        fmv.x.d a2,fa0
        fmv.x.d a1,fs0
        lui     a0,%hi(.LC5)
        addi    a0,a0,%lo(.LC5)
        call    printf
        lui     a5,%hi(.LC0)
        addi    a5,a5,%lo(.LC0)
        ld      t4,0(a5)
        ld      t3,8(a5)
        ld      t1,16(a5)
        ld      a7,24(a5)
        ld      a6,32(a5)
        ld      a0,40(a5)
        ld      a1,48(a5)
        ld      a2,56(a5)
        ld      a3,64(a5)
        ld      a4,72(a5)
        ld      a5,80(a5)
        sd      t4,216(sp)
        sd      t3,224(sp)
        sd      t1,232(sp)
        sd      a7,240(sp)
        sd      a6,248(sp)
        sd      a0,256(sp)
        sd      a1,264(sp)
        sd      a2,272(sp)
        sd      a3,280(sp)
        sd      a4,288(sp)
        sd      a5,296(sp)
        addi    s0,sp,216
        lui     s1,%hi(.LC6)
.L7:
.LBB4:
.LBB5:
        ld      a3,0(s0)
        addi    a2,s1,%lo(.LC6)
        li      a1,32
        addi    a0,sp,176
        call    snprintf
        mv      a0,s0
        call    gmtime
        mv      a1,a0
        addi    a0,sp,176
        call    show
.LBE5:
        addi    s0,s0,8
        addi    a5,sp,304
        bne     s0,a5,.L7
.LBE4:
        li      a5,1699999744
        addi    a5,a5,256
        addi    a0,sp,32
        sd      a5,32(sp)
        call    localtime
        mv      a1,a0
        lui     a0,%hi(.LC7)
        addi    a0,a0,%lo(.LC7)
        call    show
        li      a5,61
        li      a3,-15
        slli    a5,a5,32
        li      a4,31
        slli    a3,a3,33
        addi    a5,a5,25
        slli    a4,a4,34
        li      a2,-1
        addi    a0,sp,56
        sd      a3,56(sp)
        sd      a5,64(sp)
        sd      a4,72(sp)
        sw      a2,88(sp)
        sd      zero,80(sp)
        call    mktime
        mv      a1,a0
        lui     a0,%hi(.LC8)
        addi    a0,a0,%lo(.LC8)
        call    printf
        lui     a0,%hi(.LC9)
        addi    a1,sp,56
        addi    a0,a0,%lo(.LC9)
        call    show
        addi    a0,sp,16
        call    gmtime
        lw      t3,0(a0)
        lw      t1,4(a0)
        lw      a7,8(a0)
        lw      a6,12(a0)
        lw      a2,20(a0)
        lw      a3,24(a0)
        lw      a1,16(a0)
        lw      a4,28(a0)
        lw      a5,32(a0)
        addi    a0,sp,96
        sw      t3,96(sp)
        sw      t1,100(sp)
        sw      a7,104(sp)
        sw      a6,108(sp)
        sw      a2,116(sp)
        sw      a3,120(sp)
        sw      a1,112(sp)
        sw      a4,124(sp)
        sw      a5,128(sp)
        call    mktime
        ld      a5,16(sp)
        mv      a4,a0
        lui     a0,%hi(.LC10)
        sub     a5,a5,a4
        seqz    a1,a5
        addi    a0,a0,%lo(.LC10)
        call    printf
        li      a5,100
        sd      zero,144(sp)
        sd      zero,152(sp)
        li      s0,1
        addi    a0,sp,136
        sw      a5,156(sp)
        sw      s0,148(sp)
        sd      zero,136(sp)
        sd      zero,160(sp)
        sw      zero,168(sp)
        call    mktime
        mv      a1,a0
        lui     a0,%hi(.LC11)
        addi    a0,a0,%lo(.LC11)
        call    printf
        li      a5,99
        slli    a5,a5,32
        addi    a5,a5,13
        sd      zero,184(sp)
        addi    a0,sp,176
        sd      a5,192(sp)
        sw      s0,188(sp)
        sd      zero,176(sp)
        sd      zero,200(sp)
        sw      zero,208(sp)
        call    mktime
        lui     a0,%hi(.LC12)
        addi    a1,sp,176
        addi    a0,a0,%lo(.LC12)
        call    show
        addi    a0,sp,40
        sd      zero,40(sp)
        call    gmtime
        call    asctime
        mv      a1,a0
        lui     a0,%hi(.LC13)
        addi    a0,a0,%lo(.LC13)
        call    printf
        li      a5,951783424
        addi    a5,a5,-1024
        addi    a0,sp,48
        sd      a5,48(sp)
        call    ctime
        mv      a1,a0
        lui     a0,%hi(.LC14)
        addi    a0,a0,%lo(.LC14)
        call    printf
        ld      ra,344(sp)
        ld      s0,336(sp)
        ld      s1,328(sp)
        fld     fs0,312(sp)
        li      a0,0
        addi    sp,sp,352
        jr      ra
.LFE1:
        .size   main, .-main
        .text
.Letext0:
