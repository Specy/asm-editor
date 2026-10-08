.data
a: .float -1.5
.text
# Apply neg.s to an initialized value; inspect $f0: raw bits 0x3FC00000.
l.s $f1, a
neg.s $f0, $f1
