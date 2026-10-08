# The source bits encode single 1.0; fmv.s leaves the same 1.0 bits in the destination.
.text
li t0, 1065353216
fmv.s.x f1, t0
fmv.s f2, f1
