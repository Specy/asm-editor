# Convert the value 6.0 from d to s; f2 (ft2) holds 6.0.
.text
li t0, 6
fcvt.d.w f1, t0
fcvt.s.d f2, f1
