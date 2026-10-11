        .option nopic
        .attribute arch, "rv32i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
.LC0:
        .string "%lld / %lld = %lld r %lld\n"
        .align  2
.LC1:
        .string "%llu / %llu = %llu r %llu\n"
        .align  2
.LC2:
        .string "%llx << %d = %llx, >> = %llx, sar = %lld\n"
        .align  2
.LC3:
        .string "%lld * 3 = %lld, * itself = %lld, to double %.17g, to float %.9g\n"
        .align  2
.LC4:
        .string "%llu to double %.17g to float %.9g popcount=%d clz=%d ctz=%d bswap=%llx\n"
        .align  2
.LC5:
        .string "%.17g to int64 %lld"
        .align  2
.LC7:
        .string " to uint64 %llu"
        .align  2
.LC8:
        .string " float to int64 %lld\n"
        .align  2
.LC9:
        .string "32-bit: popcount=%d clz=%d ctz=%d bswap=%x\n"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB0:
        addi    sp,sp,-128
        sw      s3,108(sp)
        lui     s3,%hi(sv)
        sw      s4,104(sp)
        sw      s5,100(sp)
        sw      s8,88(sp)
        sw      ra,124(sp)
        sw      s0,120(sp)
        sw      s1,116(sp)
        sw      s2,112(sp)
        sw      s6,96(sp)
        sw      s7,92(sp)
        sw      s9,84(sp)
        sw      s10,80(sp)
        sw      s11,76(sp)
        fsd     fs0,56(sp)
        fsd     fs1,48(sp)
        addi    s3,s3,%lo(sv)
.LBB2:
        sw      zero,32(sp)
.LBB3:
.LBB4:
        lui     s5,%hi(.LC0)
        li      s8,-1
.LBE4:
        li      s4,14
.L2:
        lw      a5,32(sp)
        li      s11,0
        slli    s2,a5,3
.LBB5:
        add     s2,s3,s2
.L7:
        slli    a5,s11,3
        add     a5,s3,a5
        lw      s0,0(s2)
        lw      s1,4(s2)
        lw      s6,0(a5)
        lw      s7,4(a5)
        mv      a0,s0
        mv      a1,s1
        or      a6,s6,s7
        mv      a2,s6
        mv      a3,s7
        beq     a6,zero,.L3
        bne     s0,zero,.L5
        li      a5,-2147483648
        bne     a5,s1,.L5
        beq     s8,s6,.L46
.L5:
        call    __divdi3
        mv      s9,a0
        mv      s10,a1
        mv      a2,s6
        mv      a3,s7
        mv      a0,s0
        mv      a1,s1
        call    __moddi3
        sw      a0,0(sp)
        mv      a6,s9
        mv      a7,s10
        mv      a4,s6
        mv      a5,s7
        mv      a2,s0
        mv      a3,s1
        sw      a1,4(sp)
        addi    a0,s5,%lo(.LC0)
        call    printf
.L3:
.LBE5:
        addi    s11,s11,1
        bne     s11,s4,.L7
.LBE3:
        lw      a5,32(sp)
        addi    a5,a5,1
        sw      a5,32(sp)
        bne     a5,s11,.L2
        lui     s0,%hi(uv)
        addi    s0,s0,%lo(uv)
.LBE2:
.LBB8:
        li      s10,0
.LBB9:
.LBB10:
        lui     s2,%hi(.LC1)
.LBE10:
        li      s6,10
.L8:
        slli    t1,s10,3
.LBB11:
        add     s7,s0,t1
.LBE11:
        li      s1,0
.L11:
.LBB12:
        slli    a5,s1,3
        add     a5,s0,a5
        lw      s8,0(s7)
        lw      s9,4(s7)
        lw      s4,0(a5)
        lw      s5,4(a5)
        mv      a0,s8
        mv      a1,s9
        or      a5,s4,s5
        mv      a2,s4
        mv      a3,s5
        beq     a5,zero,.L9
        call    __udivdi3
        mv      a6,a0
        mv      s11,a1
        mv      a2,s4
        mv      a3,s5
        mv      a0,s8
        mv      a1,s9
        sw      a6,32(sp)
        call    __umoddi3
        lw      a6,32(sp)
        sw      a0,0(sp)
        mv      a7,s11
        mv      a4,s4
        mv      a5,s5
        mv      a2,s8
        mv      a3,s9
        sw      a1,4(sp)
        addi    a0,s2,%lo(.LC1)
        call    printf
.L9:
.LBE12:
        addi    s1,s1,1
        bne     s1,s6,.L11
.LBE9:
        addi    s10,s10,1
        bne     s10,s1,.L8
        lui     s2,%hi(shifts)
        addi    s2,s2,%lo(shifts)
.LBE8:
.LBB13:
        li      s8,0
        lui     s5,%hi(.LC2)
.LBB14:
.LBB15:
        li      s11,31
.LBE15:
        li      s4,7
.LBE14:
        li      s9,10
.L12:
        slli    s1,s8,3
.LBB21:
.LBB16:
        add     s1,s0,s1
.LBE16:
        li      s10,0
        j       .L19
.L48:
.LBB17:
        slli    a1,a3,1
        sub     a0,s11,a4
        sll     a7,a2,a5
        sll     a1,a1,a0
        srl     t1,a2,a4
        blt     a5,zero,.L15
.L49:
        sra     t1,a3,a5
        srai    t3,a3,31
        sub     a0,s11,a4
        slli    a1,a3,1
        sw      t1,8(sp)
        sw      t3,12(sp)
        sll     a1,a1,a0
        srl     a0,a2,a4
        blt     a5,zero,.L17
.L50:
        srl     a0,a3,a5
        li      a5,0
        sw      a0,0(sp)
        sw      a5,4(sp)
        addi    a0,s5,%lo(.LC2)
.LBE17:
        addi    s10,s10,1
.LBB18:
        call    printf
.LBE18:
        beq     s10,s4,.L47
.L19:
.LBB19:
        slli    a5,s10,2
        add     a5,s2,a5
        lw      a4,0(a5)
        lw      a2,0(s1)
        lw      a3,4(s1)
        sub     a0,s11,a4
        srli    a1,a2,1
        addi    a5,a4,-32
        li      a6,0
        srl     a1,a1,a0
        sll     a7,a3,a4
        bge     a5,zero,.L48
        or      a7,a1,a7
        sub     a0,s11,a4
        slli    a1,a3,1
        sll     a6,a2,a4
        sll     a1,a1,a0
        srl     t1,a2,a4
        bge     a5,zero,.L49
.L15:
        or      t1,a1,t1
        sra     t3,a3,a4
        sub     a0,s11,a4
        slli    a1,a3,1
        sw      t1,8(sp)
        sw      t3,12(sp)
        sll     a1,a1,a0
        srl     a0,a2,a4
        bge     a5,zero,.L50
.L17:
        or      a0,a1,a0
        srl     a5,a3,a4
        sw      a0,0(sp)
        sw      a5,4(sp)
        addi    a0,s5,%lo(.LC2)
.LBE19:
        addi    s10,s10,1
.LBB20:
        call    printf
.LBE20:
        bne     s10,s4,.L19
.L47:
.LBE21:
        addi    s8,s8,1
        bne     s8,s9,.L12
.LBE13:
.LBB22:
        li      s10,0
        lui     s8,%hi(.LC3)
        li      s2,14
.L20:
.LBB23:
        slli    a5,s10,3
        add     a5,s3,a5
        lw      s4,0(a5)
        lw      s5,4(a5)
.LBE23:
        addi    s10,s10,1
.LBB24:
        srli    a4,s4,31
        slli    a3,s4,1
        slli    a5,s5,1
        or      a5,a4,a5
        add     s11,a3,s4
        sltu    a3,s11,a3
        add     a5,a5,s5
        mul     s1,s5,s4
        add     s9,a3,a5
        mv      a0,s4
        mv      a1,s5
        mulhu   a5,s4,s4
        slli    s1,s1,1
        mul     s6,s4,s4
        add     s1,s1,a5
        call    __floatdisf
        fcvt.d.s        fa0,fa0
        mv      a0,s4
        mv      a1,s5
        fsd     fa0,8(sp)
        call    __floatdidf
        mv      a7,s1
        mv      a4,s11
        mv      a6,s6
        mv      a5,s9
        mv      a2,s4
        mv      a3,s5
        fsd     fa0,0(sp)
        addi    a0,s8,%lo(.LC3)
        call    printf
.LBE24:
        bne     s10,s2,.L20
.LBE22:
.LBB25:
        li      s1,0
        lui     s10,%hi(.LC4)
        li      s9,10
.L23:
.LBB26:
        slli    a5,s1,3
        add     a5,s0,a5
        lw      s2,0(a5)
        lw      s3,4(a5)
        li      s6,-1
        mv      a0,s2
        mv      a1,s3
        call    __floatundidf
        mv      a0,s2
        mv      a1,s3
        fsd     fa0,32(sp)
        call    __floatundisf
        mv      a1,s3
        mv      a0,s2
        fcvt.d.s        fs0,fa0
        call    __popcountdi2
        or      a4,s2,s3
        mv      s4,a0
        lw      s8,32(sp)
        lw      s5,36(sp)
        mv      a0,s2
        mv      a1,s3
        mv      s11,s6
        beq     a4,zero,.L21
        call    __clzdi2
        mv      s6,a0
        mv      a1,s3
        mv      a0,s2
        call    __ctzdi2
        mv      s11,a0
.L21:
        mv      a0,s2
        mv      a1,s3
        call    __bswapdi2
        fsd     fs0,32(sp)
        sw      s8,40(sp)
        sw      s5,44(sp)
        lw      a6,32(sp)
        lw      a7,36(sp)
        lw      a4,40(sp)
        lw      a5,44(sp)
        sw      a0,16(sp)
        sw      s11,8(sp)
        sw      s6,4(sp)
        sw      s4,0(sp)
        mv      a2,s2
        mv      a3,s3
        sw      a1,20(sp)
        addi    a0,s10,%lo(.LC4)
.LBE26:
        addi    s1,s1,1
.LBB27:
        call    printf
.LBE27:
        bne     s1,s9,.L23
        lui     a5,%hi(.LC6)
.LBE25:
.LBB28:
.LBB29:
        fld     fs1,%lo(.LC6)(a5)
        lui     s1,%hi(dv)
        addi    s1,s1,%lo(dv)
.LBE29:
        li      s0,0
        lui     s4,%hi(.LC5)
        lui     s3,%hi(.LC8)
.LBB30:
        lui     s5,%hi(.LC7)
.LBE30:
        li      s2,13
.L26:
.LBB31:
        slli    a5,s0,3
        add     a5,s1,a5
        fld     fs0,0(a5)
        fmv.d   fa0,fs0
        call    __fixdfdi
        fsd     fs0,32(sp)
        lw      a2,32(sp)
        lw      a3,36(sp)
        mv      a4,a0
        mv      a5,a1
        addi    a0,s4,%lo(.LC5)
        call    printf
        fgt.d   a5,fs0,fs1
        fmv.d   fa0,fs0
        beq     a5,zero,.L24
        call    __fixunsdfdi
        mv      a2,a0
        mv      a3,a1
        addi    a0,s5,%lo(.LC7)
        call    printf
.L24:
        fcvt.s.d        fa0,fs0
.LBE31:
        addi    s0,s0,1
.LBB32:
        call    __fixsfdi
        mv      a2,a0
        mv      a3,a1
        addi    a0,s3,%lo(.LC8)
        call    printf
.LBE32:
        bne     s0,s2,.L26
.LBE28:
        li      a4,16838656
        lui     a0,%hi(.LC9)
        addi    a4,a4,128
        addi    a0,a0,%lo(.LC9)
        li      a3,0
        li      a2,0
        li      a1,6
        call    printf
        lw      ra,124(sp)
        lw      s0,120(sp)
        lw      s1,116(sp)
        lw      s2,112(sp)
        lw      s3,108(sp)
        lw      s4,104(sp)
        lw      s5,100(sp)
        lw      s6,96(sp)
        lw      s7,92(sp)
        lw      s8,88(sp)
        lw      s9,84(sp)
        lw      s10,80(sp)
        lw      s11,76(sp)
        fld     fs0,56(sp)
        fld     fs1,48(sp)
        li      a0,0
        addi    sp,sp,128
        jr      ra
.L46:
.LBB33:
.LBB7:
.LBB6:
        bne     s8,s7,.L5
        j       .L3
.LBE6:
.LBE7:
.LBE33:
.LFE0:
        .size   main, .-main
        .data
        .align  2
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
        .word   0
        .word   0
        .word   1
        .word   0
        .word   2
        .word   0
        .word   10
        .word   0
        .word   -1
        .word   0
        .word   0
        .word   1
        .word   -889275714
        .word   -559038737
        .word   -1
        .word   -1
        .word   -1486618624
        .word   232830643
        .word   -350287150
        .word   -1420514932
        .align  3
        .type   sv, @object
        .size   sv, 112
sv:
        .word   0
        .word   0
        .word   1
        .word   0
        .word   -1
        .word   -1
        .word   7
        .word   0
        .word   -7
        .word   -1
        .word   1000000007
        .word   0
        .word   -1000000007
        .word   -1
        .word   0
        .word   1
        .word   -1
        .word   -2
        .word   -1
        .word   2147483647
        .word   0
        .word   -2147483648
        .word   -1985229329
        .word   19088743
        .word   1985229329
        .word   -19088744
        .word   -727379969
        .word   232
        .section        .srodata.cst8,"aM",@progbits,8
        .align  3
.LC6:
        .word   0
        .word   -1074790400
        .text
.Letext0:
