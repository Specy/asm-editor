        .option nopic
        .attribute arch, "rv32i2p1_m2p0_f2p2_d2p2_zicsr2p0"
        .attribute unaligned_access, 0
        .attribute stack_align, 16
        .text
.Ltext0:
        .section        .rodata.str1.4,"aMS",@progbits,1
        .align  2
.LC0:
        .string "[%d] [%i] [%u] [%o] [%x] [%X]\n"
        .align  2
.LC1:
        .string "returned %d\n"
        .align  2
.LC2:
        .string "[%5d] [%-5d] [%05d] [%+d] [% d] [%+5d] [%-+5d] [% 05d]\n"
        .align  2
.LC3:
        .string "[%.3d] [%8.3d] [%-8.3d] [%.0d] [%+.0d] [%5.0d]\n"
        .align  2
.LC4:
        .string "[%#x] [%#X] [%#o] [%#o] [%#x] [%#.3o] [%#10x] [%#010x]\n"
        .align  2
.LC5:
        .string "[%*d] [%-*d] [%*d] [%.*d] [%*.*d] [%.*d]\n"
        .align  2
.LC6:
        .string "[%d] [%d] [%u] [%x]\n"
        .align  2
.LC7:
        .string "[%hhd] [%hhu] [%hd] [%hu] [%hhx] [%hx]\n"
        .align  2
.LC8:
        .string "[%ld] [%lu] [%lx] [%lo]\n"
        .align  2
.LC9:
        .string "[%lld] [%lld] [%llu] [%llx] [%llX] [%llo]\n"
        .align  2
.LC13:
        .string "[%jd] [%ju] [%zd] [%zu] [%td] [%zx]\n"
        .align  2
.LC14:
        .string "[%d] [%c] [%5c] [%-5c] [%c%c%c]\n"
        .align  2
.LC15:
        .string "gone"
        .align  2
.LC16:
        .string "truncate"
        .align  2
.LC17:
        .string "xyz"
        .align  2
.LC18:
        .string "abcdef"
        .align  2
.LC19:
        .string "hi"
        .align  2
.LC20:
        .string "hello"
        .align  2
.LC21:
        .string "[%s] [%10s] [%-10s] [%.3s] [%10.2s] [%-10.4s] [%.0s] [%s]\n"
        .align  2
.LC22:
        .string ""
        .align  2
.LC23:
        .string "[%%] [%%%%] [100%%]\n"
        .align  2
.LC24:
        .string "world"
        .align  2
.LC25:
        .string "[%2$s %1$s] [%3$d %3$x] [%1$s]\n"
        .align  2
.LC27:
        .string "[%1$*2$d] [%1$-*2$d] [%3$.*4$f]\n"
        .align  2
.LC28:
        .string "%s"
        .align  2
.LC29:
        .string "empty returned %d\n"
        .align  2
.LC30:
        .string "%c"
        .align  2
.LC31:
        .string "|NUL returned %d\n"
        .align  2
.LC32:
        .string "fprintf"
        .align  2
.LC33:
        .string "%d-%s\n"
        .align  2
.LC34:
        .string "fprintf returned %d\n"
        .align  2
.LC35:
        .string "to stderr %d\n"
        .align  2
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
        addi    sp,sp,-64
        mv      a5,a6
        mv      a1,a3
        li      a4,8
        li      a2,-42
        addi    a0,a0,%lo(.LC0)
        sw      ra,60(sp)
        sw      s0,56(sp)
        sw      s1,52(sp)
        sw      s2,48(sp)
        sw      s3,44(sp)
        sw      s4,40(sp)
        call    printf
        mv      a1,a0
        lui     a0,%hi(.LC1)
        addi    a0,a0,%lo(.LC1)
        call    printf
        li      a7,42
        lui     a0,%hi(.LC2)
        sw      a7,0(sp)
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
        sw      s0,0(sp)
        mv      a7,s0
        mv      a2,s0
        mv      a1,s0
        mv      a3,a6
        li      a5,0
        li      a4,0
        addi    a0,a0,%lo(.LC4)
        call    printf
        li      s2,-1
        li      s1,7
        li      a3,6
        li      a6,3
        li      s3,5
        li      a5,8
        lui     a0,%hi(.LC5)
        li      a7,4
        sw      a6,8(sp)
        sw      a5,4(sp)
        sw      s1,20(sp)
        sw      s2,16(sp)
        sw      a3,12(sp)
        sw      s3,0(sp)
        mv      a1,a3
        li      a5,-6
        li      a4,2
        li      a2,1
        addi    a0,a0,%lo(.LC5)
        call    printf
        li      a2,-2147483648
        lui     a0,%hi(.LC6)
        add     a1,a2,s2
        mv      a4,s2
        mv      a3,s2
        addi    a0,a0,%lo(.LC6)
        call    printf
        li      a4,69632
        addi    a4,a4,368
        li      a2,300
        li      a6,131072
        lui     a0,%hi(.LC7)
        add     a6,a6,s2
        mv      a3,a4
        mv      a1,a2
        li      a5,511
        addi    a0,a0,%lo(.LC7)
        call    printf
        li      a3,-559038464
        li      a2,-294965248
        li      a1,-1999998976
        lui     a0,%hi(.LC8)
        addi    a1,a1,-1024
        addi    a3,a3,-273
        addi    a2,a2,-2048
        li      a4,511
        addi    a0,a0,%lo(.LC8)
        call    printf
        lui     a3,%hi(.LC10)
        lui     a4,%hi(.LC11)
        lw      a6,%lo(.LC10)(a3)
        lw      a7,%lo(.LC10+4)(a3)
        lui     a5,%hi(.LC12)
        lw      a3,%lo(.LC11+4)(a4)
        lw      a2,%lo(.LC11)(a4)
        lw      a4,%lo(.LC12)(a5)
        lw      a5,%lo(.LC12+4)(a5)
        sw      a3,12(sp)
        lui     a0,%hi(.LC9)
        li      a3,-2147483648
        sw      a6,16(sp)
        sw      a7,20(sp)
        sw      a2,8(sp)
        sw      a4,0(sp)
        sw      a5,4(sp)
        li      a6,-1
        li      a7,-1
        li      a4,0
        li      a5,-2147483648
        li      a2,-1
        addi    a3,a3,-1
        addi    a0,a0,%lo(.LC9)
        call    printf
        li      a4,12
        li      a5,4096
        sw      a4,0(sp)
        addi    a5,a5,-1348
        lui     a0,%hi(.LC13)
        li      a4,820129792
        li      a2,-410066944
        sw      a5,4(sp)
        li      a7,4
        li      a6,-5
        addi    a4,a4,1024
        li      a5,4
        addi    a2,a2,1536
        li      a3,-3
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
        lui     s2,%hi(.LC22)
        addi    a3,s2,%lo(.LC22)
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
        sw      a3,0(sp)
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
        lw      a4,%lo(.LC26)(a5)
        lw      a5,%lo(.LC26+4)(a5)
        lui     a0,%hi(.LC27)
        li      a6,2
        mv      a2,s3
        mv      a1,s1
        addi    a0,a0,%lo(.LC27)
        call    printf
        lui     a0,%hi(.LC28)
        addi    a1,s2,%lo(.LC22)
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
        lw      a0,%lo(stdout)(a5)
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
        lw      a0,%lo(stderr)(a5)
        lui     a1,%hi(.LC35)
        mv      a2,s1
        addi    a1,a1,%lo(.LC35)
        call    fprintf
        mv      a1,a0
        lui     a0,%hi(.LC36)
        addi    a0,a0,%lo(.LC36)
        call    printf
        lw      ra,60(sp)
        lw      s0,56(sp)
        lw      s1,52(sp)
        lw      s2,48(sp)
        lw      s3,44(sp)
        lw      s4,40(sp)
        li      a0,0
        addi    sp,sp,64
        jr      ra
.LFE0:
        .size   main, .-main
        .section        .srodata.cst8,"aM",@progbits,8
        .align  3
.LC10:
        .word   1402433619
        .word   5478256
        .align  3
.LC11:
        .word   1985229328
        .word   -19088744
        .align  3
.LC12:
        .word   -1985229329
        .word   19088743
        .align  3
.LC26:
        .word   -266631570
        .word   1074340345
        .text
.Letext0:
