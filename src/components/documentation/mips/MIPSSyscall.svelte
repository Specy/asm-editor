<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import { mipsSyscall } from '$lib/languages/MIPS/MIPS-documentation'
    import { capitalize } from '$lib/utils'
    import DocsOperand from '../DocsOperand.svelte'
</script>

<Column gap="1rem">
    {#each Object.values(mipsSyscall) as syscall}
        <Card padding="1rem" gap="1rem" background="secondary">
            <h2 style="border-bottom: solid 0.1rem var(--tertiary); padding-bottom: 0.8rem">
                {syscall.code} - {capitalize(syscall.name)}
            </h2>
            {#if syscall.result.other}
                <p>
                    {syscall.result.other}
                </p>
            {/if}

            {#if syscall.result.arguments?.length > 0}
                <h3>Result</h3>
                <Column>
                    {#each syscall.result.arguments as result}
                        <DocsOperand
                            name={result.name}
                            content={result.description}
                            style="width: fit-content"
                        />
                    {/each}
                </Column>
            {/if}
            {#if syscall.arguments.length > 0}
                <h3>Arguments</h3>
                <Column gap="1rem">
                    {#each syscall.arguments as arg}
                        <DocsOperand
                            name={arg.name}
                            content={arg.description}
                            style="width: fit-content"
                        />
                    {/each}
                </Column>
            {/if}
        </Card>
    {/each}
</Column>


<style>
    p {
        line-height: 1.3;
    }
</style>