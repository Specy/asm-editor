.data
a: .float 1.25
b: .float 2.5
.text
# Compare 1.25 with 2.5. Inspect FPU condition flag 1: 1 for c.olt; this ordered comparison is true.
l.s $f0, a
l.s $f2, b
c.olt.s 1, $f0, $f2
