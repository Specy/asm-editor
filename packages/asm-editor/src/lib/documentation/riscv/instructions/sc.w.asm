# value is initialized and naturally aligned for this operation.
.data
value: .word 0x12345678
.text
la t0, value
# lr reserves value. The first sc.w succeeds (t2=0); the next has no fresh reservation (t4=1).
li t1, 42
lr.w t3, (t0)
sc.w t2, t1, (t0)
li t1, 99
sc.w t4, t1, (t0)
# t4=1 reports failure; value remains 42 rather than changing to 99.
