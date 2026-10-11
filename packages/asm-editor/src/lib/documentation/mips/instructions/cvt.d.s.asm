.data
value: .float -1.5
.text
# Convert single -1.5 to double. Inspect $f2:$f3: -1.5 (raw bits 0xBFF8000000000000).
l.s $f4, value
cvt.d.s $f2, $f4
