<script lang="ts">
    //nothing to import: this page is prose, a table and two listings
</script>

<div class="not-implemented">
    <strong>Two instructions are wrong in the 64 bit emulator.</strong>
    This is a defect, not a missing feature: the instructions assemble and run, they just give the wrong
    answer in one range. Everything else on this page behaves the way the specification says. If you are
    writing 64 bit code and a value loses its top half for no reason you can see, this is almost certainly
    why.
</div>

<h2>The immediate shifts drop the top half</h2>

<div class="text">
    <code>slli</code>, <code>srli</code> and <code>srai</code> with a shift amount of
    <strong>31 or less</strong>
    are carried out on the low 32 bits only, and the answer is sign extended into the top half. The same
    instructions with an amount of 32 or more are carried out on all 64 bits and are correct.
</div>

<div class="text">
    The register forms, <code>sll</code>, <code>srl</code> and <code>sra</code>, are correct at
    every amount. That is the workaround: put the shift amount in a register.
</div>

<div class="scroll">
    <table>
        <thead>
            <tr><th>program</th><th>you get</th><th>it should be</th></tr>
        </thead>
        <tbody>
            <tr>
                <td><code>li t0, 1</code><br /><code>slli t1, t0, 32</code></td>
                <td><code>0000000100000000</code></td>
                <td class="ok"><code>0000000100000000</code> correct</td>
            </tr>
            <tr>
                <td><code>li t0, 1</code><br /><code>slli t2, t0, 31</code></td>
                <td class="bad"><code>FFFFFFFF80000000</code></td>
                <td><code>0000000080000000</code></td>
            </tr>
            <tr>
                <td
                    ><code>li t0, 1</code><br /><code>li t3, 31</code><br /><code
                        >sll t4, t0, t3</code
                    ></td
                >
                <td><code>0000000080000000</code></td>
                <td class="ok">correct, the register form</td>
            </tr>
            <tr>
                <td><code>li t5, 0x11223344</code><br /><code>slli t6, t5, 8</code></td>
                <td class="bad"><code>0000000022334400</code></td>
                <td><code>0000001122334400</code></td>
            </tr>
        </tbody>
    </table>
</div>

<div class="text">
    In the last row the <code>11</code> at the top of <code>t5</code> was shifted out of a 32 bit register
    instead of moving up into the second half of a 64 bit one.
</div>

<h2>li of a wide constant comes out wrong</h2>

<div class="text">
    <code>li</code> is a pseudo-instruction built out of those shifts. Its expansion is a
    <code>lui</code>, an <code>addiw</code>, and then a run of <code>slli</code> and
    <code>addi</code>
    pairs with shift amounts of 11 and 10, every one of them in the broken range. So
    <strong>any constant that needs more than 32 bits loses its top half silently</strong>. Nothing
    reports an error.
</div>

<pre class="example">li t0, 42                   <span class="c"># fine</span>
li t1, 0x12345678           <span class="c"># fine, fits in 32 bits</span>
li t2, 0x1122334455667788   <span class="c"># gives 0000000055667788</span></pre>

<h2>The workaround</h2>

<div class="text">
    Build a wide constant out of two halves that each fit in 32 bits, with a shift of 32 between
    them. A shift amount of 32 is outside the broken range, so it is carried out correctly.
</div>

<pre class="example">li t3, 0x11223344
slli t3, t3, 32             <span class="c"># 32 or more, so the top half lands correctly</span>
li t4, 0x55667788
add t3, t3, t4              <span class="c"># and the bottom half is added in</span></pre>

<div class="text">
    That gives <code>1122334455667788</code>, with one thing to watch. If the bottom half has its
    top bit set, the <code>li</code> that loads it sign extends, and the <code>add</code> carries
    ones into the top half. Put <code>zext.w</code> on the bottom half before adding when that is possible.
</div>

<style>
    .not-implemented {
        padding: 0.9rem 1rem;
        border-radius: 0.4rem;
        border-left: 0.25rem solid var(--accent);
        background-color: rgba(var(--RGB-secondary), 0.7);
        color: var(--background-text-muted);
        line-height: 1.5rem;
        margin-bottom: 0.5rem;
    }

    .text {
        line-height: 1.5rem;
    }

    h2 {
        border-bottom: solid 0.15rem var(--accent);
        padding-bottom: 0.5rem;
        margin-top: 1.4rem;
        margin-bottom: 0;
    }

    .scroll {
        overflow-x: auto;
    }

    table {
        border-collapse: collapse;
        width: 100%;
    }

    th,
    td {
        text-align: left;
        padding: 0.5rem 0.7rem;
        border-bottom: 1px solid rgba(var(--RGB-secondary), 0.9);
        vertical-align: top;
    }

    th {
        color: var(--background-text-muted);
        font-weight: 600;
    }

    td.bad code {
        color: #e8806a;
    }

    td.ok {
        color: var(--background-text-muted);
    }

    code {
        font-family: FiraCode, monospace;
        font-size: 0.9em;
    }

    .example {
        padding: 0.7rem 0.9rem;
        background-color: rgba(var(--RGB-secondary), 0.7);
        color: var(--background-text-muted);
        line-height: 1.5rem;
        border-radius: 0.4rem;
        font-family: FiraCode, monospace;
        font-size: 0.9rem;
        overflow-x: auto;
        margin: 0;
    }

    .example .c {
        opacity: 0.7;
    }
</style>
