        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC0:
        .ascii  "[%d] [%i] [%u] [%o] [%x] [%X]\012\000"
        .align  2
$LC1:
        .ascii  "returned %d\012\000"
        .align  2
$LC2:
        .ascii  "[%5d] [%-5d] [%05d] [%+d] [% d] [%+5d] [%-+5d] [% 05d]\012"
        .ascii  "\000"
        .align  2
$LC3:
        .ascii  "[%.3d] [%8.3d] [%-8.3d] [%.0d] [%+.0d] [%5.0d]\012\000"
        .align  2
$LC4:
        .ascii  "[%#x] [%#X] [%#o] [%#o] [%#x] [%#.3o] [%#10x] [%#010x]\012"
        .ascii  "\000"
        .align  2
$LC5:
        .ascii  "[%*d] [%-*d] [%*d] [%.*d] [%*.*d] [%.*d]\012\000"
        .align  2
$LC6:
        .ascii  "[%d] [%d] [%u] [%x]\012\000"
        .align  2
$LC7:
        .ascii  "[%hhd] [%hhu] [%hd] [%hu] [%hhx] [%hx]\012\000"
        .align  2
$LC8:
        .ascii  "[%ld] [%lu] [%lx] [%lo]\012\000"
        .align  2
$LC9:
        .ascii  "[%lld] [%lld] [%llu] [%llx] [%llX] [%llo]\012\000"
        .align  2
$LC10:
        .ascii  "[%jd] [%ju] [%zd] [%zu] [%td] [%zx]\012\000"
        .align  2
$LC11:
        .ascii  "[%d] [%c] [%5c] [%-5c] [%c%c%c]\012\000"
        .align  2
$LC12:
        .ascii  "hi\000"
        .align  2
$LC13:
        .ascii  "hello\000"
        .align  2
$LC14:
        .ascii  "[%s] [%10s] [%-10s] [%.3s] [%10.2s] [%-10.4s] [%.0s] [%s"
        .ascii  "]\012\000"
        .align  2
$LC15:
        .ascii  "\000"
        .align  2
$LC16:
        .ascii  "gone\000"
        .align  2
$LC17:
        .ascii  "truncate\000"
        .align  2
$LC18:
        .ascii  "xyz\000"
        .align  2
$LC19:
        .ascii  "abcdef\000"
        .align  2
$LC20:
        .ascii  "[%%] [%%%%] [100%%]\012\000"
        .align  2
$LC21:
        .ascii  "world\000"
        .align  2
$LC22:
        .ascii  "[%2$s %1$s] [%3$d %3$x] [%1$s]\012\000"
        .align  2
$LC23:
        .ascii  "[%1$*2$d] [%1$-*2$d] [%3$.*4$f]\012\000"
        .align  2
$LC25:
        .ascii  "%s\000"
        .align  2
$LC26:
        .ascii  "empty returned %d\012\000"
        .align  2
$LC27:
        .ascii  "%c\000"
        .align  2
$LC28:
        .ascii  "|NUL returned %d\012\000"
        .align  2
$LC29:
        .ascii  "fprintf\000"
        .align  2
$LC30:
        .ascii  "%d-%s\012\000"
        .align  2
$LC31:
        .ascii  "fprintf returned %d\012\000"
        .align  2
$LC32:
        .ascii  "to stderr %d\012\000"
        .align  2
$LC33:
        .ascii  "stderr returned %d\012\000"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .set    nomips16
        .set    nomicromips
        .ent    main
        .type   main, @function
main:
        .frame  $sp,80,$31      # vars= 0, regs= 5/0, args= 56, gp= 0
        .mask   0x800f0000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-80
        lui     $4,%hi($LC0)
        sw      $17,64($sp)
        sw      $16,60($sp)
        li      $17,8                 # 0x8
        li      $16,255           # 0xff
        sw      $16,24($sp)
        sw      $16,20($sp)
        sw      $17,16($sp)
        li      $7,42                 # 0x2a
        li      $6,-42                  # 0xffffffffffffffd6
        li      $5,42                 # 0x2a
        addiu   $4,$4,%lo($LC0)
        sw      $31,76($sp)
        sw      $19,72($sp)
        sw      $18,68($sp)
        jal     printf
        nop
        lui     $4,%hi($LC1)
        move    $5,$2
        addiu   $4,$4,%lo($LC1)
        jal     printf
        nop
        li      $2,42                 # 0x2a
        lui     $4,%hi($LC2)
        sw      $2,32($sp)
        sw      $2,28($sp)
        sw      $2,24($sp)
        sw      $2,20($sp)
        sw      $2,16($sp)
        li      $7,42                 # 0x2a
        li      $6,42                 # 0x2a
        li      $5,42                 # 0x2a
        addiu   $4,$4,%lo($LC2)
        jal     printf
        nop
        lui     $4,%hi($LC3)
        sw      $0,24($sp)
        sw      $0,20($sp)
        sw      $0,16($sp)
        li      $7,7                        # 0x7
        li      $6,7                        # 0x7
        li      $5,7                        # 0x7
        addiu   $4,$4,%lo($LC3)
        jal     printf
        nop
        lui     $4,%hi($LC4)
        sw      $16,32($sp)
        sw      $16,28($sp)
        sw      $17,24($sp)
        sw      $0,20($sp)
        sw      $0,16($sp)
        li      $7,8                        # 0x8
        li      $6,255                  # 0xff
        li      $5,255                  # 0xff
        addiu   $4,$4,%lo($LC4)
        jal     printf
        nop
        li      $3,7                        # 0x7
        li      $2,3                        # 0x3
        sw      $3,52($sp)
        li      $3,6                        # 0x6
        li      $19,-1                  # 0xffffffffffffffff
        li      $16,4                 # 0x4
        li      $18,2                 # 0x2
        sw      $3,44($sp)
        sw      $2,40($sp)
        li      $3,5                        # 0x5
        sw      $2,24($sp)
        lui     $4,%hi($LC5)
        li      $2,-6                 # 0xfffffffffffffffa
        sw      $3,32($sp)
        sw      $19,48($sp)
        sw      $17,36($sp)
        sw      $16,28($sp)
        sw      $18,16($sp)
        sw      $2,20($sp)
        li      $7,6                        # 0x6
        li      $6,1                        # 0x1
        li      $5,6                        # 0x6
        addiu   $4,$4,%lo($LC5)
        jal     printf
        nop
        li      $5,2147418112                 # 0x7fff0000
        lui     $4,%hi($LC6)
        sw      $19,16($sp)
        li      $7,-1                 # 0xffffffffffffffff
        li      $6,-2147483648                  # 0xffffffff80000000
        ori     $5,$5,0xffff
        addiu   $4,$4,%lo($LC6)
        jal     printf
        nop
        li      $2,65536                    # 0x10000
        addiu   $7,$2,4464
        li      $17,511           # 0x1ff
        ori     $2,$2,0xffff
        lui     $4,%hi($LC7)
        sw      $17,20($sp)
        sw      $7,16($sp)
        sw      $2,24($sp)
        li      $6,300                  # 0x12c
        li      $5,300                  # 0x12c
        addiu   $4,$4,%lo($LC7)
        jal     printf
        nop
        li      $7,-559087616                 # 0xffffffffdead0000
        li      $6,-294977536                 # 0xffffffffee6b0000
        li      $5,-2000027648                  # 0xffffffff88ca0000
        lui     $4,%hi($LC8)
        addiu   $5,$5,27648
        sw      $17,16($sp)
        ori     $7,$7,0xbeef
        addiu   $6,$6,10240
        addiu   $4,$4,%lo($LC8)
        jal     printf
        nop
        li      $2,1402404864                 # 0x53970000
        li      $3,5439488              # 0x530000
        ori     $2,$2,0x7053
        ori     $3,$3,0x9770
        sw      $2,48($sp)
        sw      $3,52($sp)
        li      $2,1985216512                 # 0x76540000
        li      $3,-19136512                        # 0xfffffffffedc0000
        ori     $2,$2,0x3210
        ori     $3,$3,0xba98
        sw      $2,40($sp)
        sw      $3,44($sp)
        li      $2,-1985282048                  # 0xffffffff89ab0000
        li      $3,19070976       # 0x1230000
        ori     $2,$2,0xcdef
        ori     $3,$3,0x4567
        sw      $2,32($sp)
        sw      $3,36($sp)
        li      $2,-1                 # 0xffffffffffffffff
        li      $3,-1                 # 0xffffffffffffffff
        sw      $2,24($sp)
        sw      $3,28($sp)
        move    $2,$0
        li      $3,-2147483648                  # 0xffffffff80000000
        li      $7,2147418112                 # 0x7fff0000
        lui     $4,%hi($LC9)
        sw      $3,20($sp)
        sw      $2,16($sp)
        li      $6,-1                 # 0xffffffffffffffff
        ori     $7,$7,0xffff
        addiu   $4,$4,%lo($LC9)
        jal     printf
        nop
        li      $2,2748           # 0xabc
        sw      $2,36($sp)
        li      $2,12                 # 0xc
        sw      $2,32($sp)
        li      $2,-5                 # 0xfffffffffffffffb
        sw      $2,24($sp)
        li      $2,820117504                        # 0x30e20000
        li      $3,4                        # 0x4
        ori     $2,$2,0x3400
        li      $6,-410124288                 # 0xffffffffe78e0000
        lui     $4,%hi($LC10)
        sw      $3,20($sp)
        sw      $16,28($sp)
        sw      $2,16($sp)
        ori     $6,$6,0xe600
        li      $7,-3                 # 0xfffffffffffffffd
        addiu   $4,$4,%lo($LC10)
        jal     printf
        nop
        li      $2,99                 # 0x63
        sw      $2,28($sp)
        li      $2,98                 # 0x62
        sw      $2,24($sp)
        li      $2,97                 # 0x61
        sw      $2,20($sp)
        lui     $4,%hi($LC11)
        li      $2,122                  # 0x7a
        sw      $2,16($sp)
        li      $7,121                  # 0x79
        li      $6,120                  # 0x78
        li      $5,1                        # 0x1
        addiu   $4,$4,%lo($LC11)
        jal     printf
        nop
        lui     $2,%hi($LC16)
        addiu   $2,$2,%lo($LC16)
        sw      $2,28($sp)
        lui     $2,%hi($LC17)
        addiu   $2,$2,%lo($LC17)
        sw      $2,24($sp)
        lui     $2,%hi($LC18)
        addiu   $2,$2,%lo($LC18)
        sw      $2,20($sp)
        lui     $16,%hi($LC15)
        lui     $7,%hi($LC12)
        lui     $2,%hi($LC19)
        addiu   $7,$7,%lo($LC12)
        addiu   $16,$16,%lo($LC15)
        lui     $17,%hi($LC13)
        addiu   $2,$2,%lo($LC19)
        lui     $4,%hi($LC14)
        move    $6,$7
        addiu   $5,$17,%lo($LC13)
        sw      $16,32($sp)
        sw      $2,16($sp)
        addiu   $4,$4,%lo($LC14)
        jal     printf
        nop
        lui     $4,%hi($LC20)
        addiu   $4,$4,%lo($LC20)
        jal     printf
        nop
        lui     $5,%hi($LC21)
        lui     $4,%hi($LC22)
        li      $7,255                  # 0xff
        addiu   $6,$17,%lo($LC13)
        addiu   $5,$5,%lo($LC21)
        addiu   $4,$4,%lo($LC22)
        jal     printf
        nop
        lui     $2,%hi($LC24)
        ldc1    $f0,%lo($LC24)($2)
        lui     $4,%hi($LC23)
        li      $6,5                        # 0x5
        sdc1    $f0,16($sp)
        sw      $18,24($sp)
        li      $5,7                        # 0x7
        addiu   $4,$4,%lo($LC23)
        jal     printf
        nop
        lui     $4,%hi($LC25)
        move    $5,$16
        addiu   $4,$4,%lo($LC25)
        jal     printf
        nop
        lui     $4,%hi($LC26)
        move    $5,$2
        addiu   $4,$4,%lo($LC26)
        jal     printf
        nop
        lui     $4,%hi($LC27)
        move    $5,$0
        addiu   $4,$4,%lo($LC27)
        jal     printf
        nop
        lui     $4,%hi($LC28)
        move    $5,$2
        addiu   $4,$4,%lo($LC28)
        jal     printf
        nop
        lui     $2,%hi(stdout)
        lw      $4,%lo(stdout)($2)
        lui     $7,%hi($LC29)
        lui     $5,%hi($LC30)
        addiu   $7,$7,%lo($LC29)
        li      $6,12345                    # 0x3039
        addiu   $5,$5,%lo($LC30)
        jal     fprintf
        nop
        lui     $4,%hi($LC31)
        move    $5,$2
        addiu   $4,$4,%lo($LC31)
        jal     printf
        nop
        lui     $2,%hi(stderr)
        lw      $4,%lo(stderr)($2)
        lui     $5,%hi($LC32)
        li      $6,7                        # 0x7
        addiu   $5,$5,%lo($LC32)
        jal     fprintf
        nop
        lui     $4,%hi($LC33)
        move    $5,$2
        addiu   $4,$4,%lo($LC33)
        jal     printf
        nop
        lw      $31,76($sp)
        lw      $19,72($sp)
        lw      $18,68($sp)
        lw      $17,64($sp)
        lw      $16,60($sp)
        move    $2,$0
        addiu   $sp,$sp,80
        jr      $31
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
        .section        .rodata.cst8,"aM",@progbits,8
        .align  3
$LC24:
        .word   -266631570
        .word   1074340345
        .text
