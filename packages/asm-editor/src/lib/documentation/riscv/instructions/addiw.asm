.text
li t0, 2147483647
# t0=2147483647, immediate 1; addiw writes -2147483648 (0xFFFFFFFF80000000) to t2.
addiw t2, t0, 1
