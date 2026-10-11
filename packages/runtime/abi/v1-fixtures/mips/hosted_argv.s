        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC0:
        .ascii  "valid argv=%d\012\000"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .set    nomips16
        .set    nomicromips
        .ent    main
        .type   main, @function
main:
        .frame  $sp,24,$31      # vars= 0, regs= 1/0, args= 16, gp= 0
        .mask   0x80000000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-24
        sw      $31,20($sp)
        beq     $5,$0,$L3
        nop
        sll     $4,$4,2
        addu    $5,$5,$4
        lw      $5,0($5)
        sltu    $5,$5,1
$L2:
        lui     $4,%hi($LC0)
        addiu   $4,$4,%lo($LC0)
        jal     printf
        nop
        lw      $31,20($sp)
        move    $2,$0
        addiu   $sp,$sp,24
        jr      $31
        nop
$L3:
        move    $5,$0
        b       $L2
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
        .text
