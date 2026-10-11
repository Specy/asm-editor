.data
a: .double 1.5
b: .double 2.25
.text
# mul double 1.5 and 2.25. Inspect $f6:$f7 for 3.375 (raw bits 0x400B000000000000).
l.d $f2, a
l.d $f4, b
mul.d $f6, $f2, $f4
