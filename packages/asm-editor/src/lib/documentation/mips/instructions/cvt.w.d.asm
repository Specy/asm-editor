.data
number: .double 2.0
.text
# Convert 2.0 to a word using the current rounding mode. Inspect $f8: raw word 2.
l.d $f2, number
cvt.w.d $f8, $f2
