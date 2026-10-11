# Convert the value 6.0 from s to lu; t1 becomes 6.
.text
li t0, 6
fcvt.s.w f1, t0
fcvt.lu.s t1, f1
