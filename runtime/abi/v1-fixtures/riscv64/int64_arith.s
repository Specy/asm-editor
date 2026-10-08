        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.8,"aMS",@progbits,1
        .align  3
.LC0:
        .string "%lld / %lld = %lld r %lld\n"
        .align  3
.LC1:
        .string "%llu / %llu = %llu r %llu\n"
        .align  3
.LC2:
        .string "%llx << %d = %llx, >> = %llx, sar = %lld\n"
        .align  3
.LC3:
        .string "%lld * 3 = %lld, * itself = %lld, to double %.17g, to float %.9g\n"
        .align  3
.LC4:
        .string "%llu to double %.17g to float %.9g popcount=%d clz=%d ctz=%d bswap=%llx\n"
        .align  3
.LC5:
        .string "%.17g to int64 %lld"
        .align  3
.LC7:
        .string " to uint64 %llu"
        .align  3
.LC8:
        .string " float to int64 %lld\n"
        .align  3
.LC9:
        .string "32-bit: popcount=%d clz=%d ctz=%d bswap=%x\n"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB0:
        addi    sp,sp,-96
        sd      s1,72(sp)
        sd      s6,32(sp)
        lui     s1,%hi(sv)
.LBB2:
.LBB3:
.LBB4:
        li      s6,-1
.LBE4:
.LBE3:
.LBE2:
        sd      s3,56(sp)
        sd      s4,48(sp)
        sd      s5,40(sp)
        sd      s7,24(sp)
        sd      ra,88(sp)
        sd      s0,80(sp)
        sd      s2,64(sp)
        sd      s8,16(sp)
        fsd     fs0,8(sp)
        fsd     fs1,0(sp)
        addi    s1,s1,%lo(sv)
.LBB11:
.LBB9:
.LBB5:
        slli    s5,s6,63
.LBE5:
.LBE9:
        li      s7,0
.LBB10:
.LBB6:
        lui     s4,%hi(.LC0)
.LBE6:
        li      s3,14
.L2:
        slli    s2,s7,3
.LBB7:
        add     s2,s1,s2
.LBE7:
        li      s0,0
.L5:
.LBB8:
        slli    a5,s0,3
        add     a5,s1,a5
        ld      a3,0(s2)
        ld      a5,0(a5)
        addi    a0,s4,%lo(.LC0)
        mv      a1,a3
        mv      a2,a5
        beq     a5,zero,.L3
        bne     a3,s5,.L4
        beq     a5,s6,.L3
.L4:
        rem     a4,a3,a5
        div     a3,a3,a5
        call    printf
.L3:
.LBE8:
        addiw   s0,s0,1
        bne     s0,s3,.L5
.LBE10:
        addiw   s7,s7,1
        bne     s7,s0,.L2
        lui     s2,%hi(uv)
        addi    s2,s2,%lo(uv)
.LBE11:
.LBB12:
        li      s6,0
.LBB13:
.LBB14:
        lui     s5,%hi(.LC1)
.LBE14:
        li      s4,10
.L6:
        slli    s3,s6,3
.LBB15:
        add     s3,s2,s3
.LBE15:
        li      s0,0
.L8:
.LBB16:
        slli    a5,s0,3
        add     a5,s2,a5
        ld      a3,0(s3)
        ld      a5,0(a5)
        addi    a0,s5,%lo(.LC1)
        mv      a1,a3
        mv      a2,a5
        beq     a5,zero,.L7
        remu    a4,a3,a5
        divu    a3,a3,a5
        call    printf
.L7:
.LBE16:
        addiw   s0,s0,1
        bne     s0,s4,.L8
.LBE13:
        addiw   s6,s6,1
        bne     s6,s0,.L6
        lui     s4,%hi(shifts)
        addi    s4,s4,%lo(shifts)
.LBE12:
.LBB17:
        li      s7,0
        lui     s6,%hi(.LC2)
.LBB18:
        li      s5,7
.LBE18:
        li      s8,10
.L9:
        slli    s3,s7,3
.LBB22:
.LBB19:
        add     s3,s2,s3
.LBE19:
        li      s0,0
.L10:
.LBB20:
        slli    a5,s0,2
        add     a5,s4,a5
        lw      a2,0(a5)
        ld      a1,0(s3)
        addi    a0,s6,%lo(.LC2)
.LBE20:
        addiw   s0,s0,1
.LBB21:
        sra     a5,a1,a2
        srl     a4,a1,a2
        sll     a3,a1,a2
        call    printf
.LBE21:
        bne     s0,s5,.L10
.LBE22:
        addiw   s7,s7,1
        bne     s7,s8,.L9
.LBE17:
.LBB23:
        li      s0,0
        lui     s4,%hi(.LC3)
        li      s3,14
.L11:
.LBB24:
        slli    a5,s0,3
        add     a5,s1,a5
        ld      a1,0(a5)
        addi    a0,s4,%lo(.LC3)
.LBE24:
        addiw   s0,s0,1
.LBB25:
        mul     a3,a1,a1
        fcvt.s.l        fa5,a1
        fcvt.d.l        fa4,a1
        slli    a2,a1,1
        fcvt.d.s        fa5,fa5
        fmv.x.d a4,fa4
        add     a2,a2,a1
        fmv.x.d a5,fa5
        call    printf
.LBE25:
        bne     s0,s3,.L11
.LBE23:
.LBB26:
        li      s1,0
        lui     s7,%hi(.LC4)
        li      s6,10
.L13:
.LBB27:
        slli    a5,s1,3
        add     a5,s2,a5
        ld      s0,0(a5)
        li      s4,-1
        mv      s5,s4
        fcvt.s.lu       fa5,s0
        mv      a0,s0
        fcvt.d.lu       fs1,s0
        fcvt.d.s        fs0,fa5
        call    __popcountdi2
        sext.w  s3,a0
        mv      a0,s0
        beq     s0,zero,.L12
        call    __clzdi2
        sext.w  s4,a0
        mv      a0,s0
        call    __ctzdi2
        sext.w  s5,a0
.L12:
        mv      a0,s0
        call    __bswapdi2
        fmv.x.d a3,fs0
        fmv.x.d a2,fs1
        mv      a7,a0
        mv      a6,s5
        mv      a5,s4
        mv      a4,s3
        mv      a1,s0
        addi    a0,s7,%lo(.LC4)
.LBE27:
        addiw   s1,s1,1
.LBB28:
        call    printf
.LBE28:
        bne     s1,s6,.L13
        lui     a5,%hi(.LC6)
.LBE26:
.LBB29:
.LBB30:
        fld     fs1,%lo(.LC6)(a5)
        lui     s1,%hi(dv)
        addi    s1,s1,%lo(dv)
.LBE30:
        li      s0,0
        lui     s5,%hi(.LC5)
        lui     s4,%hi(.LC8)
.LBB31:
        lui     s3,%hi(.LC7)
.LBE31:
        li      s2,13
.L16:
.LBB32:
        slli    a4,s0,32
        srli    a5,a4,29
        add     a5,s1,a5
        fld     fs0,0(a5)
        addi    a0,s5,%lo(.LC5)
        fcvt.l.d a2,fs0,rtz
        fmv.x.d a1,fs0
        call    printf
        fgt.d   a5,fs0,fs1
        addi    a0,s3,%lo(.LC7)
        beq     a5,zero,.L14
        fcvt.lu.d a1,fs0,rtz
        call    printf
.L14:
        fcvt.s.d        fs0,fs0
        addi    a0,s4,%lo(.LC8)
.LBE32:
        addiw   s0,s0,1
.LBB33:
        fcvt.l.s a1,fs0,rtz
        call    printf
.LBE33:
        bne     s0,s2,.L16
.LBE29:
        li      a4,16838656
        lui     a0,%hi(.LC9)
        addi    a4,a4,128
        addi    a0,a0,%lo(.LC9)
        li      a3,0
        li      a2,0
        li      a1,6
        call    printf
        ld      ra,88(sp)
        ld      s0,80(sp)
        ld      s1,72(sp)
        ld      s2,64(sp)
        ld      s3,56(sp)
        ld      s4,48(sp)
        ld      s5,40(sp)
        ld      s6,32(sp)
        ld      s7,24(sp)
        ld      s8,16(sp)
        fld     fs0,8(sp)
        fld     fs1,0(sp)
        li      a0,0
        addi    sp,sp,96
        jr      ra
.LFE0:
        .size   main, .-main
        .data
        .align  3
        .type   shifts, @object
        .size   shifts, 28
shifts:
        .word   0
        .word   1
        .word   7
        .word   31
        .word   32
        .word   33
        .word   63
        .align  3
        .type   dv, @object
        .size   dv, 104
dv:
        .word   0
        .word   0
        .word   0
        .word   1071644672
        .word   0
        .word   -1075838976
        .word   0
        .word   1073217536
        .word   0
        .word   -1074266112
        .word   524288
        .word   1106247680
        .word   524288
        .word   -1041235968
        .word   0
        .word   1128267776
        .word   1733216256
        .word   1135329645
        .word   1733216256
        .word   -1012154003
        .word   -798530048
        .word   1138748221
        .word   -798530048
        .word   -1008735427
        .word   1475522593
        .word   1100836660
        .align  3
        .type   uv, @object
        .size   uv, 80
uv:
        .dword  0
        .dword  1
        .dword  2
        .dword  10
        .dword  4294967295
        .dword  4294967296
        .dword  -2401053089206453570
        .dword  -1
        .dword  1000000000000000000
        .dword  -6101065172474983726
        .align  3
        .type   sv, @object
        .size   sv, 112
sv:
        .dword  0
        .dword  1
        .dword  -1
        .dword  7
        .dword  -7
        .dword  1000000007
        .dword  -1000000007
        .dword  4294967296
        .dword  -4294967297
        .dword  9223372036854775807
        .dword  -9223372036854775808
        .dword  81985529216486895
        .dword  -81985529216486895
        .dword  999999999999
        .section        .srodata.cst8,"aM",@progbits,8
        .align  3
.LC6:
        .word   0
        .word   -1074790400
        .text
.Letext0:
