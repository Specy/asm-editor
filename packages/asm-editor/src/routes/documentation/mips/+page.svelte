<script lang="ts">
    import { resolve } from '$app/paths'
    import DocumentationHome from '#cmp/documentation/site/DocumentationHome.svelte'
</script>

<DocumentationHome
    language="mips"
    title="MIPS assembly reference - instructions, registers and syscalls | Asm Editor"
    description="MIPS assembly reference for instructions, directives, simulator services, registers, and C/C++ programs."
>
    {#snippet intro()}
        <p>
            This reference covers the MIPS simulator’s instructions, assembler directives,
            registers, and services. For a service call, put its number in <code>$v0</code> and use
            the listed registers for its arguments and result; see
            <a href={resolve('/documentation/mips/syscall')}>Syscalls</a>.
        </p>
    {/snippet}
</DocumentationHome>
