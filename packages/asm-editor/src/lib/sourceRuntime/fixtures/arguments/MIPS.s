        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .rdata
        .align  2
$LC0:
        .ascii  "argc=%d\012\000"
        .align  2
$LC1:
        .ascii  "argv[%d]=%s\012\000"
        .text
        .align  2
        .globl  main
        .set    nomips16
        .set    nomicromips
        .ent    main
        .type   main, @function
main:
        .frame  $fp,32,$31      # vars= 8, regs= 2/0, args= 16, gp= 0
        .mask   0xc0000000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-32
        sw      $31,28($sp)
        sw      $fp,24($sp)
        move    $fp,$sp
        sw      $4,32($fp)
        sw      $5,36($fp)
        lw      $5,32($fp)
        lui     $2,%hi($LC0)
        addiu   $4,$2,%lo($LC0)
        jal     printf
        nop
        sw      $0,16($fp)
        b       $L2
        nop
$L3:
        lw      $2,16($fp)
        sll     $2,$2,2
        lw      $3,36($fp)
        addu    $2,$3,$2
        lw      $2,0($2)
        move    $6,$2
        lw      $5,16($fp)
        lui     $2,%hi($LC1)
        addiu   $4,$2,%lo($LC1)
        jal     printf
        nop
        lw      $2,16($fp)
        addiu   $2,$2,1
        sw      $2,16($fp)
$L2:
        lw      $3,16($fp)
        lw      $2,32($fp)
        slt     $2,$3,$2
        bne     $2,$0,$L3
        nop
        lw      $2,32($fp)
        sll     $2,$2,2
        lw      $3,36($fp)
        addu    $2,$3,$2
        lw      $2,0($2)
        sltu    $2,$0,$2
        andi    $2,$2,0x00ff
        move    $sp,$fp
        lw      $31,28($sp)
        lw      $fp,24($sp)
        addiu   $sp,$sp,32
        jr      $31
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
