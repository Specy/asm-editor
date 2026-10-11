.text
li t0, 2147483649
# t0=2147483649; sext.w writes −2147483647 (0xFFFFFFFF80000001) to t2.
sext.w t2, t0
