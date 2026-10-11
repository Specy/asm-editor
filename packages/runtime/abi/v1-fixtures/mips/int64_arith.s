        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC0:
        .ascii  "%lld / %lld = %lld r %lld\012\000"
        .align  2
$LC1:
        .ascii  "%llu / %llu = %llu r %llu\012\000"
        .align  2
$LC2:
        .ascii  "%llx << %d = %llx, >> = %llx, sar = %lld\012\000"
        .align  2
$LC3:
        .ascii  "%lld * 3 = %lld, * itself = %lld, to double %.17g, to fl"
        .ascii  "oat %.9g\012\000"
        .align  2
$LC4:
        .ascii  "%llu to double %.17g to float %.9g popcount=%d clz=%d ct"
        .ascii  "z=%d bswap=%llx\012\000"
        .align  2
$LC5:
        .ascii  "%.17g to int64 %lld\000"
        .align  2
$LC7:
        .ascii  " to uint64 %llu\000"
        .align  2
$LC8:
        .ascii  " float to int64 %lld\012\000"
        .align  2
$LC9:
        .ascii  "32-bit: popcount=%d clz=%d ctz=%d bswap=%x\012\000"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .set    nomips16
        .set    nomicromips
        .ent    main
        .type   main, @function
main:
        .frame  $sp,120,$31   # vars= 8, regs= 10/4, args= 56, gp= 0
        .mask   0xc0ff0000,-20
        .fmask  0x00f00000,-8
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-120
        sw      $20,80($sp)
        sw      $19,76($sp)
        lui     $20,%hi($LC0)
        lui     $19,%hi(sv)
        sw      $21,84($sp)
        sw      $31,100($sp)
        sw      $fp,96($sp)
        sw      $23,92($sp)
        sw      $22,88($sp)
        sw      $18,72($sp)
        sw      $17,68($sp)
        sw      $16,64($sp)
        sdc1    $f22,112($sp)
        sdc1    $f20,104($sp)
        sw      $0,56($sp)
        addiu   $19,$19,%lo(sv)
        addiu   $20,$20,%lo($LC0)
        li      $21,-1                  # 0xffffffffffffffff
$L2:
        lw      $2,56($sp)
        move    $fp,$0
        sll     $18,$2,3
        addu    $18,$19,$18
$L7:
        sll     $2,$fp,3
        addu    $2,$19,$2
        lw      $22,0($18)
        lw      $23,4($18)
        lw      $16,0($2)
        lw      $17,4($2)
        move    $4,$22
        or      $2,$16,$17
        move    $5,$23
        move    $6,$16
        move    $7,$17
        beq     $2,$0,$L3
        nop
        bne     $22,$0,$L5
        nop
        li      $2,-2147483648                  # 0xffffffff80000000
        bne     $23,$2,$L5
        nop
        beq     $16,$21,$L42
        nop
$L5:
        jal     __moddi3
        nop
        move    $6,$16
        move    $7,$17
        move    $4,$22
        move    $5,$23
        sw      $2,32($sp)
        sw      $3,36($sp)
        jal     __divdi3
        nop
        sw      $2,24($sp)
        sw      $3,28($sp)
        sw      $16,16($sp)
        sw      $17,20($sp)
        move    $6,$22
        move    $7,$23
        move    $4,$20
        jal     printf
        nop
$L3:
        addiu   $fp,$fp,1
        li      $2,14                 # 0xe
        bne     $fp,$2,$L7
        nop
        lw      $2,56($sp)
        addiu   $2,$2,1
        sw      $2,56($sp)
        bne     $2,$fp,$L2
        nop
        lui     $18,%hi($LC1)
        addiu   $2,$18,%lo($LC1)
        lui     $16,%hi(uv)
        sw      $0,60($sp)
        addiu   $16,$16,%lo(uv)
        sw      $2,56($sp)
        li      $18,10                  # 0xa
$L8:
        lw      $2,60($sp)
        move    $17,$0
        sll     $8,$2,3
        addu    $fp,$16,$8
$L11:
        sll     $2,$17,3
        addu    $2,$16,$2
        lw      $22,0($fp)
        lw      $23,4($fp)
        lw      $20,0($2)
        lw      $21,4($2)
        move    $4,$22
        or      $2,$20,$21
        move    $5,$23
        move    $6,$20
        move    $7,$21
        beq     $2,$0,$L9
        nop
        jal     __umoddi3
        nop
        move    $6,$20
        move    $7,$21
        move    $4,$22
        move    $5,$23
        sw      $2,32($sp)
        sw      $3,36($sp)
        jal     __udivdi3
        nop
        lw      $4,56($sp)
        sw      $2,24($sp)
        sw      $3,28($sp)
        sw      $20,16($sp)
        sw      $21,20($sp)
        move    $6,$22
        move    $7,$23
        jal     printf
        nop
$L9:
        addiu   $17,$17,1
        bne     $17,$18,$L11
        nop
        lw      $2,60($sp)
        addiu   $2,$2,1
        sw      $2,60($sp)
        bne     $2,$17,$L8
        nop
        lui     $20,%hi(shifts)
        lui     $18,%hi($LC2)
        move    $22,$0
        addiu   $20,$20,%lo(shifts)
        addiu   $18,$18,%lo($LC2)
        li      $21,7                 # 0x7
        li      $23,10                  # 0xa
$L12:
        sll     $17,$22,3
        move    $fp,$0
        addu    $17,$16,$17
$L13:
        sll     $2,$fp,2
        addu    $2,$20,$2
        lw      $2,0($2)
        lw      $6,0($17)
        lw      $7,4($17)
        nor     $3,$0,$2
        sll     $12,$7,1
        sll     $12,$12,$3
        srl     $13,$6,1
        srl     $8,$6,$2
        srl     $13,$13,$3
        or      $8,$12,$8
        sll     $4,$7,$2
        andi    $3,$2,0x20
        sra     $11,$7,$2
        srl     $10,$7,$2
        sll     $9,$6,$2
        sra     $14,$7,31
        move    $5,$8
        or      $4,$13,$4
        movn    $4,$9,$3
        movn    $8,$11,$3
        movn    $5,$10,$3
        movn    $11,$14,$3
        movn    $10,$0,$3
        movn    $9,$0,$3
        sw      $4,28($sp)
        sw      $8,40($sp)
        sw      $11,44($sp)
        sw      $5,32($sp)
        sw      $10,36($sp)
        sw      $9,24($sp)
        sw      $2,16($sp)
        move    $4,$18
        addiu   $fp,$fp,1
        jal     printf
        nop
        bne     $fp,$21,$L13
        nop
        addiu   $22,$22,1
        bne     $22,$23,$L12
        nop
        lui     $17,%hi($LC3)
        move    $22,$0
        addiu   $17,$17,%lo($LC3)
        li      $18,14                  # 0xe
$L14:
        sll     $2,$22,3
        addu    $2,$19,$2
        lw      $20,0($2)
        lw      $21,4($2)
        lw      $4,0($2)
        lw      $5,4($2)
        addiu   $22,$22,1
        jal     __floatdisf
        nop
        cvt.d.s $f0,$f0
        move    $4,$20
        move    $5,$21
        sdc1    $f0,40($sp)
        jal     __floatdidf
        nop
        mul     $6,$21,$20
        sdc1    $f0,32($sp)
        multu   $20,$20
        sll     $2,$20,1
        srl     $8,$20,31
        sll     $3,$21,1
        addu    $7,$2,$20
        mfhi    $5
        or      $3,$8,$3
        mflo    $4
        sll     $6,$6,1
        sltu    $2,$7,$2
        addu    $3,$3,$21
        addu    $5,$6,$5
        addu    $2,$2,$3
        sw      $4,24($sp)
        sw      $7,16($sp)
        sw      $5,28($sp)
        sw      $2,20($sp)
        move    $6,$20
        move    $7,$21
        move    $4,$17
        jal     printf
        nop
        bne     $22,$18,$L14
        nop
        lui     $23,%hi($LC4)
        move    $17,$0
        addiu   $23,$23,%lo($LC4)
        li      $fp,10                  # 0xa
        b       $L19
        nop
$L44:
        clz     $21,$18
        beq     $19,$0,$L17
        nop
        clz     $21,$19
$L18:
        move    $4,$18
        move    $5,$19
        jal     __ctzdi2
        nop
        move    $22,$2
$L15:
        move    $4,$18
        move    $5,$19
        jal     __bswapdi2
        nop
        sw      $2,48($sp)
        sw      $3,52($sp)
        sw      $22,40($sp)
        sw      $21,36($sp)
        sw      $20,32($sp)
        sdc1    $f22,24($sp)
        sdc1    $f20,16($sp)
        move    $6,$18
        move    $7,$19
        move    $4,$23
        addiu   $17,$17,1
        jal     printf
        nop
        beq     $17,$fp,$L43
        nop
$L19:
        sll     $2,$17,3
        addu    $2,$16,$2
        lw      $18,0($2)
        lw      $19,4($2)
        lw      $4,0($2)
        lw      $5,4($2)
        jal     __floatundidf
        nop
        move    $4,$18
        move    $5,$19
        mov.d   $f20,$f0
        jal     __floatundisf
        nop
        move    $4,$18
        move    $5,$19
        cvt.d.s $f22,$f0
        jal     __popcountdi2
        nop
        or      $3,$18,$19
        move    $20,$2
        bne     $3,$0,$L44
        nop
        li      $21,-1                  # 0xffffffffffffffff
        li      $22,-1                  # 0xffffffffffffffff
        b       $L15
        nop
$L42:
        bne     $21,$17,$L5
        nop
        b       $L3
        nop
$L17:
        addiu   $21,$21,32
        b       $L18
        nop
$L43:
        lui     $2,%hi($LC6)
        ldc1    $f22,%lo($LC6)($2)
        lui     $19,%hi(dv)
        lui     $18,%hi($LC5)
        lui     $20,%hi($LC7)
        lui     $17,%hi($LC8)
        move    $16,$0
        addiu   $19,$19,%lo(dv)
        addiu   $18,$18,%lo($LC5)
        addiu   $20,$20,%lo($LC7)
        addiu   $17,$17,%lo($LC8)
$L22:
        sll     $2,$16,3
        addu    $2,$19,$2
        ldc1    $f20,0($2)
        mov.d   $f12,$f20
        jal     __fixdfdi
        nop
        mfc1    $6,$f20
        mfc1    $7,$f21
        sw      $2,16($sp)
        sw      $3,20($sp)
        move    $4,$18
        jal     printf
        nop
        c.lt.d  $fcc0,$f22,$f20
        mov.d   $f12,$f20
        bc1f    $fcc0,$L20
        nop
        jal     __fixunsdfdi
        nop
        move    $6,$2
        move    $7,$3
        move    $4,$20
        jal     printf
        nop
$L20:
        cvt.s.d $f12,$f20
        jal     __fixsfdi
        nop
        move    $6,$2
        move    $7,$3
        move    $4,$17
        jal     printf
        nop
        addiu   $16,$16,1
        li      $2,13                 # 0xd
        bne     $16,$2,$L22
        nop
        li      $2,16777216       # 0x1000000
        ori     $2,$2,0xf080
        lui     $4,%hi($LC9)
        sw      $2,16($sp)
        move    $7,$0
        move    $6,$0
        li      $5,6                        # 0x6
        addiu   $4,$4,%lo($LC9)
        jal     printf
        nop
        lw      $31,100($sp)
        ldc1    $f22,112($sp)
        ldc1    $f20,104($sp)
        lw      $fp,96($sp)
        lw      $23,92($sp)
        lw      $22,88($sp)
        lw      $21,84($sp)
        lw      $20,80($sp)
        lw      $19,76($sp)
        lw      $18,72($sp)
        lw      $17,68($sp)
        lw      $16,64($sp)
        move    $2,$0
        addiu   $sp,$sp,120
        jr      $31
        nop
        .set    macro
        .set    reorder
        .end    main
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
        .section        .rodata.cst8,"aM",@progbits,8
        .align  3
$LC6:
        .word   0
        .word   -1074790400
        .text
