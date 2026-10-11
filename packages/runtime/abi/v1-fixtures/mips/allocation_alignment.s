        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC0:
        .ascii  "malloc aligned=%d calloc aligned=%d\012\000"
        .align  2
$LC1:
        .ascii  "realloc aligned=%d\012\000"
        .align  2
$LC2:
        .ascii  "new aligned=%d array aligned=%d alignas16=%d\012\000"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .set    nomips16
        .set    nomicromips
        .ent    main
        .type   main, @function
main:
        .frame  $sp,40,$31      # vars= 0, regs= 5/0, args= 16, gp= 0
        .mask   0x800f0000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-40
        li      $4,1                        # 0x1
        sw      $31,36($sp)
        sw      $17,24($sp)
        sw      $16,20($sp)
        sw      $19,32($sp)
        sw      $18,28($sp)
        jal     malloc
        nop
        li      $5,7                        # 0x7
        li      $4,3                        # 0x3
        move    $16,$2
        jal     calloc
        nop
        move    $17,$2
        beq     $16,$0,$L5
        nop
        andi    $5,$16,0x7
        srl     $5,$5,2
        xori    $5,$5,0x1
$L2:
        beq     $17,$0,$L6
        nop
        andi    $6,$17,0x7
        srl     $6,$6,2
        xori    $6,$6,0x1
$L3:
        lui     $4,%hi($LC0)
        addiu   $4,$4,%lo($LC0)
        jal     printf
        nop
        move    $4,$16
        li      $5,73                 # 0x49
        jal     realloc
        nop
        move    $18,$2
        beq     $2,$0,$L7
        nop
        andi    $5,$2,0x7
        srl     $5,$5,2
        xori    $5,$5,0x1
$L4:
        lui     $4,%hi($LC1)
        addiu   $4,$4,%lo($LC1)
        jal     printf
        nop
        li      $5,16                 # 0x10
        li      $4,16                 # 0x10
        jal     _ZnwjSt11align_val_t
        nop
        li      $5,16                 # 0x10
        li      $4,48                 # 0x30
        move    $16,$2
        jal     _ZnajSt11align_val_t
        nop
        andi    $6,$2,0x7
        andi    $7,$16,0xf
        andi    $5,$16,0x7
        lui     $4,%hi($LC2)
        sltu    $7,$7,1
        sltu    $6,$6,1
        sltu    $5,$5,1
        addiu   $4,$4,%lo($LC2)
        move    $19,$2
        jal     printf
        nop
        move    $4,$18
        jal     free
        nop
        move    $4,$17
        jal     free
        nop
        move    $4,$16
        li      $6,16                 # 0x10
        li      $5,16                 # 0x10
        jal     _ZdlPvjSt11align_val_t
        nop
        move    $4,$19
        li      $5,16                 # 0x10
        jal     _ZdaPvSt11align_val_t
        nop
        lw      $31,36($sp)
        lw      $19,32($sp)
        lw      $18,28($sp)
        lw      $17,24($sp)
        lw      $16,20($sp)
        move    $2,$0
        addiu   $sp,$sp,40
        jr      $31
        nop
$L5:
        move    $5,$0
        b       $L2
        nop
$L7:
        move    $5,$0
        b       $L4
        nop
$L6:
        move    $6,$0
        b       $L3
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
        .text
