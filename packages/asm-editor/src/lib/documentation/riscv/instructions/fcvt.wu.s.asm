# Convert the value 6.0 from s to wu; t1 becomes 6.
.text
li t0, 6
fcvt.s.w f1, t0
fcvt.wu.s t1, f1
