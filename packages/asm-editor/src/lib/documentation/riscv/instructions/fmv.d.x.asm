# The source bits encode double 1.0; fmv.d.x leaves the same 1.0 bits in the destination.
.text
li t0, 4607182418800017408
fmv.d.x f1, t0
