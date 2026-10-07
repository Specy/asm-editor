.text
li t0, 1
# t0=1 is below the sign-extended all-ones immediate when compared unsigned; sltiu writes 1 to t2.
sltiu t2, t0, -1
