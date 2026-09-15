<script lang="ts">
    import { resolve } from '$app/paths'
</script>

<div class="not-implemented">
    <strong>None of this is implemented in this editor.</strong>
    The 68000's exception machinery is described here because it is part of the processor and you will
    meet it in real code, but the emulator has no vector table, no supervisor mode and no exception handlers.
    The bottom of memory is ordinary memory: writing to it changes nothing about how a program runs. Each
    section below ends with what the editor does instead.
</div>

<div class="text">
    On a real 68000, <code>trap #15</code> is one of sixteen trap instructions, and the traps are a few
    of 256 causes that can take the program counter away from your program. All of them work the same
    way, through a table at the bottom of memory.
</div>

<h2>The vector table</h2>

<div class="text">
    The first 1024 bytes of memory, <code>$000000</code> to <code>$0003FF</code>, are
    <strong>256 vectors</strong>
    of four bytes each. A vector is the address of the code that deals with one cause, and the CPU finds
    it by multiplying the cause's <strong>vector number</strong> by 4 and reading the long there.
</div>

<div class="scroll">
    <table>
        <thead>
            <tr><th class="num">vector</th><th>address</th><th>cause</th></tr>
        </thead>
        <tbody>
            <tr
                ><td class="num">0</td><td><code>$0000</code></td><td
                    >the supervisor stack pointer the CPU starts with</td
                ></tr
            >
            <tr
                ><td class="num">1</td><td><code>$0004</code></td><td
                    >the program counter the CPU starts with</td
                ></tr
            >
            <tr><td class="num">2</td><td><code>$0008</code></td><td>bus error</td></tr>
            <tr
                ><td class="num">3</td><td><code>$000C</code></td><td
                    >address error, a word or long at an odd address</td
                ></tr
            >
            <tr><td class="num">4</td><td><code>$0010</code></td><td>illegal instruction</td></tr>
            <tr><td class="num">5</td><td><code>$0014</code></td><td>division by zero</td></tr>
            <tr
                ><td class="num">6</td><td><code>$0018</code></td><td
                    >the <code>chk</code> instruction, an index out of range</td
                ></tr
            >
            <tr
                ><td class="num">7</td><td><code>$001C</code></td><td
                    >the <code>trapv</code> instruction, on overflow</td
                ></tr
            >
            <tr><td class="num">8</td><td><code>$0020</code></td><td>privilege violation</td></tr>
            <tr
                ><td class="num">9</td><td><code>$0024</code></td><td
                    >trace, one vector per instruction for a debugger</td
                ></tr
            >
            <tr
                ><td class="num">10, 11</td><td><code>$0028</code></td><td
                    >an instruction beginning <code>1010</code> or <code>1111</code></td
                ></tr
            >
            <tr><td class="num">24</td><td><code>$0060</code></td><td>spurious interrupt</td></tr>
            <tr
                ><td class="num">25-31</td><td><code>$0064</code></td><td
                    >the seven interrupt levels, one vector each</td
                ></tr
            >
            <tr
                ><td class="num">32-47</td><td><code>$0080</code></td><td
                    ><code>trap #0</code> to <code>trap #15</code></td
                ></tr
            >
            <tr
                ><td class="num">64-255</td><td><code>$0100</code></td><td
                    >interrupt vectors devices supply themselves</td
                ></tr
            >
        </tbody>
    </table>
</div>

<div class="text">
    So <code>trap #15</code> is vector 47, at <code>$0000BC</code>, and a division by zero is vector
    5, at <code>$000014</code>. The first two entries are why a 68000 needs no boot code of its own:
    on reset it loads <code>a7</code> from <code>$0000</code> and the program counter from
    <code>$0004</code>, and starts running. Filling that table in is the first thing an operating
    system does, and on a machine without one it is the first thing the program does.
</div>

<div class="editor-note">
    <strong>In this editor:</strong> there is no vector table. The bottom of memory holds whatever
    you put there and nothing reads it. A program can write to <code>$0000</code> and
    <code>$0004</code> and see the bytes in the memory panel, but the emulator never consults them.
</div>

<h2>What the CPU does when an exception happens</h2>

<div class="text">
    The steps are the same for every cause, and this is what handling an exception means in
    hardware.
</div>

<ol class="steps">
    <li>It finishes, or abandons, the instruction it is on.</li>
    <li>
        It makes an internal copy of the status register, then sets the <strong>S</strong> bit to
        switch into <strong>supervisor mode</strong>, and clears the <strong>T</strong> bit so the handler
        is not traced.
    </li>
    <li>
        It pushes an <strong>exception frame</strong> onto the supervisor stack: the program counter and
        that copy of the status register, six bytes for most causes. A bus or address error pushes eight
        more bytes describing what went wrong, since the instruction has to be abandoned halfway.
    </li>
    <li>It reads the vector and loads it into the program counter, and the handler starts.</li>
    <li>
        The handler ends with <code>rte</code>, return from exception, which pops the status
        register and the program counter back, and the program carries on where it left off.
    </li>
</ol>

<div class="editor-note">
    <strong>In this editor:</strong> the three instructions that exist only to serve this machinery
    are recognised by the assembler but refuse to build, each with its own reason.
    <ul class="build-errors">
        <li>
            <code>rte</code> is not implemented: every program runs in supervisor mode and no exception
            state is kept.
        </li>
        <li>
            <code>stop</code> is not implemented: there are no interrupts to wake a stopped processor.
        </li>
        <li><code>reset</code> is not implemented: there is no external hardware to reset.</li>
    </ul>
    <code>chk</code>, <code>trapv</code> and <code>illegal</code> do assemble and run.
    <code>rtr</code> works too, because it only restores the condition codes and a return address from
    the ordinary stack rather than from an exception frame.
</div>

<h2>Three words for three causes</h2>

<div class="text">
    All three go through the machinery above, and the difference is where they come from.
</div>

<ul class="causes">
    <li>
        An <strong>exception</strong> is the CPU refusing to carry out the instruction it is on: an address
        error, a division by zero, an illegal instruction. Your program caused it, at an instruction you
        can point at.
    </li>
    <li>
        An <strong>interrupt</strong> comes from a device, between two instructions. The 68000 has
        seven levels, and three bits in the status register hold the
        <strong>interrupt mask</strong>, which says the levels it will listen to right now. A
        program can raise the mask to keep a piece of code from being stopped halfway. Level 7 is
        non-maskable and gets through regardless.
    </li>
    <li>
        A <strong>trap</strong> is an instruction you ran on purpose to hand control over, which is
        what
        <a href={resolve('/documentation/m68k/traps', {})}>trap #15</a> does here.
    </li>
</ul>

<div class="editor-note">
    <strong>In this editor:</strong> only <code>trap #15</code> exists. Writing
    <code>trap #0</code>
    through <code>trap #14</code> does not assemble at all, and the build error says so: "simulates
    one trap, <code>#15</code>, which is its input and output". There are no trap vectors for the
    other fifteen to point at. No device raises an interrupt either, so the interrupt mask never
    matters.
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

    .editor-note {
        padding: 0.7rem 0.9rem;
        border-radius: 0.4rem;
        background-color: rgba(var(--RGB-secondary), 0.45);
        color: var(--background-text-muted);
        line-height: 1.5rem;
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
        padding: 0.45rem 0.7rem;
        border-bottom: 1px solid rgba(var(--RGB-secondary), 0.9);
    }

    th {
        color: var(--background-text-muted);
        font-weight: 600;
    }

    .num {
        text-align: right;
        white-space: nowrap;
    }

    code {
        font-family: FiraCode, monospace;
        font-size: 0.9em;
    }

    ol.steps,
    ul.causes,
    ul.build-errors {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        line-height: 1.5rem;
        margin: 0;
        padding-left: 1.4rem;
    }

    a {
        color: var(--accent);
        text-decoration: underline;
    }
</style>
