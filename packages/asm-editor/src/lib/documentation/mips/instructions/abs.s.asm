.data
a: .float -1.5
.text
# Apply abs.s to an initialized value; inspect $f0: raw bits 0x3FC00000.
l.s $f1, a
abs.s $f0, $f1
