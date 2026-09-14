<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import { riscvRegisterFiles } from '$lib/languages/RISC-V/RISC-V-documentation'

    interface Props {
        disableLinks?: boolean
    }

    let { disableLinks = false }: Props = $props()
</script>

<Column gap="1rem" style="width: 100%;">
    {#each riscvRegisterFiles as file (file.id)}
        <h2 class="section-title" id={file.id}>{file.title}</h2>
        <div class="note">
            <MarkdownRenderer source={file.intro} {disableLinks} />
        </div>
        {#each file.registers as register (register.name)}
            <Card gap="1rem" padding="1rem" background="secondary" style="width: 100%;">
                <h3 class="sub-title">{register.name} ({register.number})</h3>
                <MarkdownRenderer source={register.description} {disableLinks} />
            </Card>
        {/each}
    {/each}
</Column>

<style lang="scss">
    h2 {
        border-bottom: solid 0.15rem var(--accent);
        padding-bottom: 0.5rem;
    }
    .sub-title {
        font-size: 1.3rem;
        margin-right: 0.4rem;
    }
    .section-title {
        margin-top: 1rem;
    }
    .note {
        line-height: 1.5;
        color: var(--background-text-muted);
    }
</style>
