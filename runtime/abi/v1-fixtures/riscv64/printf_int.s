        .option nopic
        .attribute arch, "rv64i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.8,"aMS",@progbits,1
        .align  3
.LC0:
        .string "[%d] [%i] [%u] [%o] [%x] [%X]\n"
        .align  3
.LC1:
        .string "returned %d\n"
        .align  3
.LC2:
        .string "[%5d] [%-5d] [%05d] [%+d] [% d] [%+5d] [%-+5d] [% 05d]\n"
        .align  3
.LC3:
        .string "[%.3d] [%8.3d] [%-8.3d] [%.0d] [%+.0d] [%5.0d]\n"
        .align  3
.LC4:
        .string "[%#x] [%#X] [%#o] [%#o] [%#x] [%#.3o] [%#10x] [%#010x]\n"
        .align  3
.LC5:
        .string "[%*d] [%-*d] [%*d] [%.*d] [%*.*d] [%.*d]\n"
        .align  3
.LC6:
        .string "[%d] [%d] [%u] [%x]\n"
        .align  3
.LC7:
        .string "[%hhd] [%hhu] [%hd] [%hu] [%hhx] [%hx]\n"
        .align  3
.LC8:
        .string "[%ld] [%lu] [%lx] [%lo]\n"
        .align  3
.LC12:
        .string "[%lld] [%lld] [%llu] [%llx] [%llX] [%llo]\n"
        .align  3
.LC13:
        .string "[%jd] [%ju] [%zd] [%zu] [%td] [%zx]\n"
        .align  3
.LC14:
        .string "[%d] [%c] [%5c] [%-5c] [%c%c%c]\n"
        .align  3
.LC15:
        .string "gone"
        .align  3
.LC16:
        .string "truncate"
        .align  3
.LC17:
        .string "xyz"
        .align  3
.LC18:
        .string "abcdef"
        .align  3
.LC19:
        .string "hi"
        .align  3
.LC20:
        .string "hello"
        .align  3
.LC21:
        .string "[%s] [%10s] [%-10s] [%.3s] [%10.2s] [%-10.4s] [%.0s] [%s]\n"
        .align  3
.LC22:
        .string ""
        .align  3
.LC23:
        .string "[%%] [%%%%] [100%%]\n"
        .align  3
.LC24:
        .string "world"
        .align  3
.LC25:
        .string "[%2$s %1$s] [%3$d %3$x] [%1$s]\n"
        .align  3
.LC27:
        .string "[%1$*2$d] [%1$-*2$d] [%3$.*4$f]\n"
        .align  3
.LC28:
        .string "%s"
        .align  3
.LC29:
        .string "empty returned %d\n"
        .align  3
.LC30:
        .string "%c"
        .align  3
.LC31:
        .string "|NUL returned %d\n"
        .align  3
.LC32:
        .string "fprintf"
        .align  3
.LC33:
        .string "%d-%s\n"
        .align  3
.LC34:
        .string "fprintf returned %d\n"
        .align  3
.LC35:
        .string "to stderr %d\n"
        .align  3
.LC36:
        .string "stderr returned %d\n"
        .section        .text.startup,"ax",@progbits
        .align  2
        .globl  main
        .type   main, @function
main:
.LFB0:
        li      a6,255
        li      a3,42
        lui     a0,%hi(.LC0)
        addi    sp,sp,-96
        mv      a5,a6
        mv      a1,a3
        li      a4,8
        li      a2,-42
        addi    a0,a0,%lo(.LC0)
        sd      ra,88(sp)
        sd      s0,80(sp)
        sd      s1,72(sp)
        sd      s2,64(sp)
        sd      s3,56(sp)
        sd      s4,48(sp)
        call    printf
        mv      a1,a0
        lui     a0,%hi(.LC1)
        addi    a0,a0,%lo(.LC1)
        call    printf
        li      a7,42
        lui     a0,%hi(.LC2)
        sd      a7,0(sp)
        mv      a6,a7
        mv      a5,a7
        mv      a4,a7
        mv      a3,a7
        mv      a2,a7
        mv      a1,a7
        addi    a0,a0,%lo(.LC2)
        call    printf
        li      a3,7
        lui     a0,%hi(.LC3)
        mv      a2,a3
        mv      a1,a3
        li      a6,0
        li      a5,0
        li      a4,0
        addi    a0,a0,%lo(.LC3)
        call    printf
        li      s0,255
        li      a6,8
        lui     a0,%hi(.LC4)
        sd      s0,0(sp)
        mv      a7,s0
        mv      a2,s0
        mv      a1,s0
        mv      a3,a6
        li      a5,0
        li      a4,0
        addi    a0,a0,%lo(.LC4)
        call    printf
        li      s1,-1
        li      s2,7
        li      a3,6
        li      a6,3
        li      s3,5
        li      a5,8
        lui     a0,%hi(.LC5)
        li      a7,4
        sd      a6,16(sp)
        sd      a5,8(sp)
        sd      s2,40(sp)
        sd      s1,32(sp)
        sd      a3,24(sp)
        sd      s3,0(sp)
        mv      a1,a3
        li      a5,-6
        li      a4,2
        li      a2,1
        addi    a0,a0,%lo(.LC5)
        call    printf
        li      a2,-2147483648
        lui     a0,%hi(.LC6)
        mv      a4,s1
        mv      a3,s1
        not     a1,a2
        addi    a0,a0,%lo(.LC6)
        call    printf
        li      a4,69632
        addi    a4,a4,368
        li      a2,300
        li      a6,131072
        lui     a0,%hi(.LC7)
        add     a6,a6,s1
        mv      a3,a4
        mv      a1,a2
        li      a5,511
        addi    a0,a0,%lo(.LC7)
        call    printf
        li      a3,933982208
        li      a2,1953792
        slli    a3,a3,2
        addi    a2,a2,-667
        li      a1,-1999998976
        lui     a0,%hi(.LC8)
        addi    a3,a3,-273
        slli    a2,a2,11
        addi    a1,a1,-1024
        li      a4,511
        addi    a0,a0,%lo(.LC8)
        call    printf
        li      t3,5476352
        li      t1,-19087360
        li      a7,19087360
        addi    t3,t3,1904
        li      a6,1402433536
        addi    t1,t1,-1384
        li      a5,1985228800
        addi    a7,a7,1384
        li      a4,-1985228800
        slli    t3,t3,32
        slli    t1,t1,32
        slli    a7,a7,32
        addi    a6,a6,83
        addi    a5,a5,528
        addi    a4,a4,-529
        lui     a0,%hi(.LC12)
        add     a6,t3,a6
        add     a5,t1,a5
        add     a4,a7,a4
        mv      a3,s1
        slli    a2,s1,63
        srli    a1,s1,1
        addi    a0,a0,%lo(.LC12)
        call    printf
        li      a2,17580032
        li      a1,-17580032
        addi    a2,a2,-1907
        addi    a1,a1,1907
        li      a6,4096
        lui     a0,%hi(.LC13)
        slli    a2,a2,10
        slli    a1,a1,9
        addi    a6,a6,-1348
        li      a5,12
        li      a4,4
        li      a3,-5
        addi    a0,a0,%lo(.LC13)
        call    printf
        lui     a0,%hi(.LC14)
        li      a7,99
        li      a6,98
        li      a5,97
        li      a4,122
        li      a3,121
        li      a2,120
        li      a1,1
        addi    a0,a0,%lo(.LC14)
        call    printf
        lui     s1,%hi(.LC22)
        addi    a3,s1,%lo(.LC22)
        lui     s4,%hi(.LC20)
        lui     a2,%hi(.LC19)
        lui     a7,%hi(.LC15)
        lui     a6,%hi(.LC16)
        lui     a5,%hi(.LC17)
        lui     a4,%hi(.LC18)
        lui     a0,%hi(.LC21)
        addi    a7,a7,%lo(.LC15)
        addi    a6,a6,%lo(.LC16)
        addi    a5,a5,%lo(.LC17)
        addi    a4,a4,%lo(.LC18)
        addi    a1,s4,%lo(.LC20)
        sd      a3,0(sp)
        addi    a0,a0,%lo(.LC21)
        addi    a3,a2,%lo(.LC19)
        addi    a2,a2,%lo(.LC19)
        call    printf
        lui     a0,%hi(.LC23)
        addi    a0,a0,%lo(.LC23)
        call    printf
        lui     a1,%hi(.LC24)
        lui     a0,%hi(.LC25)
        mv      a3,s0
        addi    a2,s4,%lo(.LC20)
        addi    a1,a1,%lo(.LC24)
        addi    a0,a0,%lo(.LC25)
        call    printf
        lui     a5,%hi(.LC26)
        ld      a3,%lo(.LC26)(a5)
        lui     a0,%hi(.LC27)
        li      a4,2
        mv      a2,s3
        mv      a1,s2
        addi    a0,a0,%lo(.LC27)
        call    printf
        lui     a0,%hi(.LC28)
        addi    a1,s1,%lo(.LC22)
        addi    a0,a0,%lo(.LC28)
        call    printf
        mv      a1,a0
        lui     a0,%hi(.LC29)
        addi    a0,a0,%lo(.LC29)
        call    printf
        lui     a0,%hi(.LC30)
        li      a1,0
        addi    a0,a0,%lo(.LC30)
        call    printf
        mv      a1,a0
        lui     a0,%hi(.LC31)
        addi    a0,a0,%lo(.LC31)
        call    printf
        lui     a5,%hi(stdout)
        ld      a0,%lo(stdout)(a5)
        lui     a3,%hi(.LC32)
        li      a2,12288
        lui     a1,%hi(.LC33)
        addi    a3,a3,%lo(.LC32)
        addi    a2,a2,57
        addi    a1,a1,%lo(.LC33)
        call    fprintf
        mv      a1,a0
        lui     a0,%hi(.LC34)
        addi    a0,a0,%lo(.LC34)
        call    printf
        lui     a5,%hi(stderr)
        ld      a0,%lo(stderr)(a5)
        lui     a1,%hi(.LC35)
        mv      a2,s2
        addi    a1,a1,%lo(.LC35)
        call    fprintf
        mv      a1,a0
        lui     a0,%hi(.LC36)
        addi    a0,a0,%lo(.LC36)
        call    printf
        ld      ra,88(sp)
        ld      s0,80(sp)
        ld      s1,72(sp)
        ld      s2,64(sp)
        ld      s3,56(sp)
        ld      s4,48(sp)
        li      a0,0
        addi    sp,sp,96
        jr      ra
.LFE0:
        .size   main, .-main
        .section        .srodata.cst8,"aM",@progbits,8
        .align  3
.LC26:
        .word   -266631570
        .word   1074340345
        .text
.Letext0:
