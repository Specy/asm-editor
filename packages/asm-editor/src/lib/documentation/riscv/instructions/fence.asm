# Store 42, order reads and writes before reads and writes, then load 42 back. This single-threaded emulator cannot show ordering between harts.
.data
value: .word 0
.text
la t0, value
li t1, 42
sw t1, 0(t0)
fence 3, 3
lw t2, 0(t0)
