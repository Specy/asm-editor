.data
number: .float 2.0
.text
# Convert 2.0 to a word using the current rounding mode. Inspect $f0: raw word 2.
l.s $f2, number
cvt.w.s $f0, $f2
