# Convert the value 6.0 from s to d; f2 (ft2) holds 6.0.
.text
li t0, 6
fcvt.s.w f1, t0
fcvt.d.s f2, f1
