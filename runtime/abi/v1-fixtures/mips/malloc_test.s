        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC0:
        .ascii  "malloc(10) non-null=%d aligned8=%d\012\000"
        .align  2
$LC1:
        .ascii  "abcdefghi\000"
        .align  2
$LC2:
        .ascii  "grown keeps=%s\012\000"
        .align  2
$LC3:
        .ascii  "shrunk keeps=%s\012\000"
        .align  2
$LC4:
        .ascii  "calloc zero sum=%d\012\000"
        .align  2
$LC5:
        .ascii  "calloc overflow null=%d errno==ENOMEM %d\012\000"
        .align  2
$LC6:
        .ascii  "malloc huge null=%d errno==ENOMEM %d\012\000"
        .align  2
$LC7:
        .ascii  "still here\000"
        .align  2
$LC8:
        .ascii  "realloc huge null=1 errno==ENOMEM %d old=%s\012\000"
        .align  2
$LC9:
        .ascii  "malloc(0) non-null=%d\012\000"
        .align  2
$LC10:
        .ascii  "realloc(NULL)=%s\012\000"
        .align  2
$LC11:
        .ascii  "interleaved corrupted bytes=%d\012\000"
        .align  2
$LC12:
        .ascii  "repeated alloc/free ok=%d\012\000"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .set    nomips16
        .set    nomicromips
        .ent    main
        .type   main, @function
main:
        .frame  $sp,864,$31   # vars= 816, regs= 8/0, args= 16, gp= 0
        .mask   0x807f0000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-864
        li      $2,-1                 # 0xffffffffffffffff
        sw      $2,828($sp)
        li      $2,2147418112                 # 0x7fff0000
        ori     $2,$2,0xffff
        sw      $2,824($sp)
        li      $4,10                 # 0xa
        li      $2,4                        # 0x4
        sw      $31,860($sp)
        sw      $16,832($sp)
        sw      $22,856($sp)
        sw      $21,852($sp)
        sw      $20,848($sp)
        sw      $19,844($sp)
        sw      $18,840($sp)
        sw      $17,836($sp)
        sw      $2,820($sp)
        jal     malloc
        nop
        andi    $6,$2,0x7
        srl     $6,$6,2
        lui     $4,%hi($LC0)
        xori    $6,$6,0x1
        sltu    $5,$0,$2
        addiu   $4,$4,%lo($LC0)
        move    $16,$2
        jal     printf
        nop
        lui     $3,%hi($LC1)
        addiu   $2,$3,%lo($LC1)
        lw      $6,%lo($LC1)($3)
        lw      $3,4($2)
        lhu     $2,8($2)
        sw      $3,4($16)
        sw      $6,0($16)
        move    $4,$16
        li      $5,100                  # 0x64
        sh      $2,8($16)
        jal     realloc
        nop
        lui     $4,%hi($LC2)
        move    $16,$2
        move    $5,$2
        addiu   $4,$4,%lo($LC2)
        jal     printf
        nop
        li      $6,89                 # 0x59
        addiu   $4,$16,10
        li      $5,120                  # 0x78
        jal     memset
        nop
        move    $4,$16
        sb      $0,99($16)
        li      $5,5                        # 0x5
        jal     realloc
        nop
        lui     $4,%hi($LC3)
        move    $16,$2
        move    $5,$2
        addiu   $4,$4,%lo($LC3)
        sb      $0,4($2)
        jal     printf
        nop
        move    $4,$16
        jal     free
        nop
        li      $5,4                        # 0x4
        li      $4,1000           # 0x3e8
        jal     calloc
        nop
        move    $16,$2
        addiu   $4,$2,4000
        move    $5,$0
$L2:
        lw      $3,0($2)
        addiu   $2,$2,4
        addu    $5,$5,$3
        bne     $2,$4,$L2
        nop
        lui     $4,%hi($LC4)
        addiu   $4,$4,%lo($LC4)
        jal     printf
        nop
        lui     $17,%hi(errno)
        move    $4,$16
        jal     free
        nop
        sw      $0,%lo(errno)($17)
        lw      $4,824($sp)
        lw      $5,820($sp)
        jal     calloc
        nop
        sw      $2,816($sp)
        lw      $5,816($sp)
        lw      $6,%lo(errno)($17)
        lui     $4,%hi($LC5)
        xori    $6,$6,0xc
        sltu    $6,$6,1
        sltu    $5,$5,1
        addiu   $4,$4,%lo($LC5)
        jal     printf
        nop
        sw      $0,%lo(errno)($17)
        lw      $4,828($sp)
        jal     malloc
        nop
        sw      $2,816($sp)
        lw      $5,816($sp)
        lw      $6,%lo(errno)($17)
        lui     $4,%hi($LC6)
        xori    $6,$6,0xc
        sltu    $6,$6,1
        sltu    $5,$5,1
        addiu   $4,$4,%lo($LC6)
        jal     printf
        nop
        li      $4,16                 # 0x10
        jal     malloc
        nop
        lui     $4,%hi($LC7)
        addiu   $3,$4,%lo($LC7)
        sw      $0,%lo(errno)($17)
        move    $16,$2
        lw      $8,%lo($LC7)($4)
        lw      $5,828($sp)
        lw      $7,4($3)
        lhu     $6,8($3)
        lbu     $2,10($3)
        move    $4,$16
        addiu   $5,$5,-4096
        sw      $8,0($16)
        sw      $7,4($16)
        sh      $6,8($16)
        sb      $2,10($16)
        jal     realloc
        nop
        move    $4,$2
        beq     $2,$0,$L3
        nop
$L21:
        jal     free
        nop
        move    $4,$0
        jal     malloc
        nop
        lui     $4,%hi($LC9)
        sltu    $5,$0,$2
        move    $16,$2
        addiu   $4,$4,%lo($LC9)
        jal     printf
        nop
        move    $4,$16
        jal     free
        nop
        li      $4,8                        # 0x8
        jal     malloc
        nop
        move    $16,$2
        move    $5,$2
        li      $2,1935998976                 # 0x73650000
        addiu   $2,$2,29286
        sw      $2,0($16)
        lui     $4,%hi($LC10)
        li      $2,104                  # 0x68
        addiu   $4,$4,%lo($LC10)
        sh      $2,4($16)
        jal     printf
        nop
        li      $19,458096640                 # 0x1b4e0000
        move    $4,$16
        addiu   $16,$sp,16
        jal     free
        nop
        move    $18,$16
        move    $22,$0
        move    $21,$0
        ori     $19,$19,0x81b5
        li      $20,200           # 0xc8
$L5:
        multu   $22,$19
        addiu   $18,$18,4
        mfhi    $3
        srl     $3,$3,5
        sll     $2,$3,2
        addu    $2,$2,$3
        sll     $17,$2,4
        subu    $17,$17,$2
        sll     $17,$17,2
        subu    $17,$22,$17
        addiu   $17,$17,1
        move    $4,$17
        jal     malloc
        nop
        sw      $2,-4($18)
        move    $5,$21
        move    $4,$2
        move    $6,$17
        addiu   $21,$21,1
        jal     memset
        nop
        addiu   $22,$22,37
        bne     $21,$20,$L5
        nop
        addiu   $17,$16,800
        move    $18,$16
$L6:
        lw      $4,0($18)
        addiu   $18,$18,8
        jal     free
        nop
        bne     $18,$17,$L6
        nop
        li      $9,458096640                        # 0x1b4e0000
        addiu   $8,$sp,20
        li      $7,37                 # 0x25
        li      $6,1                        # 0x1
        move    $18,$0
        ori     $9,$9,0x81b5
        li      $10,201           # 0xc9
$L8:
        multu   $7,$9
        lw      $3,0($8)
        mfhi    $4
        srl     $4,$4,5
        sll     $2,$4,2
        addu    $2,$2,$4
        sll     $4,$2,4
        subu    $4,$4,$2
        sll     $4,$4,2
        subu    $4,$7,$4
        addu    $4,$4,$3
$L7:
        lbu     $2,0($3)
        move    $5,$3
        xor     $2,$2,$6
        sltu    $2,$0,$2
        addu    $18,$18,$2
        addiu   $3,$3,1
        bne     $4,$5,$L7
        nop
        addiu   $6,$6,2
        addiu   $7,$7,74
        addiu   $8,$8,8
        bne     $6,$10,$L8
        nop
        move    $19,$16
$L9:
        li      $4,64                 # 0x40
        jal     malloc
        nop
        sw      $2,0($19)
        addiu   $19,$19,8
        bne     $19,$17,$L9
        nop
$L10:
        lw      $4,0($16)
        addiu   $16,$16,4
        jal     free
        nop
        bne     $16,$17,$L10
        nop
        lui     $4,%hi($LC11)
        move    $5,$18
        addiu   $4,$4,%lo($LC11)
        jal     printf
        nop
        li      $16,1000                    # 0x3e8
        move    $17,$0
$L11:
        li      $4,1000           # 0x3e8
        jal     malloc
        nop
        move    $4,$2
        addiu   $16,$16,-1
        sltu    $2,$0,$2
        addu    $17,$17,$2
        jal     free
        nop
        bne     $16,$0,$L11
        nop
        lui     $4,%hi($LC12)
        move    $5,$17
        addiu   $4,$4,%lo($LC12)
        jal     printf
        nop
        lw      $31,860($sp)
        lw      $22,856($sp)
        lw      $21,852($sp)
        lw      $20,848($sp)
        lw      $19,844($sp)
        lw      $18,840($sp)
        lw      $17,836($sp)
        lw      $16,832($sp)
        move    $2,$0
        addiu   $sp,$sp,864
        jr      $31
        nop
$L3:
        lw      $5,%lo(errno)($17)
        lui     $4,%hi($LC8)
        xori    $5,$5,0xc
        addiu   $4,$4,%lo($LC8)
        move    $6,$16
        sltu    $5,$5,1
        jal     printf
        nop
        move    $4,$16
        b       $L21
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
        .text
