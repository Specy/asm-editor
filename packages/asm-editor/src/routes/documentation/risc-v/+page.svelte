<script lang="ts">
    import { resolve } from '$app/paths'
    import DocumentationHome from '#cmp/documentation/site/DocumentationHome.svelte'
</script>

<DocumentationHome
    language="risc-v"
    title="RISC-V assembly reference - instructions, registers and ecall syscalls | Asm Editor"
    description="RISC-V assembly reference for RV32 and RV64 instructions, directives, simulator services, registers, and C/C++ programs."
>
    {#snippet intro()}
        <p>
            This reference covers RV32 and RV64 assembly for the RARS simulator. For a service call,
            put its number in <code>a7</code> and use the listed registers for its arguments and
            result; see
            <a href={resolve('/documentation/risc-v/syscall')}>Syscalls</a>.
        </p>
    {/snippet}
</DocumentationHome>
