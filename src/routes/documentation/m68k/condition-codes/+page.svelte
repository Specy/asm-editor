<script lang="ts">
    import DocsOperand from '$cmp/documentation/DocsOperand.svelte'
    import M68KConditionCodes from '$cmp/documentation/m68k/M68KConditionCodes.svelte'
    import Page from '$cmp/shared/layout/Page.svelte'
    import { branchConditionsFlags } from '$lib/languages/M68K/M68K-documentation'
    import Column from '$cmp/shared/layout/Column.svelte'
    const flags = Array.from(branchConditionsFlags.entries())
</script>

<Page cropped contentStyle="padding: 1rem; gap: 1rem;">
    <h1>Condition Codes</h1>
    <div class="text">
        When performing operations, the CPU will set condition codes in the status register after
        the instruction is executed.
        <br />
        For example the <a href="/documentation/m68k/instruction/tst">tst</a>,
        <a href="/documentation/m68k/instruction/cmp">cmp</a>
        instructions will set the condition codes that represent the result of the comparison of the
        operands.
        <br />
        The following are all the condition codes available:
    </div>
    <div class="column content">
        <M68KConditionCodes />
    </div>
    <div class="text">
        The instructions that use the condition codes are:
        <a href="/documentation/m68k/instruction/bcc">bcc</a>
        <a href="/documentation/m68k/instruction/dbcc">dbcc</a>
        <a href="/documentation/m68k/instruction/scc">scc</a>
    </div>
    <h1 style="margin-top: 2rem;">Condition codes flags</h1>
    <div class="text">
        The condition codes X, N, Z, V, C are the individual flags that can be set in the status
        register.
        <br />
        <br />X is the extend flag, it is set when the result of an operation is too large to fit in
        the destination register.
        <br />N is the negative flag, it is set when the result of an operation is negative.
        <br />Z is the zero flag, it is set when the result of an operation is zero.
        <br />V is the overflow flag, in arithmetical operations, it is set if it caused the result
        to overflow.
        <br />C is the carry flag, when an operation causes a carry, like an addition or a shift, it
        is set to the value of the carry.
    </div>
    <Column gap="0.4rem" style="margin-left: 1rem">
        {#each flags as cc}
            <DocsOperand name={cc[0]} content={cc[1]} style="width: fit-content" />
        {/each}
    </Column>
</Page>

<style>
    .content {
        padding: 1rem;
    }
    a {
        color: var(--accent);
        text-decoration: underline;
    }
    .text {
        line-height: 1.5rem;
    }
    @media (max-width: 800px) {
        .content {
            padding: unset;
        }
    }
</style>
