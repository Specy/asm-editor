# The source bits encode double 1.0; fmv.x.d writes 0x3FF0000000000000 to t2.
.text
li t0, 4607182418800017408
fmv.d.x f1, t0
fmv.x.d t2, f1
