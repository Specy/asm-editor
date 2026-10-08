# The source bits encode single 1.0; fmv.x.s writes 0x3F800000 to t2.
.text
li t0, 1065353216
fmv.s.x f1, t0
fmv.x.s t2, f1
