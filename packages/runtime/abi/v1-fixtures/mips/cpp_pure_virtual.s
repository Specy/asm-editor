        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC0:
        .ascii  "Shape constructor calls describe()\000"
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
        lui     $4,%hi($LC0)
        addiu   $sp,$sp,-24
        addiu   $4,$4,%lo($LC0)
        sw      $31,20($sp)
        jal     puts
        nop
        lui     $2,%hi(stdout)
        lw      $4,%lo(stdout)($2)
        jal     fflush
        nop
        jal     __cxa_pure_virtual
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
        .weak   __cxa_pure_virtual
        .text
