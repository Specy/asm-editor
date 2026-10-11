        .nan    legacy
        .module fp=32
        .module oddspreg
        .module arch=mips32
        .text
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
$LC1:
        .ascii  "%s: %04d-%02d-%02d %02d:%02d:%02d wday=%d yday=%d isdst="
        .ascii  "%d\012\000"
        .text
        .align  2
        .set    nomips16
        .set    nomicromips
        .ent    show
        .type   show, @function
show:
        .frame  $sp,56,$31      # vars= 0, regs= 1/0, args= 48, gp= 0
        .mask   0x80000000,-4
        .fmask  0x00000000,0
        .set    noreorder
        .set    nomacro
        lw      $7,16($5)
        lw      $6,20($5)
        lw      $12,32($5)
        lw      $11,28($5)
        lw      $10,24($5)
        lw      $9,0($5)
        lw      $8,4($5)
        lw      $3,8($5)
        lw      $2,12($5)
        addiu   $sp,$sp,-56
        move    $5,$4
        lui     $4,%hi($LC1)
        addiu   $7,$7,1
        sw      $12,40($sp)
        sw      $11,36($sp)
        sw      $10,32($sp)
        sw      $9,28($sp)
        sw      $8,24($sp)
        sw      $3,20($sp)
        sw      $2,16($sp)
        addiu   $6,$6,1900
        addiu   $4,$4,%lo($LC1)
        sw      $31,52($sp)
        jal     printf
        nop
        lw      $31,52($sp)
        addiu   $sp,$sp,56
        jr      $31
        nop
        .set    macro
        .set    reorder
        .end    show
        .size   show, .-show
        .section        .rodata.str1.4
        .align  2
$LC2:
        .ascii  "time plausible=%d stored equals returned=%d\012\000"
        .align  2
$LC3:
        .ascii  "time(NULL) not before=%d\012\000"
        .align  2
$LC4:
        .ascii  "clock non-decreasing=%d CLOCKS_PER_SEC=%ld\012\000"
        .align  2
$LC5:
        .ascii  "difftime=%g %g\012\000"
        .align  2
$LC6:
        .ascii  "gmtime(%lld)\000"
        .align  2
$LC7:
        .ascii  "localtime\000"
        .align  2
$LC8:
        .ascii  "mktime=%lld\012\000"
        .align  2
$LC9:
        .ascii  "normalized\000"
        .align  2
$LC10:
        .ascii  "mktime(gmtime(now)) == now: %d\012\000"
        .align  2
$LC11:
        .ascii  "y2k=%lld\012\000"
        .align  2
$LC12:
        .ascii  "month 13\000"
        .align  2
$LC13:
        .ascii  "asctime: %s\000"
        .align  2
$LC14:
        .ascii  "ctime: %s\000"
        .rdata
        .align  3
$LC0:
        .word   0
        .word   0
        .word   86399
        .word   0
        .word   951782400
        .word   0
        .word   951868800
        .word   0
        .word   1234567890
        .word   0
        .word   2147483647
        .word   0
        .word   -2147483648
        .word   0
        .word   -192522496
        .word   0
        .word   -86400
        .word   -1
        .word   2085978496
        .word   -1
        .word   -769665
        .word   58
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .set    nomips16
        .set    nomicromips
        .ent    main
        .type   main, @function
main:
        .frame  $sp,328,$31   # vars= 280, regs= 4/2, args= 24, gp= 0
        .mask   0x80070000,-12
        .fmask  0x00300000,-8
        .set    noreorder
        .set    nomacro
        addiu   $sp,$sp,-328
        addiu   $4,$sp,296
        move    $2,$0
        move    $3,$0
        sw      $31,316($sp)
        sw      $18,312($sp)
        sw      $17,308($sp)
        sw      $16,304($sp)
        sdc1    $f20,320($sp)
        sw      $2,296($sp)
        sw      $3,300($sp)
        jal     time
        nop
        lw      $6,296($sp)
        lw      $4,300($sp)
        xor     $6,$6,$2
        xor     $4,$4,$3
        or      $6,$6,$4
        sw      $2,288($sp)
        sw      $3,292($sp)
        sltu    $6,$6,1
        li      $5,1                        # 0x1
        blez    $3,$L20
        nop
$L5:
        lui     $4,%hi($LC2)
        addiu   $4,$4,%lo($LC2)
        jal     printf
        nop
        move    $4,$0
        jal     time
        nop
        lw      $4,292($sp)
        li      $5,1                        # 0x1
        slt     $6,$3,$4
        bne     $6,$0,$L8
        nop
        beq     $4,$3,$L21
        nop
$L7:
        lui     $4,%hi($LC3)
        addiu   $4,$4,%lo($LC3)
        jal     printf
        nop
        jal     clock
        nop
        li      $4,196608             # 0x30000
        sw      $0,280($sp)
        move    $16,$2
        sw      $0,284($sp)
        move    $3,$0
        addiu   $4,$4,3392
$L9:
        ldc1    $f2,280($sp)
        mtc1    $3,$f0
        addiu   $3,$3,1
        cvt.d.w $f0,$f0
        add.d   $f0,$f0,$f2
        sdc1    $f0,280($sp)
        bne     $3,$4,$L9
        nop
        jal     clock
        nop
        slt     $2,$2,$16
        bne     $2,$0,$L14
        nop
        nor     $5,$0,$16
        srl     $5,$5,31
$L10:
        li      $6,983040             # 0xf0000
        lui     $4,%hi($LC4)
        addiu   $6,$6,16960
        addiu   $4,$4,%lo($LC4)
        jal     printf
        nop
        li      $6,3                        # 0x3
        move    $7,$0
        li      $4,10                 # 0xa
        move    $5,$0
        jal     difftime
        nop
        mov.d   $f20,$f0
        li      $6,65536                    # 0x10000
        ori     $6,$6,0x5180
        move    $7,$0
        move    $4,$0
        move    $5,$0
        jal     difftime
        nop
        mfc1    $6,$f20
        mfc1    $7,$f21
        lui     $4,%hi($LC5)
        addiu   $4,$4,%lo($LC5)
        sdc1    $f0,16($sp)
        jal     printf
        nop
        lui     $2,%hi($LC0)
        addiu   $2,$2,%lo($LC0)
        addiu   $3,$sp,24
        addiu   $4,$2,80
$L11:
        lw      $8,0($2)
        lw      $7,4($2)
        lw      $6,8($2)
        lw      $5,12($2)
        addiu   $2,$2,16
        sw      $8,0($3)
        sw      $7,4($3)
        sw      $6,8($3)
        sw      $5,12($3)
        addiu   $3,$3,16
        bne     $2,$4,$L11
        nop
        lw      $4,0($2)
        lw      $2,4($2)
        lui     $18,%hi($LC6)
        sw      $4,0($3)
        sw      $2,4($3)
        addiu   $16,$sp,24
        addiu   $17,$sp,112
        addiu   $18,$18,%lo($LC6)
$L12:
        lw      $3,4($16)
        lw      $2,0($16)
        move    $6,$18
        sw      $3,20($sp)
        li      $5,32                 # 0x20
        move    $4,$17
        sw      $2,16($sp)
        jal     snprintf
        nop
        move    $4,$16
        jal     gmtime
        nop
        move    $5,$2
        move    $4,$17
        addiu   $16,$16,8
        jal     show
        nop
        bne     $17,$16,$L12
        nop
        li      $2,1699938304                 # 0x65530000
        move    $3,$0
        addiu   $4,$sp,272
        ori     $2,$2,0xf100
        sw      $3,276($sp)
        sw      $2,272($sp)
        jal     localtime
        nop
        lui     $4,%hi($LC7)
        move    $5,$2
        addiu   $4,$4,%lo($LC7)
        jal     show
        nop
        li      $2,124                  # 0x7c
        sw      $2,240($sp)
        li      $2,61                 # 0x3d
        sw      $2,232($sp)
        li      $2,25                 # 0x19
        sw      $2,228($sp)
        li      $2,-30                  # 0xffffffffffffffe2
        addiu   $4,$sp,220
        sw      $2,224($sp)
        li      $2,-1                 # 0xffffffffffffffff
        sw      $0,220($sp)
        sw      $0,236($sp)
        sw      $0,244($sp)
        sw      $0,248($sp)
        sw      $2,252($sp)
        jal     mktime
        nop
        lui     $4,%hi($LC8)
        move    $7,$3
        move    $6,$2
        addiu   $4,$4,%lo($LC8)
        jal     printf
        nop
        lui     $4,%hi($LC9)
        addiu   $5,$sp,220
        addiu   $4,$4,%lo($LC9)
        jal     show
        nop
        addiu   $4,$sp,288
        jal     gmtime
        nop
        addiu   $4,$2,32
        addiu   $3,$sp,184
$L13:
        lw      $8,0($2)
        lw      $7,4($2)
        lw      $6,8($2)
        lw      $5,12($2)
        addiu   $2,$2,16
        sw      $8,0($3)
        sw      $7,4($3)
        sw      $6,8($3)
        sw      $5,12($3)
        addiu   $3,$3,16
        bne     $2,$4,$L13
        nop
        lw      $2,0($2)
        addiu   $4,$sp,184
        sw      $2,0($3)
        jal     mktime
        nop
        move    $4,$3
        lw      $3,288($sp)
        li      $16,1                 # 0x1
        xor     $3,$3,$2
        lw      $2,292($sp)
        xor     $2,$2,$4
        or      $5,$3,$2
        lui     $4,%hi($LC10)
        sltu    $5,$5,1
        addiu   $4,$4,%lo($LC10)
        jal     printf
        nop
        addiu   $4,$sp,148
        li      $2,100                  # 0x64
        sw      $16,160($sp)
        sw      $0,148($sp)
        sw      $0,152($sp)
        sw      $0,156($sp)
        sw      $0,164($sp)
        sw      $0,172($sp)
        sw      $0,176($sp)
        sw      $0,180($sp)
        sw      $2,168($sp)
        jal     mktime
        nop
        lui     $4,%hi($LC11)
        move    $6,$2
        move    $7,$3
        addiu   $4,$4,%lo($LC11)
        jal     printf
        nop
        li      $2,13                 # 0xd
        move    $4,$17
        sw      $2,128($sp)
        li      $2,99                 # 0x63
        sw      $16,124($sp)
        sw      $0,112($sp)
        sw      $0,116($sp)
        sw      $0,120($sp)
        sw      $0,136($sp)
        sw      $0,140($sp)
        sw      $0,144($sp)
        sw      $2,132($sp)
        jal     mktime
        nop
        lui     $4,%hi($LC12)
        move    $5,$17
        addiu   $4,$4,%lo($LC12)
        jal     show
        nop
        move    $3,$0
        addiu   $4,$sp,264
        move    $2,$0
        sw      $3,268($sp)
        sw      $2,264($sp)
        jal     gmtime
        nop
        move    $4,$2
        jal     asctime
        nop
        lui     $4,%hi($LC13)
        move    $5,$2
        addiu   $4,$4,%lo($LC13)
        jal     printf
        nop
        li      $2,951779328                        # 0x38bb0000
        addiu   $4,$sp,256
        move    $3,$0
        ori     $2,$2,0xc00
        sw      $3,260($sp)
        sw      $2,256($sp)
        jal     ctime
        nop
        lui     $4,%hi($LC14)
        move    $5,$2
        addiu   $4,$4,%lo($LC14)
        jal     printf
        nop
        lw      $31,316($sp)
        ldc1    $f20,320($sp)
        lw      $18,312($sp)
        lw      $17,308($sp)
        lw      $16,304($sp)
        move    $2,$0
        addiu   $sp,$sp,328
        jr      $31
        nop
$L21:
        lw      $3,288($sp)
        sltu    $2,$2,$3
        beq     $2,$0,$L7
        nop
$L8:
        move    $5,$0
        b       $L7
        nop
$L14:
        move    $5,$0
        b       $L10
        nop
$L20:
        bne     $3,$0,$L6
        nop
        li      $3,946667520                        # 0x386d0000
        addiu   $3,$3,17280
        sltu    $2,$2,$3
        beq     $2,$0,$L5
        nop
$L6:
        move    $5,$0
        b       $L5
        nop
        .set    macro
        .set    reorder
        .end    main
        .size   main, .-main
        .text
