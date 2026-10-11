        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .section        .rodata._ZN6TracerD2Ev.str1.4,"aMS",@progbits,1
        .align  2
$LC0:
        .ascii  "destroy %s\012\000"
        .section        .text._ZN6TracerD2Ev,"axG",@progbits,_ZN6TracerD5Ev,comdat
        .align  2
        .weak   _ZN6TracerD2Ev
        .set    nomips16
        .set    nomicromips
        .ent    _ZN6TracerD2Ev
        .type   _ZN6TracerD2Ev, @function
_ZN6TracerD2Ev:
        .frame  $sp,0,$31         # vars= 0, regs= 0/0, args= 0, gp= 0
        .mask   0x00000000,0
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        lw      $5,0($4)
        lui     $4,%hi($LC0)
        addiu   $4,$4,%lo($LC0)
        j       printf
        nop
        .set    macro
        .set    reorder
        .end    _ZN6TracerD2Ev
        .size   _ZN6TracerD2Ev, .-_ZN6TracerD2Ev
        .weak   _ZN6TracerD1Ev
        _ZN6TracerD1Ev = _ZN6TracerD2Ev
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC1:
        .ascii  "atexit handler\000"
        .text
        .align  2
        .set    nomips16
        .set    nomicromips
        .ent    _ZL7handlerv
        .type   _ZL7handlerv, @function
_ZL7handlerv:
        .frame  $sp,0,$31         # vars= 0, regs= 0/0, args= 0, gp= 0
        .mask   0x00000000,0
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        lui     $4,%hi($LC1)
        addiu   $4,$4,%lo($LC1)
        j       puts
        nop
        .set    macro
        .set    reorder
        .end    _ZL7handlerv
        .size   _ZL7handlerv, .-_ZL7handlerv
        .section        .rodata.str1.4
        .align  2
$LC2:
        .ascii  "function-local static\000"
        .align  2
$LC3:
        .ascii  "construct %s\012\000"
        .text
        .align  2
        .set    nomips16
        .set    nomicromips
        .ent    _ZL5localv.part.0
        .type   _ZL5localv.part.0, @function
_ZL5localv.part.0:
        .frame  $sp,24,$31      # vars= 0, regs= 2/0, args= 16, gp= 0
        .mask   0x80010000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-24
        lui     $5,%hi($LC2)
        lui     $4,%hi($LC3)
        addiu   $5,$5,%lo($LC2)
        sw      $16,16($sp)
        addiu   $4,$4,%lo($LC3)
        lui     $16,%hi(_ZZL5localvE1t)
        sw      $31,20($sp)
        sw      $5,%lo(_ZZL5localvE1t)($16)
        jal     printf
        nop
        lw      $31,20($sp)
        lui     $6,%hi(__dso_handle)
        addiu   $5,$16,%lo(_ZZL5localvE1t)
        lui     $4,%hi(_ZN6TracerD1Ev)
        lw      $16,16($sp)
        lui     $2,%hi(_ZGVZL5localvE1t)
        li      $3,1                        # 0x1
        addiu   $6,$6,%lo(__dso_handle)
        addiu   $4,$4,%lo(_ZN6TracerD1Ev)
        addiu   $sp,$sp,24
        sb      $3,%lo(_ZGVZL5localvE1t)($2)
        j       __cxa_atexit
        nop
        .set    macro
        .set    reorder
        .end    _ZL5localv.part.0
        .size   _ZL5localv.part.0, .-_ZL5localv.part.0
        .section        .rodata.str1.4
        .align  2
$LC4:
        .ascii  "main starts, initializer returned %d\012\000"
        .align  2
$LC5:
        .ascii  "main returns\000"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .set    nomips16
        .set    nomicromips
        .ent    main
        .type   main, @function
main:
        .frame  $sp,24,$31      # vars= 0, regs= 2/0, args= 16, gp= 0
        .mask   0x80010000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        lui     $2,%hi(_ZL17initialized_value)
        lw      $5,%lo(_ZL17initialized_value)($2)
        lui     $4,%hi($LC4)
        addiu   $sp,$sp,-24
        addiu   $4,$4,%lo($LC4)
        sw      $31,20($sp)
        sw      $16,16($sp)
        jal     printf
        nop
        lui     $4,%hi(_ZL7handlerv)
        addiu   $4,$4,%lo(_ZL7handlerv)
        lui     $16,%hi(_ZGVZL5localvE1t)
        jal     atexit
        nop
        lb      $2,%lo(_ZGVZL5localvE1t)($16)
        beq     $2,$0,$L11
        nop
$L8:
        lui     $4,%hi($LC5)
        addiu   $4,$4,%lo($LC5)
        jal     puts
        nop
        lw      $31,20($sp)
        lw      $16,16($sp)
        move    $2,$0
        addiu   $sp,$sp,24
        jr      $31
        nop
$L11:
        jal     _ZL5localv.part.0
        nop
        lb      $2,%lo(_ZGVZL5localvE1t)($16)
        bne     $2,$0,$L8
        nop
        jal     _ZL5localv.part.0
        nop
        b       $L8
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
        .section        .rodata.str1.4
        .align  2
$LC6:
        .ascii  "global first\000"
        .align  2
$LC7:
        .ascii  "global second\000"
        .align  2
$LC8:
        .ascii  "dynamic initializer of an int\012\000"
        .align  2
$LC9:
        .ascii  "global third, defined after main\000"
        .section        .text.startup
        .align  2
        .set    nomips16
        .set    nomicromips
        .ent    _GLOBAL__sub_I_first
        .type   _GLOBAL__sub_I_first, @function
_GLOBAL__sub_I_first:
        .frame  $sp,40,$31      # vars= 0, regs= 5/0, args= 16, gp= 0
        .mask   0x800f0000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-40
        lui     $5,%hi($LC6)
        sw      $18,28($sp)
        lui     $18,%hi($LC3)
        sw      $19,32($sp)
        sw      $17,24($sp)
        sw      $16,20($sp)
        lui     $17,%hi(__dso_handle)
        lui     $16,%hi(_ZN6TracerD1Ev)
        addiu   $5,$5,%lo($LC6)
        lui     $19,%hi(first)
        addiu   $4,$18,%lo($LC3)
        sw      $31,36($sp)
        sw      $5,%lo(first)($19)
        jal     printf
        nop
        addiu   $6,$17,%lo(__dso_handle)
        addiu   $5,$19,%lo(first)
        addiu   $4,$16,%lo(_ZN6TracerD1Ev)
        jal     __cxa_atexit
        nop
        lui     $5,%hi($LC7)
        addiu   $5,$5,%lo($LC7)
        lui     $19,%hi(second)
        addiu   $4,$18,%lo($LC3)
        sw      $5,%lo(second)($19)
        jal     printf
        nop
        addiu   $6,$17,%lo(__dso_handle)
        addiu   $5,$19,%lo(second)
        addiu   $4,$16,%lo(_ZN6TracerD1Ev)
        jal     __cxa_atexit
        nop
        lui     $4,%hi($LC8)
        addiu   $4,$4,%lo($LC8)
        jal     printf
        nop
        lui     $5,%hi($LC9)
        addiu   $5,$5,%lo($LC9)
        lui     $19,%hi(third)
        addiu   $4,$18,%lo($LC3)
        lui     $3,%hi(_ZL17initialized_value)
        sw      $5,%lo(third)($19)
        sw      $2,%lo(_ZL17initialized_value)($3)
        jal     printf
        nop
        lw      $31,36($sp)
        lw      $18,28($sp)
        addiu   $6,$17,%lo(__dso_handle)
        addiu   $5,$19,%lo(third)
        lw      $17,24($sp)
        lw      $19,32($sp)
        addiu   $4,$16,%lo(_ZN6TracerD1Ev)
        lw      $16,20($sp)
        addiu   $sp,$sp,40
        j       __cxa_atexit
        nop
        .set    macro
        .set    reorder
        .end    _GLOBAL__sub_I_first
        .size   _GLOBAL__sub_I_first, .-_GLOBAL__sub_I_first
        .section        .init_array,"aw"
        .align  2
        .word   _GLOBAL__sub_I_first
        .globl  third
        .section        .bss,"aw",@nobits
        .align  2
        .type   third, @object
        .size   third, 4
third:
        .space  4
        .local  _ZGVZL5localvE1t
        .comm   _ZGVZL5localvE1t,8,8
        .local  _ZZL5localvE1t
        .comm   _ZZL5localvE1t,4,4
        .local  _ZL17initialized_value
        .comm   _ZL17initialized_value,4,4
        .globl  second
        .align  2
        .type   second, @object
        .size   second, 4
second:
        .space  4
        .globl  first
        .align  2
        .type   first, @object
        .size   first, 4
first:
        .space  4
        .text
