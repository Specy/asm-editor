.data
a: .float 1.25
b: .float 2.5
.text
# Compare 1.25 with 2.5. Inspect FPU condition flag 1: 0 for c.f; this predicate is false for these ordered unequal operands.
l.s $f0, a
l.s $f2, b
c.f.s 1, $f0, $f2
