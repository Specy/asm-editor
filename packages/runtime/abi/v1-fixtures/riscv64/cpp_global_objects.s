        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata._ZN6TracerD2Ev.str1.8,"aMS",@progbits,1
        .align  3
.LC0:
        .string "destroy %s\n"
        .section        .text._ZN6TracerD2Ev,"axG",@progbits,_ZN6TracerD5Ev,comdat
        .align  2
        .weak   _ZN6TracerD2Ev
        .type   _ZN6TracerD2Ev, @function
_ZN6TracerD2Ev:
.LFB10:
.LBB23:
        ld      a1,0(a0)
        lui     a0,%hi(.LC0)
        addi    a0,a0,%lo(.LC0)
        tail    printf
.LBE23:
.LFE10:
        .size   _ZN6TracerD2Ev, .-_ZN6TracerD2Ev
        .weak   _ZN6TracerD1Ev
        .set    _ZN6TracerD1Ev,_ZN6TracerD2Ev
        .section        .rodata.str1.8,"aMS",@progbits,1
        .align  3
.LC1:
        .string "atexit handler"
        .text
        .align  2
        .type   _ZL7handlerv, @function
_ZL7handlerv:
.LFB12:
        lui     a0,%hi(.LC1)
        addi    a0,a0,%lo(.LC1)
        tail    puts
.LFE12:
        .size   _ZL7handlerv, .-_ZL7handlerv
        .section        .rodata.str1.8
        .align  3
.LC2:
        .string "function-local static"
        .align  3
.LC3:
        .string "construct %s\n"
        .text
        .align  2
        .type   _ZL5localv.part.0, @function
_ZL5localv.part.0:
.LFB17:
        addi    sp,sp,-16
.LBB24:
.LBB25:
.LBB26:
        lui     a1,%hi(.LC2)
        lui     a0,%hi(.LC3)
.LBE26:
.LBE25:
.LBE24:
        sd      s0,0(sp)
.LBB31:
.LBB29:
.LBB27:
        addi    a5,a1,%lo(.LC2)
        lui     s0,%hi(_ZZL5localvE1t)
        addi    a1,a1,%lo(.LC2)
        addi    a0,a0,%lo(.LC3)
.LBE27:
.LBE29:
.LBE31:
        sd      ra,8(sp)
.LBB32:
.LBB30:
.LBB28:
        sd      a5,%lo(_ZZL5localvE1t)(s0)
        call    printf
.LBE28:
.LBE30:
.LBE32:
        addi    a1,s0,%lo(_ZZL5localvE1t)
        ld      s0,0(sp)
        ld      ra,8(sp)
        lui     a5,%hi(_ZGVZL5localvE1t)
        li      a4,1
        lui     a2,%hi(__dso_handle)
        lui     a0,%hi(_ZN6TracerD1Ev)
        sb      a4,%lo(_ZGVZL5localvE1t)(a5)
        addi    a2,a2,%lo(__dso_handle)
        addi    a0,a0,%lo(_ZN6TracerD1Ev)
        addi    sp,sp,16
        tail    __cxa_atexit
.LFE17:
        .size   _ZL5localv.part.0, .-_ZL5localv.part.0
        .section        .rodata.str1.8
        .align  3
.LC4:
        .string "main starts, initializer returned %d\n"
        .align  3
.LC5:
        .string "main returns"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB14:
        lui     a5,%hi(_ZL17initialized_value)
        lw      a1,%lo(_ZL17initialized_value)(a5)
        lui     a0,%hi(.LC4)
        addi    sp,sp,-16
        addi    a0,a0,%lo(.LC4)
        sd      ra,8(sp)
        sd      s0,0(sp)
        call    printf
        lui     a0,%hi(_ZL7handlerv)
        addi    a0,a0,%lo(_ZL7handlerv)
        call    atexit
.LBB33:
.LBB34:
        lui     s0,%hi(_ZGVZL5localvE1t)
        lbu     a5,%lo(_ZGVZL5localvE1t)(s0)
        beq     a5,zero,.L11
.L8:
.LBE34:
.LBE33:
        lui     a0,%hi(.LC5)
        addi    a0,a0,%lo(.LC5)
        call    puts
        ld      ra,8(sp)
        ld      s0,0(sp)
        li      a0,0
        addi    sp,sp,16
        jr      ra
.L11:
.LBB36:
.LBB35:
        call    _ZL5localv.part.0
.LBE35:
.LBE36:
.LBB37:
.LBB38:
        lbu     a5,%lo(_ZGVZL5localvE1t)(s0)
        bne     a5,zero,.L8
        call    _ZL5localv.part.0
        j       .L8
.LBE38:
.LBE37:
.LFE14:
        .size   main, .-main
        .section        .rodata.str1.8
        .align  3
.LC6:
        .string "global first"
        .align  3
.LC7:
        .string "global second"
        .align  3
.LC8:
        .string "dynamic initializer of an int\n"
        .align  3
.LC9:
        .string "global third, defined after main"
        .section        .text.startup
        .align  2
        .type   _GLOBAL__sub_I_first, @function
_GLOBAL__sub_I_first:
.LFB16:
        addi    sp,sp,-48
        sd      s2,16(sp)
.LBB50:
.LBB51:
.LBB52:
.LBB53:
.LBB54:
        lui     a1,%hi(.LC6)
        lui     s2,%hi(.LC3)
.LBE54:
.LBE53:
.LBE52:
.LBE51:
.LBE50:
        sd      s3,8(sp)
.LBB83:
.LBB79:
.LBB61:
.LBB58:
.LBB55:
        addi    a5,a1,%lo(.LC6)
        lui     s3,%hi(first)
        addi    a1,a1,%lo(.LC6)
        addi    a0,s2,%lo(.LC3)
.LBE55:
.LBE58:
.LBE61:
.LBE79:
.LBE83:
        sd      ra,40(sp)
        sd      s0,32(sp)
        sd      s1,24(sp)
.LBB84:
.LBB80:
.LBB62:
.LBB59:
.LBB56:
        sd      a5,%lo(first)(s3)
.LBE56:
.LBE59:
.LBE62:
        lui     s1,%hi(__dso_handle)
.LBB63:
.LBB60:
.LBB57:
        call    printf
.LBE57:
.LBE60:
.LBE63:
        lui     s0,%hi(_ZN6TracerD1Ev)
        addi    a2,s1,%lo(__dso_handle)
        addi    a1,s3,%lo(first)
        addi    a0,s0,%lo(_ZN6TracerD1Ev)
        call    __cxa_atexit
.LBB64:
.LBB65:
.LBB66:
        lui     a1,%hi(.LC7)
        addi    a5,a1,%lo(.LC7)
        lui     s3,%hi(second)
        addi    a0,s2,%lo(.LC3)
        addi    a1,a1,%lo(.LC7)
        sd      a5,%lo(second)(s3)
        call    printf
.LBE66:
.LBE65:
.LBE64:
        addi    a2,s1,%lo(__dso_handle)
        addi    a1,s3,%lo(second)
        addi    a0,s0,%lo(_ZN6TracerD1Ev)
        call    __cxa_atexit
        lui     a0,%hi(.LC8)
        addi    a0,a0,%lo(.LC8)
        call    printf
.LBB67:
.LBB68:
.LBB69:
        lui     a1,%hi(.LC9)
.LBE69:
.LBE68:
.LBE67:
        mv      a3,a0
.LBB76:
.LBB73:
.LBB70:
        addi    a5,a1,%lo(.LC9)
        addi    a0,s2,%lo(.LC3)
.LBE70:
.LBE73:
.LBE76:
        lui     a4,%hi(_ZL17initialized_value)
.LBB77:
.LBB74:
.LBB71:
        lui     s2,%hi(third)
        addi    a1,a1,%lo(.LC9)
        sd      a5,%lo(third)(s2)
.LBE71:
.LBE74:
.LBE77:
        sw      a3,%lo(_ZL17initialized_value)(a4)
.LBB78:
.LBB75:
.LBB72:
        call    printf
.LBE72:
.LBE75:
.LBE78:
        addi    a0,s0,%lo(_ZN6TracerD1Ev)
.LBE80:
.LBE84:
        ld      s0,32(sp)
        ld      ra,40(sp)
        ld      s3,8(sp)
.LBB85:
.LBB81:
        addi    a2,s1,%lo(__dso_handle)
        addi    a1,s2,%lo(third)
.LBE81:
.LBE85:
        ld      s1,24(sp)
        ld      s2,16(sp)
        addi    sp,sp,48
.LBB86:
.LBB82:
        tail    __cxa_atexit
.LBE82:
.LBE86:
.LFE16:
        .size   _GLOBAL__sub_I_first, .-_GLOBAL__sub_I_first
        .section        .init_array,"aw"
        .align  3
        .dword  _GLOBAL__sub_I_first
        .globl  third
        .section        .sbss,"aw",@nobits
        .align  3
        .type   third, @object
        .size   third, 8
third:
        .zero   8
        .local  _ZGVZL5localvE1t
        .comm   _ZGVZL5localvE1t,8,8
        .local  _ZZL5localvE1t
        .comm   _ZZL5localvE1t,8,8
        .local  _ZL17initialized_value
        .comm   _ZL17initialized_value,4,4
        .globl  second
        .align  3
        .type   second, @object
        .size   second, 8
second:
        .zero   8
        .globl  first
        .align  3
        .type   first, @object
        .size   first, 8
first:
        .zero   8
        .text
.Letext0:
