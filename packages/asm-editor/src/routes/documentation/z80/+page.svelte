<script lang="ts">
    import DocumentationHome from '#cmp/documentation/site/DocumentationHome.svelte'
</script>

<DocumentationHome
    language="z80"
    title="Z80 assembly reference - instructions, registers and I/O ports | Asm Editor"
    description="Read the Z80 Documentation, including all the instructions with their flags, timings and opcodes, the assembler directives, the registers and the console ports"
>
    {#snippet intro()}
        <p class="intro">
            The Z80 is an 8 bit CPU with 64 KB of memory, a handful of 8 bit registers that pair up
            into 16 bit ones, and no memory management of any kind: a program owns the whole address
            space. Programs here are assembled at <code>.org 0x8000</code>, above the reset and
            <code>rst</code> vectors, with the stack pointer starting at the top of memory.
            Execution ends when the program reaches a <code>halt</code>, when a top level
            <code>ret</code> returns, or when it simply runs off the end of the assembled code.
        </p>
        <p class="intro">
            The Z80 has no system calls: it talks to the outside world through the <code>in</code>
            and
            <code>out</code>
            instructions, which address one of 256 ports. This emulator wires the first five ports to
            the console, so a program can print characters and numbers and read a line back.
        </p>
    {/snippet}
</DocumentationHome>

<style lang="scss">
    .intro {
        line-height: 1.5;
        max-width: 60rem;
        color: var(--background-text-muted);
    }
    code {
        background-color: var(--secondary);
        color: var(--accent);
        padding: 0.1rem 0.3rem;
        border-radius: 0.3rem;
    }
</style>
