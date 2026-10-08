.data
a: .float -1.5
.text
# Apply mov.s to an initialized value; inspect $f0: raw bits 0xBFC00000.
l.s $f1, a
mov.s $f0, $f1
