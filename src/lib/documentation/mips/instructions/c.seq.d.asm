.data
a: .double 1.25
b: .double 2.5
.text
# Compare 1.25 with 2.5. Inspect FPU condition flag 1: 0 for c.seq; this predicate is false for these ordered unequal operands.
l.d $f2, a
l.d $f4, b
c.seq.d 1, $f2, $f4
