.data
value: .float 2.25
.text
# Take sqrt of 2.25. Inspect $f0: 1.5 (raw bits 0x3FC00000).
l.s $f2, value
sqrt.s $f0, $f2
