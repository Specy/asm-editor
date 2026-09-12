<script lang="ts">
    import NavigationLinkButton from '$cmp/shared/button/NavigationLinkButton.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
</script>

<svelte:head>
    <title>x86-64 Documentation</title>
    <meta
        name="description"
        content="Read the x86-64 documentation, including the instructions with the operand forms NASM accepts, the assembler directives, the registers and flags, and the Linux syscalls this emulator implements"
    />
    <meta
        property="og:description"
        content="Read the x86-64 documentation, including the instructions with the operand forms NASM accepts, the assembler directives, the registers and flags, and the Linux syscalls this emulator implements"
    />
</svelte:head>
<Page cropped contentStyle="padding: 1rem; gap: 1rem">
    <h1 style="margin-top: 1rem; gap: 1rem; flex-wrap: wrap" class="row">x86-64 Documentation</h1>
    <p class="intro">
        x86-64 is the instruction set most desktop and server processors run. It has sixteen 64 bit
        general purpose registers, memory addressed as one flat space, and an instruction for almost
        everything of around 2600 mnemonics.
    </p>
    <p class="intro">
        Programs in asm-editor are written in <a href="https://www.nasm.us/" target="_blank" rel="noreferrer"
            >NASM</a
        >
        syntax, assembled by the NASM assembler, and run by
        <a href="https://github.com/jart/blink" target="_blank" rel="noreferrer">blink</a>, which
        emulates a Linux program. So a program starts at
        <code>_start</code>, its code goes in <code>section .text</code> and its data in
        <code>section .data</code>, and it reaches the outside world through the
        <code>syscall</code> instruction. It ends by calling syscall 60. A program that runs off the
        end of its own code executes whatever bytes follow in memory.
    </p>
    <div class="links">
        <NavigationLinkButton href="/documentation/x86/instruction">
            <div>Instructions</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/x86/directive">
            <div>Directives</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/x86/registers">
            <div>Registers & Flags</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/x86/syscall">
            <div>Syscalls</div>
        </NavigationLinkButton>
        <NavigationLinkButton href="/documentation/x86/all">
            <div>Complete Documentation</div>
        </NavigationLinkButton>
    </div>
</Page>

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
    .links {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        max-width: 60rem;
        gap: 0.8rem;
    }
    @media (max-width: 900px) {
        .links {
            grid-template-columns: repeat(2, 1fr);
        }
    }
    @media (max-width: 400px) {
        .links {
            grid-template-columns: repeat(1, 1fr);
        }
    }
</style>
