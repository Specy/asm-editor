<script lang="ts">
    import InstructionIndex from '#cmp/documentation/site/InstructionIndex.svelte'
    import { x86DocumentedNames } from '#lib/languages/X86/X86-documentation.ts'
    import { resolve } from '$app/paths'
</script>

<InstructionIndex
    language="x86"
    names={x86DocumentedNames}
    code
    description="Read the x86-64 instruction documentation: every integer instruction with the operand forms NASM accepts, the processor that introduced each one, and a program to run it in"
>
    <p class="note">
        The integer instruction set, under NASM's own headings. The vector and system extensions are
        listed with their forms on the
        <a href={resolve('/documentation/x86/all')}>complete documentation</a>
        page: no source we can publish describes them, and no program here runs one.
    </p>
</InstructionIndex>

<style lang="scss">
    .note {
        line-height: 1.5;
        max-width: 60rem;
        color: var(--background-text-muted);

        a {
            color: var(--accent);
            text-decoration: underline;
        }
    }
</style>
