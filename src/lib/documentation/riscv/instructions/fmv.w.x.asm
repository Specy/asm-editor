# The source bits encode single 1.0; fmv.w.x leaves the same 1.0 bits in the destination.
.text
li t0, 1065353216
fmv.w.x f1, t0
