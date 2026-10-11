        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC0:
        .ascii  "handler ran\000"
        .text
        .align  2
        .set    nomips16
        .set    nomicromips
        .ent    handler
        .type   handler, @function
handler:
        .frame  $sp,0,$31         # vars= 0, regs= 0/0, args= 0, gp= 0
        .mask   0x00000000,0
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        lui     $4,%hi($LC0)
        addiu   $4,$4,%lo($LC0)
        j       puts
        nop
        .set    macro
        .set    reorder
        .end    handler
        .size   handler, .-handler
        .section        .rodata.str1.4
        .align  2
$LC1:
        .ascii  "exiting at level %d\012\000"
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
        lui     $4,%hi(handler)
        addiu   $sp,$sp,-24
        addiu   $4,$4,%lo(handler)
        sw      $31,20($sp)
        jal     atexit
        nop
        lui     $4,%hi($LC1)
        addiu   $4,$4,%lo($LC1)
        li      $5,3                        # 0x3
        jal     printf
        nop
        li      $4,7                        # 0x7
        jal     exit
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
        .text
