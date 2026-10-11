.data
a: .double 1.5
b: .double 2.25
.text
# div double 1.5 and 2.25. Inspect $f6:$f7 for 0.6666666666666666 (raw bits 0x3FE5555555555555).
l.d $f2, a
l.d $f4, b
div.d $f6, $f2, $f4
