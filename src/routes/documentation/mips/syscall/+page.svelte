<script lang="ts">
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import MipsSyscall from '$cmp/documentation/mips/MIPSSyscall.svelte'
</script>

<svelte:head>
    <title>MIPS Syscalls</title>
    <meta
      name="description"
      content="Syscalls in MIPS are used to make requests to the operating system. Learn how to use them and the available syscalls."
    />
    <meta
      property="og:description"
      content="Syscalls in MIPS are used to make requests to the operating system. Learn how to use them and the available syscalls."
    />
</svelte:head>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>MIPS Syscalls</h1>
    <p>
        MIPS syscalls are used to make requests to the operating system. They are not instructions
        that are executed by the CPU, but rather instructions that are used by the simulator to make
        requests to the operating system.
    </p>
    <p>
        Each syscall has a unique code that is used to identify it. You must put the syscall code
        inside the the $v0 register before calling the syscall instruction.
        <br />
        <br />
        As an example:
    </p>
    <MarkdownRenderer
        source={`
\`\`\`mips
# Load the integer 42 into register $a0, which is
# the register that will be printed by the syscall 
li $a0, 42 

# Set the syscall code for printing an integer
li $v0, 1
syscall

\`\`\`
        `.trim()}
    />
    <MipsSyscall />
</Page>
