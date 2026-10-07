# Convert the value 6.0 from s to w; t1 becomes 6.
.text
li t0, 6
fcvt.s.w f1, t0
fcvt.w.s t1, f1
