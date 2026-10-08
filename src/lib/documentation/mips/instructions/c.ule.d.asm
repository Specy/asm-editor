.data
a: .double 1.25
b: .double 2.5
.text
# Compare 1.25 with 2.5. Inspect FPU condition flag 1: 1 for c.ule; this ordered comparison is true.
l.d $f2, a
l.d $f4, b
c.ule.d 1, $f2, $f4
