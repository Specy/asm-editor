<script lang="ts">
    import DocumentationHome from '#cmp/documentation/site/DocumentationHome.svelte'
</script>

<DocumentationHome
    language="x86"
    title="x86-64 assembly reference - instructions, registers and Linux syscalls | Asm Editor"
    description="Read the x86-64 documentation, including the instructions with the operand forms NASM accepts, the assembler directives, the registers and flags, and the Linux syscalls this emulator implements"
>
    {#snippet intro()}
        <p class="intro">
            x86-64 is the instruction set most desktop and server processors run. It has sixteen 64
            bit general purpose registers, memory addressed as one flat space, and an instruction
            for almost everything of around 2600 mnemonics.
        </p>
        <p class="intro">
            Programs in asm-editor are written in <a
                href="https://www.nasm.us/"
                target="_blank"
                rel="noreferrer">NASM</a
            >
            syntax, assembled by the NASM assembler, and run by
            <a href="https://github.com/jart/blink" target="_blank" rel="noreferrer">blink</a>,
            which emulates a Linux program. So a program starts at
            <code>_start</code>, its code goes in <code>section .text</code> and its data in
            <code>section .data</code>, and it reaches the outside world through the
            <code>syscall</code> instruction. It ends by calling syscall 60. A program that runs off the
            end of its own code executes whatever bytes follow in memory.
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
    a {
        color: var(--accent);
        text-decoration: underline;
    }
</style>
