# Convert the value 6.0 from d to w; t1 becomes 6.
.text
li t0, 6
fcvt.d.w f1, t0
fcvt.w.d t1, f1
