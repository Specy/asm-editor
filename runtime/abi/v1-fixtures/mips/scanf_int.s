        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .align  2
        .set    nomips16
        .set    nomicromips
        .ent    skip_line
        .type   skip_line, @function
skip_line:
        .frame  $sp,32,$31      # vars= 0, regs= 3/0, args= 16, gp= 0
        .mask   0x80030000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-32
        sw      $17,24($sp)
        sw      $16,20($sp)
        sw      $31,28($sp)
        li      $16,10                  # 0xa
        li      $17,-1                  # 0xffffffffffffffff
        b       $L3
        nop
$L7:
        beq     $2,$17,$L1
        nop
$L3:
        jal     getchar
        nop
        bne     $2,$16,$L7
        nop
$L1:
        lw      $31,28($sp)
        lw      $17,24($sp)
        lw      $16,20($sp)
        addiu   $sp,$sp,32
        jr      $31
        nop
        .set    macro
        .set    reorder
        .end    skip_line
        .size   skip_line, .-skip_line
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC0:
        .ascii  "%d %d\000"
        .align  2
$LC1:
        .ascii  "1: r=%d a=%d b=%d\012\000"
        .align  2
$LC2:
        .ascii  "%i %i %i %i\000"
        .align  2
$LC3:
        .ascii  "2: r=%d %d %d %d %d\012\000"
        .align  2
$LC4:
        .ascii  "%x %X %o %u\000"
        .align  2
$LC5:
        .ascii  "3: r=%d %d %d %d %u\012\000"
        .align  2
$LC6:
        .ascii  "%3d%2d%d\000"
        .align  2
$LC7:
        .ascii  "4: r=%d %d %d %d\012\000"
        .align  2
$LC8:
        .ascii  "%d,%d ; %d\000"
        .align  2
$LC9:
        .ascii  "5: r=%d %d %d %d\012\000"
        .align  2
$LC10:
        .ascii  "%*d %d%n\000"
        .align  2
$LC11:
        .ascii  "6: r=%d a=%d n=%d\012\000"
        .align  2
$LC12:
        .ascii  "%hhd %hd %ld %lld %llu\000"
        .align  2
$LC13:
        .ascii  "7: r=%d %d %d %ld %lld %llu\012\000"
        .align  2
$LC14:
        .ascii  "%d\000"
        .align  2
$LC15:
        .ascii  "8: r=%d (matching failure), next char '%c'\012\000"
        .align  2
$LC16:
        .ascii  "%d%d\000"
        .align  2
$LC17:
        .ascii  "9: r=%d a=%d (partial), next char '%c'\012\000"
        .align  2
$LC18:
        .ascii  "%u\000"
        .align  2
$LC19:
        .ascii  "10: r=%d u=%u\012\000"
        .align  2
$LC20:
        .ascii  " total: %d%%\000"
        .align  2
$LC21:
        .ascii  "11: r=%d a=%d\012\000"
        .align  2
$LC22:
        .ascii  "12: r=%d at end\012\000"
        .align  2
$LC23:
        .ascii  "13: r=%d still at end\012\000"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .set    nomips16
        .set    nomicromips
        .ent    main
        .type   main, @function
main:
        .frame  $sp,112,$31   # vars= 48, regs= 5/0, args= 40, gp= 0
        .mask   0x800f0000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-112
        lui     $4,%hi($LC0)
        addiu   $6,$sp,72
        addiu   $5,$sp,76
        addiu   $4,$4,%lo($LC0)
        sw      $31,108($sp)
        sw      $19,104($sp)
        sw      $18,100($sp)
        sw      $17,96($sp)
        sw      $16,92($sp)
        sw      $0,76($sp)
        sw      $0,72($sp)
        sw      $0,68($sp)
        sw      $0,64($sp)
        sw      $0,60($sp)
        jal     scanf
        nop
        lw      $7,72($sp)
        lw      $6,76($sp)
        lui     $4,%hi($LC1)
        move    $5,$2
        addiu   $4,$4,%lo($LC1)
        jal     printf
        nop
        addiu   $16,$sp,64
        lui     $4,%hi($LC2)
        sw      $16,16($sp)
        addiu   $7,$sp,68
        addiu   $6,$sp,72
        addiu   $5,$sp,76
        addiu   $4,$4,%lo($LC2)
        jal     scanf
        nop
        lw      $3,64($sp)
        lw      $7,72($sp)
        sw      $3,20($sp)
        lw      $3,68($sp)
        lw      $6,76($sp)
        lui     $4,%hi($LC3)
        sw      $3,16($sp)
        move    $5,$2
        addiu   $4,$4,%lo($LC3)
        jal     printf
        nop
        addiu   $18,$sp,60
        lui     $4,%hi($LC4)
        sw      $18,16($sp)
        addiu   $7,$sp,68
        addiu   $6,$sp,72
        addiu   $5,$sp,76
        addiu   $4,$4,%lo($LC4)
        jal     scanf
        nop
        lw      $3,60($sp)
        lw      $7,72($sp)
        sw      $3,20($sp)
        lw      $3,68($sp)
        lw      $6,76($sp)
        lui     $4,%hi($LC5)
        sw      $3,16($sp)
        move    $5,$2
        addiu   $4,$4,%lo($LC5)
        jal     printf
        nop
        lui     $4,%hi($LC6)
        addiu   $7,$sp,68
        addiu   $6,$sp,72
        addiu   $5,$sp,76
        addiu   $4,$4,%lo($LC6)
        jal     scanf
        nop
        lw      $3,68($sp)
        lw      $7,72($sp)
        lw      $6,76($sp)
        lui     $4,%hi($LC7)
        sw      $3,16($sp)
        move    $5,$2
        addiu   $4,$4,%lo($LC7)
        jal     printf
        nop
        lui     $4,%hi($LC8)
        addiu   $7,$sp,68
        addiu   $6,$sp,72
        addiu   $5,$sp,76
        addiu   $4,$4,%lo($LC8)
        jal     scanf
        nop
        lw      $3,68($sp)
        lw      $7,72($sp)
        lw      $6,76($sp)
        lui     $4,%hi($LC9)
        sw      $3,16($sp)
        move    $5,$2
        addiu   $4,$4,%lo($LC9)
        jal     printf
        nop
        lui     $4,%hi($LC10)
        move    $6,$16
        addiu   $5,$sp,76
        addiu   $4,$4,%lo($LC10)
        jal     scanf
        nop
        lw      $7,64($sp)
        lw      $6,76($sp)
        lui     $4,%hi($LC11)
        move    $5,$2
        addiu   $4,$4,%lo($LC11)
        jal     printf
        nop
        addiu   $2,$sp,40
        sw      $2,20($sp)
        lui     $4,%hi($LC12)
        addiu   $2,$sp,48
        move    $3,$0
        sw      $2,16($sp)
        addiu   $7,$sp,56
        addiu   $6,$sp,80
        addiu   $5,$sp,82
        move    $2,$0
        addiu   $4,$4,%lo($LC12)
        sw      $3,52($sp)
        sw      $3,44($sp)
        sb      $0,82($sp)
        sh      $0,80($sp)
        sw      $0,56($sp)
        sw      $2,48($sp)
        sw      $2,40($sp)
        jal     scanf
        nop
        lw      $4,40($sp)
        lw      $5,44($sp)
        sw      $4,32($sp)
        lw      $4,48($sp)
        lw      $3,56($sp)
        sw      $5,36($sp)
        lw      $5,52($sp)
        lh      $7,80($sp)
        lb      $6,82($sp)
        sw      $4,24($sp)
        lui     $4,%hi($LC13)
        sw      $3,16($sp)
        lui     $16,%hi($LC14)
        sw      $5,28($sp)
        addiu   $4,$4,%lo($LC13)
        move    $5,$2
        jal     printf
        nop
        jal     skip_line
        nop
        addiu   $5,$sp,76
        addiu   $4,$16,%lo($LC14)
        jal     scanf
        nop
        move    $17,$2
        jal     getchar
        nop
        lui     $4,%hi($LC15)
        move    $5,$17
        move    $6,$2
        addiu   $4,$4,%lo($LC15)
        jal     printf
        nop
        jal     skip_line
        nop
        lui     $4,%hi($LC16)
        addiu   $6,$sp,72
        addiu   $5,$sp,76
        addiu   $4,$4,%lo($LC16)
        sw      $0,72($sp)
        sw      $0,76($sp)
        jal     scanf
        nop
        lw      $19,76($sp)
        move    $17,$2
        jal     getchar
        nop
        lui     $4,%hi($LC17)
        move    $7,$2
        move    $6,$19
        move    $5,$17
        addiu   $4,$4,%lo($LC17)
        jal     printf
        nop
        jal     skip_line
        nop
        lui     $4,%hi($LC18)
        move    $5,$18
        addiu   $4,$4,%lo($LC18)
        jal     scanf
        nop
        lw      $6,60($sp)
        lui     $4,%hi($LC19)
        move    $5,$2
        addiu   $4,$4,%lo($LC19)
        jal     printf
        nop
        lui     $4,%hi($LC20)
        addiu   $5,$sp,76
        addiu   $4,$4,%lo($LC20)
        jal     scanf
        nop
        lw      $6,76($sp)
        lui     $4,%hi($LC21)
        move    $5,$2
        addiu   $4,$4,%lo($LC21)
        jal     printf
        nop
        addiu   $5,$sp,76
        addiu   $4,$16,%lo($LC14)
        jal     scanf
        nop
        lui     $4,%hi($LC22)
        move    $5,$2
        addiu   $4,$4,%lo($LC22)
        jal     printf
        nop
        addiu   $5,$sp,76
        addiu   $4,$16,%lo($LC14)
        jal     scanf
        nop
        lui     $4,%hi($LC23)
        move    $5,$2
        addiu   $4,$4,%lo($LC23)
        jal     printf
        nop
        lw      $31,108($sp)
        lw      $19,104($sp)
        lw      $18,100($sp)
        lw      $17,96($sp)
        lw      $16,92($sp)
        move    $2,$0
        addiu   $sp,$sp,112
        jr      $31
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
        .text
